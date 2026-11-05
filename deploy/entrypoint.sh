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

# Kept in DATA_PATH: fetch the pinned agent sources and build the tool image through the host Docker.
# The image is rebuilt when a file baked into it changes (the stamp holds the hash of those files at the last build).
CACHE_DIR="$HOME/.cache/job-search-platform"
IMAGE_STAMP="$CACHE_DIR/hermes-image.sha256"
IMAGE_HASH=$(cd /app/infra/hermes && cat Dockerfile package.json package-lock.json parser-requirements.txt parse_document.py export_pdf.mjs typst_render.py | sha256sum | cut -d' ' -f1)
if [ ! -f "$CACHE_DIR/hermes-runtime.json" ]; then
  echo "preparing agent runtime (first start, takes several minutes)"
  /app/backend/.venv/bin/python /app/infra/hermes/setup.py --acquire --build
  echo "$IMAGE_HASH" > "$IMAGE_STAMP"
elif [ "$(cat "$IMAGE_STAMP" 2>/dev/null)" != "$IMAGE_HASH" ]; then
  echo "agent tool image is out of date, rebuilding (takes a few minutes)"
  if /app/backend/.venv/bin/python /app/infra/hermes/setup.py --acquire --build; then echo "$IMAGE_HASH" > "$IMAGE_STAMP"; else echo "agent image rebuild failed, keeping the old image"; fi
fi
# The agent's own Python lives in DATA_PATH too; if it stops running (profile_cv fails with FileNotFoundError),
# rebuild just that environment (the tool image is kept). A failure here must not keep the web app down.
ENVPY="$HOME/.cache/job-search-platform/hermes-environment/.venv/bin/python"
if ! "$ENVPY" -c pass 2>/dev/null; then
  echo "agent python not runnable, rebuilding the agent environment"
  /app/backend/.venv/bin/python /app/infra/hermes/setup.py --acquire || echo "agent environment rebuild failed"
fi
exec /app/backend/.venv/bin/python /app/scripts/run_local.py --host 0.0.0.0 --port 8000 \
  --frontend-dist /app/frontend/dist
