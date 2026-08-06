import { AppError } from "../lib/errors.js";
import { auth } from "../lib/auth.js";

/**
 * Gmail REST client.
 *
 * Every call runs here rather than in the browser: the OAuth access token is
 * a server-side secret, and it expires hourly. `accessTokenFor` delegates the
 * refresh to Better Auth, which owns the stored refresh token.
 *
 * Gmail is the source of truth — nothing is mirrored into Postgres. The mail
 * screen reads live, so a message archived in Gmail proper is archived here
 * on the next load.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** How many message bodies to fetch in parallel when building a list page. */
const LIST_CONCURRENCY = 8;

// --------------------------------------------------------------------------
// Wire types (the subset of the Gmail resource we use)
// --------------------------------------------------------------------------
interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

interface GmailLabel {
  id: string;
  name: string;
  type?: "system" | "user";
}

export interface MailAddress {
  name: string;
  email: string;
}

export interface MailAttachment {
  id: string;
  name: string;
  size: string;
}

/** The shape apps/web renders. Mirrors `MailMessage` in the web types. */
export interface MailMessage {
  id: string;
  threadId: string;
  box: "inbox" | "sent" | "drafts" | "scheduled" | "archive" | "trash" | "spam";
  from: MailAddress;
  to: MailAddress[];
  cc?: MailAddress[];
  senderLine?: string;
  subject: string;
  preview: string;
  /** Plain text: previews, search, and the quoted block in a reply. */
  body: string;
  /** The sender's own HTML, when the message had an HTML part. Untrusted. */
  bodyHtml?: string;
  receivedAt: string;
  tag: "important" | "newsletter" | "calendar" | "other";
  labels: string[];
  unread: boolean;
  starred: boolean;
  replied?: boolean;
  attachments?: MailAttachment[];
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------
/**
 * A valid Google access token for this user, refreshed if it has expired.
 *
 * A user who signed up with email/password has no Google account linked, and
 * one who consented before the Gmail scopes were added has a token that
 * predates them — both surface as a 403 telling the client to reconnect,
 * which is a re-consent, not an error to retry.
 *
 * `headers` must be omitted for machine-to-machine callers (the orchestrator's
 * outbound webhook). Better Auth's `resolveUserId` throws UNAUTHORIZED when it
 * is handed headers that carry no session, even if `userId` is supplied —
 * passing none is what makes the `userId` lookup authoritative.
 */
export async function accessTokenFor(
  userId: string,
  headers?: Headers,
): Promise<string> {
  let result: { accessToken?: string } | null = null;
  try {
    result = await auth.api.getAccessToken({
      body: { providerId: "google", userId },
      ...(headers ? { headers } : {}),
    });
  } catch {
    throw new AppError(
      403,
      "GMAIL_NOT_CONNECTED",
      "Reconnect your Google account to use mail.",
    );
  }

  if (!result?.accessToken) {
    throw new AppError(
      403,
      "GMAIL_NOT_CONNECTED",
      "Reconnect your Google account to use mail.",
    );
  }
  return result.accessToken;
}

// --------------------------------------------------------------------------
// Transport
// --------------------------------------------------------------------------
async function gmailFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // 401/403 here means the grant was revoked or the scope is missing —
    // both are fixed by reconnecting, not by retrying.
    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        403,
        "GMAIL_NOT_CONNECTED",
        "Google rejected the mailbox request. Reconnect your Google account.",
      );
    }
    if (response.status === 429) {
      throw new AppError(
        429,
        "GMAIL_RATE_LIMITED",
        "Gmail is rate limiting this account. Try again shortly.",
      );
    }
    throw new AppError(
      502,
      "GMAIL_ERROR",
      `Gmail request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Resolve promises `limit` at a time so a 50-message page can't open 50 sockets. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]!);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

// --------------------------------------------------------------------------
// Parsing
// --------------------------------------------------------------------------
function decodeBase64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const match = headers?.find(
    (header) => header.name.toLowerCase() === name.toLowerCase(),
  );
  return match?.value ?? "";
}

/** `"Ada Lovelace" <ada@example.com>, bob@example.com` → structured addresses. */
export function parseAddressList(value: string): MailAddress[] {
  if (!value.trim()) return [];

  const addresses: MailAddress[] = [];
  // Split on commas that aren't inside a quoted display name.
  for (const part of value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const entry = part.trim();
    if (!entry) continue;

    const angled = entry.match(/^(.*)<([^>]+)>$/);
    if (angled) {
      const name = angled[1]!.trim().replace(/^"(.*)"$/, "$1");
      const email = angled[2]!.trim();
      addresses.push({ name: name || email.split("@")[0]!, email });
      continue;
    }
    addresses.push({ name: entry.split("@")[0]!, email: entry });
  }
  return addresses;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Both representations of the body.
 *
 * A `multipart/alternative` message carries the same content twice, and the
 * two are not interchangeable: the HTML part is what the sender designed, and
 * the plain part is a lossy transcription where links collapse to bare URLs.
 * Rendering the plain part is why a newsletter arrived looking like a
 * link dump. Keep both — HTML for display, text for previews, search and
 * reply quoting.
 */
function extractBody(payload: GmailPart | undefined): {
  text: string;
  html: string;
} {
  if (!payload) return { text: "", html: "" };

  const plain: string[] = [];
  const html: string[] = [];

  const walk = (part: GmailPart) => {
    const mime = part.mimeType ?? "";
    if (part.body?.data) {
      if (mime === "text/plain") plain.push(decodeBase64Url(part.body.data));
      else if (mime === "text/html") html.push(decodeBase64Url(part.body.data));
    }
    part.parts?.forEach(walk);
  };
  walk(payload);

  const htmlBody = html.join("\n").trim();
  return {
    // Derive text from HTML only when the sender didn't provide it.
    text: plain.length > 0 ? plain.join("\n").trim() : stripHtml(htmlBody),
    html: htmlBody,
  };
}

function collectAttachments(payload: GmailPart | undefined): MailAttachment[] {
  const attachments: MailAttachment[] = [];

  const walk = (part: GmailPart) => {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        name: part.filename,
        size: formatBytes(part.body.size ?? 0),
      });
    }
    part.parts?.forEach(walk);
  };
  if (payload) walk(payload);
  return attachments;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deriveBox(labelIds: string[]): MailMessage["box"] {
  // Order matters: a trashed draft is in the trash, not in drafts.
  if (labelIds.includes("TRASH")) return "trash";
  if (labelIds.includes("SPAM")) return "spam";
  if (labelIds.includes("DRAFT")) return "drafts";
  if (labelIds.includes("SENT")) return "sent";
  if (labelIds.includes("INBOX")) return "inbox";
  // Gmail's "archive" is simply the absence of INBOX.
  return "archive";
}

function deriveTag(labelIds: string[]): MailMessage["tag"] {
  if (labelIds.includes("CATEGORY_PROMOTIONS")) return "newsletter";
  if (labelIds.includes("CATEGORY_UPDATES")) return "newsletter";
  if (labelIds.includes("CATEGORY_FORUMS")) return "newsletter";
  if (labelIds.includes("IMPORTANT")) return "important";
  return "other";
}

/** Sender column: "ada .. bob, carol" when several people are on the thread. */
function senderLine(from: MailAddress, to: MailAddress[]): string | undefined {
  if (to.length <= 1) return undefined;
  const first = from.email.split("@")[0];
  const rest = to
    .slice(0, 2)
    .map((address) => address.name || address.email.split("@")[0])
    .join(", ");
  return `${first} .. ${rest}`;
}

function toMailMessage(
  message: GmailMessage,
  userLabels: Map<string, string>,
): MailMessage {
  const labelIds = message.labelIds ?? [];
  const headers = message.payload?.headers;

  const from = parseAddressList(headerValue(headers, "From"))[0] ?? {
    name: "Unknown",
    email: "",
  };
  const to = parseAddressList(headerValue(headers, "To"));
  const cc = parseAddressList(headerValue(headers, "Cc"));
  const { text: body, html: bodyHtml } = extractBody(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    box: deriveBox(labelIds),
    from,
    to,
    ...(cc.length > 0 ? { cc } : {}),
    ...(senderLine(from, to) ? { senderLine: senderLine(from, to) } : {}),
    subject: headerValue(headers, "Subject") || "(no subject)",
    preview: message.snippet ?? "",
    body,
    ...(bodyHtml ? { bodyHtml } : {}),
    receivedAt: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date().toISOString(),
    tag: deriveTag(labelIds),
    labels: labelIds
      .map((id) => userLabels.get(id))
      .filter((name): name is string => Boolean(name)),
    unread: labelIds.includes("UNREAD"),
    starred: labelIds.includes("STARRED"),
    ...(headerValue(headers, "In-Reply-To") ? { replied: true } : {}),
    ...(collectAttachments(message.payload).length > 0
      ? { attachments: collectAttachments(message.payload) }
      : {}),
  };
}

// --------------------------------------------------------------------------
// Labels
// --------------------------------------------------------------------------
/** User-created labels only, keyed by id — system labels drive `box`/`tag`. */
async function userLabelMap(token: string): Promise<Map<string, string>> {
  const { labels } = await gmailFetch<{ labels?: GmailLabel[] }>(
    token,
    "/labels",
  );
  const map = new Map<string, string>();
  for (const label of labels ?? []) {
    if (label.type === "user") map.set(label.id, label.name);
  }
  return map;
}

export async function listLabels(token: string): Promise<string[]> {
  return [...(await userLabelMap(token)).values()].sort();
}

/** Resolve a label name to its id, creating the label when it's new. */
async function labelIdForName(token: string, name: string): Promise<string> {
  const { labels } = await gmailFetch<{ labels?: GmailLabel[] }>(
    token,
    "/labels",
  );
  const existing = labels?.find(
    (label) => label.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) return existing.id;

  const created = await gmailFetch<GmailLabel>(token, "/labels", {
    method: "POST",
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  return created.id;
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------
/** Gmail search syntax per mailbox view. */
const BOX_QUERY: Record<string, string> = {
  inbox: "in:inbox",
  sent: "in:sent",
  drafts: "in:drafts",
  archive: "-in:inbox -in:sent -in:trash -in:spam",
  trash: "in:trash",
  spam: "in:spam",
  starred: "is:starred",
  all: "in:anywhere",
};

export interface ListOptions {
  box?: string;
  search?: string;
  limit?: number;
  pageToken?: string;
}

export async function listMessages(
  token: string,
  options: ListOptions = {},
): Promise<{
  messages: MailMessage[];
  nextPageToken?: string;
  labels: string[];
}> {
  const parts = [BOX_QUERY[options.box ?? "inbox"] ?? "in:inbox"];
  if (options.search?.trim()) parts.push(options.search.trim());

  const params = new URLSearchParams({
    q: parts.join(" "),
    maxResults: String(Math.min(options.limit ?? 30, 100)),
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const page = await gmailFetch<{
    messages?: { id: string }[];
    nextPageToken?: string;
  }>(token, `/messages?${params}`);

  const labelMap = await userLabelMap(token);
  const ids = page.messages ?? [];

  // `messages.list` returns ids only. Metadata format is enough for the list
  // row (headers + snippet) and skips downloading every body.
  const messages = await pooled(ids, LIST_CONCURRENCY, async ({ id }) =>
    toMailMessage(
      await gmailFetch<GmailMessage>(
        token,
        `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=In-Reply-To`,
      ),
      labelMap,
    ),
  );

  return {
    messages,
    ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
    labels: [...labelMap.values()].sort(),
  };
}

/** One message with its body — what the reader pane opens. */
export async function getMessage(
  token: string,
  id: string,
): Promise<MailMessage> {
  const [message, labelMap] = await Promise.all([
    gmailFetch<GmailMessage>(token, `/messages/${id}?format=full`),
    userLabelMap(token),
  ]);
  return toMailMessage(message, labelMap);
}

// --------------------------------------------------------------------------
// Mutations
// --------------------------------------------------------------------------
async function modify(
  token: string,
  ids: string[],
  body: { addLabelIds?: string[]; removeLabelIds?: string[] },
): Promise<void> {
  if (ids.length === 0) return;
  // batchModify takes up to 1000 ids and returns 204.
  await gmailFetch<void>(token, "/messages/batchModify", {
    method: "POST",
    body: JSON.stringify({ ids, ...body }),
  });
}

export function setRead(token: string, ids: string[], read: boolean) {
  return modify(
    token,
    ids,
    read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] },
  );
}

export function setStarred(token: string, ids: string[], starred: boolean) {
  return modify(
    token,
    ids,
    starred ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] },
  );
}

/** Archive is removing INBOX; restore puts it back. */
export function archive(token: string, ids: string[]) {
  return modify(token, ids, { removeLabelIds: ["INBOX"] });
}

export function unarchive(token: string, ids: string[]) {
  return modify(token, ids, { addLabelIds: ["INBOX"] });
}

export function setSpam(token: string, ids: string[], spam: boolean) {
  return modify(
    token,
    ids,
    spam
      ? { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] }
      : { addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] },
  );
}

/**
 * Trash, not delete. `messages.delete` is irreversible and needs a scope we
 * deliberately don't hold; trashing is what the UI's "delete" means anyway.
 */
export async function trash(token: string, ids: string[]): Promise<void> {
  await pooled(ids, LIST_CONCURRENCY, (id) =>
    gmailFetch<void>(token, `/messages/${id}/trash`, { method: "POST" }),
  );
}

export async function untrash(token: string, ids: string[]): Promise<void> {
  await pooled(ids, LIST_CONCURRENCY, (id) =>
    gmailFetch<void>(token, `/messages/${id}/untrash`, { method: "POST" }),
  );
}

export async function applyLabel(
  token: string,
  ids: string[],
  label: string,
): Promise<void> {
  await modify(token, ids, {
    addLabelIds: [await labelIdForName(token, label)],
  });
}

export async function createLabel(token: string, label: string): Promise<void> {
  await labelIdForName(token, label);
}

// --------------------------------------------------------------------------
// Sending
// --------------------------------------------------------------------------
export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** Set when replying, so Gmail threads the message correctly. */
  threadId?: string;
  inReplyTo?: string;
}

/**
 * RFC 2822 message, base64url encoded as Gmail requires.
 *
 * Headers are encoded per RFC 2047 when they carry non-ASCII, and the body is
 * sent as UTF-8 — otherwise an accented name or a non-Latin subject arrives
 * as mojibake.
 */
function buildMime(mail: OutgoingMail): string {
  const encodeHeader = (value: string) =>
    // eslint-disable-next-line no-control-regex
    /^[\x00-\x7F]*$/.test(value)
      ? value
      : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

  const lines = [
    `To: ${mail.to.join(", ")}`,
    ...(mail.cc?.length ? [`Cc: ${mail.cc.join(", ")}`] : []),
    ...(mail.bcc?.length ? [`Bcc: ${mail.bcc.join(", ")}`] : []),
    `Subject: ${encodeHeader(mail.subject)}`,
    ...(mail.inReplyTo
      ? [`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`]
      : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.body,
  ];

  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendMail(
  token: string,
  mail: OutgoingMail,
): Promise<{ id: string; threadId: string }> {
  return gmailFetch<{ id: string; threadId: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: buildMime(mail),
      ...(mail.threadId ? { threadId: mail.threadId } : {}),
    }),
  });
}

export async function saveDraft(
  token: string,
  mail: OutgoingMail,
): Promise<{ id: string }> {
  const draft = await gmailFetch<{ id: string }>(token, "/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw: buildMime(mail),
        ...(mail.threadId ? { threadId: mail.threadId } : {}),
      },
    }),
  });
  return draft;
}

/** The signed-in mailbox address — the "from" the composer shows. */
export async function profile(
  token: string,
): Promise<{ emailAddress: string; messagesTotal: number }> {
  return gmailFetch<{ emailAddress: string; messagesTotal: number }>(
    token,
    "/profile",
  );
}

// --------------------------------------------------------------------------
// Correspondent directory
// --------------------------------------------------------------------------
export interface Correspondent {
  email: string;
  /** Best display name seen for this address; falls back to the local-part. */
  name: string;
  /** Messages this mailbox sent to them — a much stronger signal than received. */
  sent: number;
  received: number;
  /** ISO timestamp of the most recent message either way; drives recency rank. */
  lastSeen: string;
}

/**
 * Everyone this mailbox has actually corresponded with, harvested from message
 * headers.
 *
 * The Gmail scopes carry no bulk contacts endpoint, so this is one metadata GET
 * per message — the reason it is a periodic background sync into a cache rather
 * than something an agent command waits on. Only From/To/Cc/Date are requested,
 * which is the smallest response Gmail will return.
 *
 * The mailbox owner is excluded: they appear on every single message and would
 * otherwise rank first for every query.
 */
export async function listCorrespondents(
  token: string,
  options: { limit?: number } = {},
): Promise<Correspondent[]> {
  const limit = Math.min(options.limit ?? 500, 2000);
  const self = (await profile(token)).emailAddress.toLowerCase();

  // Walk `messages.list` pages until we have `limit` ids or Gmail runs out.
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: "in:inbox OR in:sent",
      maxResults: String(Math.min(limit - ids.length, 500)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const page = await gmailFetch<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(token, `/messages?${params}`);

    for (const message of page.messages ?? []) ids.push(message.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < limit);

  const directory = new Map<string, Correspondent>();

  const record = (
    address: MailAddress,
    direction: "sent" | "received",
    at: number,
  ) => {
    const email = address.email.trim().toLowerCase();
    if (!email || !email.includes("@") || email === self) return;

    const seen = new Date(at).toISOString();
    const existing = directory.get(email);
    if (!existing) {
      directory.set(email, {
        email,
        name: address.name || email.split("@")[0]!,
        sent: direction === "sent" ? 1 : 0,
        received: direction === "received" ? 1 : 0,
        lastSeen: seen,
      });
      return;
    }

    existing[direction] += 1;
    if (seen > existing.lastSeen) existing.lastSeen = seen;
    // A real display name beats a local-part placeholder, whenever it shows up.
    if (address.name && existing.name === existing.email.split("@")[0]) {
      existing.name = address.name;
    }
  };

  await pooled(ids, LIST_CONCURRENCY, async (id) => {
    const message = await gmailFetch<GmailMessage>(
      token,
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date`,
    );
    const headers = message.payload?.headers;
    const at = Number(message.internalDate ?? Date.now());
    // A message in SENT means the mailbox owner wrote to its recipients; the
    // sender of anything else is someone who wrote to them.
    const outgoing = (message.labelIds ?? []).includes("SENT");

    for (const address of parseAddressList(headerValue(headers, "From"))) {
      record(address, outgoing ? "sent" : "received", at);
    }
    for (const field of ["To", "Cc"]) {
      for (const address of parseAddressList(headerValue(headers, field))) {
        record(address, outgoing ? "sent" : "received", at);
      }
    }
  });

  return [...directory.values()].sort((a, b) =>
    b.lastSeen.localeCompare(a.lastSeen),
  );
}
