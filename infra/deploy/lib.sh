#!/usr/bin/env bash
# Shared helpers for bootstrap.sh and deploy.sh (WP1 part 2, spec 2026-10-15-iac-single-vm-design.md).

check_app_env() {
  local file="$1"
  [[ -f "$file" ]] || { echo "missing $file; copy infra/deploy/app.env.example and fill it in" >&2; return 1; }
  local mode
  mode=$(stat -c %a "$file" 2>/dev/null || stat -f %Lp "$file")
  [[ "$mode" == "600" ]] || { echo "$file must be mode 0600 (is $mode)" >&2; return 1; }
  if grep -nE '^[^#]*CHANGE_ME' "$file" >&2; then
    echo "replace every CHANGE_ME in $file" >&2; return 1
  fi
}

# Parse KEY=VALUE lines without executing them (systemd EnvironmentFile rules: one pair of quotes is stripped).
load_app_env() {
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
    key="${line%%=*}"; value="${line#*=}"
    [[ "$line" == *=* && "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "invalid line in $1: $line" >&2; return 1; }
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
    export "$key=$value"
  done < "$1"
}

wait_ready() {
  local url="$1" seconds="$2" deadline=$((SECONDS + $2))
  while (( SECONDS < deadline )); do
    # shellcheck disable=SC2086  # CURL_EXTRA is deliberately word-split
    curl --silent --fail --max-time 5 ${CURL_EXTRA:-} "$url" >/dev/null && return 0
    sleep 2
  done
  echo "not ready after ${seconds}s: $url" >&2
  return 1
}

guard_schema() {
  local db_head="$1" code_head="$2"
  [[ "$db_head" == "$code_head" ]] && return 0
  echo "database is at $db_head but this release expects $code_head; code-only rollback is unsafe." >&2
  echo "restore the pre-deploy backup instead:" >&2
  echo "  uv run --locked --project backend python scripts/restore.py --archive /var/backups/job-search-platform/<pre-deploy archive> --target-database <db> --target-bucket <bucket>" >&2
  return 1
}
