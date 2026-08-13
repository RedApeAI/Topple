import type { AuthSession, AuthUser } from "./lib/auth.js";

/** Cloudflare bindings used by the Worker entry point. Optional fields keep
 * the same Hono app usable from the Node development server and tests. */
export type AppBindings = {
  NODE_ENV?: string;
  DEV_AUTH_BYPASS?: string;
  DEV_AUTH_USER_ID?: string;
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  FRONTEND_ORIGINS?: string;
  ORCHESTRATOR_URL?: string;
  COOKIE_CROSS_SITE?: string;
  COOKIE_SECURE?: string;
  SESSION_EXPIRES_IN?: string;
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX?: string;
  PASSWORD_MIN_LENGTH?: string;
  PASSWORD_MAX_LENGTH?: string;
  AUTH_LOCKOUT_THRESHOLD?: string;
  AUTH_LOCKOUT_WINDOW_MS?: string;
  AUTH_LOCKOUT_DURATION_MS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  ORCHESTRATOR_SHARED_SECRET?: string;
  UNIPILE_API_KEY?: string;
  UNIPILE_BASE_URL?: string;
  UNIPILE_API_VERSION?: string;
  UNIPILE_WEBHOOK_SECRET?: string;
  UNIPILE_HOSTED_AUTH_DOMAIN?: string;
  MESSAGING_CALLBACK_URL?: string;
  MESSAGING_ATTACHMENTS_BUCKET?: R2Bucket;
  MESSAGING_AI_ENABLED?: string;
  MESSAGING_AI_PROVIDER_URL?: string;
  MESSAGING_AI_API_KEY?: string;
  MESSAGING_AI_MODEL?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    requestId: string;
    user: AuthUser;
    session: AuthSession;
  };
};
