import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";

import { app } from "./app.js";
import { env } from "./lib/env.js";
import { initializeWebSocket, SOCKET_PATH } from "./websocket/server.js";

const server = createServer();

// Attach socket.io first so it owns the `/api/socket.io` namespace.
initializeWebSocket(server);

// Hono's listener is registered after socket.io's. Requests headed for the
// socket.io namespace are skipped here — otherwise Hono would also fire on
// socket.io polling requests and throw `ERR_HTTP_HEADERS_SENT`.
const honoListener = getRequestListener(app.fetch, {});
server.on("request", (request, response) => {
  if (request.url?.startsWith(SOCKET_PATH)) return;
  honoListener(request, response);
});

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
