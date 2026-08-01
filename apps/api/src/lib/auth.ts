import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  accounts,
  getDb,
  sessions,
  users,
  verifications,
} from "@repo/db-sql";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";

import { env } from "./env.js";
import { validatePassword } from "./security.js";

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
    },
  }),
  advanced: {
    database: { generateId: "uuid" },
    defaultCookieAttributes: {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_CROSS_SITE ? "none" : "lax",
      path: "/",
      ...(env.COOKIE_CROSS_SITE ? { partitioned: true } : {}),
    },
    useSecureCookies: env.COOKIE_SECURE,
  },
  session: {
    expiresIn: env.SESSION_EXPIRES_IN,
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: env.PASSWORD_MIN_LENGTH,
    maxPasswordLength: env.PASSWORD_MAX_LENGTH,
    revokeSessionsOnPasswordReset: true,
    passwordValidator: ({ password }: { password: string }) => {
      const problems = validatePassword(password);
      if (problems.length > 0) {
        return {
          valid: false,
          error: problems.join("; "),
        };
      }
      return { valid: true };
    },
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
  plugins: [],
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
