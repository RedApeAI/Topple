# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# apps/api — the BFF.
#
# Build from the REPO ROOT, not this directory:
#     docker build -f apps/api/Dockerfile -t redape-api .
# The pnpm workspace resolves `@repo/db-sql` through the root lockfile, so the
# build context has to include it.
#
# Node, deliberately, not an edge runtime: the MCP endpoint in
# routes/connectors.ts drives the SDK's transport with raw node:http objects
# and throws "MCP requires the Node server adapter." without them.
# ---------------------------------------------------------------------------
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Same effect as `pnpm config set store-dir /pnpm/store --global`, without
# taking that command's --global code path — which additionally demands pnpm's
# *global bin dir* be on PATH (a check meant for `pnpm add -g`, which this
# image never does) and fails the build before anything else can run. pnpm
# reads store-dir from this env var the same way npm does: dashes to
# underscores, `npm_config_` prefix.
ENV NPM_CONFIG_STORE_DIR=/pnpm/store
# The root package.json's `prepare` script runs husky, which needs a .git that
# .dockerignore deliberately excludes. Two different failures, two different
# fixes: HUSKY=0 is husky's own opt-out, for the `build` stage below where a
# full (non-`--prod`) install means husky IS present; the `prod-deps` stage
# installs `--prod`, so husky isn't installed at all and the shell can't find
# the binary regardless of this var — `"prepare": "husky || true"` in
# package.json covers that case. Neither alone is `--ignore-scripts`, which
# would also skip postinstall steps real dependencies rely on.
ENV HUSKY=0
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------
# Manifests only.
#
# Sources change every commit, dependency manifests rarely, so installing from
# this layer keeps the dependency cache alive across ordinary edits.
# `--frozen-lockfile` validates the lockfile against every workspace member, so
# all twelve manifests must be present even though only two get built.
# ---------------------------------------------------------------------------
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json                    apps/api/
COPY apps/call/package.json                   apps/call/
COPY apps/docs/package.json                   apps/docs/
COPY apps/heartbeat/package.json              apps/heartbeat/
COPY apps/landing/package.json                apps/landing/
COPY apps/web/package.json                    apps/web/
COPY packages/db-mongo/package.json           packages/db-mongo/
COPY packages/db-sql/package.json             packages/db-sql/
COPY packages/eslint-config/package.json      packages/eslint-config/
COPY packages/redis/package.json              packages/redis/
COPY packages/typescript-config/package.json  packages/typescript-config/
COPY packages/ui/package.json                 packages/ui/

# ---------------------------------------------------------------------------
# Compile. `api...` selects the API and everything it depends on, which is how
# the other ten workspace packages stay uninstalled.
# ---------------------------------------------------------------------------
FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter api...
COPY packages/typescript-config packages/typescript-config
COPY packages/db-sql            packages/db-sql
COPY apps/api                   apps/api
# @repo/db-sql exports ./dist/index.js, so it has to be compiled before the API
# that imports it — the ordering apps/api's `prestart` script already encodes.
RUN pnpm --filter @repo/db-sql build && pnpm --filter api build

# ---------------------------------------------------------------------------
# The same install, minus dev dependencies. Resolved separately rather than
# pruned in place so TypeScript and ESLint never reach the final image.
# ---------------------------------------------------------------------------
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter api... --prod

# ---------------------------------------------------------------------------
# Runtime.
#
# The /repo prefix is preserved from the build stages on purpose: pnpm's
# node_modules are symlink farms pointing into node_modules/.pnpm by relative
# path, and they only resolve if the directory layout is identical.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=prod-deps /repo/node_modules                 ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules        ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/db-sql/node_modules ./packages/db-sql/node_modules
COPY --from=build     /repo/apps/api/package.json        ./apps/api/package.json
COPY --from=build     /repo/apps/api/dist                ./apps/api/dist
COPY --from=build     /repo/packages/db-sql/package.json ./packages/db-sql/package.json
COPY --from=build     /repo/packages/db-sql/dist         ./packages/db-sql/dist

USER node
WORKDIR /repo/apps/api
EXPOSE 4000

# Not `pnpm start` — that runs a `prestart` hook which rebuilds @repo/db-sql
# with a TypeScript that is no longer installed here.
CMD ["node", "dist/index.js"]
