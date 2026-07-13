import type { AuthSession, AuthUser } from "./lib/auth.js";

export type OrganizationRole = "owner" | "admin" | "member";

export type AppEnv = {
  Variables: {
    requestId: string;
    user: AuthUser;
    session: AuthSession;
    organizationId: string;
    organizationRole: OrganizationRole;
  };
};
