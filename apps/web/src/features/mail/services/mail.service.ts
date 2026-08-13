import { apiClient } from "@/lib/api/client";
import { postOperatorCommand } from "@/lib/mock/operator-agent";
import type { MailAddress, MailMessage } from "../types/mail.types";

/**
 * The mail feature talks to the signed-in user's real Gmail through the BFF
 * (`/api/v1/mail`), which holds the OAuth token. Nothing is cached here —
 * Gmail is the source of truth.
 */

export interface Mailbox {
  messages: MailMessage[];
  labels: string[];
  account: MailAddress;
  nextPageToken?: string;
}

/**
 * One page of the whole mailbox. Gmail's `in:anywhere` is fetched once and the
 * sidebar views filter it client-side, which is what keeps every existing view
 * (starred, done, trash, labels) working off a single round trip. Additional
 * pages use the returned Gmail `nextPageToken`.
 */
export async function fetchMailbox(
  limit = 60,
  pageToken?: string,
): Promise<Mailbox> {
  const [mailbox, account] = await Promise.all([
    apiClient.get<{
      data: {
        messages: MailMessage[];
        labels: string[];
        nextPageToken?: string;
      };
    }>("/api/v1/mail/messages", {
      params: { box: "all", limit, ...(pageToken ? { pageToken } : {}) },
    }),
    apiClient.get<{ data: { emailAddress: string } }>("/api/v1/mail/profile"),
  ]);

  return {
    messages: mailbox.data.data.messages,
    labels: mailbox.data.data.labels,
    account: {
      name: account.data.data.emailAddress.split("@")[0] ?? "Me",
      email: account.data.data.emailAddress,
    },
    ...(mailbox.data.data.nextPageToken
      ? { nextPageToken: mailbox.data.data.nextPageToken }
      : {}),
  };
}

/**
 * The list is fetched with metadata only, so a row's `body` is empty until the
 * reader opens it. This fills it in.
 */
export async function fetchMessageBody(id: string): Promise<MailMessage> {
  const { data } = await apiClient.get<{ data: MailMessage }>(
    `/api/v1/mail/messages/${encodeURIComponent(id)}`,
  );
  return data.data;
}

// --------------------------------------------------------------------------
// Mutations — each mirrors one Gmail label operation
// --------------------------------------------------------------------------
export function setRead(ids: string[], read: boolean) {
  return apiClient.post("/api/v1/mail/messages/read", { ids, read });
}

export function setStarred(ids: string[], starred: boolean) {
  return apiClient.post("/api/v1/mail/messages/star", { ids, starred });
}

export function setArchived(ids: string[], archived: boolean) {
  return apiClient.post("/api/v1/mail/messages/archive", { ids, archived });
}

export function setTrashed(ids: string[], trashed: boolean) {
  return apiClient.post("/api/v1/mail/messages/trash", { ids, trashed });
}

export function setSpam(ids: string[], spam: boolean) {
  return apiClient.post("/api/v1/mail/messages/spam", { ids, spam });
}

export function applyLabel(ids: string[], label: string) {
  return apiClient.post("/api/v1/mail/messages/label", { ids, label });
}

export function createLabel(label: string) {
  return apiClient.post("/api/v1/mail/labels", { label });
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
  threadId?: string;
  inReplyTo?: string;
}

export async function sendMail(mail: OutgoingMail): Promise<string> {
  const { data } = await apiClient.post<{ data: { id: string } }>(
    "/api/v1/mail/send",
    mail,
  );
  return data.data.id;
}

export async function saveDraft(mail: OutgoingMail): Promise<string> {
  const { data } = await apiClient.post<{ data: { id: string } }>(
    "/api/v1/mail/drafts",
    mail,
  );
  return data.data.id;
}

// --------------------------------------------------------------------------
// Agent drafting
// --------------------------------------------------------------------------
/**
 * Ask the Operator agent to write the body. It runs in copilot mode so the
 * result is a draft the salesperson reviews before it leaves — the composer
 * never sends straight from the model.
 *
 * The agent replies with prose in `text` and, when it decided to act, the
 * message it composed in `action.text`; the composed message is the better
 * body when present.
 */
export async function generateMailDraft(input: {
  to: string[];
  subject: string;
  instruction?: string;
}): Promise<string> {
  const command = [
    input.instruction?.trim() ||
      `Draft an email to ${input.to.join(", ")}${input.subject ? ` about "${input.subject}"` : ""}.`,
    "Write only the email body — no subject line, no placeholders.",
  ].join(" ");

  const response = await postOperatorCommand({
    text: command,
    mode: "copilot",
    preferredChannel: "mail",
  });

  return response.message.action?.text?.trim() || response.message.text.trim();
}
