# CR-API-01 — Public API paths and root health checks

Status: DRAFT, awaiting owner approval · Date: 2026-10-20 · Project level: product

## The Why

The owner will hand the system to a customer with API documentation they read and maintain.
Today every route sits under `/api/v1/...`, and nothing in the path tells a reader whether a call
answers at once or starts background AI work that must be polled. Load balancers and uptime
monitors also expect `/health` at the root.

Owner decision (2026-10-20, option A): `async` appears only on routes that start background work
and answer `202 Accepted`; routes that answer at once use `/v1/<resource>`; health is at the root.

## Facts (evidence)

- 130 route handlers, all already `async def` in FastAPI (`backend/src/job_search_platform/api/*.py`).
- Routers mounted with `prefix="/api/v1"` in `main.py:277-282`; OpenAPI `servers=[{"url": "/api/v1"}]`.
- 18 routes answer 202. 14 of them start or change background work; 4 are account e-mail sends
  (signup, delete-code, resend-verification, password/forgot) that answer 202 to avoid leaking
  whether an address exists, not because the caller must poll.
- `/api/v1/health` and `/api/v1/health/ready` exist.
- Path users of `/api/v1`: `frontend/src/lib/api.ts` (one `API_BASE` constant), Playwright fixtures
  (~265 occurrences), `infra/deploy/{bootstrap,deploy}.sh`, `scripts/smoke_platform.py`,
  `docs/contracts/application-api.yaml`, the `no_store_api_responses` middleware.
- Not affected: MCP (`/mcp`), A2A, OAuth discovery on the shared listener. They have their own paths.

## Functional requirements

- **FR-API-01** The system must serve every owner REST route under `/v1/`.
- **FR-API-02** The system must serve every route that starts or changes background work and
  answers `202` with a pollable run or job under `/v1/async/<name>`, where `<name>` names the work
  (table below).
- **FR-API-03** The system must answer `GET /health` (liveness) and `GET /health/ready` (readiness,
  same checks as today) at the root, with no authentication and `Cache-Control: no-store`.
- **FR-API-04** The OpenAPI document must list `/v1` as the server, and each `/v1/async/*` operation
  must state in its description that the result is read from the run returned.
- **FR-API-05** When a request uses the old `/api/v1/` prefix, the system must answer `410 Gone` with
  code `api_moved` and the new path in `fields.location`. (Recommended: no redirect, because 307
  redirects of POST requests with cookies and CSRF headers fail in some clients.)

## Path table (async routes)

| Today (`/api/v1` + …) | New |
|---|---|
| `POST /projects/{p}/runs` | `POST /v1/async/projects/{p}/agent-runs` |
| `POST /projects/{p}/runs/{r}/cancel` | `POST /v1/async/projects/{p}/agent-runs/{r}/cancel` |
| `POST /projects/{p}/runs/{r}/tailor/apply` | `POST /v1/async/projects/{p}/agent-runs/{r}/cv-tailoring/apply` |
| `POST /projects/{p}/sessions/{s}/messages` | `POST /v1/async/projects/{p}/sessions/{s}/messages` |
| `POST /projects/{p}/job-search/match/runs` | `POST /v1/async/projects/{p}/smart-matches` |
| `POST /projects/{p}/cvs/{c}/profile` | `POST /v1/async/projects/{p}/cvs/{c}/skill-profiles` |
| `POST /projects/{p}/cvs/{c}/experience-runs` | `POST /v1/async/projects/{p}/cvs/{c}/experience-extractions` |
| `POST /projects/{p}/documents/{d}/revisions` | `POST /v1/async/projects/{p}/documents/{d}/revisions` |
| `POST /projects/{p}/documents/{d}/revisions/{v}/restore` | `POST /v1/async/projects/{p}/documents/{d}/revisions/{v}/restore` |
| `POST /projects/{p}/saved-searches/{s}/preview` | `POST /v1/async/projects/{p}/saved-searches/{s}/previews` |
| `POST /projects/{p}/webhooks/{w}/test` | `POST /v1/async/projects/{p}/webhooks/{w}/test-deliveries` |
| `POST /projects/{p}/webhooks/deliveries/{d}/redeliver` | `POST /v1/async/projects/{p}/webhooks/deliveries/{d}/redeliveries` |
| `POST /projects/{p}/practice-attempts/{a}/feedback` | `POST /v1/async/projects/{p}/practice-attempts/{a}/feedback` |
| `POST /projects/{p}/practice-sets/{s}/report` | `POST /v1/async/projects/{p}/practice-sets/{s}/report` |

Every other route keeps its current path after the prefix: `/api/v1/projects` → `/v1/projects`.
Reads of a run stay synchronous: `GET /v1/projects/{p}/runs/{r}` and the SSE stream.

## Questions for the owner

- **Q-API-01** Creating a session (`POST /sessions`) and a practice set also start AI work but answer
  `201` with the new record. Keep them under `/v1/` (recommended: the caller gets a usable record at
  once) or move them under `/v1/async/`?
- **Q-API-02** FR-API-05: answer `410` on the old prefix (recommended), or keep serving `/api/v1`
  as an alias for one release?

## Acceptance criteria

- [ ] **AC-API-01** `P0` · FR-API-01/02 — Given the app, when every route in the OpenAPI document is
  listed, then each path starts with `/v1/` and exactly the 14 table routes start with `/v1/async/`.
- [ ] **AC-API-02** `P0` · FR-API-03 — `GET /health` → 200 without a cookie; `GET /health/ready` →
  200 when Postgres and MinIO are up and 503 when Postgres is down.
- [ ] **AC-API-03** `P1` · FR-API-05 — `POST /api/v1/projects` → 410, `code: api_moved`,
  `fields.location: /v1/projects`.
- [ ] **AC-API-04** `P0` · regression — the full backend, e2e and real-stack suites pass on new paths.
- [ ] **AC-API-05** `P1` · FR-API-04 — each `/v1/async/*` operation description names the run to poll.

## Impact

Backend routers and `main.py`; `frontend/src/lib/api.ts` and every hard-coded API path in the
frontend; Playwright fixtures; deploy scripts and smoke script; `docs/contracts/application-api.yaml`
and the OpenAPI parity test. No database change. Rollback: revert the commit (paths only).
