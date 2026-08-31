# Zernio API working memory

> Persistent project note for agents and developers. Source: <https://docs.zernio.com/llms-full.txt>, downloaded 2026-08-02 (Asia/Kolkata). The downloaded source was 3,674,831 bytes / 95,316 lines, SHA-256 `7e178a8eba2957dbe36f44947e13b77e30414c964ec129f00e4a82d875444f78`. Zernio changes this document over time; re-fetch it before relying on volatile prices, limits, schemas, or platform capabilities.

## Non-negotiable integration facts

- Base URL: `https://zernio.com/api/v1`. Endpoint paths below are relative to it, such as `/profiles`, not `/v1/profiles` when the configured base already contains `/api/v1`.
- Authentication: `Authorization: Bearer sk_...`. API keys have an `sk_` prefix plus 64 hex characters, are displayed once, and are stored hashed by Zernio. SDKs default to `ZERNIO_API_KEY`.
- Main hierarchy: one **team** (workspace/billing boundary) contains **profiles** (tenant/customer boundary), which contain connected **accounts**. Persist `profileId -> customer` and `accountId -> customer` mappings.
- Zernio IDs shown in API examples are 24-character MongoDB-style strings, not UUIDs. Webhook event IDs are UUIDs.
- A profile is organizational isolation, but post creation validates an `accountId` against the whole team. The caller must enforce that every target account belongs to the current tenant.
- For a multi-tenant product, use one profile per customer. One full-access key is sufficient; profile-scoped/read-only keys are for access control, not extra throughput.
- Prefer webhooks for new activity and lifecycle outcomes. Polling is for initial backfill and periodic reconciliation.
- The API reference is broad: the current full document contains 513 endpoint-reference pages and platform/product guides for social publishing, inbox, comments/reviews, analytics, ads, contacts/sequences/workflows, broadcasts, SMS, phone numbers, PSTN/WhatsApp calls, and WhatsApp Business management.

## Core flows

### Profiles and account connection

1. `POST /profiles` and persist `profile._id`.
2. Start OAuth with `GET /connect/{platform}?profileId=...&redirect_url=...`; redirect the browser to returned `authUrl`.
3. Standard mode uses Zernio-hosted selection screens. `headless=true` returns the user to the supplied callback with selection context (`tempToken`, URL-encoded `userProfile`, `step`, and `connect_token`) so the application can render its own Page/organization/board/location/profile picker and call the relevant selection endpoint.
4. Secondary-selection platforms include Facebook Pages, LinkedIn organizations, Pinterest boards, Google Business locations, and Snapchat profiles. Ads have additional connect flows.
5. Bluesky and Telegram have nonstandard/non-OAuth setup flows; do not assume the generic OAuth contract for every platform.
6. Persist the mapping from `account.connected` (`accountId`, `profileId`). Reconnect unhealthy accounts using the same profile.
7. List with `GET /accounts?profileId=...`; monitor `/accounts/health` plus `account.disconnected` events.

Supported social guides in the snapshot: Bluesky, Discord, Facebook, Instagram, LinkedIn, Pinterest, Reddit, Slack, Snapchat, Telegram, Threads, TikTok, Twitter/X, and YouTube. Separate guides cover Google Business and ad products (Meta, LinkedIn, Pinterest, TikTok, X, Google/OpenAI Ads surfaces). Capabilities, OAuth scopes, media limits, inbox support, and `platformSpecificData` differ by platform; consult that platform section before building a request.

### Posts and scheduling

- `POST /posts` is the central publishing call. Targets are entries in `platforms[]`, each with `platform` and `accountId` plus optional platform-specific data/custom media.
- `publishNow: true` publishes immediately; `scheduledFor` schedules; neither saves a draft. Cross-post by adding targets. Status moves through draft/scheduled/publishing to published, partial, failed, or cancelled.
- Make creates retry-safe: generate one fresh UUID in `x-request-id` for each logical post and reuse it only for retries of that same call. A replay within about five minutes returns HTTP 200 with `existingPost`.
- Independent content-hash dedup hashes `(platform, accountId, content + media URLs)` for 24 hours. A duplicate returns HTTP 409 with `existingPostId`.
- Retry network failures/timeouts/5xx with the same request ID. Honor `Retry-After` for 429. Treat a 200 idempotency replay and a 409 content duplicate as known outcomes, not blind failures.
- Platform targets may have per-platform scheduling overrides. Prefer an absolute ISO 8601 instant (`Z` or explicit offset). A naive datetime is interpreted in the request's IANA `timezone` (default UTC); returned times are UTC.
- For recurring tenant schedules use profile queues and `queuedFromProfile` (optionally `queueId`). Do not read `/queue/next-slot` and then manually submit that time; doing so bypasses queue locking.
- Use post webhooks (`post.published`, `post.partial`, `post.failed`, per-platform events, etc.) for final outcomes rather than polling.

