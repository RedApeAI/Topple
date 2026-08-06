import { Context, Hono } from "hono";
import { z } from "zod";

import { AppError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import { jsonValidator } from "../lib/validation.js";
import { requireAuth } from "../middleware/require-auth.js";
import type { AuthSession, AuthUser } from "../lib/auth.js";
import { resolveTenant } from "../services/tenant.service.js";
import { rateLimit } from "../middleware/rate-limit.js";
import {
  assertOk,
  changePassword,
  getSession,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  type ServiceResult,
} from "../services/auth.service.js";
import type { AppEnv } from "../types.js";

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z
  .string()
  .min(env.PASSWORD_MIN_LENGTH)
  .max(env.PASSWORD_MAX_LENGTH);

const registerSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(env.PASSWORD_MAX_LENGTH),
});

const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const requestPasswordResetSchema = z.strictObject({
  email: emailSchema,
  redirectTo: z.string().trim().max(2048).optional(),
});

const resetPasswordSchema = z.strictObject({
  newPassword: passwordSchema,
  token: z.string().min(1).max(2048),
});

/** Forward set-cookie headers from a Better Auth result onto the response. */
function applyCookies(context: Context<AppEnv>, result: ServiceResult) {
  if (result.cookies) {
    for (const cookie of result.cookies) {
      context.header("set-cookie", cookie, { append: true });
    }
  }
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post(
  "/register",
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: "auth-register" }),
  jsonValidator(registerSchema),
  async (context) => {
    const input = context.req.valid("json");
    const result = await register(input, context.req.raw.headers);
    if (!result.ok) {
      throw new AppError(
        result.status as 400 | 401 | 403 | 404 | 409 | 429,
        result.error?.code ?? "AUTH_ERROR",
        result.error?.message ?? "Registration failed",
      );
    }
    applyCookies(context, result);
    return context.json({ data: result.data }, 201);
  },
);

authRoutes.post(
  "/login",
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: "auth-login" }),
  jsonValidator(loginSchema),
  async (context) => {
    const input = context.req.valid("json");
    const result = await login(input, context.req.raw.headers);
    if (!result.ok) {
      throw new AppError(
        result.status as 400 | 401 | 403 | 404 | 409 | 429,
        result.error?.code ?? "AUTH_ERROR",
        result.error?.message ?? "Login failed",
      );
    }
    applyCookies(context, result);
    return context.json({ data: result.data });
  },
);

authRoutes.post("/logout", async (context) => {
  const result = await logout(context.req.raw.headers);
  assertOk(result);
  applyCookies(context, result);
  return context.json({ data: { success: true } });
});

authRoutes.get("/session", async (context) => {
  const result = await getSession(context.req.raw.headers);
  if (!result.ok) {
    return context.json({ data: null, authenticated: false }, 200);
  }
  applyCookies(context, result);

  // The team travels with the session so the sidebar can name it without a
  // second round trip, and so the client never has to work it out itself.
  // A failure here must not sign the user out — the app is usable without it.
  let organization: { id: string; name: string } | null = null;
  try {
    const payload = result.data as { user?: AuthUser; session?: AuthSession };
    if (payload?.user && payload?.session) {
      organization = await resolveTenant(
        payload.user,
        payload.session,
        context.req.raw.headers,
      );
    }
  } catch {
    organization = null;
  }

  return context.json({
    data: { ...(result.data as object), organization },
    authenticated: true,
  });
});

authRoutes.get("/me", requireAuth, async (context) => {
  return context.json({ data: context.get("user") });
});

authRoutes.post(
  "/change-password",
  requireAuth,
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: "auth-change-password" }),
  jsonValidator(changePasswordSchema),
  async (context) => {
    const input = context.req.valid("json");
    const result = await changePassword(input, context.req.raw.headers);
    assertOk(result);
    applyCookies(context, result);
    return context.json({ data: { success: true } });
  },
);

authRoutes.post(
  "/request-password-reset",
  rateLimit({ windowMs: 60_000, max: 3, keyPrefix: "auth-request-reset" }),
  jsonValidator(requestPasswordResetSchema),
  async (context) => {
    const input = context.req.valid("json");
    // Always succeed to avoid account enumeration; never leak whether the
    // email exists.
    await requestPasswordReset(input, context.req.raw.headers);
    return context.json({ data: { success: true } });
  },
);

authRoutes.post(
  "/reset-password",
  rateLimit({ windowMs: 60_000, max: 5, keyPrefix: "auth-reset" }),
  jsonValidator(resetPasswordSchema),
  async (context) => {
    const input = context.req.valid("json");
    const result = await resetPassword(input, context.req.raw.headers);
    if (!result.ok) {
      throw new AppError(
        result.status as 400 | 401 | 403 | 404 | 409 | 429,
        result.error?.code ?? "AUTH_ERROR",
        result.error?.message ?? "Password reset failed",
      );
    }
    applyCookies(context, result);
    return context.json({ data: { success: true } });
  },
);
