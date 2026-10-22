# Durable Runs Implementation Plan

> Execution: delegate-build. Sonnet workers run in sequence, the root integrates, and one Opus final review closes it out. The owner authorized autonomous execution on 2026-10-10.

**Spec (authoritative):** `docs/superpowers/specs/2026-10-10-durable-runs-design.md`
**Branch:** `feat/durable-runs`, from `origin/develop` (08afbf3).

## Global constraints
- Same as the earlier phases: run tests with `uv run --project backend pytest ...`. The baseline failures are `test_application_startup` and `test_storage_infrastructure`.
- No content in events, spans, errors or logs. Test data must be synthetic.
- The contract YAML must match the runtime.
- No `git stash`. Commit only your own files, and end every commit message with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Waves (sequential)
| Wave | Task | Owns | Acceptance |
|---|---|---|---|
| 1 | T1 Resume and needs_input | migration 0018; queue `interrupt_or_resume`; supervisor close and reconcile; RunStatus; the needs_input producers and consumers (input endpoint, tailor apply); A2A mapping; cancel; YAML; tests | Spec sections FR-A03 and FR-A02, plus their tests |
| 2 | T2 Tracing and requester | bridge usage; `llm_round` events; `integrations/tracing.py` with pinned OTel deps, lock and pip-audit; `grants.label`; `RunView.requester`; YAML; tests | Spec sections Tracing and FR-A01, plus their tests |
| 3 | T3 UI | Timeline requester and round stats, needs_input status, pack answer form, grant label field, e2e | Build passes, the new e2e passes, DESIGN.md is followed |

After the waves: full suite, Opus review, live smoke (at most 10 calls), merge, and push.
