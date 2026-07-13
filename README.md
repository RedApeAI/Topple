# Plucia Monorepo

This repo is wired as a pnpm + Turborepo workspace.

## Apps

- `apps/api`: Hono + Better Auth primary API, runs on port `4000`.
- `apps/web`: Next.js frontend for the application, runs on port `3000`.
- `apps/docs`: Next.js documentation site, runs on port `3001`.
- `apps/worker`: FastAPI worker API, runs on port `8000`.
- `apps/call`: Python call API, runs on port `8001`.
- `apps/heartbeat`: Python heartbeat API, runs on port `8002`.

## Packages

- `packages/ui`: shared React UI package.
- `packages/eslint-config`: shared ESLint config.
- `packages/typescript-config`: shared TypeScript config.
- `packages/db-mongo`: Python MongoDB integration package placeholder.
- `packages/db-sql`: Drizzle ORM database package backed by Neon.

### Database

Set `DATABASE_URL` to the Neon connection string in the environment of the app
that uses the database. API code can then import the shared client with:

```ts
import { getDb } from "@repo/db-sql";

const db = getDb();
```

Add table definitions under `packages/db-sql/src/schema`, then use
`pnpm --filter @repo/db-sql db:generate` and
`pnpm --filter @repo/db-sql db:migrate` to manage migrations.

- `packages/redis`: Python Redis integration package placeholder.

## Running Everything

From the repo root:

```sh
pnpm dev
```

That runs every workspace `dev` script through Turbo.

The Python apps declare FastAPI/Uvicorn in their `pyproject.toml` files. If those
dependencies are not installed yet, their dev scripts still boot a minimal
fallback health server so the monorepo can start with one command while the API
implementations are being filled in.

Health endpoints:

```sh
curl http://localhost:4000/healthz
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:8002/health
```

Frontend API URLs are listed in `.env.example`.

## Common Commands

```sh
pnpm build
pnpm lint
pnpm check-types
pnpm format
```
