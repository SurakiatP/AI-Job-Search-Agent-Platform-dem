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
set -a
# shellcheck source=/dev/null
source "$env_file"
set +a
as_jsp() { sudo -u jsp --preserve-env -H bash -c "$*"; }  # releases are owned by jsp; git refuses root on them

previous="$(readlink -f "$base/current")"
release="$base/releases/$tag"
repo_url="$(as_jsp "git -C '$previous' remote get-url origin")"
git ls-remote --exit-code "$repo_url" "refs/tags/$tag" >/dev/null || { echo "no such tag: $tag" >&2; exit 1; }
[[ -d "$release" ]] || as_jsp "git clone --quiet --depth 1 --branch '$tag' '$repo_url' '$release'"
as_jsp "cd '$release' && uv sync --locked --project backend"

# Rolling back across a migration is never automatic: the target must know the database's revision.
db_head="$(as_jsp "cd '$previous' && uv run --locked --project backend python scripts/migration_state.py db-head")"
if ! as_jsp "cd '$release' && uv run --locked --project backend python scripts/migration_state.py knows '$db_head'"; then
  guard_schema "$db_head" "$(as_jsp "cd '$release' && uv run --locked --project backend python scripts/migration_state.py code-head")"
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/var/backups/job-search-platform/pre-deploy-$tag-$stamp"
as_jsp "cd '$previous' && uv run --locked --project backend python scripts/backup.py --archive '$archive'"

as_jsp "cd '$release' && npm ci --prefix frontend && npm run build --prefix frontend"
if ! diff -rq "$previous/infra" "$release/infra" >/dev/null; then
  as_jsp "cd '$release' && uv run --locked --project backend python scripts/local_infra.py start"
fi

ln -sfn "$release" "$base/current"
systemctl restart job-search-platform
if ! wait_ready "https://$DOMAIN/api/v1/health/ready" 60; then
  echo "health check failed; restoring $previous" >&2
  ln -sfn "$previous" "$base/current"
  systemctl restart job-search-platform
  echo "if $tag migrated the schema, restore $archive with scripts/restore.py (see infra/deploy/README.md)" >&2
  exit 1
fi
echo "deployed $tag"
