import { env } from "./env.js";

/**
 * Password policy and response hardening.
 *
 * `validatePassword` returns *every* problem it finds rather than throwing on
 * the first, so the caller can show a complete list instead of making the user
 * resubmit once per rule. An empty array means the password is acceptable.
 */

/** Rejected regardless of length — these are the first guesses in any list. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty",
  "qwerty123",
  "letmein",
  "welcome",
  "welcome1",
  "iloveyou",
  "admin",
  "administrator",
  "changeme",
  "secret",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "abc123",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
]);

export function validatePassword(password: string): string[] {
  const problems: string[] = [];

  if (password.length < env.PASSWORD_MIN_LENGTH) {
    problems.push(
      `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (password.length > env.PASSWORD_MAX_LENGTH) {
    problems.push(
      `Password must be at most ${env.PASSWORD_MAX_LENGTH} characters`,
    );
  }
  if (!/[a-z]/.test(password)) {
    problems.push("Password must contain a lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    problems.push("Password must contain an uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    problems.push("Password must contain a number");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    problems.push("Password must contain a symbol");
  }
  // Strip trailing digits before the dictionary check so "Password123" is
  // caught by the same entry as "password".
  const normalized = password.toLowerCase().replace(/[0-9]+$/, "");
  if (
    COMMON_PASSWORDS.has(password.toLowerCase()) ||
    COMMON_PASSWORDS.has(normalized)
  ) {
    problems.push("Password is too common — choose something less guessable");
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push("Password must not be a single repeated character");
  }

  return problems;
}

/**
 * Headers layered on top of Hono's `secureHeaders()`.
 *
 * This process only ever serves JSON and auth redirects, so the CSP can deny
 * every fetch directive outright — nothing here loads a script, style, or
 * frame. HSTS is emitted only when the deployment is actually HTTPS, since
 * sending it over plain HTTP in development would pin localhost to TLS in the
 * developer's browser.
 */
export function getSecurityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy":
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
  };

  if (env.NODE_ENV === "production" || env.COOKIE_SECURE) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains";
  }

  return headers;
}
