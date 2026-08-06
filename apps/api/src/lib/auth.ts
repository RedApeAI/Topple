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
import { validatePassword } from "./security.js";

/**
 * Signing in with Google also grants Plucia the user's mailbox, so the mail
 * feature is a real client rather than a fixture.
 *
 * `gmail.modify` is a Google *restricted* scope — it needs an app verification
 * and a CASA security assessment before anyone outside the project's test
 * users can grant it. `accessType: "offline"` plus `prompt: "consent"` are
 * both required to receive a refresh token: Google returns one only on a fresh
 * consent, so without the prompt the mailbox would go dark an hour after login
 * and never recover.
 */
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          scope: GMAIL_SCOPES,
          accessType: "offline" as const,
          prompt: "consent" as const,
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

const authAllowedHosts = [
  ...new Set([
    new URL(env.BETTER_AUTH_URL).host,
    ...env.FRONTEND_ORIGINS.map((origin) => new URL(origin).host),
  ]),
];

export const auth = betterAuth({
  appName: "Plucia",
  // Plucia is accessed directly on localhost and through HTTPS development
  // tunnels. Resolve callbacks from the incoming, allowlisted host so OAuth
  // state cookies are created and verified on the same browser origin.
  baseURL: {
    allowedHosts: authAllowedHosts,
    protocol: "auto",
    fallback: env.BETTER_AUTH_URL,
  },
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
  plugins: [organization()],
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
