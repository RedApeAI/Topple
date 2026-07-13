import type { MiddlewareHandler } from "hono";

import { auth } from "../lib/auth.js";
import type { AppEnv } from "../types.js";

export const requireAuth: MiddlewareHandler<AppEnv> = async (context, next) => {
  const result = await auth.api.getSession({
    headers: context.req.raw.headers,
  });

  if (!result) {
    return context.json(
      {
        error: { code: "UNAUTHENTICATED", message: "Authentication required" },
      },
      401,
    );
  }

  if (result.user.status !== "active") {
    return context.json(
      { error: { code: "ACCOUNT_DISABLED", message: "Account is not active" } },
      403,
    );
  }

  context.set("user", result.user);
  context.set("session", result.session);
  await next();
};
