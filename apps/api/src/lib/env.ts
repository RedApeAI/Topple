import "dotenv/config";

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
    GOOGLE_CLIENT_ID: optionalCredential,
    GOOGLE_CLIENT_SECRET: optionalCredential,
    APPLE_CLIENT_ID: optionalCredential,
    APPLE_CLIENT_SECRET: optionalCredential,
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

export const env = {
  ...parsed.data,
  FRONTEND_ORIGINS: frontendOrigins,
};
