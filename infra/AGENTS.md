# infra

Docker Compose stack and pinned container build inputs for the local owner machine. Nothing here is application logic.
Not here: backend/frontend code, secrets, credentials, upstream checkouts (these live outside the repo).

## Layout

- `compose.yaml` - services: `postgres`, `minio`, `litellm-db`, `litellm`, `mailpit`; profile `seed` (`litellm-seed`); profile `langfuse` (`langfuse-db`, `langfuse-clickhouse`, `langfuse-valkey`, `langfuse-minio`, and more).
- `postgres/` - `Dockerfile`, `go.mod`, `go.sum`, `provenance.json` (PostgreSQL 17.11 alpine + gosu built from pinned source).
- `minio/` - `Dockerfile`, `go.mod`, `go.sum`, `provenance.json` (MinIO OSS built from pinned source commit).
- `litellm/` - `config.yaml`, `seed.py` (LiteLLM gateway config and seeding).
- `langfuse/` - `env.sh`.
- `hermes/` - `Dockerfile`, `setup.py` (acquire and build), `pyproject.toml`, `uv.lock`, `package.json`/`package-lock.json`, `parse_document.py`, `tool_gate.py`, `native_bridge.py`, `typst_render.py`, `export_pdf.mjs`.

## scripts/ (drive infra; run from repo root with `uv run --locked --project backend python scripts/<name>.py`)

- `local_infra.py start|status ... --private-dir <dir> --source-dir <minio checkout>` - create credentials and start Compose services.
- `run_local.py` - start the app. `accounts.py` - `create-user`, `disable-user`.
- `backup.py` / `restore.py` - PostgreSQL metadata and MinIO objects together, with checksums.
- `check_dependencies.py` - lock drift and runtime versions. `security_scan.py` - locked dependency and image scans; raw reports stay in a private cache.
- `prove_hermes.py`, `prove_storage.py`, `smoke_platform.py`, `smoke_workflow.py` - evidence and smoke runs.
- Hermes: `python3 infra/hermes/setup.py --acquire --build`.

## Commands

- Compose directly: `docker compose -f infra/compose.yaml up -d mailpit` (example from local-operation.md); prefer `scripts/local_infra.py` for postgres/minio.
- Setup, upstream checkouts and env vars (`CORE02_PRIVATE_DIR`, `MINIO_SOURCE_DIR`, `GOSU_SOURCE_DIR`, `HERMES_SOURCE_DIR`, `CAREER_OPS_SOURCE_DIR`, `HERMES_ENV_DIR`): `docs/engineering/local-operation.md`.

## Rules

- Pin everything: upstream images by `@sha256:` digest, locally built images (`job-search-platform/postgres`, `job-search-platform/minio-oss`) by a tag that encodes the pinned source, source commits in `backend/pyproject.toml` (`[tool.job-search-platform.upstream]`: hermes, career-ops, minio, gosu). No floating tags. Keep the full Career Ops and Hermes checkouts pinned; do not vendor third-party source or nested repositories.
- Changing a pinned input or image means re-running dependency and image scans (`pip-audit`, `npm audit`, Trivy, SBOM) before merge; see `docs/engineering/DELIVERY.md` and `docs/engineering/dependencies.md`. Known exploitable Critical/High findings block delivery; do not hide them by disabling checks or ignoring advisories without evidence. Unknown scan coverage must stay visible.
- `go.mod`/`go.sum` overlays are hash-checked against `provenance.json`; update both together.
- MinIO stays open source under AGPLv3: keep the license notice copied into the image, keep the pinned source build; do not silently substitute another product. Upstream is archived, so this project owns patches.
- Secrets and credentials never in repo, logs or images; they are generated into the private dir outside the repo.
- Project execution containers get only their own workspace: no Docker socket, host home or infrastructure/provider secrets.
- Backup/restore must cover PostgreSQL and MinIO together; see `docs/engineering/recovery-proof.md`.
