import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  accounts,
  getDb,
  invitations,
  members,
  organizations,
  sessions,
  users,
  verifications,
} from "@repo/db-sql";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { env } from "./env.js";

const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
    ? {
        apple: {
          clientId: env.APPLE_CLIENT_ID,
          clientSecret: env.APPLE_CLIENT_SECRET,
        },
      }
    : {}),
};

export const auth = betterAuth({
  appName: "Plucia",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.FRONTEND_ORIGINS,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verification: verifications,
      organization: organizations,
      member: members,
      invitation: invitations,
    },
  }),
  advanced: {
    database: { generateId: "uuid" },
    defaultCookieAttributes: {
      httpOnly: true,
      secure: env.NODE_ENV === "production" || env.COOKIE_CROSS_SITE,
      sameSite: env.COOKIE_CROSS_SITE ? "none" : "lax",
      ...(env.COOKIE_CROSS_SITE ? { partitioned: true } : {}),
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  socialProviders,
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      requireLocalEmailVerified: true,
    },
  },
  user: {
    deleteUser: { enabled: true },
    additionalFields: {
      status: {
        type: "string",
        required: false,
        defaultValue: "active",
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [user] = await getDb()
            .select({ status: users.status })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);

          return user?.status === "active";
        },
      },
    },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      membershipLimit: 100,
      invitationExpiresIn: 60 * 60 * 48,
    }),
  ],
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/forget-password": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
