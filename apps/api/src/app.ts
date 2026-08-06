import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "./lib/auth.js";
import { env } from "./lib/env.js";
import { getSecurityHeaders } from "./lib/security.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { authRoutes } from "./routes/auth.js";
import { mailRoutes, mailWebhookRoutes } from "./routes/mail.js";
import { orchestratorRoutes } from "./routes/orchestrator.js";
import { zernioRoutes, zernioWebhookRoutes } from "./routes/zernio.js";
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
app.route("/api/v1/zernio", zernioWebhookRoutes);
app.route("/api/v1/zernio", zernioRoutes);

// The signed-in user's Gmail, proxied so the OAuth token stays server-side.
// The webhook route is mounted first: it authenticates by shared secret and
// must not fall behind the session guard `mailRoutes` applies to everything.
app.route("/api/v1/mail", mailWebhookRoutes);
app.route("/api/v1/mail", mailRoutes);

// The agent, proxied. The dashboard never reaches the orchestrator directly —
// tenant and user come from the session here, not from the caller.
app.route("/api/v1/agent", orchestratorRoutes);

// Better Auth validates its own payloads and owns all auth/OAuth callbacks.
app.on(["GET", "POST"], "/api/auth/*", (context) =>
  auth.handler(context.req.raw),
);

app.notFound((context) =>
  context.json(
    { error: { code: "NOT_FOUND", message: "Route not found" } },
    404,
  ),
);
app.onError(errorHandler);
