#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV="$ROOT/apps/api/.env"
WEB_ENV="$ROOT/apps/web/.env.local"
LOG="$ROOT/scripts/.tunnel.log"
PORT="${1:-3000}"

echo "Tunnel target: http://127.0.0.1:${PORT}"
echo "Cleaning up any previous quick tunnel..."
pkill -f "cloudflared tunnel --url" 2>/dev/null || true
sleep 1

nohup cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate >"$LOG" 2>&1 &
CLOUDFLARED_PID=$!
echo "cloudflared started (pid $CLOUDFLARED_PID)"

HOST=""
for _ in $(seq 1 60); do
  HOST="$(rg -o 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  if [ -n "$HOST" ]; then break; fi
  if ! kill -0 "$CLOUDFLARED_PID" 2>/dev/null; then
    echo "cloudflared exited early. Log:"
    cat "$LOG"
    exit 1
  fi
  sleep 1
done

if [ -z "$HOST" ]; then
  echo "Timed out waiting for tunnel URL. Log:"
  cat "$LOG"
  exit 1
fi

echo "Assigned tunnel host: $HOST"
echo

python3 - "$API_ENV" "$WEB_ENV" "$HOST" <<'PY'
import re
import sys

api_env, web_env, host = sys.argv[1], sys.argv[2], sys.argv[3]

def upsert(path, key, value):
    with open(path) as f:
        lines = f.read().splitlines(keepends=True)
    found = False
    for i, line in enumerate(lines):
        if line.startswith(key + "="):
            lines[i] = f"{key}={value}\n"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}\n")
    with open(path, "w") as f:
        f.writelines(lines)

def swap_trycloudflare(path, key, new_host):
    with open(path) as f:
        lines = f.read().splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.startswith(key + "="):
            parts = line.strip().split("=", 1)[1].split(",")
            kept = [p for p in parts if "trycloudflare.com" not in p and p.strip()]
            if new_host not in kept:
                kept.append(new_host)
            lines[i] = f"{key}={','.join(kept)}\n"
            break
    with open(path, "w") as f:
        f.writelines(lines)

# apps/api/.env
upsert(api_env, "ZERNIO_WEBHOOK_PUBLIC_URL", f"{host}/api/v1/zernio/webhooks")
upsert(api_env, "BETTER_AUTH_URL", host)
swap_trycloudflare(api_env, "FRONTEND_ORIGINS", host)

# apps/web/.env.local
upsert(web_env, "VITE_DEV_ALLOWED_HOSTS", host.replace("https://", ""))
PY

echo "Updated env files:"
echo "  apps/api/.env     ZERNIO_WEBHOOK_PUBLIC_URL=$HOST/api/v1/zernio/webhooks"
echo "  apps/api/.env     BETTER_AUTH_URL=$HOST"
echo "  apps/api/.env     FRONTEND_ORIGINS (trycloudflare host swapped)"
echo "  apps/web/.env.local VITE_DEV_ALLOWED_HOSTS=${HOST#https://}"
echo
echo "App URL:      $HOST"
echo "Webhook URL:  $HOST/api/v1/zernio/webhooks"
echo "Health check: $HOST/healthz"
echo
echo "Next: restart API and web so they pick up the new env, then open $HOST"
