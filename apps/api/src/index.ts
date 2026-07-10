import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    ok: true,
    service: "api",
  });
});

app.get("/health", (c) => {
  return c.json({
    ok: true,
  });
});

const port = Number.parseInt(process.env.PORT ?? "4000", 10);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
