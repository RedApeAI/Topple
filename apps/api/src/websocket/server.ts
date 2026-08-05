import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type {
  AuthenticatedSocket,
  ClientToServerEvents,
  ServerToClientEvents,
  RoomIdentifier,
} from "./types.js";
import { auth } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { resolveTenant } from "../services/tenant.service.js";

let io: Server<ClientToServerEvents, ServerToClientEvents>;

/** Socket.io namespace — keep in sync with the client (`path` option). */
export const SOCKET_PATH = "/api/socket.io";

interface RoomEmitter {
  emit<K extends keyof ServerToClientEvents>(
    event: K,
    data: Parameters<ServerToClientEvents[K]>[0],
  ): void;
}

function toRoom(room: string): RoomEmitter {
  return getIO().to(room) as unknown as RoomEmitter;
}

export function initializeWebSocket(httpServer: HttpServer): void {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // Use the API namespace so Vite's `/api` proxy (and any reverse proxy
    // routing `/api` to the API) forwards both the polling and WebSocket
    // transports without extra configuration.
    path: SOCKET_PATH,
    cors: {
      origin: env.FRONTEND_ORIGINS,
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie;
      if (!cookies) {
        console.warn("WebSocket auth failed: No cookies provided");
        return next(new Error("Authentication required"));
      }

      console.debug("WebSocket auth: Attempting session validation");
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookies }),
      });

      if (!session || !session.user) {
        console.warn("WebSocket auth failed: Invalid session");
        return next(new Error("Invalid session"));
      }

      // Resolve the tenant (creating a personal organization when the user
      // has none yet) so the socket joins the same workspace room that the
      // webhook pipeline broadcasts to. Failing here for a brand-new user was
      // the reason sockets connected but never received events.
      const tenant = await resolveTenant(
        session.user,
        session.session,
        new Headers({ cookie: cookies }),
      );

      (socket as AuthenticatedSocket).data = {
        userId: session.user.id,
        organizationId: tenant.id,
      };

      console.info(
        `WebSocket authenticated: user=${session.user.id}, org=${tenant.id}`,
      );
      next();
    } catch (error) {
      console.error("WebSocket auth error:", error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const { organizationId } = socket.data;

    socket.join(`workspace:${organizationId}`);
    console.info(
      `Socket connected: ${socket.id}, workspace: ${organizationId}`,
    );

    socket.on("join", (rooms: RoomIdentifier[]) => {
      for (const room of rooms) {
        const roomName = formatRoomName(room, organizationId);
        socket.join(roomName);
      }
    });

    socket.on("leave", (rooms: RoomIdentifier[]) => {
      for (const room of rooms) {
        const roomName = formatRoomName(room, organizationId);
        socket.leave(roomName);
      }
    });

    socket.on("typing:start", (conversationId: string) => {
      if (!conversationId) return;
      socket
        .to(`conversation:${organizationId}:${conversationId}`)
        .emit("typing:start", {
          conversationId,
          userId: socket.data.userId,
        });
    });

    socket.on("typing:stop", (conversationId: string) => {
      if (!conversationId) return;
      socket
        .to(`conversation:${organizationId}:${conversationId}`)
        .emit("typing:stop", {
          conversationId,
          userId: socket.data.userId,
        });
    });

    socket.on("disconnect", () => {
      console.info(`Socket disconnected: ${socket.id}`);
    });
  });
}

function formatRoomName(room: RoomIdentifier, organizationId: string): string {
  switch (room.type) {
    case "workspace":
      return `workspace:${organizationId}`;
    case "conversation":
      return `conversation:${organizationId}:${room.id}`;
    case "user":
      return `user:${room.id}`;
  }
}

export function getIO(): Server<ClientToServerEvents, ServerToClientEvents> {
  if (!io) {
    throw new Error("WebSocket server not initialized");
  }
  return io;
}

export function broadcastToWorkspace<K extends keyof ServerToClientEvents>(
  organizationId: string,
  event: K,
  data: Parameters<ServerToClientEvents[K]>[0],
): void {
  toRoom(`workspace:${organizationId}`).emit(event, data);
}

export function broadcastToConversation<K extends keyof ServerToClientEvents>(
  organizationId: string,
  conversationId: string,
  event: K,
  data: Parameters<ServerToClientEvents[K]>[0],
): void {
  toRoom(`conversation:${organizationId}:${conversationId}`).emit(event, data);
}

export function broadcastToUser<K extends keyof ServerToClientEvents>(
  userId: string,
  event: K,
  data: Parameters<ServerToClientEvents[K]>[0],
): void {
  toRoom(`user:${userId}`).emit(event, data);
}
