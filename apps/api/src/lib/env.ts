import { z } from "zod";

const optionalCredential = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const rawEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    FRONTEND_ORIGINS: z.string().min(1),
    COOKIE_CROSS_SITE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    // Force the session cookie to be marked Secure even when the app is
    // behind a TLS-terminating proxy and NODE_ENV is not "production".
    // Defaults to true in production, false in development.
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value === "true",
      ),
    // Session lifetime in seconds (Better Auth default is 7 days).
    SESSION_EXPIRES_IN: z.coerce
      .number()
      .int()
      .min(60)
      .default(60 * 60 * 24 * 7),
    // Auth rate limiting (sliding window).
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    // Password policy.
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(64).default(10),
    PASSWORD_MAX_LENGTH: z.coerce.number().int().min(16).max(256).default(128),
    // Optional per-account lockout after N failed sign-ins.
    AUTH_LOCKOUT_THRESHOLD: z.coerce.number().int().min(3).default(5),
    AUTH_LOCKOUT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .default(15 * 60_000),
    AUTH_LOCKOUT_DURATION_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .default(15 * 60_000),
    GOOGLE_CLIENT_ID: optionalCredential,
    GOOGLE_CLIENT_SECRET: optionalCredential,
    APPLE_CLIENT_ID: optionalCredential,
    APPLE_CLIENT_SECRET: optionalCredential,
    // The orchestrator. All browser traffic to it is proxied through this
    // service so tenant/user identity comes from the session, never the client.
    ORCHESTRATOR_URL: z.url().default("http://localhost:8000"),
    // Shared secret the orchestrator presents on /api/v1/mail/outbound. That
    // endpoint sends mail as an arbitrary user_id and has no session cookie to
    // check, so without this configured it refuses every request.
    OUTBOUND_WEBHOOK_SECRET: optionalCredential,
    // Unipile messaging is optional in local development. Routes return a
    // typed configuration error until the provider credentials are present.
    UNIPILE_API_KEY: optionalCredential,
    UNIPILE_BASE_URL: z.url().default("https://api.unipile.com"),
    UNIPILE_API_VERSION: z
      .string()
      .regex(/^v[0-9]+$/)
      .default("v2"),
    UNIPILE_WEBHOOK_SECRET: optionalCredential,
    UNIPILE_HOSTED_AUTH_DOMAIN: optionalCredential,
    MESSAGING_CALLBACK_URL: z.url().optional(),
    MESSAGING_MAX_ATTACHMENT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(15 * 1024 * 1024)
      .default(15 * 1024 * 1024),
    MESSAGING_SSE_POLL_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(10_000)
      .default(2_000),
    MESSAGING_SSE_MAX_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(60)
      .default(25),
    MESSAGING_AI_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    MESSAGING_AI_PROVIDER_URL: z.url().optional(),
    MESSAGING_AI_API_KEY: optionalCredential,
    MESSAGING_AI_MODEL: z.string().min(1).max(128).default("messaging-default"),
  })
  .superRefine((value, context) => {
    for (const [provider, clientId, clientSecret] of [
      ["Google", value.GOOGLE_CLIENT_ID, value.GOOGLE_CLIENT_SECRET],
      ["Apple", value.APPLE_CLIENT_ID, value.APPLE_CLIENT_SECRET],
    ] as const) {
      if (Boolean(clientId) !== Boolean(clientSecret)) {
        context.addIssue({
          code: "custom",
          path: [`${provider.toUpperCase()}_CLIENT_ID`],
          message: `${provider} OAuth requires both client id and client secret`,
        });
      }
    }
  });

function parseOrigins(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      if (origin.includes("*")) {
        throw new Error("wildcard origins are not allowed");
      }

      const url = new URL(origin);
      if (url.origin !== origin.replace(/\/$/, "")) {
        throw new Error(`origin must not include a path: ${origin}`);
      }
      return url.origin;
    });

  if (origins.length === 0) {
    throw new Error("at least one frontend origin is required");
  }

  return [...new Set(origins)];
}

const parsed = rawEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.issues
    .map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    )
    .join("; ");
  throw new Error(`Invalid API environment: ${fields}`);
}

let frontendOrigins: string[];
try {
  frontendOrigins = parseOrigins(parsed.data.FRONTEND_ORIGINS);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "invalid origin list";
  throw new Error(`Invalid API environment: FRONTEND_ORIGINS: ${message}`);
}

const parsedData = parsed.data;

export const env = {
  ...parsedData,
  FRONTEND_ORIGINS: frontendOrigins,
  COOKIE_SECURE:
    parsedData.COOKIE_SECURE ??
    (parsedData.NODE_ENV === "production" ||
      parsedData.COOKIE_CROSS_SITE === true),
};
