import assert from "node:assert/strict";
import { test } from "node:test";

import { getChannelCapabilities, supportsCapability } from "../capabilities.js";
import {
  canReadAssignedThread,
  canUseAccount,
  isOrganizationManager,
} from "../authorization-policy.js";
import {
  assertMessageContent,
  safeFilename,
  sanitizeMessageHtml,
} from "../content.js";
import {
  createHostedState,
  hmacSha256Hex,
  verifyHostedState,
  verifyHmacSha256HexSafe,
} from "../crypto.js";
import { mapMessagingCallbackError } from "../callback-errors.js";
import {
  normalizeEmail,
  normalizePhone,
  normalizeProviderIdentifier,
  participantIdentifiers,
} from "../identity.js";
import {
  messageFingerprint,
  normalizeAccount,
  normalizeMessage,
  normalizeMessageReaction,
  normalizeThread,
} from "../normalizer.js";
import { sendChatMessageWithRecovery } from "../service.js";
import { UnipileClient, UnipileProviderError } from "../unipile-client.js";

test("normalizes contact identifiers without over-merging", () => {
  assert.equal(normalizeEmail("  Sales@Example.COM "), "sales@example.com");
  assert.equal(normalizePhone("(44) 20 1234-5678"), "+442012345678");
  assert.equal(normalizePhone("not-a-phone"), null);
  assert.equal(normalizeProviderIdentifier("  @Lead  "), "@lead");

  const identifiers = participantIdentifiers("whatsapp", {
    providerParticipantId: "wa-user-1",
    normalizedName: "Lead",
    avatarUrl: null,
    profileUrl: null,
    emailAddress: "lead@example.com",
    phoneNumber: "+442012345678",
    linkedinPublicIdentifier: null,
    instagramIdentifier: null,
    telegramIdentifier: null,
    role: null,
    isSelf: false,
    providerMetadata: {},
  });
  assert.deepEqual(
    identifiers.map((identifier) => identifier.identifierType),
    ["email", "phone", "whatsapp", "provider_participant"],
  );
});

test("resolves channel capabilities explicitly", () => {
  assert.equal(supportsCapability("whatsapp", "reply"), true);
  assert.equal(supportsCapability("instagram", "attachments"), true);
  assert.equal(supportsCapability("whatsapp", "archive"), false);
  assert.equal(getChannelCapabilities("telegram").readReceipts, true);
  assert.equal(getChannelCapabilities("google").htmlEmail, true);
});

test("enforces account sharing and assignment visibility", () => {
  const member = {
    organizationId: "org-1",
    organizationName: "Test org",
    userId: "user-1",
    role: "member",
  };
  assert.equal(
    canUseAccount(
      { organizationId: "org-1", createdByUserId: "user-2", shared: false },
      member,
    ),
    false,
  );
  assert.equal(
    canUseAccount(
      { organizationId: "org-1", createdByUserId: "user-2", shared: true },
      member,
    ),
    true,
  );
  assert.equal(isOrganizationManager({ ...member, role: "admin" }), true);
  assert.equal(
    canReadAssignedThread(
      { assignedUserId: "user-2", assignedTeamId: null },
      member,
    ),
    false,
  );
  assert.equal(
    canReadAssignedThread(
      { assignedUserId: "user-1", assignedTeamId: null },
      member,
    ),
    true,
  );
});

test("sanitizes message HTML and blocks unsafe URLs", () => {
  const sanitized = sanitizeMessageHtml(
    '<p>Hello <strong>lead</strong></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
  );
  assert.match(sanitized, /<p>Hello <strong>lead<\/strong><\/p>/);
  assert.doesNotMatch(sanitized, /script|javascript:/i);
  assert.throws(
    () => assertMessageContent({ text: "", html: "<script>x</script>" }),
    /required/i,
  );
  assert.equal(safeFilename("../unsafe\u0000name?.pdf"), ".._unsafename_.pdf");
});

test("creates and verifies expiring hosted-auth state", async () => {
  const created = await createHostedState(
    {
      organizationId: "org-1",
      userId: "user-1",
      channel: "linkedin_sales_navigator",
      returnPath: "/dashboard/inbox",
    },
    "a-test-secret",
  );
  const verified = await verifyHostedState(created.state, "a-test-secret");
  assert.equal(verified?.organizationId, "org-1");
  assert.equal(verified?.channel, "linkedin_sales_navigator");
  assert.equal(await verifyHostedState(created.state, "wrong-secret"), null);
});

test("verifies Unipile-style HMAC signatures with constant-time Web Crypto", async () => {
  const signed = await hmacSha256Hex("webhook-secret", "123.hello");
  assert.equal(
    await verifyHmacSha256HexSafe("webhook-secret", "123.hello", signed),
    true,
  );
  assert.equal(
    await verifyHmacSha256HexSafe("webhook-secret", "123.changed", signed),
    false,
  );
  assert.equal(
    await verifyHmacSha256HexSafe("webhook-secret", "123.hello", "bad"),
    false,
  );
});