### Media

1. `POST /media/presign` with `filename` and `contentType`.
2. PUT bytes directly to `uploadUrl` with the matching content type and no Zernio auth header.
3. Reference `publicUrl` in `mediaItems` or per-platform `customMedia`.

The presigned upload URL lasts one hour. Temporary uploads expire after seven days; media becomes permanent when a referencing post publishes. The general upload limit is documented as 5 GB; PDFs are documented as 100 MB and LinkedIn-only. Every platform imposes narrower type, dimension, duration, aspect-ratio, count, and mixing constraints.

### Unified inbox

- `GET /inbox/conversations?profileId=...` aggregates tenant conversations. The generated reference returns top-level `data` (array), `pagination` (`hasMore`, `nextCursor`), and `meta` (queried/failed-account diagnostics), not a top-level `conversations` array.
- Fetch conversation messages with opaque cursor pagination; pass `pagination.nextCursor` back as `cursor`.
- Send with `POST /inbox/conversations/{conversationId}/messages`. The generated reference requires `accountId` and names the text field `message`; it returns `{ success, data: { messageId, conversationId, sentAt, message } }`. One narrative tenant-inbox example incorrectly uses `{ text }`; prefer the generated endpoint contract.
- A successful send response means accepted, not delivered. Track `message.sent`, `message.delivered`, `message.read`, and `message.failed` webhooks.
- Also available: conversation search/detail, typing indicator, mark-read/status actions, message edit/delete/reactions, mentions, post comments/private replies/moderation, and Google Business/Facebook reviews.
- WhatsApp adds the 24-hour customer-service window and approved-template rules.
- Backfill on onboarding and reconcile periodically. For Facebook/Instagram, repeat the onboarding sweep later because older history can replay asynchronously, retain old sort dates, and emit no webhooks.

## Webhooks

- Configure up to 10 endpoints per team via `/webhooks/settings`; use `/webhooks/test` and logs to validate them.
- Delivery is at least once. Acknowledge with 2xx within 5 seconds after durably accepting the event, then process asynchronously.
- Retry schedule: immediate, 10s, 1m40s, 16m40s, 2h46m40s, 24h, 24h (maximum seven attempts), then dead-letter. Webhooks are not automatically disabled.
- Deduplicate on top-level payload `id` (also `X-Zernio-Event-Id`; legacy `X-Late-Event-Id`).
- If a secret is configured, verify lowercase hex HMAC-SHA256 of the exact raw request body using `X-Zernio-Signature` (legacy `X-Late-Signature`) and a timing-safe comparison. Reject missing/mismatched signatures.
- Payloads are event-specific and generally top-level objects shaped like `{ id, event, ..., account, timestamp }`; they are not documented as a generic `{ event, data }` envelope.
- Route account events by `profileId`; inbox events by `account.id`; post events by each target's `accountId`.

Event families in this snapshot:

- Posts: scheduled, published, failed, partial, cancelled, recycled, per-platform published/failed/deleted, TikTok URL resolved, and external/native post created/updated/deleted.
- Inbox: conversation started; message received/sent/edited/deleted/delivered/read/failed; reaction received; comment received; review new/updated.
- Accounts: connected/disconnected.
- Ads: initial sync complete, lead received, ad status changed.
- Calls: received/ended/failed and WhatsApp call-permission request.
- WhatsApp: template review status and automatic lead/purchase event.
- Phone-number lifecycle: KYC submitted, activated, declined, action/verification required, suspended, reactivated, and released. These retain a legacy `whatsapp.number.*` prefix even when applicable to provisioned numbers generally.

## Errors, limits, and pagination

