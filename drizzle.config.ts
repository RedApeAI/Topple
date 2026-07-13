import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  dialect: "postgresql",
  // The schema path must be absolute because this config is called from the
  // db-sql workspace. Drizzle Kit requires a workspace-relative migration
  // output path when reading its migration journal.
  schema: resolve(rootDir, "packages/db-sql/src/schema/*.ts"),
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
