import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { getDatabaseUrl } from "./env.js";

export function createDb() {
  return drizzle({ client: neon(getDatabaseUrl()) });
}

let database: ReturnType<typeof createDb> | undefined;

/** Return the process-wide Drizzle client shared by API routes and services. */
export function getDb(): ReturnType<typeof createDb> {
  database ??= createDb();
  return database;
}
