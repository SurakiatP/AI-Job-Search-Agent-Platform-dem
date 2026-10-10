# Langfuse run tracing (branch 2, `feat/langfuse`)

Status: the owner approved the design in chat on 2026-10-11 ("ตรง เขียน spec เลย"). Risk option A: self-host Langfuse 4.56.0 on loopback with metadata only.

## Goal

The owner opens Langfuse and sees one trace per run. Each trace holds the `run.execute` span and its `llm.round` children, with model, latency and input/output token counts. No prompt, CV text, job text or model output ever reaches Langfuse.

## Out of scope

- **LiteLLM's Langfuse callback, and the run-id link between the gateway and the app (approach 3).** Add these when per-call cost is needed.
- **Cost in Langfuse.** `ai-analyze` is an alias that Langfuse cannot price.
- **Langfuse in `/api/v1/health/ready`.** Tracing is optional. A Langfuse outage must not make the app degraded.
- **LLM-as-judge evaluations, prompt management, datasets and media upload.**

## 1. Infrastructure (`infra/compose.yaml`, profile `langfuse`)

All six services join a new bridge network, `langfuse_private`. Only `langfuse-web` publishes a host port. Every service has a healthcheck and the label `com.job-search-platform.task: langfuse`.

| Service | Image (pinned by digest) | Host port | Notes |
|---|---|---|---|
| `langfuse-web` | `langfuse/langfuse:4.56.0@sha256:b1948c7c0931f277975b985e30e73536b1bca5822705ddd9a89ba7c1ed79b3ee` | `127.0.0.1:${CORE02_LANGFUSE_PORT:-53000}:3000` | Headless init, signup disabled, `TELEMETRY_ENABLED=false` |
| `langfuse-worker` | `langfuse/langfuse-worker:4.56.0@sha256:3f7571ff3a725ebdcdf4c35e06bdf8c3f8325770691c673793ad61b328265e13` | none | Same env as web, minus init |
| `langfuse-db` | `job-search-platform/postgres:17.11-alpine-gosu-1.19-6456aaa0f3c8` (project image) | none | Own volume `jobsearch-core02-langfuse-db-data` |
| `langfuse-clickhouse` | `clickhouse/clickhouse-server:25.12.11.4-distroless@sha256:f72a88eba5b89e80faea55f048bc0827d4a8a09c4f62701bf9dc802c9e049f53` | none | Trivy 0 High/Critical (2026-10-11). Own data and log volumes |
| `langfuse-valkey` | `valkey/valkey:8-alpine@sha256:081c2f5cb575efc901aa80ff9cdbd1ec6a301682fd35e1ebb4b0990a4a4a8507` | none | `--requirepass` read from the secret file, `--maxmemory-policy noeviction` |
| `langfuse-minio` | `job-search-platform/minio-oss:7aac2a2c…` (project image) | none | Separate instance and volume from the CV store. Before `server` starts, the bucket `langfuse` is created with `mkdir -p /data/langfuse`, as in Langfuse's official compose |

### Secrets

Langfuse does not read `*_FILE` variables. As with LiteLLM, both Langfuse services use an `sh -c` entrypoint that exports each value from `/run/secrets/*` and then `exec`s the image's original entrypoint. No secret appears in compose env, `docker inspect` or `.env`.

### Required Langfuse settings

- `DATABASE_URL`, plus `CLICKHOUSE_URL=http://langfuse-clickhouse:8123` and `CLICKHOUSE_MIGRATION_URL=clickhouse://langfuse-clickhouse:9000`.
- `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD`, with `CLICKHOUSE_CLUSTER_ENABLED=false`.
- `REDIS_HOST`, `REDIS_PORT` and `REDIS_AUTH`.
- `LANGFUSE_S3_EVENT_UPLOAD_*`: bucket `langfuse`, endpoint `http://langfuse-minio:9000`, region `auto`, path style on.
- `NEXTAUTH_URL=http://127.0.0.1:53000`, plus `NEXTAUTH_SECRET`, `SALT` and `ENCRYPTION_KEY` (64 hex characters).

### ClickHouse credentials

The distroless image may skip the env-processing entrypoint. `local_infra.py` therefore writes a `users.d` XML that holds only the SHA-256 hash of the password (`password_sha256_hex`), and mounts it read-only.

