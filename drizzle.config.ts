import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

const rootDir = dirname(fileURLToPath(import.meta.url));

// `pnpm --filter @repo/db-sql db:migrate` runs drizzle-kit with the *package*
// as its working directory, so a bare `dotenv/config` would look for
// `packages/db-sql/.env` and silently find nothing. Load by absolute path
// instead, with the API's local profile first. dotenv never overwrites an
// already-set variable, so migrations target the same database the API uses.
for (const envPath of [
  resolve(rootDir, "apps/api/.env.local"),
  resolve(rootDir, "apps/api/.env"),
  resolve(rootDir, "packages/db-sql/.env"),
  resolve(rootDir, ".env"),
]) {
  if (existsSync(envPath)) loadEnv({ path: envPath });
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env, packages/db-sql/.env, or apps/api/.env.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  // The schema path must be absolute because this config is called from the
  // db-sql workspace. Drizzle Kit requires a workspace-relative migration
  // output path when reading its migration journal.
  schema: resolve(rootDir, "packages/db-sql/src/schema/*.ts"),
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
