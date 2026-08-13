# Plucia API v1

Hono API for browser authentication, Gmail mail, tenant membership, agent
access, and the normalized Unipile messaging inbox. It runs on Node.js or
Cloudflare Workers and uses Better Auth, Drizzle ORM, Neon/Postgres, and Zod.

The Node and Cloudflare entry points both serve the same HTTP API.

## Setup

Requirements: Node.js 18+, pnpm 9, and a Postgres/Neon database.

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm install
pnpm --filter @repo/db-sql db:migrate
```

After filling in the two environment files, run `pnpm --filter api dev` and
`pnpm --filter web dev` in separate terminals.

The API listens on `http://localhost:4000` by default. `GET /healthz` is the
load-balancer health endpoint and deliberately does not query the database.

Run checks with:

```sh
pnpm --filter @repo/db-sql check-types
pnpm --filter api check-types
pnpm --filter api lint
pnpm --filter api test
```

The unified inbox architecture, route contract, provider matrix, webhook
handling, Worker deployment, and known limitations are documented in
`docs/messaging-unified-inbox.md`.

## Cloudflare Workers deployment

The API can run on Cloudflare Workers through `src/worker.ts`.

1. Authenticate and create the Worker resources:

   ```sh
   pnpm --filter api exec wrangler login
   pnpm --filter api exec wrangler hyperdrive create plucia-api-db \
     --connection-string "$DATABASE_URL"
   ```

   Hyperdrive is optional because this API already uses Neon’s serverless HTTP
   driver. Keep the command above for a production connection-pooling setup;
   if you create it, add its binding ID under `hyperdrive` in `wrangler.jsonc`
   when the database client is migrated to use that binding.

2. Set every sensitive value as a Worker secret. Do not add them to
   `wrangler.jsonc`:

   ```sh
   pnpm --filter api exec wrangler secret put DATABASE_URL
   pnpm --filter api exec wrangler secret put BETTER_AUTH_SECRET
   pnpm --filter api exec wrangler secret put BETTER_AUTH_URL
   pnpm --filter api exec wrangler secret put FRONTEND_ORIGINS
   pnpm --filter api exec wrangler secret put UNIPILE_API_KEY
   pnpm --filter api exec wrangler secret put UNIPILE_WEBHOOK_SECRET
   ```

   Add the Google/Apple credentials when those integrations are enabled. Set
   `COOKIE_CROSS_SITE=true` when the web app and API use separate sites.

3. Put the deployed Worker hostname in `BETTER_AUTH_URL` and add that
   hostname to the OAuth redirect URI allowlists.

4. Validate and deploy:

   ```sh
   pnpm --filter api cf:deploy:dry-run
   pnpm --filter api cf:deploy
   ```

Database migrations still run outside Workers with
`pnpm --filter @repo/db-sql db:migrate`.

After deployment, configure the web app with the Worker URL:

```text
VITE_API_URL=https://plucia-api.ariyamandebnath-ad.workers.dev
```

### Environment profiles

Use `apps/api/.env.example` as the starting point for local Node.js development.
Worker deployments should provide the same required authentication, database,
and frontend-origin values as Worker secrets. Do not commit local environment
files.

## Environment