- Non-2xx errors use a flat envelope: human-readable `error` plus stable `type` and `code`, and optional `param`, `docUrl`, `platform`, and raw `platformError`. Branch on `type`/`code`, never message text.
- Types: `invalid_request_error` (400/422), `authentication_error` (401), `permission_error` (403), `not_found` (404), `rate_limit_error` (429), `platform_error` (upstream 4xx or 502), and `api_error` (500).
- Common stable codes include missing/invalid fields or JSON, mutually exclusive fields, missing/invalid credentials, feature/add-on unavailable, linked/ads account required, platform API error, rate limited, and internal error.
- Connected-account rate ladder: 0-2 accounts = 60 req/min; 3-2,000 = 600 req/min; 2,001+ = 1,200 req/min. Legacy AppSumo plans are 600 req/min.
- Selected analytics endpoints use a 1-second window: `max(6, requests_per_minute / 60)`, producing 6/10/20 req/s for those tiers (legacy AppSumo 10 req/s).
- Read `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; on 429 wait the relative seconds in `Retry-After`.
- Posting velocity limits are separate and platform-specific.
- Pagination is not globally uniform. Depending on endpoint it may be page/limit, limit/offset or skip, opaque `cursor`/`nextCursor`, `after`, `before`, or platform page tokens. Follow that endpoint's schema rather than imposing one shared paginator.

## Major API domains

- Identity/configuration: profiles, accounts, account groups, connect/secondary selection, scoped API keys, users, usage/billing/logs.
- Publishing: posts (create/list/get/update/delete/retry, bulk, recycle and platform actions), queues, media, platform settings.
- Engagement: inbox conversations/messages, comments, reviews, mentions, comment-to-DM automations.
- Analytics: post and daily aggregates, best times/content decay/frequency, platform account insights and demographics, inbox analytics, external-post sync.
- Ads: accounts/finance/audit, campaigns/ad sets/ads, creatives/images/previews, audiences, lead forms/leads, conversions, targeting, forecasts, insights/reports, catalogs/product sets, studies and reach/frequency.
- CRM/automation: contacts, custom fields, sequences/enrollments, workflows/logs, broadcasts/recipients.
- Communications: phone-number search/provisioning/KYC/porting, SMS/registration/sender IDs/lookup/opt-outs/usage, unified calls, voice calls, WhatsApp calls and recordings.
- WhatsApp Business: connection/number selection, templates, flows, business profile/display name/username, group chats, blocklist, conversions/datasets, sandbox, broadcasts and calling permissions/config.
- Platform-native extensions: Discord channels/roles/members/pins/events, Reddit feed/search/flairs/rules, Twitter search/retweet/bookmark/follow, Google Business location/menu/service/media/verification operations.

Official SDKs documented for Node (`@zernio/node`), Python (`zernio-sdk`), Go, Ruby, Java, PHP, .NET, and Rust. An OpenAPI spec is downloadable. The hosted MCP endpoint is `https://mcp.zernio.com/mcp`; the docs say it exposes a small always-visible core plus on-demand tools covering the API.

## Billing snapshot (volatile)

- Connected accounts are metered as account-days per calendar month, divided by days in that month, then priced through graduated tiers: first 10 units at $6, next 90 at $3, above 100 at $1.
- A flat $12 monthly credit covers the equivalent of the first two tier-one account units. Charges occur as usage accrues with a fraud-protection threshold beginning at $10 and increasing over time.
- SMS is billed per segment/destination; phone-number, calls, ads, X API operations, WhatsApp, KYC/registration, and other product-specific prices have dedicated tables. Never hard-code these values without rechecking current pricing pages.

## RedApeAI implementation update (2026-08-02)

- `apps/api` exposes authenticated `/api/v1/zernio` connection status,
  hosted OAuth initiation, and tenant-checked WhatsApp inbox/message routes.
- The Zernio secret remains server-only. A Zernio profile is mapped one-to-one
  to the active Better Auth organization, and account/conversation ownership is
  revalidated before reads or sends.
- `apps/web` uses Axios and Zustand for WhatsApp/LinkedIn connection state and
  handles the hosted OAuth return at `/dashboard/zernio/callback`.
- WhatsApp conversations and existing-thread sends are live through Zernio.
  Freeform sends remain subject to Meta's 24-hour service window.
- LinkedIn connection is supported, but DMs are deliberately disabled because
  the current Zernio documentation states that LinkedIn does not expose its
  messaging API to third-party applications.

## WhatsApp connection modes (updated 2026-08-03)

- WhatsApp currently uses only `POST /connect/whatsapp/credentials`. The required Zernio
  body is `profileId`, `accessToken`, `wabaId`, and `phoneNumberId`; `pin` is an
  optional six-digit two-step verification PIN. The Meta token is a permanent
  System User token with `whatsapp_business_management` and
  `whatsapp_business_messaging`, not a Zernio API key.
- RedApeAI exposes this as authenticated
  `POST /api/v1/zernio/channels/whatsapp/credentials`. The API derives
  `profileId` from the active Better Auth organization, forwards the secret
  once to Zernio, does not persist or log it, and resyncs accounts afterward.
- The RedApeAI frontend intentionally has no WhatsApp Facebook JS SDK, popup,
  redirect, or hostname-dependent branch. This makes development and
  deployment use the same headless contract.
- Zernio's WhatsApp sandbox can validate messaging and webhooks without a
  customer-owned number: discover the sandbox number, create a sandbox session
  for the tester's phone, reply to the activation message, then exercise the
  normal inbox endpoints. Delete the session when finished.

## How to use this memory

- Use this file for architecture and invariants.
- For an exact request/response schema, platform media rule, OAuth scope, event payload, enum, price, or limit, search the current `llms-full.txt` or official endpoint page immediately before coding.
- When the docs conflict internally, prefer the generated endpoint-reference section over narrative quickstarts, then verify with the installed SDK types or a non-destructive API call.
