import axios, { AxiosError } from "axios";

/**
 * The one HTTP client for the BFF (`apps/api`).
 *
 * `baseURL` is empty by default so every request goes to the frontend origin
 * and Vite's dev proxy forwards it. That keeps the session cookie same-origin,
 * which is what makes Better Auth's OAuth callbacks work behind an HTTPS
 * tunnel — see the proxy comment in `vite.config.ts`. Set `VITE_API_URL` only
 * when the API really is on another origin.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  withCredentials: true,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

/**
 * Budget for a request that runs the agent loop server-side.
 *
 * 30s is right for reads, but an Operator command or a document ingest is an
 * LLM loop and legitimately runs longer. Each hop's budget has to be shorter
 * than the one outside it, or the browser abandons a request that is still
 * being worked on and the user sees a failure that did not happen:
 *
 *   Cloudflare edge   ~100s   fixed — returns 524 past this
 *   this client         95s
 *   BFF                 85s   TIMEOUT_MS in orchestrator.service.ts
 *   orchestrator        75s   OPERATOR_DEADLINE_SECONDS
 */
export const AGENT_TIMEOUT_MS = 95_000;

/** Error body shapes we may receive: Hono BFF, then FastAPI orchestrator. */
interface ApiErrorBody {
  error?: { code?: string; message?: string } | string;
  detail?: string | { msg?: string }[];
  message?: string;
}

function bodyMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body.trim() || undefined;
  if (!body || typeof body !== "object") return undefined;

  const { error, detail, message } = body as ApiErrorBody;

  // `{ error: { code, message } }` — every apps/api failure.
  if (error && typeof error === "object" && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;

  // `{ detail: ... }` — FastAPI's HTTPException and 422 validation arrays.
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const joined = detail
      .map((issue) => issue?.msg)
      .filter(Boolean)
      .join("; ");
    if (joined) return joined;
  }

  if (typeof message === "string" && message.trim()) return message;
  return undefined;
}

/**
 * A message worth showing a salesperson. Prefers what the server said, falls
 * back to `fallback`, and never surfaces a bare "Request failed with status
 * code 500".
 */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (axios.isAxiosError(error)) {
    if (isBackendUnreachable(error)) {
      return "Can't reach the server — check that it's running and try again.";
    }
    return bodyMessage(error.response?.data) ?? error.message ?? fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * True when the request never reached a working service — the caller is then
 * free to fall back to fixture data rather than showing an error. A 4xx is
 * deliberately *not* unreachable: the service answered, the request was wrong.
 */
export function isBackendUnreachable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;

  // No response at all: DNS failure, connection refused, timeout, CORS block.
  if (!error.response) {
    return (
      error.code === AxiosError.ERR_NETWORK ||
      error.code === AxiosError.ECONNABORTED ||
      error.code === AxiosError.ETIMEDOUT ||
      error.code === undefined
    );
  }

  // A proxy answered but the service behind it did not.
  return [502, 503, 504].includes(error.response.status);
}
