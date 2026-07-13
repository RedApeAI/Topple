import { customType } from "drizzle-orm/pg-core";

/** PostgreSQL's case-insensitive text type. Requires `create extension citext`. */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});
