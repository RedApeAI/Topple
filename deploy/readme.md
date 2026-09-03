# Deploying RedApeAI

Three things ship: **api** (BFF) and **orchestrator** (agent runtime) on Render,
**web** (dashboard SPA) on Vercel. `landing` and `docs` deploy separately;
`call` and `heartbeat` are health-check stubs with no implementation.

```
                    Cloudflare DNS
                            │
              ┌─────────────┴──────────────┐
        redape.com                  app.redape.com
        (landing, later)                  │
                                          ▼
                                   Vercel · apps/web
                                   static SPA + SPA fallback
                                          │
                              rewrite /api/* and /healthz
                                          │
                                          ▼
                    ┌────── Render · render.yaml ───────┐
                    │  web      redape-api      public  │
                    │   │ private network               │
                    │  pserv    redape-orchestrator     │
                    │  keyvalue redape-cache            │
                    └───────────────────────────────────┘
                             │        │         │
                          Atlas     Neon    Qdrant Cloud
```

This is the **target** shape. The current deploy runs a cheaper, no-card variant
of it — `redape-orchestrator` as a free public web service rather than the
private service drawn above. See the comment block at the top of
[`render.yaml`](../render.yaml) for exactly what differs and why, and "Current
mode" below for how to create it that way.

## Why this shape

**The SPA and the BFF must share an origin.** `apps/web/src/lib/api/client.ts`
sets `baseURL: ""` on purpose: the session cookie has to stay first-party or
Better Auth's OAuth callbacks break. In development Vite's proxy provides that;
in production the rewrite in `apps/web/vercel.json` does. Everything about the
auth configuration (`COOKIE_CROSS_SITE=false`, a single `FRONTEND_ORIGINS`
entry) follows from it. The browser never sees the `onrender.com` hostname.

The rewrite order in `vercel.json` matters and JSON cannot carry a comment, so:
`/api/:path*` and `/healthz` come **before** the `/(.*)` → `/index.html`
catch-all, which exists because `App.tsx` uses `BrowserRouter` and a hard
refresh on `/inbox` would otherwise 404. Vercel checks the filesystem first, so
static assets are unaffected.

**Node, not an edge runtime, for the BFF.** `routes/connectors.ts` drives the
MCP SDK's transport with raw `node:http` objects and throws
`"MCP requires the Node server adapter."` without them.

**A private service, not a worker or a cron, for the orchestrator.** It receives
traffic — the BFF proxies every turn — and it must keep running between
requests: `engine/background.py` sends the outbound mail, writes the trace and
publishes events _after_ the response has gone out, and the lifespan hook
replays turns whose deferred work never ran.

**Nothing is on Render's Free tier.** A free web service cannot _receive_
private network traffic, and free instances spin down — which would drop exactly
the post-response work above.

## Current mode: free, no card, manual creation

**Render's private services have no free tier, at all** — a paid plan is
required to create one, whether through a Blueprint or by hand. `render.yaml`
is currently set up to avoid that entirely: `redape-orchestrator` is a free
`web` service instead of the private service it's designed to be, and the two
backend services talk over their public `onrender.com` URLs instead of the
private network. Full rationale and the two trade-offs this accepts (the
orchestrator is reachable by anyone who finds its URL, and both services can
cold-start after 15 min idle) are in the comment block at the top of
[`render.yaml`](../render.yaml) — read it before applying.

**Blueprints also need a payment method on file**, independent of whether the
resources it creates are free — so even with everything in `render.yaml` now
free-tier, create the three services by hand instead:

### 1. redape-orchestrator, first

Dashboard → **New +** → **Web Service** → connect `RedApeAI/Topple` → branch
`main`.

- **Runtime**: Docker
- **Dockerfile Path**: `apps/worker/orchestrator/Dockerfile`
- **Docker Build Context Directory**: `.` (repo root — the image resolves
  `@repo/db-sql` through the root lockfile)
- **Instance Type**: Free
- **Health Check Path**: `/health`

Environment variables — add each as a plain key/value, copying from
`apps/worker/orchestrator/.env`: `MONGO_URL`, `MONGO_DB`, `QDRANT_URL`,
`QDRANT_API_KEY`, `BEDROCK_API_KEY`. Then these fixed values (not from your
`.env` — see `render.yaml` for why each is set the way it is):

