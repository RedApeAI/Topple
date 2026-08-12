# WhatsApp production and end-to-end testing

Plucia uses Zernio as the WhatsApp gateway. Zernio sends signed webhook events
to the API, and the API publishes tenant-scoped Socket.IO events to the web
application.

```text
WhatsApp customer -> Meta -> Zernio -> apps/api webhook -> Socket.IO -> apps/web
Plucia operator   -> apps/web -> apps/api -> Zernio -> Meta -> WhatsApp customer
```

## Stable deployment (no development tunnel)

Deploy the Node API to a service with a stable HTTPS hostname and WebSocket
support. Deploy the static Vite application separately. A typical layout is:

```text
https://app.example.com  -> apps/web
https://api.example.com  -> apps/api (port from $PORT)
```

The API process must stay alive; do not deploy it as a request-only/serverless
function because it owns long-lived Socket.IO connections. A single replica is
enough for the first milestone. When adding replicas, provision Redis and set
`REDIS_URL` so every replica shares Socket.IO broadcasts.

Run database migrations as a release/pre-deploy command:

```sh
pnpm --filter @repo/db-sql db:migrate
```

Build and start the API with:

```sh
pnpm --filter @repo/db-sql build
pnpm --filter api build
pnpm --filter api start
```

Build the web application with:

```sh
VITE_API_URL=https://api.example.com pnpm --filter web build
```

## API environment

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://api.example.com
FRONTEND_ORIGINS=https://app.example.com
COOKIE_SECURE=true
COOKIE_CROSS_SITE=false

ZERNIO_API_KEY=sk_...
ZERNIO_BASE_URL=https://zernio.com/api/v1
ZERNIO_WEBHOOK_SECRET=<random-secret>
ZERNIO_WEBHOOK_PUBLIC_URL=https://api.example.com/api/v1/zernio/webhooks
ZERNIO_CONNECT_REDIRECT_URL=https://app.example.com/dashboard/zernio/callback

# Set only when running more than one API replica.
REDIS_URL=redis://...
```

`app.example.com` and `api.example.com` are same-site subdomains. If the web
and API deployments use unrelated domains, set `COOKIE_CROSS_SITE=true`; both
must use HTTPS, and browser third-party-cookie policies can still interfere.
Using subdomains of one domain is therefore preferred.

The API configures the `Plucia WhatsApp Inbox` webhook on startup and retries
transient setup failures. Its stable endpoint can be inspected after login:

```text
GET /api/v1/zernio/webhooks/status
```

The result must report `configured: true`, `active: true`, and
`failureCount: 0`. Zernio disables a webhook after repeated delivery failures,
so monitor this endpoint and the Zernio webhook delivery logs.

## End-to-end acceptance test

Use two devices/numbers: the connected WABA number and a separate customer
WhatsApp number.

1. Deploy the database, API, and web app. Confirm `GET /healthz` returns 200.
2. Sign in and connect the WABA through the WhatsApp page.
3. Confirm the webhook status endpoint is configured and active.
4. In Zernio, send a test webhook and confirm the delivery log receives a 2xx
   in under five seconds.
5. Keep the Plucia WhatsApp inbox open with no conversation selected. Send a
   message from the customer phone. The conversation must move to the top and
   show unread without refreshing.
6. Open the conversation. Send another customer message. It must appear once
   in the open chat without refreshing.
7. Reply from Plucia. It must appear once in Plucia and arrive on the customer
   phone. Confirm the status progresses from sent to delivered and then read.
8. Disable the browser network, send two customer messages, then restore the
   network. Socket.IO must reconnect and REST reconciliation must recover both
   messages without duplication.
9. Restart the API, send a customer message during the restart, and wait for
   Zernio's retry. Confirm it appears after the API returns.
10. Open two Plucia browser sessions in the same workspace. A message sent or
    received in either session must update both sessions.

Free-form WhatsApp replies only work inside the 24-hour customer-service
window. To initiate or reopen a conversation outside that window, use an
approved template through the New chat flow. A failure outside the window is a
WhatsApp policy result, not a realtime transport failure.

## Production monitoring

Alert on API 5xx responses, webhook signature failures, a nonzero Zernio
webhook `failureCount`, inactive webhooks, `message.failed` events, Redis
connection errors, and repeated Socket.IO authentication failures. Keep the
Zernio event ID as the deduplication key and retain webhook rows long enough to
investigate delivery incidents.
