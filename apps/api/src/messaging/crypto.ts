import type { MessagingConnectChannel } from "./contracts.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(
  secret: string,
  value: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(value),
  );
  return bytesToHex(new Uint8Array(signature));
}

// Web Crypto's verify API accepts bytes, so this helper avoids a Node Buffer
// dependency and keeps the same code usable in Workers.
function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );
}

export async function verifyHmacSha256HexSafe(
  secret: string,
  value: string,
  signatureHex: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(signatureHex)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(signatureHex) as unknown as BufferSource,
    textEncoder.encode(value),
  );
}

export type HostedStatePayload = {
  organizationId: string;
  userId: string;
  channel: MessagingConnectChannel;
  nonce: string;
  expiresAt: number;
  returnPath: string;
};

export async function createHostedState(
  payload: Omit<HostedStatePayload, "nonce" | "expiresAt"> & {
    ttlSeconds?: number;
  },
  secret: string,
): Promise<{ state: string; payload: HostedStatePayload; nonceHash: string }> {
  const statePayload: HostedStatePayload = {
    ...payload,
    nonce: crypto.randomUUID(),
    expiresAt: Date.now() + (payload.ttlSeconds ?? 600) * 1000,
  };
  const encoded = bytesToBase64Url(
    textEncoder.encode(JSON.stringify(statePayload)),
  );
  const signature = await hmacSha256Hex(secret, encoded);
  return {
    state: `${encoded}.${signature}`,
    payload: statePayload,
    nonceHash: await sha256Hex(statePayload.nonce),
  };
}

export async function verifyHostedState(
  state: string,
  secret: string,
): Promise<HostedStatePayload | null> {
  const [encoded, signature] = state.split(".");
  if (
    !encoded ||
    !signature ||
    !(await verifyHmacSha256HexSafe(secret, encoded, signature))
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      textDecoder.decode(base64UrlToBytes(encoded)),
    ) as HostedStatePayload;
    if (
      !parsed ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.channel !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.returnPath !== "string" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isSafeReturnPath(value: string): boolean {
  return (
    value.length <= 512 &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("://")
  );
}

export function parseUnipileSignature(
  value: string | null,
): { timestamp: number; signature: string } | null {
  if (!value) return null;
  const parts = Object.fromEntries(
    value.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v0;
  if (!Number.isFinite(timestamp) || !signature) return null;
  return { timestamp, signature };
}