| Variable                                            | Required             | Purpose                                                                                            |
| --------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                      | yes                  | Neon/Postgres connection string                                                                    |
| `BETTER_AUTH_SECRET`                                | yes                  | Random secret, at least 32 characters                                                              |
| `BETTER_AUTH_URL`                                   | yes                  | Fallback public auth origin; allowlisted incoming frontend hosts are resolved per request          |
| `FRONTEND_ORIGINS`                                  | yes                  | Exact comma-separated browser origins allowed by CORS and Better Auth                              |
| `PORT`                                              | no                   | HTTP port, default `4000`                                                                          |
| `DEV_AUTH_BYPASS`, `DEV_AUTH_USER_ID`               | local development    | Uses one active database user for the dashboard without a real login; rejected outside development |
| `COOKIE_CROSS_SITE`                                 | no                   | Use `Secure; SameSite=None` cookies when frontend and API are on different sites                   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`          | together             | Enables Google sign-in                                                                             |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`            | together             | Enables optional social sign-in                                                                    |
| `ORCHESTRATOR_URL`                                  | no                   | Internal agent service URL, default `http://localhost:8000`                                        |
| `OUTBOUND_WEBHOOK_SECRET`                           | for service webhooks | Shared secret for orchestrator mail callbacks                                                      |
| `UNIPILE_API_KEY`                                   | for messaging        | Application-scoped Unipile v2 API key; legacy v1 access tokens do not work with the v2 base URL    |
| `UNIPILE_BASE_URL`, `UNIPILE_API_VERSION`           | no                   | Unipile endpoint and version, default `https://api.unipile.com` / `v2`                             |
| `UNIPILE_WEBHOOK_SECRET`                            | for webhooks         | Server-only raw-body webhook HMAC secret                                                           |
| `UNIPILE_HOSTED_AUTH_DOMAIN`                        | no                   | Optional Unipile hosted-auth domain                                                                |
| `MESSAGING_CALLBACK_URL`                            | no                   | Optional fixed hosted-auth callback                                                                |
| `MESSAGING_ATTACHMENTS_BUCKET`                      | optional binding     | R2 bucket for browser/provider attachment storage                                                  |
| `MESSAGING_AI_ENABLED`, `MESSAGING_AI_PROVIDER_URL` | optional AI          | Feature flag and internal tenant-safe AI adapter endpoint                                          |

Wildcards are rejected in `FRONTEND_ORIGINS`. Never combine a wildcard origin
with credentialed CORS. When `COOKIE_CROSS_SITE=true`, both the frontend and API
must use HTTPS. Browser requests must use `credentials: "include"`.

The process fails at boot when required configuration is missing or an OAuth
provider has only one credential configured.

## Response and authorization conventions

Successful product responses use `{ "data": ... }`. Errors use
`{ "error": { "code", "message", "requestId"? } }`. Unknown JSON fields are
rejected. Messaging requests are limited to 16 MiB at the Hono boundary and
attachment uploads are validated again against `MESSAGING_MAX_ATTACHMENT_BYTES`.

Organization IDs are never trusted as proof of access. Every product request
derives the user from the signed session cookie and checks the `members` table
for that organization. Roles are:

- `member`: read mail, conversations, and agent data.
- `admin`: member access plus create/update/delete product data and manage most members.
- `owner`: admin access plus owner-only organization operations enforced by Better Auth.

Cross-tenant item lookups always include both the item ID and organization ID,
so an Org A member cannot read an Org B row by guessing its UUID.

## Auth endpoints

All paths below are mounted by the official Better Auth Hono handler under
`/api/auth`. Better Auth performs its own schema validation; all application
routes use `@hono/zod-validator` with strict Zod schemas.

| Method     | Endpoint                           | Auth                      | Purpose / main input                                                          |
| ---------- | ---------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `POST`     | `/api/auth/sign-up/email`          | public, rate-limited      | Create account: `name`, `email`, `password`                                   |
| `POST`     | `/api/auth/sign-in/email`          | public, rate-limited      | Sign in: `email`, `password`, optional `rememberMe`                           |
| `POST`     | `/api/auth/sign-in/social`         | public, rate-limited      | Start OAuth: `provider` (`google` or `apple`), optional trusted `callbackURL` |
| `GET/POST` | `/api/auth/callback/:provider`     | OAuth callback            | Provider callback; do not call manually                                       |
| `GET`      | `/api/auth/get-session`            | cookie                    | Return the current user and session                                           |
| `POST`     | `/api/auth/sign-out`               | cookie                    | Revoke the current session and clear its cookie                               |
| `POST`     | `/api/auth/update-user`            | session                   | Update the current user's `name` or `image`                                   |
| `POST`     | `/api/auth/change-password`        | fresh session             | `currentPassword`, `newPassword`, optional `revokeOtherSessions`              |
| `POST`     | `/api/auth/delete-user`            | fresh session             | Delete the current user; enabled explicitly                                   |
| `GET`      | `/api/auth/list-sessions`          | session                   | List the current user's sessions                                              |
| `POST`     | `/api/auth/revoke-session`         | session                   | Revoke one session by token                                                   |
| `POST`     | `/api/auth/revoke-other-sessions`  | session                   | Revoke every session except the current one                                   |
| `POST`     | `/api/auth/revoke-sessions`        | session                   | Revoke all sessions                                                           |
| `POST`     | `/api/auth/link-social`            | session                   | Explicitly link Google/Apple to the signed-in account                         |
| `GET`      | `/api/auth/list-accounts`          | session                   | List linked authentication methods                                            |
| `POST`     | `/api/auth/unlink-account`         | session                   | Remove a linked method without removing the last login method                 |
| `POST`     | `/api/auth/request-password-reset` | public, rate-limited      | Reserved for reset email flow                                                 |
| `POST`     | `/api/auth/reset-password`         | reset token, rate-limited | Set `newPassword` using a reset token                                         |

