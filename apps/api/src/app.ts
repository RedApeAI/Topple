import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "./lib/auth.js";
import { env } from "./lib/env.js";
import { getSecurityHeaders } from "./lib/security.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { requireAuth } from "./middleware/require-auth.js";
import { requireOrganizationMember } from "./middleware/require-org-role.js";
import { agentConfigRoutes } from "./routes/agent-config.js";
import { authRoutes } from "./routes/auth.js";
import { channelRoutes } from "./routes/channels.js";
import { conversationRoutes } from "./routes/conversations.js";
import type { AppEnv } from "./types.js";

export const app = new Hono<AppEnv>();

app.use("*", requestContext);
app.use("*", secureHeaders());
app.use("*", async (context, next) => {
  await next();
  for (const [name, value] of Object.entries(getSecurityHeaders())) {
    context.res.headers.set(name, value);
  }
});
app.use(
  "*",
  cors({
    origin: (origin) => (env.FRONTEND_ORIGINS.includes(origin) ? origin : ""),
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "X-Request-Id"],
    maxAge: 600,
    credentials: true,
  }),
);
app.use(
  "*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (context) =>
      context.json(
        {
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Request body exceeds 1 MiB",
          },
        },
        413,
      ),
  }),
);

app.get("/", (context) =>
  context.json({ ok: true, service: "plucia-api", version: 1 }),
);
app.get("/healthz", (context) => context.json({ ok: true }));

// Single-user auth layer (login, register, session, me, password).
app.route("/api/v1/auth", authRoutes);

// Better Auth validates its own payloads and owns all auth/OAuth callbacks.
app.on(["GET", "POST"], "/api/auth/*", (context) =>
  auth.handler(context.req.raw),
);

app.use(
  "/api/organizations/:organizationId/*",
  requireAuth,
  requireOrganizationMember,
);
app.route("/api/organizations", channelRoutes);
app.route("/api/organizations", conversationRoutes);
app.route("/api/organizations", agentConfigRoutes);

app.notFound((context) =>
  context.json(
    { error: { code: "NOT_FOUND", message: "Route not found" } },
    404,
  ),
);
app.onError(errorHandler);
