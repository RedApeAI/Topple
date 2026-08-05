# Plucia API v1

Hono API for browser authentication, tenant membership, channel metadata,
conversation pointers, and agent configuration. It runs on Node.js and uses
Better Auth, Drizzle ORM, Neon/Postgres, and Zod.

This version intentionally does not contain worker orchestration, Redis,
Lambda/ASG coordination, message processing, Bedrock calls, or cloud setup.

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
```

## Environment

| Variable                                   | Required         | Purpose                                                                                   |
| ------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | yes              | Neon/Postgres connection string                                                           |
| `BETTER_AUTH_SECRET`                       | yes              | Random secret, at least 32 characters                                                     |
| `BETTER_AUTH_URL`                          | yes              | Fallback public auth origin; allowlisted incoming frontend hosts are resolved per request |
| `FRONTEND_ORIGINS`                         | yes              | Exact comma-separated browser origins allowed by CORS and Better Auth                     |
| `PORT`                                     | no               | HTTP port, default `4000`                                                                 |
| `COOKIE_CROSS_SITE`                        | no               | Use `Secure; SameSite=None` cookies when frontend and API are on different sites          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | together         | Enables Google sign-in                                                                    |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`   | together         | Enables Apple sign-in                                                                     |
| `ZERNIO_API_KEY`                           | yes for channels | Server-only Zernio API key                                                                |
| `ZERNIO_BASE_URL`                          | no               | Zernio API root, default `https://zernio.com/api/v1`                                      |
| `ZERNIO_WEBHOOK_SECRET`                    | for realtime     | Verifies signed Zernio webhook bodies                                                     |
| `ZERNIO_WEBHOOK_PUBLIC_URL`                | for realtime     | Public HTTPS URL ending in `/api/v1/zernio/webhooks`                                      |
| `ZERNIO_CONNECT_REDIRECT_URL`              | for LinkedIn     | Frontend callback used by hosted LinkedIn OAuth                                           |

Wildcards are rejected in `FRONTEND_ORIGINS`. Never combine a wildcard origin
with credentialed CORS. When `COOKIE_CROSS_SITE=true`, both the frontend and API
must use HTTPS. Browser requests must use `credentials: "include"`.

The process fails at boot when required configuration is missing or an OAuth
provider has only one credential configured.

## Response and authorization conventions

Successful product responses use `{ "data": ... }`. Errors use
`{ "error": { "code", "message", "requestId"? } }`. Unknown JSON fields are
rejected. Request bodies are limited to 1 MiB.

Organization IDs are never trusted as proof of access. Every product request
derives the user from the signed session cookie and checks the `members` table
for that organization. Roles are:

- `member`: read channels, conversations, and agent config.
- `admin`: member access plus create/update/delete product data and manage most members.
- `owner`: admin access plus owner-only organization operations enforced by Better Auth.

Cross-tenant item lookups always include both the item ID and organization ID,
so an Org A member cannot read an Org B row by guessing its UUID.

## Zernio channel connections

Authenticated WhatsApp and LinkedIn account onboarding is exposed under
`/api/v1/zernio`. The server owns the Zernio API key and maintains one Zernio
profile per Better Auth organization. The browser never receives the key or
temporary hosted-OAuth tokens. During headless WhatsApp setup, the browser sends
the customer-supplied Meta System User token once to this authenticated API;
the API forwards it to Zernio without persisting or logging it.

| Method   | Route                                                   | Purpose                                            |
| -------- | ------------------------------------------------------- | -------------------------------------------------- |
| `GET`    | `/api/v1/zernio/channels`                               | Sync and return connected account status           |
| `POST`   | `/api/v1/zernio/channels/linkedin/connect`              | Start hosted LinkedIn OAuth                        |
| `POST`   | `/api/v1/zernio/channels/whatsapp/connect`              | Start headless WhatsApp Embedded Signup            |
| `GET`    | `/api/v1/zernio/channels/whatsapp/phone-numbers`        | List numbers to pick after Embedded Signup         |
| `POST`   | `/api/v1/zernio/channels/whatsapp/phone-numbers/select` | Bind the phone number the user picked              |
| `POST`   | `/api/v1/zernio/channels/whatsapp/credentials`          | Connect WhatsApp with server-side Meta credentials |
| `DELETE` | `/api/v1/zernio/channels/:platform/:accountId`          | Disconnect a tenant-owned account                  |
| `GET`    | `/api/v1/zernio/conversations`                          | List authenticated tenant WhatsApp threads         |
| `POST`   | `/api/v1/zernio/conversations`                          | Start WhatsApp chat with approved template         |
| `GET`    | `/api/v1/zernio/conversations/:id/messages?accountId=…` | Read a tenant-owned WhatsApp thread                |
| `POST`   | `/api/v1/zernio/conversations/:id/messages`             | Send in an existing tenant-owned thread            |
| `POST`   | `/api/v1/zernio/conversations/:id/read?accountId=…`     | Mark a WhatsApp thread read                        |
| `GET`    | `/api/v1/zernio/whatsapp/templates?accountId=…`         | List approved WhatsApp templates                   |
| `POST`   | `/api/v1/zernio/webhooks`                               | Receive signed Zernio events                       |
| `POST`   | `/api/v1/zernio/webhooks/configure`                     | Register/update the Zernio subscription            |
| `GET`    | `/api/v1/zernio/events?after=…`                         | Poll tenant-scoped real-time notifications         |