Password-reset email delivery is not enabled in v1 because no email service was
placed in scope. The request endpoint returns `RESET_PASSWORD_DISABLED` until a
real `sendResetPassword` implementation is configured; reset tokens are never
logged or returned as a workaround.

For social sign-in, use:

```json
{
  "provider": "google",
  "callbackURL": "https://your-project.vercel.app/dashboard"
}
```

The callback URL must belong to `FRONTEND_ORIGINS`. Better Auth resolves the
callback origin from the incoming allowlisted host, with `BETTER_AUTH_URL` as
the fallback. Configure every origin used for social login at the provider:

- Google: `<origin>/api/auth/callback/google`
- Apple: `<origin>/api/auth/callback/apple`

For example, an HTTPS development tunnel needs its own Google redirect URI:
`https://your-tunnel.example/api/auth/callback/google`.

Implicit account linking is disabled to prevent an unverified local account
from being merged solely because an OAuth provider returns the same email. A
signed-in user can explicitly link Google or Apple through `/link-social`.

## Organization and membership endpoints

The Better Auth organization plugin owns these tables and endpoints. An
organization is the tenant boundary. It creates the initiating user as owner
and applies Better Auth's owner/admin/member permission rules.

| Method | Endpoint                                                          | Purpose                                                          |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST` | `/api/auth/organization/create`                                   | Create organization: `name`, `slug`, optional `logo`, `metadata` |
| `POST` | `/api/auth/organization/check-slug`                               | Check whether a slug is available                                |
| `GET`  | `/api/auth/organization/list`                                     | List organizations for the current user                          |
| `GET`  | `/api/auth/organization/get-full-organization?organizationId=...` | Get tenant, members, and invitations                             |
| `POST` | `/api/auth/organization/set-active`                               | Set active organization in the session                           |
| `POST` | `/api/auth/organization/update`                                   | Update organization settings (admin/owner)                       |
| `POST` | `/api/auth/organization/delete`                                   | Delete organization (owner)                                      |
| `GET`  | `/api/auth/organization/list-members?organizationId=...`          | Paginated member list                                            |
| `POST` | `/api/auth/organization/invite-member`                            | Invite: `organizationId`, `email`, `role`                        |
| `GET`  | `/api/auth/organization/list-invitations?organizationId=...`      | List tenant invitations                                          |
| `GET`  | `/api/auth/organization/list-user-invitations`                    | List invitations for current user                                |
| `GET`  | `/api/auth/organization/get-invitation?id=...`                    | Get one invitation                                               |
| `POST` | `/api/auth/organization/accept-invitation`                        | Accept by `invitationId`                                         |
| `POST` | `/api/auth/organization/reject-invitation`                        | Reject by `invitationId`                                         |
| `POST` | `/api/auth/organization/cancel-invitation`                        | Cancel invitation (admin/owner)                                  |
| `POST` | `/api/auth/organization/update-member-role`                       | Set `memberId` to `admin` or `member` (subject to plugin rules)  |
| `POST` | `/api/auth/organization/remove-member`                            | Remove a member (subject to plugin rules)                        |
| `POST` | `/api/auth/organization/leave`                                    | Current user leaves a non-owned organization                     |

Invitation persistence and acceptance are enabled. Actual invitation email
delivery is intentionally not faked; add a transactional email implementation
to Better Auth's `sendInvitationEmail` callback before production onboarding.

## Mail endpoints

Authenticated mail routes are mounted under `/api/v1/mail`. They proxy Gmail
using the signed-in user's server-side OAuth token and support profile lookup,
message listing/reading, read/star/archive/trash/spam changes, labels, sending,
and drafts. Service callbacks are mounted at `/api/v1/mail/directory` and
`/api/v1/mail/outbound` and require `X-Outbound-Secret`.

## Agent endpoints

Authenticated agent proxy routes are mounted under `/api/v1/agent`. They cover
conversations, contacts, turns, operator threads and commands, lead imports,
draft approval/discard, and directory synchronization. Tenant and user
identities are derived from the authenticated session.

## Messaging history backfill

Every successful WhatsApp, LinkedIn, Instagram, or Telegram connection starts
an idempotent historical backfill. The API paginates through all available
chats and each chat's messages, supporting both Unipile cursor and offset
pagination. Chat shells are published to the dashboard before their deeper
message history finishes, and realtime progress events refresh the inbox as
history arrives.

WhatsApp requires Unipile's own initial sync before complete history is
queryable. Hosted Auth therefore requests `config.global.wait_initial_sync`,
and `account.initial_sync.completed` webhooks enqueue another backfill as the
durable fallback. Production should configure `UNIPILE_WEBHOOK_SECRET` and the
scheduled messaging-job worker; local Hosted Auth can still complete through
the wait-and-callback path.

## Unipile v2 realtime setup

Local messaging does not require a webhook secret. When
`UNIPILE_WEBHOOK_SECRET` is absent, the accounts response advertises
`realtime.mode = "polling"` and the open channel performs a bounded recent-chat
sync every 20 seconds. Sending, history sync, read receipts, and reactions still
use the Unipile v2 API directly.

For production two-way realtime delivery:

1. Deploy the API on a public HTTPS origin.
2. In the Unipile dashboard, create a webhook whose URL is
   `https://<api-origin>/api/v1/webhooks/unipile`.
