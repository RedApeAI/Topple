import type { AuthSession, AuthUser } from "./lib/auth.js";

export type AppEnv = {
  Variables: {
    requestId: string;
    user: AuthUser;
    session: AuthSession;
  };
};
