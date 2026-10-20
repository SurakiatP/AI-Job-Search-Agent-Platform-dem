# Test summary — pre-manual review, 2026-10-20

Build: `origin/develop` at `7db767c` (PR #32 merged). Environment: local worktree, local Postgres/MinIO
(colima), app on `127.0.0.1:8010` with the owner's synthetic test project. No production data touched.

## What ran (evidence)

| Check | Result |
|---|---|
| Backend `pytest backend/tests` (unit + integration) | 1,340 passed, 2 failed, 1 skipped, 1 xfailed (10 m 49 s) |
| Frontend `npm run build` (tsc + vite) | pass |
| Playwright e2e `tests/` (mocked API) | 262 passed, 1 skipped (2.0 min) |
| Live route sweep, real backend, 1280 px: 24 app/public routes | 0 responses ≥ 400, 0 horizontal overflow |
| Live route sweep, real backend, 390 px: same 24 routes | 0 error text (`undefined`, `NaN`, `[object Object]`, `Invalid Date`, not-found), 0 overflow |
| API negative probes (unknown ids, bad uuid, bad enum, write without CSRF) | 404 / 422 / 422 / 403 as expected |
| `npm audit --omit=dev`, `pip-audit` | 0 known vulnerabilities |
| th/en locale key parity (7 namespaces) | parity holds (only `bankCount_one` in en; Thai has no plural "one", correct) |
| Spec AC → test trace (4 newest specs) | see Coverage |

Not run this round: live AI runs (generation, grading, tailoring) — last verified live on 2026-10-20
during CR-IVP-01; manual exploratory charters; NFR measurements; mobile Safari/Firefox.

## Findings

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| F-01 | P1 (test defect) | The only test that drives the **real built frontend against the real backend** (`test_application_startup.py::test_actual_built_frontend…`) is red: it waits for a link "Create a project" that the redesigned Projects page no longer has. All 262 e2e tests use a mocked API, so no passing automated test covers the real stack end to end. | Update the locator(s) to the current Projects page and keep it green; it is the manual's best safety net. |
| F-02 | P1 (process) | CI runs `pytest -m "not integration"` only. About 500 integration tests — including cross-user isolation, security boundaries, practice, CV builder — run only on a developer machine. | Add Postgres + MinIO services to CI and run the integration marker (already on the deferred production-readiness list). |
| F-03 | P2 (test defect) | `test_storage_infrastructure.py::test_real_postgres_minio…` needs `CORE02_PRIVATE_DIR`; it fails instead of skipping when that is absent. | Skip with a reason when the variable is missing. |
| F-04 | P2 (coverage) | AC-EVR-06 (structured report read through MCP resource and A2A `GetTask`) is PARTIAL: MCP/A2A tests read only the old `report_markdown` shape. | One integration test with a structured report through both. |
| F-05 | P3 (traceability) | AC-CVB-13 (uploaded-CV tailoring unchanged) has no test named with its TC id; covered in practice by the passing `test_cv_tailoring.py` suite. | Rename or tag one existing test `tc_cvb_13`. |

No product defect was found on the paths exercised. No open security or PDPA defect.

## Coverage (newest specs)

| Spec | ACs | Automated |
|---|---|---|
| CR-IVP-01 interview practice | 11 | 11 FULL |
| CV trash + photo templates | 8 | 8 FULL |
| CV builder (CVB) | 15 | 14 FULL, AC-CVB-13 via regression suite (F-05) |
| Structured evaluation report (EVR) | 6 | 5 FULL, AC-EVR-06 PARTIAL (F-04) |

NFRs: no performance, availability, or capacity number was measured this round → UNKNOWN.

## Gate

**CONCERNS** — no P0 AC failing, no open security/PDPA defect, but the real-stack smoke test is red
(F-01), CI skips the integration tests (F-02), and NFRs are unmeasured.

Recommendation for the manual: **go**, after F-01 is fixed (small). The manual covers only shipped
features; deferred work (results dashboard, application email sending, production-readiness items)
stays out of it.