Required production configuration:

- `ZERNIO_API_KEY`: server-only Zernio secret key.
- `ZERNIO_BASE_URL`: defaults to `https://zernio.com/api/v1`.
- `ZERNIO_WEBHOOK_SECRET`: server-only secret used to verify Zernio's
  `X-Zernio-Signature` HMAC header.
- `ZERNIO_WEBHOOK_PUBLIC_URL`: public HTTPS URL for
  `/api/v1/zernio/webhooks`; required for real-time inbox events.
- `ZERNIO_CONNECT_REDIRECT_URL`: frontend completion route for hosted OAuth
  platforms such as LinkedIn; defaults to `/dashboard/zernio/callback` on the
  first configured frontend origin.

WhatsApp connects through Meta's Embedded Signup in headless mode. The web app
calls `POST /channels/whatsapp/connect`, opens the returned Zernio `authUrl`,
and the user authorizes inside Meta's signup page without entering a System
User token, WABA ID, or Phone Number ID. When the connected WABA has a single
phone number, Zernio auto-completes the connection and redirects the browser to
the Plucia callback with an `accountId`. When it has two or more numbers,
Zernio redirects with `step=select_phone_number` and a single-use `tempToken`;
the Plucia UI calls `GET /channels/whatsapp/phone-numbers?tempToken=…` and then
`POST /channels/whatsapp/phone-numbers/select` with the picked `phoneNumberId`
and `wabaId`. These endpoints derive the tenant's Zernio profile server-side,
so the browser never supplies or receives a `profileId` and the one-time token
is never persisted or logged.

The older headless credentials route remains available for server-to-server
setups that already hold a permanent Meta System User token, WABA ID, Phone
Number ID, and optional six-digit PIN. The API derives the tenant's Zernio
profile, forwards those values without persisting or logging them, and returns
`Cache-Control: no-store`. This flow does not use the Facebook JS SDK, browser
redirects, or domain allowlisting. The Meta token must include
`whatsapp_business_management` and `whatsapp_business_messaging`. These Meta
credentials are entered programmatically; they do not belong in either `.env`
file.

When the WhatsApp inbox opens, the web app idempotently calls the configure
route. The API creates or updates the `Plucia WhatsApp Inbox` webhook in
Zernio. In local development, expose port 4000 through an HTTPS tunnel and set
its full webhook endpoint as `ZERNIO_WEBHOOK_PUBLIC_URL`; Zernio cannot deliver
webhooks to `localhost`.

Apply the database migrations before enabling the integration. LinkedIn OAuth
is supported, but LinkedIn does not expose direct-message APIs to third-party
applications; only WhatsApp uses the inbox and send routes.

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

## Channel connection endpoints

Base path: `/api/organizations/:organizationId/channels`.

| Method   | Path          | Role    | Body                                                                                  |
| -------- | ------------- | ------- | ------------------------------------------------------------------------------------- |
| `GET`    | `/`           | member+ | List tenant connections                                                               |
| `POST`   | `/`           | admin+  | `channelType`, optional account/display fields, `secretReference`, `config`, `status` |
| `GET`    | `/:channelId` | member+ | Get one tenant connection                                                             |
| `PATCH`  | `/:channelId` | admin+  | Any allowed mutable fields; empty body rejected                                       |
| `DELETE` | `/:channelId` | admin+  | Delete one tenant connection                                                          |

`channelType` is one of `whatsapp`, `instagram`, `linkedin`, `email`, or
`voice`. Raw OAuth tokens/API secrets are not accepted. Store them in a secrets
manager and send only `secretReference`; that reference is not returned in API
responses. Platform-specific OAuth handshakes are not implemented in v1.

## Conversation metadata endpoints

Base path: `/api/organizations/:organizationId/conversations`. These endpoints
never accept or return message content.

| Method   | Path                                   | Role    | Input                                                                                          |
| -------- | -------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `GET`    | `/?channel=&status=&limit=25&offset=0` | member+ | Filtered/paginated metadata list; max limit 100                                                |
| `POST`   | `/`                                    | admin+  | `channel`, `externalThreadId`, at least one of `mongoDocumentId` or `s3Key`, optional `status` |
| `GET`    | `/:conversationId`                     | member+ | Metadata and external history pointer                                                          |
| `PATCH`  | `/:conversationId`                     | admin+  | Update pointers and/or `status`                                                                |
| `DELETE` | `/:conversationId`                     | admin+  | Delete metadata only; external storage is untouched                                            |

## Agent config endpoints

Base path: `/api/organizations/:organizationId/agent-config`.

| Method   | Path | Role    | Purpose                                                                          |
| -------- | ---- | ------- | -------------------------------------------------------------------------------- |
| `GET`    | `/`  | member+ | Get tenant config                                                                |
| `PUT`    | `/`  | admin+  | Create/replace via upsert: adapter reference, knowledge-base reference, settings |
| `DELETE` | `/`  | admin+  | Delete tenant config                                                             |

The table stores references and JSON settings only. It does not invoke workers,
LoRA adapters, or Bedrock.

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