Proven on 2026-10-11: the `users.d` hash file and the `clickhouse local … url()` healthcheck work on the distroless image. 25.8 was replaced by 25.12 (the version in Langfuse's own compose) because Langfuse 4.56.0 ClickHouse migration 39 uses a text index that 25.8 rejects (`Code: 80 Expected literal`); 25.12.11.4-distroless runs it and scans 0 High/Critical.

### Headless init

The `LANGFUSE_INIT_*` variables create the following on first start:

| Item | Value |
|---|---|
| Org | `job-search` |
| Project | `job-search-platform` |
| User | `owner@jobsearch.local`, password from a secret file |
| Project keys | `pk-lf-…` / `sk-lf-…` |

No click-through setup is needed.

## 2. Credentials (`scripts/local_infra.py`)

- **`ensure_credentials`:** creates these missing files in the private dir, mode 0600, through the existing `O_EXCL` path. Existing files are never overwritten.

  | File | Value |
  |---|---|
  | `langfuse-db-password` | random |
  | `langfuse-clickhouse-password` | random |
  | `langfuse-redis-password` | random |
  | `langfuse-minio-access-key` | random |
  | `langfuse-minio-secret-key` | random |
  | `langfuse-nextauth-secret` | random |
  | `langfuse-salt` | random |
  | `langfuse-encryption-key` | `secrets.token_hex(32)` |
  | `langfuse-ui-password` | random |
  | `langfuse-public-key` | `pk-lf-` + hex |
  | `langfuse-secret-key` | `sk-lf-` + hex |

  It also writes the ClickHouse `users.d` XML, derived from the password file.
- **`start`:** adds `--profile langfuse` to `up` only when `LANGFUSE_HOST` is set (non-empty) in the environment, which `.env` supplies. When `LANGFUSE_HOST` is empty, the stack and its behaviour are unchanged.
- **`status` and `stop`:** include the profile, so Langfuse containers are listed and stopped too.
- **`CREDENTIALS.md`:** `start` writes this at the repo root, mode 0600, gitignored, from the private-dir files. It lists the owner app, Postgres, MinIO, LiteLLM and LiteLLM DB, plus the Langfuse UI login and project keys when the profile is on. It never prints values. This replaces the one-off scratch script used on 2026-10-11.
- **Port:** `compose_environment` gains `CORE02_LANGFUSE_PORT`, default `53000`.

## 3. App (`backend/src/job_search_platform/integrations/tracing.py`)

### `configure()`

`configure()` picks one exporter:

1. When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, behaviour is unchanged. An explicit collector wins.
2. Otherwise, when `LANGFUSE_HOST` is set and both key files can be read from the private dir, the app sends spans to `OTLPSpanExporter(endpoint=f"{LANGFUSE_HOST}/api/public/otel/v1/traces", headers={"Authorization": "Basic " + b64(pk:sk)})`.
   - The private dir uses the same default as `integrations/gateway.py`, and that resolver is reused rather than copied.
3. Otherwise, tracing stays off.

A missing or unreadable key file means tracing stays off and one warning is logged without the path contents. App startup never fails because of tracing.

### `llm.round` span

The span gains these attributes, so Langfuse renders it as a generation:

- `gen_ai.request.model`
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`
- `langfuse.observation.type=generation`

The existing attributes stay. The `executor._record_round` change is limited to those keys.

No change goes to LiteLLM, Hermes, the API or the UI.

## 4. Security and documentation

- **ADR-014 (Hub `docs/adr/`, plus `ADR-INDEX.md`):** accept Langfuse 4.56.0 under option A. Record the following, and add a re-scan on every Langfuse version bump.
  - Trivy (2026-10-11): web 23 and worker 24 High/Critical, mostly nodejs and pcre2 with no fix available, and 3 fixable in worker.
  - Mitigation: loopback-only port, private network, metadata-only spans, signup off and no telemetry.
- **`docs/engineering/local-operation.md`:** cover the `LANGFUSE_HOST` toggle, port 53000, the UI login source (`CREDENTIALS.md`), disk and RAM cost (about 2–3 GB of RAM) and how to disable Langfuse (clear `LANGFUSE_HOST`).
- **`.env.example`:** add `LANGFUSE_HOST=` (empty, so tracing is off by default) and `CORE02_LANGFUSE_PORT`.
- **`docs/engineering/dependencies.md`:** record the four new image pins and their scan results.

## 5. Tests and acceptance

- **Unit, `configure()`:**
  - OTLP env wins over Langfuse.
  - The Langfuse endpoint is built with the Basic header.
  - A missing key file means no exporter and no exception.
- **Unit, `local_infra.py`:**
  - `ensure_credentials` creates the new files at mode 0600 and never rewrites them.
  - The ClickHouse XML holds the hash, not the password.
  - `--profile langfuse` is added only when `LANGFUSE_HOST` is set.
  - `CREDENTIALS.md` is 0600.
- **Compose:** `docker compose --profile langfuse config` validates.
- **Live smoke, owner machine:**
  1. `local_infra.py start` brings all services healthy.
  2. Run one `evaluate_job` through the app.
  3. `GET /api/public/v2/observations?traceId=...` with the project keys returns observations including `run.execute` and at least one `llm.round` generation with a model and token counts.
  4. A string search of the trace JSON for the job description text and the CV text finds nothing.
- **Regression:** the backend suite still shows 530 PASS with the 2 known baseline failures. With `LANGFUSE_HOST` empty, `start` brings up only the existing services.
- **Disk:** check `df -h /System/Volumes/Data` before the first `up`, and require at least 10 GB free. Current state: 15 GB free.
