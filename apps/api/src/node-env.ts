import { config } from "dotenv";

// This module is imported for side effects before the rest of the Node entry
// point's dependency graph is evaluated. Calling dotenv from inside
// index.ts's body is too late for statically imported modules such as env.ts.
config({ path: ".env.local" });
config();
