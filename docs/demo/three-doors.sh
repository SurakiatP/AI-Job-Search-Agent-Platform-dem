#!/bin/sh
# Three Doors demo: an external agent submits an evaluation over A2A.
# Copy an access token from Agent Console (Connected agents) first; it is read from the clipboard and never printed.
# Usage: sh docs/demo/three-doors.sh <job_revision_id> [th|en]
set -eu
JOB="${1:?job_revision_id required (Saved jobs -> job detail URL)}"
LANG_OUT="${2:-th}"
BASE="${A2A_BASE:-http://127.0.0.1:8001}"
TOKEN="$(pbpaste)"
[ "${#TOKEN}" -gt 20 ] || { echo "Copy an access token from Agent Console first" >&2; exit 1; }
KEY="three-doors-$(date +%s)"

echo "Agent card skills:"
curl -s "$BASE/.well-known/agent-card.json" | python3 -c "import sys,json; print([s['id'] for s in json.load(sys.stdin)['skills']])"

echo "Sending evaluate_job over A2A..."
curl -s -X POST "$BASE/" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "A2A-Version: 1.0" \
  --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"SendMessage\",\"params\":{\"message\":{\"role\":\"ROLE_USER\",\"messageId\":\"$KEY\",\"metadata\":{\"skill_id\":\"evaluate_job\"},\"parts\":[{\"data\":{\"job_revision_id\":\"$JOB\",\"output_language\":\"$LANG_OUT\",\"idempotency_key\":\"$KEY\"}}]}}}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result') or {}; t=r.get('task') or r; print(d['error'] if 'error' in d else f\"task {t.get('id')} -> {(t.get('status') or {}).get('state')}\")"
printf '' | pbcopy
echo "Open Agent Console -> Task timeline: the same task appears and updates live."