```
PORT=8000
CORS_ORIGINS=[]
LLM_BACKEND=bedrock
BEDROCK_REGION=us-east-1
BEDROCK_MODEL_ID=minimax.minimax-m2
LLM_MAX_OUTPUT_TOKENS=4096
LLM_TIMEOUT_SECONDS=60
FASTEMBED_CACHE_PATH=/opt/fastembed
```

Leave `BFF_BASE_URL` and `OUTBOUND_WEBHOOK_SECRET` for the next two steps.
Create the service — it starts building immediately, before those are set;
that's fine, it just won't work until you finish step 3.

### 2. redape-api

**New +** → **Web Service** → same repo, branch `main`.

- **Dockerfile Path**: `apps/api/Dockerfile`
- **Docker Build Context Directory**: `.`
- **Instance Type**: Free
- **Health Check Path**: `/healthz`

Copy from `apps/api/.env`: `DATABASE_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`,
`ZERNIO_WEBHOOK_PUBLIC_URL`, `ZERNIO_CONNECT_REDIRECT_URL`. Fixed values:

```
NODE_ENV=production
PORT=4000
COOKIE_CROSS_SITE=false
COOKIE_SECURE=true
KNOWLEDGE_COLLECTION=redape_re
```

For `BETTER_AUTH_SECRET`, generate one rather than reusing your local dev
value — `openssl rand -base64 48` on a terminal.

`BETTER_AUTH_URL`, `FRONTEND_ORIGINS`, and `ORCHESTRATOR_URL` need real URLs
that don't exist yet — leave placeholders (e.g. `https://placeholder`) for now
and see step 4.

### 3. Copy the two URLs and cross-wire

Both services now have a public URL on their dashboard page — something like
`https://redape-orchestrator.onrender.com` and
`https://redape-api.onrender.com` (Render appends a suffix if a name was
taken; use whatever it actually assigned).

On **redape-api** → Environment: set `ORCHESTRATOR_URL` to the orchestrator's
URL.
On **redape-orchestrator** → Environment: set `BFF_BASE_URL` to the API's URL.

Also generate `OUTBOUND_WEBHOOK_SECRET` — `openssl rand -hex 32` — and set the
**same value** on both services under that exact key. It has to be
byte-identical: the BFF compares it with `timingSafeEqual`, and a mismatch
401s every outbound email with no other symptom.

Each save triggers a redeploy of that service.

### 4. redape-cache

**New +** → **Key Value**.

- **Instance Type**: Free
- **Max Memory Policy**: `allkeys-lru`

Copy its **Internal Connection String** from the dashboard into
`redape-orchestrator`'s `DRAGONFLY_URL`. Unlike the two web services, this one
Render private-networks to just fine on the free plan — it's a datastore, not
compute, and isn't subject to the send-only restriction free web services have.

`OUTBOUND_WEBHOOK_URL` needs no entry anywhere — `config.py` derives it from
`BFF_BASE_URL` once that's set.

## Vercel

New project, **Root Directory `apps/web`**. Vercel detects the pnpm workspace
and installs from the repo root; `apps/web/vercel.json` supplies the rest.

Two things to do by hand:

1. Set `VITE_API_URL` to an **empty string**. Vite inlines it at build time and
   the code falls back to `""` (same origin) when unset, so this is
   belt-and-braces — but any real value here sends every request cross-origin
   and breaks sign-in.
2. Check the rewrite destination in `vercel.json`. It assumes
   `https://redape-api.onrender.com`; if that name was taken, Render appended a
   suffix and this must match — the actual URL from step 2 above.

Once Vercel gives you its URL, go back to **redape-api** → Environment and set
`BETTER_AUTH_URL` and `FRONTEND_ORIGINS` to it (`https://<your-app>.vercel.app`,
or `https://app.redape.com` once that domain is live) — not either service's
own `onrender.com` URL. This is the single most common way to break sign-in
here, and it fails silently.

## Cloudflare

`app` CNAME → the Vercel target, proxied. SSL/TLS mode **Full (strict)**.

Note the ~100s proxy timeout — it returns 524 past that. Every timeout in the
stack sits below it; do not raise one without checking the ladder.

## Google Cloud console

Authorised redirect URI `https://app.redape.com/api/auth/callback/google`,
authorised origin `https://app.redape.com`.

