import { randomUUID } from "node:crypto";

import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types.js";

export const requestContext: MiddlewareHandler<AppEnv> = async (
  context,
  next,
) => {
  const requestId =
    context.req.header("x-request-id")?.slice(0, 128) || randomUUID();
  const startedAt = performance.now();

  context.set("requestId", requestId);
  context.header("x-request-id", requestId);

  await next();

  const log: Record<string, unknown> = {
    level: "info",
    event: "request.completed",
    requestId,
    method: context.req.method,
    path: context.req.path,
    status: context.res.status,
    durationMs: Math.round(performance.now() - startedAt),
  };

  const user = context.get("user");
  if (user) log.userId = user.id;

  console.info(JSON.stringify(log));
};