3. Subscribe it to the `message.*` events used by the inbox and the relevant
   `account.*` lifecycle and initial-sync events.
4. Copy that webhook endpoint's signing secret into
   `UNIPILE_WEBHOOK_SECRET`. This is distinct from `UNIPILE_API_KEY`.
5. Redeploy or restart the API. The accounts response then advertises
   `realtime.mode = "webhook"`, disabling browser polling.

The webhook route verifies `unipile-signature` against the exact raw request
body before parsing JSON, durably accepts each event once, and publishes the
result to authenticated browser SSE clients. Unipile cannot call a localhost
URL directly; use an HTTPS tunnel only when testing webhook delivery locally.

## Security notes

- Better Auth is pinned exactly to `1.6.23`; do not "pin and forget". Review and
  upgrade to current Better Auth patch releases promptly, regenerate migrations,
  run the checks, and retest email, Google, Apple, and organization flows.
- Auth sign-up/sign-in/reset paths have separate per-IP rate limits. The v1
  limiter is in-memory and suitable for one API process. Before horizontal
  scaling, replace it with atomic shared storage so limits cannot be bypassed by
  switching instances.
- The API key plugin is disabled because v1 has no machine-to-machine caller.
- Logs contain request ID, user ID, organization ID, method, path, status, and
  duration. They do not contain email addresses, tokens, secrets, or messages.
- Internal exceptions and stack traces are never returned to clients.
- Migration `0001` removes the prototype password/auth-identity tables because
  their hashes are not assumed compatible with Better Auth. Back up and plan an
  explicit account migration before applying it to a populated legacy database.
