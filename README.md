# Plucia Monorepo

This repo is wired as a pnpm + Turborepo workspace.

## Apps

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
- `packages/db-sql`: Python SQL integration package placeholder.
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
