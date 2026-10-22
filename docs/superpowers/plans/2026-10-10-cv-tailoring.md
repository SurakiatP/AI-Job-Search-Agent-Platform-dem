# CV Tailoring Implementation Plan

> Execution: delegate-build. Sonnet workers, root integration, one final Opus review. The owner authorized autonomous execution on 2026-10-10.

**Goal:** FR-C03 and FR-C04, as specified in `docs/superpowers/specs/2026-10-10-cv-tailoring-design.md`. The spec is authoritative; read it first.

**Branch:** `feat/cv-tailoring` from `origin/develop` (b2c9905).

## Global constraints

- Backend tests run from the repo root with `uv run --project backend pytest backend/tests/<path> -q`. Real PostgreSQL and MinIO are running, and the default `CORE02_PRIVATE_DIR` works.
- The baseline failures are `test_application_startup` and `test_storage_infrastructure`. Ignore them.
- No CV text, provider text or token in events, errors, logs or test fixtures. Test data must be synthetic.
- Owner-only operations stay out of the registry.
- `docs/contracts/application-api.yaml` must match the runtime OpenAPI. `test_runtime_openapi_matches_application_contract_paths_methods_and_schemas` enforces this.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only your own files.
- Use `rtk` for noisy shell commands.

## Waves

| Wave | Task | Owns | Depends on | Acceptance |
|---|---|---|---|---|
| 1 | T1 Tailoring core | `services/tailoring.py` (new), `services/experience.py` (add `fact_records` only), `tests/unit/test_tailoring.py` (new) | none | The unit tests cover parse, apply and all four stop rules, and they pass. |
| 1 | T2 Schema and contracts | `migrations/versions/0016_run_result_payload.py`, `db/models.py` (Run column), `services/contracts.py`, `services/skills.py`, `services/runs.py` (tailor_cv intake), `tests/fixtures/mcp_skill_tools.json`, `docs/contracts/application-api.yaml`, the related tests | none | `tailor_cv` and `cv:tailor` are registered. `tailor_mode` is validated, and grants cannot send interactive. A tailor run appends to the job's live tailored CV doc. The migration has an upgrade and a blocked downgrade like 0015. The MCP and A2A suites pass. The contract test passes. |
| 2 | T3 Executor and REST | `workers/executor.py` (`_execute_tailor` + dispatch), `api/rest.py` (`/tailor/apply`, `/restore`), YAML for those paths, `tests/integration/test_cv_tailoring.py` (new) | T1, T2 | The integration tests from the spec's Testing section pass with a fake runtime. |
| 3 | T4 UI | `frontend/src/features/{jobs,documents}/**`, `frontend/src/locales/*`, grant capability picker, `tests/e2e/cv-tailoring.spec.ts` (new) | T3 | `npm run build --prefix frontend` passes. The new e2e spec passes. The UI follows DESIGN.md, with Thai and English copy. |

After the waves:
1. Root runs the full backend suite and `npm audit`/`pip-audit`, because no new dependencies are expected.
2. One final Opus review.
3. Live smoke with at most 10 calls.
4. Merge to develop and push.

ADR-012 (in the Hub) records the Typst → existing renderer ruling.
