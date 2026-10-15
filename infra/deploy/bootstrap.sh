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
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a

as_jsp() { sudo -u jsp --preserve-env -H bash -c "$*"; }

upstream=/var/lib/job-search-platform/.cache/job-search-platform/upstream
as_jsp "mkdir -p '$upstream'"
fetch_pinned() {  # name url commit
  local dir="$upstream/$1"
  if [[ "$(as_jsp "git -C '$dir' rev-parse HEAD 2>/dev/null" || true)" != "$3" ]]; then
    as_jsp "rm -rf '$dir' && git init -q '$dir' && git -C '$dir' fetch -q --depth 1 '$2' '$3' && git -C '$dir' checkout -q --detach '$3'"
  fi
}
pin() { as_jsp "cd '$release' && uv run --locked --project backend python -c 'import sys; sys.path.insert(0, \"scripts\"); import local_infra; print(local_infra.$1)'"; }
as_jsp "cd '$release' && uv sync --locked --project backend"
fetch_pinned minio https://github.com/minio/minio.git "$(pin MINIO_COMMIT)"
fetch_pinned gosu https://github.com/tianon/gosu.git "$(pin GOSU_COMMIT)"
fetch_pinned prometheus https://github.com/prometheus/prometheus.git "$(pin PROMETHEUS_COMMIT)"
fetch_pinned caddy https://github.com/caddyserver/caddy.git "$(pin CADDY_COMMIT)"
fetch_pinned grafana-prometheus-datasource https://github.com/grafana/grafana-prometheus-datasource.git "$(pin GRAFANA_PROM_DS_COMMIT)"

as_jsp "cd '$release' && uv run --locked --project backend python infra/hermes/setup.py --acquire --build"
as_jsp "cd '$release' && uv run --locked --project backend python scripts/local_infra.py start"
as_jsp "cd '$release' && npm ci --prefix frontend && npm run build --prefix frontend"

install -m 0644 "$here"/job-search-*.service "$here"/job-search-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now job-search-platform job-search-ingest.timer job-search-backup.timer
wait_ready "https://$DOMAIN/api/v1/health/ready" 300
echo "ready: https://$DOMAIN/login"