test("maps Unipile hosted-auth account restrictions to an actionable API error", () => {
  const error = mapMessagingCallbackError({
    type: "api/account_restricted",
    title: "Account is restricted",
    detail:
      "This account is not allowed to be linked. Reason: free_trial_used.",
  });

  assert.equal(error.status, 403);
  assert.equal(error.code, "MESSAGING_ACCOUNT_RESTRICTED");
  assert.match(error.message, /free_trial_used/);
});

test("maps an error-only hosted-auth callback without requiring state", () => {
  const error = mapMessagingCallbackError({
    type: "api/expired_link",
  });

  assert.equal(error.status, 400);
  assert.equal(error.code, "MESSAGING_CONNECTION_LINK_EXPIRED");
});

test("normalizes provider account, thread, and message payloads", async () => {
  const account = normalizeAccount({
    id: "account-1",
    provider: { name: "linkedin" },
    type: "sales_navigator",
    status: "running",
    user: { name: "Sales User", public_identifier: "sales-user" },
  });
  assert.equal(account.provider, "linkedin");
  assert.equal(account.providerAccountType, "sales_navigator");

  assert.equal(
    normalizeAccount({
      id: "account-2",
      provider: "instagram",
      status: "degraded",
    }).status,
    "connected",
  );
  assert.equal(
    normalizeAccount({
      id: "account-3",
      provider: "telegram",
      status: "running",
      is_locked: true,
    }).status,
    "failed",
  );

  const thread = normalizeThread(
    {
      id: "chat-1",
      last_message: { text: "latest", timestamp: "2026-08-12T10:00:00.000Z" },
      attendees: [{ id: "lead-1", name: "Lead", public_identifier: "lead" }],
    },
    "linkedin",
  );
  assert.equal(thread.externalThreadId, "chat-1");
  assert.equal(thread.preview, "latest");
  assert.equal(thread.participants[0]?.providerParticipantId, "lead-1");

  const instagramThread = normalizeThread(
    {
      id: "instagram-chat-1",
      name: "Instagram contact",
      user_id: "instagram-user-1",
      last_message_timestamp: "2026-08-12T10:02:00.000Z",
    },
    "instagram",
  );
  assert.equal(
    instagramThread.participants[0]?.providerParticipantId,
    "instagram-user-1",
  );
  assert.equal(
    instagramThread.lastMessageAt?.toISOString(),
    "2026-08-12T10:02:00.000Z",
  );

  const message = await normalizeMessage(
    "account-1",
    {
      id: "message-1",
      chat_id: "chat-1",
      sender: { id: "lead-1", name: "Lead" },
      text: "Hello",
      timestamp: "2026-08-12T10:01:00.000Z",
    },
    "linkedin",
    "message.new",
  );
  assert.equal(message.externalMessageId, "message-1");
  assert.equal(message.direction, "inbound");
  assert.equal(message.preview, "Hello");
  assert.equal(message.attachments.length, 0);

  const deleted = await normalizeMessage(
    "account-1",
    { id: "message-1" },
    "linkedin",
    "message.delete",
  );
  assert.equal(deleted.deliveryStatus, "deleted");
  assert.equal(deleted.externalMessageId, "message-1");
});

test("message fingerprints are stable when provider ids are absent", async () => {
  const payload = {
    chat_id: "chat-1",
    sender_id: "lead-1",
    text: "same",
    timestamp: "2026-08-12T10:01:00.000Z",
  };
  assert.equal(
    await messageFingerprint("account-1", payload),
    await messageFingerprint("account-1", payload),
  );
  assert.notEqual(
    await messageFingerprint("account-1", payload),
    await messageFingerprint("account-2", payload),
  );
});

test("normalizes reactions without creating message-shaped payloads", () => {
  assert.deepEqual(
    normalizeMessageReaction({
      message_id: "message-1",
      reaction: {
        value: "👍",
        sender: { id: "lead-1", display_name: "Lead" },
        is_sender: false,
      },
    }),
    {
      value: "👍",
      attendeeId: "lead-1",
      attendeeDisplayName: "Lead",
      isSelf: false,
    },
  );
  assert.equal(normalizeMessageReaction({ message_id: "message-1" }), null);
});

