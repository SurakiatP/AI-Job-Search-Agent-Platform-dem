#!/usr/bin/env bash
# First install on a host prepared by cloud-init.yaml. Idempotent (spec "bootstrap.sh"). Run as root.
set -euo pipefail
base=/opt/job-search-platform
private=/etc/job-search-platform/private
env_file="$private/app.env"
release="$(readlink -f "$base/current")"
here="$release/infra/deploy"
# shellcheck source=infra/deploy/lib.sh
source "$here/lib.sh"

install -d -o jsp -g jsp -m 0700 /etc/job-search-platform "$private" /var/backups/job-search-platform
install -d -o jsp -g jsp -m 0700 "$private/core02"
[[ -f "$env_file" ]] || install -o jsp -g jsp -m 0600 "$here/app.env.example" "$env_file"
check_app_env "$env_file"
load_app_env "$env_file"
[[ -z "${CADDY_TLS:-}" ]] || export CURL_EXTRA=-k  # rehearsal uses an internal CA; production keeps verification

as_jsp() { sudo -u jsp --preserve-env -H bash -c "$*"; }

upstream=/var/lib/job-search-platform/.cache/job-search-platform/upstream
as_jsp "mkdir -p '$upstream'"
as_jsp "cd '$release' && uv sync --locked --project backend"
fetch_all_pinned

as_jsp "cd '$release' && uv run --locked --project backend python infra/hermes/setup.py --acquire --build"
as_jsp "cd '$release' && uv run --locked --project backend python scripts/local_infra.py start"
as_jsp "cd '$release' && npm ci --prefix frontend && npm run build --prefix frontend"

install -m 0644 "$here"/job-search-*.service "$here"/job-search-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now job-search-platform job-search-ingest.timer job-search-backup.timer
wait_ready "https://$DOMAIN/api/v1/health/ready" 300
echo "ready: https://$DOMAIN/login"
