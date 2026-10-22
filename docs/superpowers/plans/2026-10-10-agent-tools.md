# Agent Tools Implementation Plan

> Execution: delegate-build. Sonnet workers run sequentially because they share contracts, the registry and rest.py. Root integrates, and one Opus final review closes the phase. The owner authorized autonomous execution on 2026-10-10.

**Spec (authoritative):** `docs/superpowers/specs/2026-10-10-agent-tools-design.md`
**Branch:** `feat/agent-tools` from `origin/develop` (0ba041c).

## Global constraints
- Run backend tests from the repo root with `uv run --project backend pytest backend/tests/<path> -q`. Two baseline failures are known and ignored: test_application_startup and test_storage_infrastructure.
- No CV text, provider text or tokens may appear in events, errors or logs. Test data must be synthetic.
- `docs/contracts/application-api.yaml` must match the runtime OpenAPI; the contract test enforces this. The MCP golden fixture may only gain entries.
- Do not use `git stash`, because the owner has untracked files. Commit only the files you own. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Waves (sequential)
| Wave | Task | Owns | Acceptance |
|---|---|---|---|
| 1 | T1 Direct skills | the registry `kind`/`handler`/`output_model` fields, `services/agent_jobs.py` (new), authorization for direct ids, `api/mcp.py` and `api/a2a.py` direct branches, REST `/agent/jobs/search` and `/agent/jobs/fit`, the `jobs:search` capability, YAML, tests | The spec's Direct calls section and its tests pass. |
| 2 | T2 Application tasks | migration 0017, `apply_prepare`, `apply_submit` with the `submit_application` approval, `draft_follow_up`, executor/runs/approvals changes, YAML, tests | The spec's Tasks section and its tests pass. |
| 3 | T3 UI | console approvals, the answer pack view, the follow-up action, the grant picker, and an e2e spec | The build passes, the new e2e passes, and the UI follows DESIGN.md with Thai and English copy. |

After the waves: the full backend suite, an Opus review, the live smoke (at most 10 calls), then merge and push.
