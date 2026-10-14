# backend

Python 3.12 package `job_search_platform` (FastAPI, SQLAlchemy 2, Alembic, psycopg, MCP, a2a-sdk). One modular backend; no second service or queue system.
Not here: UI (`frontend/`), container build inputs (`infra/`), operator scripts (`scripts/`).

## Layout

- `src/job_search_platform/main.py` - app factory and wiring; `config.py` - settings.
- `api/` - transport adapters: `rest.py`, `sse.py`, `mcp.py`, `mcp_tasks.py`, `a2a.py`, `oauth.py`, `accounts.py`, `dependencies.py`, `shared.py`.
- `services/` - business logic and the single authorization path (`authorization.py`), `skills.py` (skill registry), `contracts.py`, `errors.py`.
- `db/` - `models.py`, `repositories.py`, `session.py`.
- `integrations/` - adapters: `gateway.py` (LiteLLM), `hermes_runtime.py`, `object_store.py` (S3/MinIO), `secrets.py`, `mailer.py`, `tracing.py`, `jev.py`, `logging.py`.
- `workers/` - `queue.py` (PostgreSQL queue), `executor.py`, `supervisor.py`, `sandbox.py`.
- `migrations/` - Alembic; revisions in `migrations/versions/NNNN_name.py` (latest: `0026_oauth.py`).
- `tests/unit/`, `tests/integration/`, `tests/fixtures/` (synthetic CV and job), top-level `tests/test_*.py`.

## Commands (run from repo root)

- Install: `uv sync --locked --project backend --all-groups`
- Dependency/lock drift check: `uv run --locked --project backend python scripts/check_dependencies.py`
- Tests without infrastructure (CI): `uv run --locked --project backend pytest backend/tests -m "not integration" -q`
- Full suite: `uv run --locked --project backend pytest backend/tests -q`
- Run the app: `uv run --locked --project backend python scripts/run_local.py --build-frontend` (loopback `127.0.0.1:8000`).
- Audit: `uv export --locked --project backend --all-groups --no-emit-project --format requirements-txt -o <file>`, then `uv run --locked --project backend pip-audit --strict --disable-pip -r <file>`.

## Tests

- Marker `integration` = needs real local infrastructure (PostgreSQL, MinIO) or native runtime. Start it with `scripts/local_infra.py start --private-dir <dir> --source-dir <minio checkout>`; see `docs/engineering/local-operation.md`.
- `tests/conftest.py` reads synthetic credentials from `CORE02_PRIVATE_DIR` (files `postgres-user`, `postgres-password`); tests using real PostgreSQL fail without it. CI uses `CORE02_POSTGRES_PORT=55432`.
- Known baseline failures when `CORE02_PRIVATE_DIR` is not set up for full infrastructure:
  `tests/integration/test_application_startup.py::test_actual_built_frontend_with_production_rest_upload_and_session_restore` and
  `tests/integration/test_storage_infrastructure.py::test_real_postgres_minio_checksum_and_restart_proof`.
- Test data and credentials are synthetic; never real CVs, keys or personal data.

## Invariants

- REST, MCP and A2A adapters in `api/` stay thin and call the same `services/`. Authorization goes through `services/authorization.py::authorize(...)`; do not add per-transport checks.
- Services raise `ServiceError("<code>")`; `api/rest.py::_http_error` maps each code to an HTTP status. A new code needs a mapping there and an entry in the OpenAPI contract.
- Skills are declared once in `services/skills.py` (`SKILLS`) and projected to generated REST routes and `GET /tools` (`api/rest.py`), MCP tools (`api/mcp.py`) and the A2A AgentCard (`api/a2a.py`). A new operation also needs its id in `contracts.Operation`; `tests/unit/test_skills.py` pins both.
- Schema change = new Alembic migration with the next number in `migrations/versions/`; never edit an applied migration.
- `cv_revisions`, `job_revisions`, `document_revisions`, `provider_configurations`, `tool_connector_configurations` are immutable (DB trigger `reject_revision_mutation`); write a new revision instead. `application_events` is append-only (trigger, migration 0023). `runs` snapshot columns are also trigger-protected.
- Side-effecting actions (`apply_submit`) require owner approval (`services/approvals.py`); application submission stays manual, the platform only records it.
- Job postings, documents and tool output are untrusted content; they cannot grant permissions or trigger owner-only actions.
- Secrets live in the secret adapter (`integrations/secrets.py`), never in repo, logs, prompts or fixtures. Keep `tests/test_secret_redaction.py` passing.
- Pinned dependencies: update `pyproject.toml` and `uv.lock` together and re-run the audit.

## Contracts

- `docs/contracts/application-api.yaml` (REST/OpenAPI, checked by `tests/integration/test_rest_api.py`), `docs/contracts/mcp.md`, `docs/contracts/a2a.md`.
- Specs: `docs/superpowers/specs/2026-10-03-platform-design.md` plus the per-feature specs in that directory. Delivery rules: `docs/engineering/DELIVERY.md`.
- Changing an API means updating the contract file and its contract test in the same change.