**This gates general availability.** Gmail's `gmail.modify` is a _restricted_
scope: public launch needs Google verification plus a CASA security assessment
(HLD §8 gap 5). Until that clears, keep the OAuth app in testing mode with
explicit test users. Each API also has to be enabled in the project by hand — a
disabled one returns a 403 indistinguishable from a permissions problem.

## GitHub

One secret: `DATABASE_URL`, for the migration job.

Migrations run in CI rather than as Render's `preDeployCommand`, which would
force drizzle-kit and a TypeScript toolchain into the production image to run a
one-off. On both services, set **Settings → Build & Deploy → Auto-Deploy** to
**After CI Checks Pass** (a Blueprint applies this automatically via
`autoDeployTrigger: checksPass`; creating services by hand needs this set
manually, once, per service) — so the schema is always ahead of the code that
expects it.

## The timeout ladder

Every hop's budget sits inside its caller's. Raising one without raising the
ones outside it means the outer hop abandons work the inner one is still doing,
and the user is told it failed while it goes on to succeed.

| Hop                   | Budget | Set in                                  |
| --------------------- | ------ | --------------------------------------- |
| Cloudflare proxy      | ~100s  | fixed, returns 524                      |
| Browser, agent routes | 95s    | `AGENT_TIMEOUT_MS`, `lib/api/client.ts` |
| BFF → orchestrator    | 85s    | `TIMEOUT_MS`, `orchestrator.service.ts` |
| One Operator command  | 75s    | `operator_deadline_seconds`             |
| One node              | 60–70s | `node_timeout_*`                        |
| One LLM call          | 60s    | `LLM_TIMEOUT_SECONDS`                   |

## Rollback

Render dashboard → the service → **Deploys** → **Rollback to this deploy** on
the last good one. Roll the orchestrator back before the API if both are
affected: the BFF calls it, not the other way round.

Migrations are **not** reverted. A rollback across a schema change needs a
compensating migration.

## Operational constraints

**Keep `redape-api` at one instance.** `middleware/rate-limit.ts` holds its
sliding windows and the credential-stuffing lockout in process memory — its own
comment says as much. A second instance silently halves both limits and lets an
attacker alternate between them. Moving that state to `redape-cache` (already
provisioned, already reachable) is the prerequisite for scaling out.

**Rotate the Qdrant API key.** It was echoed to a terminal during debugging.
While you are there, drop `REDAPE_QDRANT` from any `.env` you copy forward — it
is not a recognised setting and is silently ignored; `QDRANT_API_KEY` is the one
`config.py` reads.

**Everything stays in `virginia`.** Render's private network does not cross
regions, so a service provisioned elsewhere silently loses its peers.

## Verifying a deploy

Steps 1–2 are specific to the current free-tier mode (both services have public
URLs, called over HTTPS). Once hardened back to a private orchestrator, step 2
becomes a Render-shell `curl` to `$ORCHESTRATOR_URL` instead, and step 3
inverts — you'd be confirming it has _no_ public URL.

1. `curl https://<orchestrator>.onrender.com/health` directly → `status: ok`
   with `mongo`, `qdrant` and `llm` all true. `degraded` returns 503 and means
   credentials, not code. The first call after 15 min idle may take up to a
   minute — that's the free-plan cold start, not a bug.
2. `curl https://app.redape.com/healthz` → `{"ok":true}`. That path proves the
   Vercel rewrite as well as the BFF.
3. Sign in. In devtools the session cookie must **not** be `SameSite=None`, and
   no request should leave `app.redape.com`. This is the one that regresses
   silently.
4. Connect Google; confirm the callback lands on `app.redape.com` and Gmail
   populates.
5. Upload a **3 MB** PDF through the paperclip — it must reach Qdrant, not 413.
6. Run an Operator command that takes more than 30s and confirm the browser
   waits for it. If both services just cold-started, expect the first attempt
   to be slow or to fail outright — retry once before treating it as a bug.
7. Issue a calendar command: this exercises orchestrator → BFF MCP discovery,
   the path that forced the Node runtime.
8. Send in autopilot, then check the mail actually left via the Sent view — the
   only step that exercises the post-response drain.
9. Roll back to the previous deploy and forward again. Rehearse it now, not
   during an incident.
