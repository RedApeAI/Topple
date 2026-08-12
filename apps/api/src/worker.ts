import type { AppBindings } from "./types.js";

/**
 * The existing Better Auth/Drizzle modules read the Node environment during
 * module initialization. Workers provide the same values as bindings, so
 * hydrate the compatibility process environment before dynamically loading
 * those modules. Secrets remain server-side and are never copied to a
 * response or browser event.
 */
function hydrateProcessEnvironment(bindings: AppBindings): void {
  const global = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  global.process ??= { env: {} };
  global.process.env ??= {};
  const processObject = global.process;
  const processEnv = processObject.env;
  if (!processEnv) return;
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string") processEnv[key] = value;
  }
}

/** Cloudflare Workers entry point for the HTTP API. */
const worker = {
  async fetch(
    request: Request,
    env: AppBindings,
    context: ExecutionContext,
  ): Promise<Response> {
    hydrateProcessEnvironment(env);
    const { app } = await import("./app.js");
    return app.fetch(request, env, context);
  },
  async scheduled(
    _controller: ScheduledController,
    env: AppBindings,
    context: ExecutionContext,
  ): Promise<void> {
    hydrateProcessEnvironment(env);
    const { processMessagingJobs } = await import("./messaging/job-runner.js");
    context.waitUntil(processMessagingJobs(env, 10));
  },
};

export default worker;
