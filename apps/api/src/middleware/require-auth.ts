import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import { auth } from "../lib/auth.js";
import {
  DEV_AUTH_LOGGED_OUT_COOKIE,
  getDevAuthIdentity,
} from "../services/dev-auth.service.js";
import type { AppEnv } from "../types.js";

export const requireAuth: MiddlewareHandler<AppEnv> = async (context, next) => {
  const devAuthLoggedOut =
    getCookie(context, DEV_AUTH_LOGGED_OUT_COOKIE) === "1";
  const result =
    (!devAuthLoggedOut ? await getDevAuthIdentity(context.env) : null) ??
    (await auth.api.getSession({
      headers: context.req.raw.headers,
    }));

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
