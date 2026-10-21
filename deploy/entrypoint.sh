#!/bin/sh
# Container start: write the private credential files the app reads from the GitLab variables,
# prepare the agent runtime once, then run the app. No secret value is ever printed.
set -eu
: "${CORE02_PRIVATE_DIR:?}" "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${MINIO_ROOT_USER:?}" \
  "${MINIO_ROOT_PASSWORD:?}" "${MEILI_MASTER_KEY:?}"
umask 077
mkdir -p "$CORE02_PRIVATE_DIR" "$HOME/.cache/job-search-platform"
put() { printf '%s' "$2" > "$CORE02_PRIVATE_DIR/$1"; chmod 0600 "$CORE02_PRIVATE_DIR/$1"; }
put postgres-user "$POSTGRES_USER"
put postgres-password "$POSTGRES_PASSWORD"
put minio-access-key "$MINIO_ROOT_USER"
put minio-secret-key "$MINIO_ROOT_PASSWORD"
put meili-master-key "$MEILI_MASTER_KEY"
[ -z "${TELEGRAM_BOT_TOKEN:-}" ] || put telegram-bot-token "$TELEGRAM_BOT_TOKEN"

# One-time (kept in DATA_PATH): fetch the pinned agent sources and build the tool image through the host Docker.
if [ ! -f "$HOME/.cache/job-search-platform/hermes-runtime.json" ]; then
  echo "preparing agent runtime (first start, takes several minutes)"
  /app/backend/.venv/bin/python /app/infra/hermes/setup.py --acquire --build
fi
exec /app/backend/.venv/bin/python /app/scripts/run_local.py --host 0.0.0.0 --port 8000 \
  --frontend-dist /app/frontend/dist
