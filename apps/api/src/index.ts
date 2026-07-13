import { serve } from "@hono/node-server";

import { app } from "./app.js";
import { env } from "./lib/env.js";

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.info(
      JSON.stringify({
        level: "info",
        event: "server.started",
        port: info.port,
      }),
    );
  },
);
