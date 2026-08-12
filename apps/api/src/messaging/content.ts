import { AppError } from "../lib/errors.js";

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "b",
  "br",
  "code",
  "div",
  "em",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "u",
  "ul",
]);

const ALLOWED_HTML_ATTRIBUTES = new Set(["href", "title", "target", "rel"]);

/** A conservative HTML sanitizer for email bodies and AI drafts. */
export function sanitizeMessageHtml(value: string): string {
  let sanitized = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<\s*(script|style|iframe|object|embed|form|input|button|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s+(?:href|src)\s*=\s*(?:"|')?\s*javascript:[^"'\s>]+(?:"|')?/gi,
      "",
    )
    .replace(
      /<\s*([a-z0-9-]+)([^>]*)>/gi,
      (full, tag: string, attributes: string) => {
        const normalizedTag = tag.toLowerCase();
        if (!ALLOWED_HTML_TAGS.has(normalizedTag)) return "";
        const safeAttributes = attributes.replace(
          /([a-z0-9:-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
          (attribute: string, name: string, rawValue: string) => {
            const normalizedName = name.toLowerCase();
            if (!ALLOWED_HTML_ATTRIBUTES.has(normalizedName)) return "";
            const valueWithoutQuotes = rawValue.replace(/^['"]|['"]$/g, "");
            if (normalizedName === "href" && !isSafeHttpUrl(valueWithoutQuotes))
              return "";
            if (
              normalizedName === "target" &&
              !["_blank", "_self"].includes(valueWithoutQuotes)
            )
              return "";
            return ` ${normalizedName}="${escapeAttribute(valueWithoutQuotes)}"`;
          },
        );
        return `<${normalizedTag}${safeAttributes}>`;
      },
    )
    .replace(/<\s*\/\s*([a-z0-9-]+)\s*>/gi, (full, tag: string) =>
      ALLOWED_HTML_TAGS.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : "",
    );

  sanitized = sanitized.replace(
    /<\s*(?:a|span)\b([^>]*)>/gi,
    (full, attributes: string) => {
      if (!/\brel\s*=/i.test(attributes)) {
        return full.replace(/>$/, ' rel="noopener noreferrer">');
      }
      return full;
    },
  );
  return sanitized.trim();
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function safeFilename(value: string): string {
  const base = Array.from(value.normalize("NFKC"))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  const sanitized = base
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (sanitized || "attachment").slice(0, 180);
}

export function normalizeText(
  value: unknown,
  maxLength = 200_000,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function previewText(
  value: string | null,
  maxLength = 280,
): string | null {
  if (!value) return null;
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened ? flattened.slice(0, maxLength) : null;
}

/** Remove credentials and message bodies from logs/ledgers that only need a
 * replay-safe diagnostic shape. Normalized message columns retain the body. */
export function redactProviderPayload(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => redactProviderPayload(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(
    value as Record<string, unknown>,
  ).slice(0, 100)) {
    const normalizedKey = key.toLowerCase();
    if (
      /(token|secret|password|cookie|authorization|access_key|refresh_key)/.test(
        normalizedKey,
      )
    ) {
      output[key] = "[redacted]";
      continue;
    }
    if (
      ["html", "body", "body_text", "body_html", "text", "content"].includes(
        normalizedKey,
      ) &&
      typeof item === "string"
    ) {
      output[key] = "[redacted-content]";
      continue;
    }
    output[key] = redactProviderPayload(item, depth + 1);
  }
  return output;
}

export function assertMessageContent(input: {
  text?: string | null;
  html?: string | null;
}): { text: string | null; html: string | null } {
  const text = normalizeText(input.text);
  const html = input.html == null ? null : sanitizeMessageHtml(input.html);
  if (!text && !html) {
    throw new AppError(
      400,
      "MESSAGE_CONTENT_REQUIRED",
      "Message text or HTML is required",
    );
  }
  if (html && html.length > 200_000) {
    throw new AppError(
      413,
      "MESSAGE_CONTENT_TOO_LARGE",
      "Message content is too large",
    );
  }
  return { text, html };
}
