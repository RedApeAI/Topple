import type { Socket } from "socket.io";

export interface SocketData {
  userId: string;
  organizationId: string;
}

export interface AuthenticatedSocket extends Socket {
  data: SocketData;
}

export type RoomType = "workspace" | "conversation" | "user";

export interface RoomIdentifier {
  type: RoomType;
  id: string;
}

export interface SocketEvents {
  connection: () => void;
  disconnect: () => void;
  join: (rooms: RoomIdentifier[]) => void;
  leave: (rooms: RoomIdentifier[]) => void;
}

export interface ServerToClientEvents {
  "message:received": (data: MessageEvent) => void;
  "message:sent": (data: MessageEvent) => void;
  "message:delivered": (data: MessageStatusEvent) => void;
  "message:read": (data: MessageStatusEvent) => void;
  "message:failed": (data: MessageStatusEvent) => void;
  "message:edited": (data: MessageEditEvent) => void;
  "message:deleted": (data: MessageDeleteEvent) => void;
  "conversation:created": (data: ConversationEvent) => void;
  "conversation:updated": (data: ConversationEvent) => void;
  "reaction:received": (data: ReactionEvent) => void;
  "typing:start": (data: TypingEvent) => void;
  "typing:stop": (data: TypingEvent) => void;
}

export interface ClientToServerEvents {
  "message:send": (
    data: SendMessagePayload,
    callback: (response: SendMessageResponse) => void,
  ) => void;
  "typing:start": (conversationId: string) => void;
  "typing:stop": (conversationId: string) => void;
}

export interface MessageEvent {
  id: string;
  conversationId: string;
  externalId: string;
  content: string;
  direction: "inbound" | "outbound";
  timestamp: string;
  attachments?: Attachment[];
}

export interface MessageStatusEvent {
  messageId: string;
  conversationId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
}

export interface MessageEditEvent {
  messageId: string;
  conversationId: string;
  content: string;
  editedAt: string;
}

export interface MessageDeleteEvent {
  messageId: string;
  conversationId: string;
  deletedAt: string;
}

export interface ConversationEvent {
  id: string;
  externalId: string;
  platform: string;
  participant: {
    id: string;
    name?: string;
    phone?: string;
  };
  lastMessage?: {
    content: string;
    timestamp: string;
  };
  unreadCount: number;
}

export interface ReactionEvent {
  messageId: string;
  conversationId: string;
  emoji: string;
  action: "add" | "remove";
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
}

export interface Attachment {
  id: string;
  type: "image" | "video" | "audio" | "document" | "sticker" | "voice";
  url: string;
  mimeType: string;
  filename?: string;
  size?: number;
}

export interface SendMessagePayload {
  conversationId: string;
  content: string;
  attachments?: Attachment[];
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}
