import { auth } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";
import { env } from "../lib/env.js";
import {
  clearFailedLogins,
  isAccountLocked,
  recordFailedLogin,
} from "../middleware/rate-limit.js";
import { validatePassword } from "../lib/security.js";

/**
 * Thin, typed wrapper around Better Auth's server API (`auth.api.*`).
 *
 * The routes layer should never talk to the database or to Better Auth
 * internals directly — it delegates here. Every method returns a normalized
 * shape:
 *
 *   { ok, status, data, headers? }
 *
 * `headers` carries the `set-cookie` responses that the route must forward to
 * the client. This keeps cookie plumbing out of the HTTP handlers.
 */

export interface ServiceResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Set-Cookie header values to propagate to the client. */
  cookies?: string[];
  error?: { code: string; message: string };
}

function extractCookies(headers: Headers | undefined): string[] | undefined {
  if (!headers) return undefined;
  const cookies = headers.getSetCookie?.() ?? [];
  return cookies.length > 0 ? cookies : undefined;
}

function toAppError(result: ServiceResult): never {
  throw new AppError(
    result.status as 400 | 401 | 403 | 404 | 409 | 429,
    result.error?.code ?? "AUTH_ERROR",
    result.error?.message ?? "Authentication failed",
  );
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export async function register(
  input: RegisterInput,
  headers: Headers,
): Promise<ServiceResult<{ user: unknown; token: string | null }>> {
  const passwordProblems = validatePassword(input.password);
  if (passwordProblems.length > 0) {
    throw new AppError(400, "WEAK_PASSWORD", passwordProblems.join("; "));
  }

  try {
    const result = (await auth.api.signUpEmail({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
      },
      headers,
      returnHeaders: true,
      returnStatus: true,
    })) as unknown as {
      headers?: Headers;
      response: { user: unknown; token: string | null };
      status: number;
    };

    clearFailedLogins(input.email);
    return {
      ok: true,
      status: result.status ?? 200,
      data: result.response,
      cookies: extractCookies(result.headers),
    };
  } catch (error) {
    throw mapAuthError(error);
  }
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function login(
  input: LoginInput,
  headers: Headers,
): Promise<ServiceResult<{ user: unknown; token: string | null }>> {
  const { locked, retryAfterMs } = isAccountLocked(input.email);
  if (locked) {
    return {
      ok: false,
      status: 429,
      data: null,
      error: {
        code: "ACCOUNT_LOCKED",
        message: `Too many failed attempts. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
      },
    };
  }

  try {
    const result = (await auth.api.signInEmail({
      body: {
        email: input.email,
        password: input.password,
      },
      headers,
      returnHeaders: true,
      returnStatus: true,
    })) as unknown as {
      headers?: Headers;
      response: { user: unknown; token: string | null };
      status: number;
    };

    clearFailedLogins(input.email);
    return {
      ok: true,
      status: result.status ?? 200,
      data: result.response,
      cookies: extractCookies(result.headers),
    };
  } catch (error) {
    recordFailedLogin(input.email);
    throw mapAuthError(error);
  }
}

export async function logout(headers: Headers): Promise<ServiceResult> {
  try {
    const result = (await auth.api.signOut({
      headers,
      returnHeaders: true,
      returnStatus: true,
    })) as unknown as { headers?: Headers; response: unknown; status: number };

    return {
      ok: true,
      status: result.status ?? 200,
      data: result.response,
      cookies: extractCookies(result.headers),
    };
  } catch (error) {
    throw mapAuthError(error);
  }
}

export interface GetSessionResult {
  user: unknown;
  session: unknown;
}

export async function getSession(
  headers: Headers,
): Promise<ServiceResult<GetSessionResult>> {
  try {
    const result = (await auth.api.getSession({
      headers,
      returnHeaders: true,
    })) as unknown as {
      headers?: Headers;
      response: { user: unknown; session: unknown } | null;
    };

    return {
      ok: Boolean(result?.response),
      status: result?.response ? 200 : 401,
      data: result?.response ?? null,
      cookies: extractCookies(result?.headers),
    };
  } catch (error) {
    throw mapAuthError(error);
  }
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(
  input: ChangePasswordInput,
  headers: Headers,
): Promise<ServiceResult> {
  const passwordProblems = validatePassword(input.newPassword);
  if (passwordProblems.length > 0) {
    throw new AppError(400, "WEAK_PASSWORD", passwordProblems.join("; "));
  }

  try {
    const result = (await auth.api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      },
      headers,
      returnHeaders: true,
      returnStatus: true,
    })) as unknown as { headers?: Headers; response: unknown; status: number };

    return {
      ok: true,
      status: result.status ?? 200,
      data: result.response,
      cookies: extractCookies(result.headers),
    };
  } catch (error) {
    throw mapAuthError(error);
  }
}

export interface RequestPasswordResetInput {
  email: string;
  redirectTo?: string;
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  headers: Headers,
): Promise<ServiceResult> {
  try {
    const result = (await auth.api.requestPasswordReset({
      body: {
        email: input.email,
        redirectTo:
          input.redirectTo ?? `${env.FRONTEND_ORIGINS[0]}/reset-password`,
      },
      headers,
      returnHeaders: true,
      returnStatus: true,
    })) as unknown as { headers?: Headers; response: unknown; status: number };

    return {
      ok: true,
      status: result.status ?? 200,
      data: result.response,
      cookies: extractCookies(result.headers),
    };
  } catch (error) {
    throw mapAuthError(error);
  }
}

export interface ResetPasswordInput {
  newPassword: string;
  token: string;
}

export async function resetPassword(
  input: ResetPasswordInput,
  headers: Headers,
): Promise<ServiceResult> {
  const passwordProblems = validatePassword(input.newPassword);
  if (passwordProblems.length > 0) {
    throw new AppError(400, "WEAK_PASSWORD", passwordProblems.join("; "));
  }

  try {
    const result = (await auth.api.resetPassword({
      body: {
        newPassword: input.newPassword,
        token: input.token,
      },
      headers,
      returnHeaders: true,
      returnStatus: true,
    })) as unknown as { headers?: Headers; response: unknown; status: number };

    return {
      ok: true,
      status: result.status ?? 200,
      data: result.response,
      cookies: extractCookies(result.headers),
    };
  } catch (error) {
    throw mapAuthError(error);
  }
}

/** Throws an AppError if the service call failed; used by routes. */
export function assertOk(result: ServiceResult): void {
  if (!result.ok) toAppError(result);
}

function mapAuthError(error: unknown): AppError {
  const status = (error as { statusCode?: number })?.statusCode;
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message;

  if (status === 401) {
    return new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password",
    );
  }
  if (status === 403) {
    return new AppError(403, "FORBIDDEN", "Access denied");
  }
  if (status === 404) {
    return new AppError(404, "NOT_FOUND", message ?? "Resource not found");
  }
  if (status === 409) {
    return new AppError(409, "CONFLICT", message ?? "Resource conflict");
  }
  if (status === 429) {
    return new AppError(429, "RATE_LIMITED", message ?? "Too many requests");
  }
  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    // Deliberately generic to avoid account enumeration.
    return new AppError(
      409,
      "EMAIL_IN_USE",
      "That email is already registered",
    );
  }
  if (code === "INVALID_EMAIL_OR_PASSWORD") {
    return new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password",
    );
  }
  if (code === "EMAIL_NOT_VERIFIED") {
    return new AppError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Please verify your email first",
    );
  }
  if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") {
    return new AppError(400, "WEAK_PASSWORD", message ?? "Invalid password");
  }

  return new AppError(
    (status as 400 | 401 | 403 | 404 | 409 | 429) ?? 401,
    "AUTH_ERROR",
    message ?? "Authentication failed",
  );
}
