#!/usr/bin/env bash
# Usage: deploy.sh <tag>. Update or roll back to a tagged release (spec "Deploy and rollback"). Run as root.
set -euo pipefail
tag="${1:?usage: deploy.sh <tag>}"
base=/opt/job-search-platform
env_file=/etc/job-search-platform/private/app.env
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=infra/deploy/lib.sh
source "$here/lib.sh"
check_app_env "$env_file"
check_pg_client
load_app_env "$env_file"
[[ -z "${CADDY_TLS:-}" ]] || export CURL_EXTRA=-k  # rehearsal uses an internal CA; production keeps verification
as_jsp() { sudo -u jsp --preserve-env -H bash -c "$*"; }  # releases are owned by jsp; git refuses root on them

previous="$(readlink -f "$base/current")"
release="$base/releases/$tag"
repo_url="$(as_jsp "git -C '$previous' remote get-url origin")"
git ls-remote --exit-code "$repo_url" "refs/tags/$tag" >/dev/null || { echo "no such tag: $tag" >&2; exit 1; }
if [[ ! -d "$release" ]]; then  # clone aside so a half-cloned directory is never reused
  rm -rf "$release.partial"
  as_jsp "git clone --quiet --depth 1 --branch '$tag' '$repo_url' '$release.partial'"
  # a branch named like the tag must not be deployed: the tag itself has to resolve to HEAD
  as_jsp "git -C '$release.partial' rev-parse -q --verify 'refs/tags/$tag^{commit}' >/dev/null || git -C '$release.partial' fetch -q --depth 1 origin 'refs/tags/$tag:refs/tags/$tag'"
  [[ "$(as_jsp "git -C '$release.partial' rev-parse 'refs/tags/$tag^{commit}'")" == "$(as_jsp "git -C '$release.partial' rev-parse HEAD")" ]] \
    || { echo "$tag is not a tag at the cloned commit" >&2; rm -rf "$release.partial"; exit 1; }
  mv "$release.partial" "$release"
fi
as_jsp "cd '$release' && uv sync --locked --project backend"

# Rolling back across a migration is never automatic: the target must know the database's revision.
db_head="$(as_jsp "cd '$release' && uv run --locked --project backend python scripts/migration_state.py db-head")"
if ! as_jsp "cd '$release' && uv run --locked --project backend python scripts/migration_state.py knows '$db_head'"; then
  guard_schema "$db_head" "$(as_jsp "cd '$release' && uv run --locked --project backend python scripts/migration_state.py code-head")"
fi

upstream=/var/lib/job-search-platform/.cache/job-search-platform/upstream
# Refresh everything infra/ depends on from release dir $1: pinned upstream sources, Hermes runtime, systemd units, containers.
apply_infra() {
  local release="$1" # pin() reads $release
  as_jsp "mkdir -p '$upstream'" || return 1
  fetch_all_pinned || return 1 # callers run this under if/||, where set -e is off
  as_jsp "cd '$release' && uv run --locked --project backend python infra/hermes/setup.py --acquire --build" || return 1
  install -m 0644 "$release"/infra/deploy/job-search-*.service "$release"/infra/deploy/job-search-*.timer /etc/systemd/system/ || return 1
  systemctl daemon-reload || return 1
  as_jsp "cd '$release' && uv run --locked --project backend python scripts/local_infra.py start"
}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/var/backups/job-search-platform/pre-deploy-$tag-$stamp"
# A consistent backup needs the maintenance lock the running app holds, so the app is stopped around it.
systemctl stop job-search-platform || { echo "could not stop app for backup; nothing deployed, app state unknown" >&2; exit 1; }
backup_ok=1
as_jsp "cd '$previous' && uv run --locked --project backend python scripts/backup.py --archive '$archive'" || backup_ok=0
systemctl start job-search-platform || { echo "could not restart app after backup; app is DOWN on $previous, nothing deployed" >&2; exit 1; }
[[ "$backup_ok" == 1 ]] || { echo "pre-deploy backup failed; nothing deployed, previous release restarted" >&2; exit 1; }

as_jsp "cd '$release' && npm ci --prefix frontend && npm run build --prefix frontend"
infra_reapplied=0
if ! diff -rq -x __pycache__ "$previous/infra" "$release/infra" >/dev/null; then
  infra_reapplied=1
  if ! apply_infra "$release"; then
    echo "starting infrastructure of $tag failed; re-applying $previous (current still points at it, app untouched)" >&2
    apply_infra "$previous" || echo "previous infra re-apply failed" >&2
    exit 1
  fi
fi

ln -sfn "$release" "$base/current"
systemctl restart job-search-platform
if ! wait_ready "https://$DOMAIN/api/v1/health/ready" 60; then
  echo "health check failed; restoring $previous" >&2
  ln -sfn "$previous" "$base/current"
  if [[ "$infra_reapplied" == 1 ]]; then
    apply_infra "$previous" || echo "previous infra restart failed" >&2
  fi
  # If the new release already migrated the schema, the previous code must not run on it.
  prev_db_head="$(as_jsp "cd '$previous' && uv run --locked --project backend python scripts/migration_state.py db-head")" || { echo "cannot read database head with previous release; app on $previous may be running against a migrated schema, check it and the pre-deploy backup $archive" >&2; exit 1; }
  if ! as_jsp "cd '$previous' && uv run --locked --project backend python scripts/migration_state.py knows '$prev_db_head'"; then
    systemctl stop job-search-platform || { echo "could not stop app; it may still run $previous on an incompatible schema" >&2; exit 1; }
    guard_schema "$prev_db_head" "$(as_jsp "cd '$previous' && uv run --locked --project backend python scripts/migration_state.py code-head")" || true
    echo "app left stopped; restore the pre-deploy backup:" >&2
    echo "  uv run --locked --project backend python scripts/restore.py --archive $archive --target-database <db> --target-bucket <bucket>" >&2
    exit 1
  fi
  systemctl restart job-search-platform || { echo "restart of previous release $previous failed; app is down, current points at it" >&2; exit 1; }
  if wait_ready "https://$DOMAIN/api/v1/health/ready" 60; then
    echo "previous release $previous is healthy again" >&2
  else
    echo "previous release $previous is NOT healthy" >&2
  fi
  echo "if $tag migrated the schema, restore $archive with scripts/restore.py (see infra/deploy/README.md)" >&2
  exit 1
fi
echo "deployed $tag"
