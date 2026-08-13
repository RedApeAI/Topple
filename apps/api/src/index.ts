import "./node-env.js";

import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";

import { app } from "./app.js";
import { env } from "./lib/env.js";

const honoListener = getRequestListener(app.fetch, {});
const server = createServer(honoListener);

server.listen(env.PORT, () => {
  const address = server.address();
  console.info(
    JSON.stringify({
      level: "info",
      event: "server.started",
      port: typeof address === "object" && address ? address.port : env.PORT,
    }),
  );
});