test("Unipile adapter sends account-scoped requests and preserves provider response ids", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new UnipileClient(
    { apiKey: "secret", baseUrl: "https://api.unipile.test", apiVersion: "v2" },
    async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(
        JSON.stringify({ message_id: "provider-message-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  );
  const response = await client.sendChatMessage({
    accountId: "account/1",
    chatId: "chat/1",
    text: "Hello",
  });
  assert.equal(response.message_id, "provider-message-1");
  assert.equal(
    requests[0]?.url,
    "https://api.unipile.test/v2/account%2F1/chats/chat%2F1/messages/send",
  );
  assert.equal(
    new Headers(requests[0]?.init?.headers).get("X-API-KEY"),
    "secret",
  );
  assert.equal(requests[0]?.init?.method, "POST");
});

test("Unipile adapter preserves v2 problem types for actionable errors", async () => {
  const client = new UnipileClient(
    {
      apiKey: "invalid",
      baseUrl: "https://api.unipile.test",
      apiVersion: "v2",
    },
    async () =>
      new Response(
        JSON.stringify({
          type: "api/invalid_credentials",
          title: "Invalid API Key",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
  );

  await assert.rejects(client.listAccounts(), (error: unknown) => {
    assert.ok(error instanceof UnipileProviderError);
    assert.equal(error.status, 401);
    assert.equal(error.providerCode, "api/invalid_credentials");
    return true;
  });
});

test("recovers a stale Instagram chat with the recipient messaging identifier", async () => {
  const started: Array<{
    accountId: string;
    participantIds: string[];
    text: string;
  }> = [];
  const client = {
    sendChatMessage: async () => {
      throw new UnipileProviderError(
        "gateway timeout",
        504,
        "UNIPILE_NETWORK_ERROR",
      );
    },
    getChat: async () => {
      throw new UnipileProviderError(
        "provider/resource_not_found",
        404,
        "provider/resource_not_found",
      );
    },
    startChat: async (input: {
      accountId: string;
      participantIds: string[];
      text: string;
    }) => {
      started.push(input);
      return { chat_id: "instagram-recipient-1", message_id: "message-1" };
    },
  };
  const thread = {
    account: { provider: "instagram", unipileAccountId: "account-1" },
    thread: { externalThreadId: "stale-chat-1" },
    participants: [
      {
        providerParticipantId: "instagram-recipient-1",
        isSelf: false,
      },
    ],
  } as Parameters<typeof sendChatMessageWithRecovery>[0]["thread"];

  const result = await sendChatMessageWithRecovery({
    client,
    thread,
    text: "Hello",
  });

  assert.equal(result.recoveredExternalThreadId, "instagram-recipient-1");
  assert.equal(result.raw.message_id, "message-1");
  assert.deepEqual(started, [
    {
      accountId: "account-1",
      participantIds: ["instagram-recipient-1"],
      text: "Hello",
    },
  ]);
});

test("Unipile adapter supports offset and time pagination for provider histories", async () => {
  const requests: string[] = [];
  const client = new UnipileClient(
    { apiKey: "secret", baseUrl: "https://api.unipile.test", apiVersion: "v2" },
    async (url) => {
      requests.push(String(url));
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  await client.listChats({
    accountId: "account-1",
    offset: 50,
    limit: 50,
    after: "2026-08-13T10:00:00.000Z",
  });
  await client.listMessages({
    accountId: "account-1",
    chatId: "chat-1",
    offset: 100,
    limit: 100,
    after: "2026-08-13T10:00:00.000Z",
  });

  assert.match(requests[0] ?? "", /offset=50/);
  assert.match(requests[0] ?? "", /limit=50/);
  assert.match(requests[0] ?? "", /after=2026-08-13T10%3A00%3A00.000Z/);
  assert.match(requests[1] ?? "", /offset=100/);
  assert.match(requests[1] ?? "", /limit=100/);
  assert.match(requests[1] ?? "", /after=2026-08-13T10%3A00%3A00.000Z/);
});

test("Unipile adapter preserves LinkedIn product inbox specifics", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new UnipileClient(
    { apiKey: "secret", baseUrl: "https://api.unipile.test", apiVersion: "v2" },
    async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ chat_id: "chat-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  await client.startChat({
    accountId: "account-1",
    participantIds: ["lead-1"],
    text: "Hello",
    inboxId: "SALES_NAVIGATOR_PRIMARY",
    specifics: {
      linkedin: { sales_navigator: { subject: "A useful subject" } },
    },
  });
  assert.equal(
    requests[0]?.url,
    "https://api.unipile.test/v2/account-1/inboxes/SALES_NAVIGATOR_PRIMARY/chats/send",
  );
  const body = JSON.parse(String(requests[0]?.init?.body)) as Record<
    string,
    unknown
  >;
  assert.deepEqual(body.users_ids, ["lead-1"]);
  assert.equal("attendees_ids" in body, false);
  assert.deepEqual(body.specifics, {
    linkedin: { sales_navigator: { subject: "A useful subject" } },
  });
});
