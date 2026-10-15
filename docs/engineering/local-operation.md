# Local operation

This application is intended to run on the owner's machine. It uses PostgreSQL and MinIO for local persistence, a macOS Keychain adapter for provider credentials, and a separate sandboxed Hermes/Career Ops runtime for native document work. Keep infrastructure credentials, provider keys, CVs, backup archives, and raw scanner output outside the repository.

## Requirements and pinned inputs

Command examples use the installed `rtk` wrapper. It is an operator tool, not an application runtime dependency. If it is unavailable, remove the leading `rtk` from setup/launch commands. The ordinary Playwright configuration uses it internally; the CI workflow demonstrates running a separate Vite server and setting `JSP_E2E_BASE_URL` to run browser tests without RTK.

Use macOS for the supported owner Keychain path. Install Git, Docker with Compose, `uv` 0.12.2, Python 3.12, Node 24.18.0 with npm 11.16.0, Trivy 0.75.0 for reproducing the recorded scan, and the Go toolchains declared by the pinned container builds. The Hermes environment uses its own locked Python 3.14.7 runtime. PostgreSQL is 17.11; backend dependencies are in `backend/uv.lock`, and frontend and browser-test dependencies are in their package locks. `scripts/check_dependencies.py` checks lock drift and runtime versions.

Before starting storage, acquire clean detached upstream checkouts outside this repository. The MinIO, gosu, Hermes, and Career Ops revisions are recorded in `backend/pyproject.toml`; the source-built MinIO and PostgreSQL dependency overlays are hash-checked by the setup scripts. For example, create the MinIO and gosu source directories under a private cache and check out the exact commits declared by the repository:

```sh
export UPSTREAM_ROOT="$HOME/.cache/job-search-platform/upstream"
mkdir -p "$UPSTREAM_ROOT"
rtk git clone --no-checkout https://github.com/minio/minio.git "$UPSTREAM_ROOT/minio"
rtk git -C "$UPSTREAM_ROOT/minio" fetch --depth 1 origin 7aac2a2c5b7c882e68c1ce017d8256be2feea27f
rtk git -C "$UPSTREAM_ROOT/minio" checkout --detach 7aac2a2c5b7c882e68c1ce017d8256be2feea27f
rtk git clone --no-checkout https://github.com/tianon/gosu.git "$UPSTREAM_ROOT/gosu"
rtk git -C "$UPSTREAM_ROOT/gosu" fetch --depth 1 origin 6456aaa0f3c854d199d0f037f068eb97515b7513
rtk git -C "$UPSTREAM_ROOT/gosu" checkout --detach 6456aaa0f3c854d199d0f037f068eb97515b7513
export MINIO_SOURCE_DIR="$UPSTREAM_ROOT/minio"
export GOSU_SOURCE_DIR="$UPSTREAM_ROOT/gosu"
```

The source paths must be clean. Do not place a checkout inside this repository. Prepare Hermes and its complete Career Ops integrations with the repository's pinned acquisition/build script; it uses an external cache and writes no credentials:

```sh
rtk python3 infra/hermes/setup.py --acquire --build
```

That operation needs network access, Docker, and the pinned build toolchains. Keep the emitted manifest in the private cache. For full dependency scans, set `HERMES_SOURCE_DIR` and `CAREER_OPS_SOURCE_DIR` to the corresponding acquired checkout paths and `HERMES_ENV_DIR` to the prepared Hermes environment path. Also set `MINIO_SOURCE_DIR` and `GOSU_SOURCE_DIR` as above. No credential values are needed for these checks.

## Start the local services and app

Create a private infrastructure directory and start the project-scoped PostgreSQL and MinIO Compose services. The command creates fresh infrastructure credentials in that directory; it reports status, not credential values. Normal stop preserves the data volumes.

```sh
export CORE02_PRIVATE_DIR="$HOME/.local/share/job-search-platform/core02-runtime"
mkdir -p "$(dirname "$CORE02_PRIVATE_DIR")"
chmod 700 "$(dirname "$CORE02_PRIVATE_DIR")"
rtk uv run --locked --project backend python scripts/local_infra.py start \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
rtk uv run --locked --project backend python scripts/local_infra.py status \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
```

Build the frontend and launch the app. The default listener is loopback-only at `http://127.0.0.1:8000`. The launcher prints the login page URL (`http://127.0.0.1:8000/login`) and `--open-browser` opens it; there is no launch link or one-use nonce any more. Sign in there with an account (see "Accounts" below).

```sh
rtk npm ci --prefix frontend
rtk uv sync --locked --project backend --all-groups
rtk uv run --locked --project backend python scripts/run_local.py --build-frontend --open-browser
```

Machines without `uv` can install the same pinned backend runtime with pip into a Python 3.12 virtual environment, then run the same launcher with that interpreter instead of `uv run`:

```sh
python3.12 -m venv .venv && . .venv/bin/activate
pip install --require-hashes -r requirements.txt
python scripts/run_local.py --build-frontend --open-browser
```

`requirements.txt` is generated from `backend/uv.lock` (runtime only, no test tools) and a unit test fails when it drifts. After changing backend dependencies, regenerate it with `uv export --locked --project backend --no-dev --no-emit-project --format requirements-txt > requirements.txt`. The frontend still needs `npm ci --prefix frontend`; Docker services and upstream checkouts are unchanged.

The session cookie `jsp_owner_session` is `HttpOnly` and `SameSite=Strict`, and `Secure` when `APP_PUBLIC_ORIGIN` is https. The app enforces same-origin CSRF protections. Keep the listener on loopback.

In Settings, select OpenAI, Anthropic, or OpenRouter, choose a model, enter the key in the provider field, and save it. The browser sends the key to the local backend for Keychain storage; it is not retained in local browser storage or the database. Use the Settings connection check before submitting a run. The selected provider receives the CV and job details needed to perform the request. Do not configure a key in a grant or share workflow.

Create a project, add a CV and a job posting you supplied, and start the evaluation/draft workflow. Review the evaluation and every generated document yourself. Application submission remains manual. In Saved jobs, the owner can mark a posting as applied or return it to saved. This persisted status is separate from an agent Run status; the button only records the owner’s action and does not send an application.

## Accounts

Each person has an account (email and password, 10-128 characters). Everything below runs against the database selected by `JSP_DATABASE` and the credentials in `CORE02_PRIVATE_DIR`.

- **Sign-up and login.** Open `/login`. Sign-up, forgot password and resend verification always answer "check your email" and never reveal whether an address has an account. An account must verify its email before it can start runs. Sessions end 7 days after last use or 30 days after login, whichever is first.
- **Mail.** The app sends verification and reset links by SMTP. With no `SMTP_HOST` it only logs `mail_disabled` and drops the mail. For local development start Mailpit with the stack (`scripts/local_infra.py start` or `docker compose -f infra/compose.yaml up -d mailpit`), then set `SMTP_HOST=127.0.0.1`, `SMTP_PORT=51025` and `SMTP_STARTTLS=false`. Read the mail at `http://127.0.0.1:58025`. Mailpit keeps nothing on disk and listens on loopback only.
- **First owner account.** `create-user` makes an already verified account, so no mail is needed:

```sh
rtk uv run --locked --project backend python scripts/accounts.py create-user --email you@example.com [--claim-existing] [--locale th|en]
rtk uv run --locked --project backend python scripts/accounts.py disable-user --email you@example.com
```

  The password is read twice with a hidden prompt, or as one line from stdin when stdin is not a terminal. `--claim-existing` hands every project that has no owner to this user, and moves those projects' queued or past runs from the legacy `owner` scope to `user:<id>`. Run it once, for the person who owned the data before accounts existed. Stop the app first: the command takes the maintenance lock, which conflicts with a running app's writes. Legacy runs that were still queued before the claim are failed by the queue the next time the app starts. It prints counts only, never the email. `disable-user` blocks login, revokes all sessions and grants, and prints `disabled`. Both exit 2 with `error: <code>` on a rejected input.
- **Settings.** `APP_PUBLIC_ORIGIN` (default `http://127.0.0.1:8000`) builds the links in mail and decides the `Secure` cookie flag. `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` (`no-reply@localhost`) and `SMTP_STARTTLS` (`true`) configure outbound mail. `USER_DAILY_RUN_QUOTA` (30) caps runs per user per Asia/Bangkok day; going over returns 429 `quota_exceeded`.

## LiteLLM gateway

`scripts/local_infra.py start` also runs the LiteLLM gateway (`litellm`, its own `litellm-db` Postgres and a one-shot `litellm-seed`). It listens on `127.0.0.1:54000` only (override with `CORE02_LITELLM_PORT`); the UI is at `http://127.0.0.1:54000/ui` (user `owner`).

- `OPENROUTER_API_KEY` is read from the environment of the `start` command (for example the owner's `.env`, exported) and reaches only the LiteLLM containers. Without it LiteLLM still starts and the seed logs `openrouter_key_missing` and skips model creation; export the key and run `start` again.
- `start` generates `litellm-master-key`, `litellm-salt-key`, `litellm-db-password` and `litellm-ui-password` in `CORE02_PRIVATE_DIR` (mode 0600, never regenerated). Do not change the salt key after models are stored.
- The seed adds model `ai-analyze` (`openrouter/z-ai/glm-5.3-flash`) if absent and creates the `job-search-app` virtual key (model `ai-analyze`, pass-through `/jev/decisions`), written to `CORE02_PRIVATE_DIR/litellm_app_key` (0600; empty until seeded). Manage models afterwards in the UI.
- The app key only allows the `ai-analyze` alias. If `AI_ANALYZE_MODEL` is changed to another alias, the key must be regenerated: delete the `job-search-app` key in the LiteLLM UI, then run `start` again.
- `/jev/decisions` forwards to the OpenRouter decisions API with the server-side key. The app uses `AI_DECISION_MODEL` (default `typesafe/jev-1.13`) in the request body.
- `status` lists `litellm`, `litellm-db` and `litellm-seed` with their health.

## Langfuse run tracing (optional)

Set `LANGFUSE_HOST=http://127.0.0.1:53000` in `.env`, export it and run `scripts/local_infra.py start`. This adds the `langfuse` profile:
- `langfuse-web` (UI at `http://127.0.0.1:53000`, loopback only)
- `langfuse-worker`
- `langfuse-db`
- `langfuse-clickhouse`
- `langfuse-valkey`
- `langfuse-minio`

The last five have no host port. They take about 2–3 GB of RAM and about 5 GB of images. Check `df -h /System/Volumes/Data` first.

- **Secrets.** `start` generates every Langfuse secret and the project keys in `CORE02_PRIVATE_DIR` (0600, never regenerated). The first start creates org `job-search`, project `job-search-platform` and user `owner@jobsearch.local`. Signup is disabled and telemetry is off.
- **Logins.** `start` writes `CREDENTIALS.md` (repo root, 0600, gitignored) with every local login, including the Langfuse password and project keys. Do not share or commit it.
- **What the app sends.** With `LANGFUSE_HOST` set, the app sends one trace per run (`run.execute` with `llm.round` generations). Each holds model, latency and token counts only: never prompts, CVs, job text or outputs. An explicit `OTEL_EXPORTER_OTLP_ENDPOINT` takes precedence.
- **Failures.** If Langfuse is down or its keys are missing, tracing stays off or drops spans. Runs and `/api/v1/health/ready` are unaffected.
- **Turning it off.** Clear `LANGFUSE_HOST` and run `stop`, then `start`. `stop` always stops the Langfuse containers, and their volumes are kept.
- **Cost.** Langfuse shows no cost, because `ai-analyze` is a gateway alias.
- **Accepted risk.** The Langfuse 4.56.0 images carry accepted High CVEs (see "Langfuse images (2026-10-11)" in `dependencies.md`). Keep the UI on loopback.
- **Disk (Colima).** Docker runs in Colima here: after removing images run `colima ssh -- sudo fstrim -v /var/lib/docker` to return the space to macOS.
- **Corrupt pull.** An image pulled while the host disk is full can unpack corrupted (zero-byte files). Re-pull it by digest.

## Configuration and multi-host

Every address the app uses comes from the environment, with the local-stack default. Put them in `.env` (see `.env.example`). Secret values stay out of git and logs; generated infrastructure secrets (Postgres/MinIO passwords, LiteLLM master and salt keys, LiteLLM DB and UI passwords) live only in `CORE02_PRIVATE_DIR` and are never set in `.env`.

| Key | Default | Secret |
| --- | --- | --- |
| `JSP_POSTGRES_HOST` | `127.0.0.1` | no |
| `JSP_POSTGRES_PORT` (legacy `CORE02_POSTGRES_PORT` still honoured) | `55432` | no |
| `JSP_DATABASE` | `jobsearch_platform_core02` | no |
| `JSP_MINIO_ENDPOINT` | `http://127.0.0.1:59000` (or `CORE02_MINIO_PORT`) | no |
| `JSP_PRIVATE_BUCKET` | `job-search-platform-private` | no |
| `LITELLM_BASE_URL` | `http://127.0.0.1:54000` | no |
| `LITELLM_API_KEY` | empty, falls back to `CORE02_PRIVATE_DIR/litellm_app_key` | yes |
| `OPENROUTER_API_KEY` | empty; read only by `local_infra.py start`, reaches only LiteLLM | yes |
| `AI_ANALYZE_MODEL` / `AI_DECISION_MODEL` | `ai-analyze` / `typesafe/jev-1.13` | no |
| `LANGFUSE_HOST` | empty (Langfuse off). `http://127.0.0.1:53000` turns on the `langfuse` compose profile in `local_infra.py start` and the app's span export | no |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset (tracing off) | no |
| `JSP_LOG_LEVEL` | `INFO` | no |
| `APP_PUBLIC_ORIGIN` / `JSP_DEV_ORIGIN` | the launcher sets it to the listener origin (default `http://127.0.0.1:8000`; with it unset both `127.0.0.1:8000` and `localhost:8000` are allowed) / unset. `JSP_DEV_ORIGIN` must be an `http` loopback origin, e.g. the Vite dev server. An `https` `APP_PUBLIC_ORIGIN` makes the session cookie `Secure`. | no |
| `CORE02_PRIVATE_DIR` | `~/.cache/job-search-platform/core02-runtime-20261003` | no (the directory holds secrets) |
| `MINIO_SOURCE_DIR` / `GOSU_SOURCE_DIR` | `~/.cache/job-search-platform/upstream/{minio,gosu}` | no |
| `CORE02_POSTGRES_PORT` / `CORE02_MINIO_PORT` / `CORE02_LITELLM_PORT` / `CORE02_LANGFUSE_PORT` | `55432` / `59000` / `54000` / `53000` (host ports published by compose) | no |

`CORE02_PRIVATE_DIR`, `MINIO_SOURCE_DIR` and `GOSU_SOURCE_DIR` are optional overrides: `local_infra.py`, the app, backup and restore share one default. To run the app on another host, point `JSP_POSTGRES_*`, `JSP_MINIO_ENDPOINT` and `LITELLM_BASE_URL` at the service host and copy the credential files into that host's `CORE02_PRIVATE_DIR`.

Health and logs:

- `GET /api/v1/health` is liveness. `GET /api/v1/health/ready` checks `postgres`, `object_store`, `llm_gateway` and `sandbox_image` concurrently (about 2 s each) and returns 200 with `status: ok` or 503 with `status: degraded` and the failing component `down`. It is unauthenticated and returns no addresses, versions or error text.
- The app logs one JSON line per record on stdout (`ts`, `level`, `logger`, `msg`, `request_id`). Each request logs method, route template, status and `duration_ms` only: no headers, bodies, query strings, tokens or CV text. `X-Request-ID` is propagated when it is a uuid or 1-64 characters of `A-Za-z0-9._-`, otherwise a new one is generated and returned.

## Optional LAN project sharing

Sharing is opt-in and starts a second listener on port `8001`. Bind it to a concrete LAN IP on the owner's machine; do not use `0.0.0.0` or `::`. The owner app remains on loopback port `8000`.

```sh
rtk uv run --locked --project backend python scripts/run_local.py \
  --build-frontend --enable-sharing --share-host 192.168.1.20 --share-port 8001
```

Replace the example address with an IP assigned to the owner's machine. In Settings, create a project grant with only the capabilities needed and a short expiry, then deliver the generated token through a private channel. Tokens are bearer credentials. A grant is restricted to its project and capabilities; it cannot read raw CVs, chat history, provider settings, or owner-only controls. Revoke a grant in Settings when access ends. Do not expose the shared listener to the public Internet; this local workflow does not provide public-hosting authentication or HTTPS.

## Hourly job ingest

The ingest worker (`scripts/ingest_jobs.py`) stores jobs from freehire and the Greenhouse, Lever and SmartRecruiters boards in PostgreSQL. It needs the PostgreSQL service and `CORE02_PRIVATE_DIR`.

```sh
rtk uv run --locked --project backend python scripts/ingest_jobs.py run        # one full ingest; prints a JSON summary
rtk uv run --locked --project backend python scripts/ingest_jobs.py status     # last 5 runs
rtk uv run --locked --project backend python scripts/ingest_jobs.py discover   # refresh data/job_boards.json from freehire, then commit it
rtk uv run --locked --project backend python scripts/ingest_jobs.py reindex     # rebuild the Meilisearch index from Postgres (atomic swap)
rtk uv run --locked --project backend python scripts/ingest_jobs.py index-settings  # re-apply index settings
```

`run --source <name>` ingests one source. A failed board is recorded in `ingest_runs.per_board` and never counts toward deleting its postings. A posting is deleted only after it is missing from two successful runs. A fetch that returns nothing, or under half of 20 or more stored postings, is treated as failed (`suspicious_shrink`). A posting older than 90 days is deleted and tombstoned so it is not re-ingested.

To run it every hour, install the launchd template:

```sh
mkdir -p ~/Library/Logs/job-search-platform
cp infra/launchd/com.job-search-platform.ingest.plist.example ~/Library/LaunchAgents/com.job-search-platform.ingest.plist
# edit the copy: replace REPO_DIR with this checkout, HOME_DIR with your home directory (launchd needs absolute paths) and PRIVATE_DIR with CORE02_PRIVATE_DIR; check PATH (which uv)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.job-search-platform.ingest.plist
```

Output goes to `~/Library/Logs/job-search-platform/ingest.log`. Check it with `tail ~/Library/Logs/job-search-platform/ingest.log` and `ingest_jobs.py status`. Stop it with `launchctl bootout gui/$(id -u)/com.job-search-platform.ingest`.

### Crawled boards (JobTopGun, JobBKK)

The crawl runs after the ATS boards in the same `ingest run`, under ADR-016.

- Each site gets up to 15 minutes and 300 requests. The whole run gets up to 50 minutes. A site that hits a cap ends normally; the next run continues. A JobTopGun cap hit while reading the sitemaps (before any detail page) is a failure, `cap_in_discovery`.
- robots.txt is re-read every run. If it cannot be read, the site is skipped with `robots_unavailable`.
- Kill switch: remove a site from the `"crawl"` list in `backend/src/job_search_platform/data/job_boards.json`. It gets no requests from the next run. A missing `"crawl"` key means no crawling.
- `run --source jobtopgun` or `run --source jobbkk` crawls one site only.
- `ingest_runs.per_board` has the keys `crawl:jobtopgun` and `crawl:jobbkk`. Each holds `state`, `error` (on failure), `requests`, `blocked`, `fetched`, `created` and `deleted`.
- The first fill takes days. JobTopGun fetches up to 130 new detail pages an hour (about 80 to 130). JobBKK's first sweep takes several days; later sweeps take a few runs. JobBKK reads listing pages 1 to 3 on every run, so new postings appear within the hour.
- Progress lives in the table `crawl_state`. Deleting a site's row restarts it from scratch.

### Job search index (Meilisearch)

The `meilisearch` service starts with `local_infra.py start` (loopback port 57700, key in the private file `meili-master-key`). The index (`MEILI_INDEX`, default `jobs`) is built on the first ingest run or by `reindex`, and synced after every later run. Search and facets are served only from the index: while it is unavailable, search returns 502 `job_source_unavailable`; there is no Postgres fallback. Run `reindex` to recover.

Never run `local_infra.py start` without the owner's `.env` loaded (it recreates LiteLLM, and an unset `OPENROUTER_API_KEY` leaves model calls failing). To add or restart one service, load `.env`, export `CORE02_PRIVATE_DIR` (and `MINIO_SOURCE_DIR`/`GOSU_SOURCE_DIR` if compose asks), then run `docker compose -f infra/compose.yaml up --detach --no-deps <service>`.

## Metrics and Grafana

The app can expose Prometheus metrics, and the dev compose stack ships Prometheus and Grafana to read them.

- **Enable:** set `METRICS_PORT=59464` in `.env`. Unset means no listener. `METRICS_HOST` defaults to `127.0.0.1`; any non-loopback host makes startup fail with `metrics_host_not_loopback`.
- **Metrics URL:** `http://127.0.0.1:59464/metrics`. The listener is separate from the app port and is never proxied; the main app has no `/metrics` route. Scrape-time values (database, search, ingest state) are computed at most once every 30 s on a dedicated small DB engine, and concurrent scrapes get the cached values.
- **Route label:** the HTTP `route` label is the route template relative to the `/api/v1` prefix, for example `/health` or `/projects/{project_id}/job-search`. FastAPI 0.142 keeps included-router paths relative. All routers share `/api/v1`, so each endpoint still has a unique label. A request that matches no route (static assets, SPA fallback) is `other`.
- **Start only the two services,** through the existing helper, so the compose environment matches the rest of the stack: Never start compose without `.env` loaded (LEARNINGS 2026-10-15): an unset `OPENROUTER_API_KEY` leaves LiteLLM model calls failing once it is recreated.

```sh
rtk uv run --env-file .env --locked --project backend python - <<'EOF'
import os, sys
from pathlib import Path
sys.path.insert(0, "scripts")
import local_infra as li
private = Path(os.environ.get("CORE02_PRIVATE_DIR") or li.DEFAULT_PRIVATE_DIR)
minio = Path(os.environ.get("MINIO_SOURCE_DIR") or li.DEFAULT_MINIO_SOURCE)
li.ensure_credentials(private)
li._compose(["up", "--detach", "--no-deps", "prometheus", "grafana"], private, minio, timeout=600)
EOF
```

  `ensure_credentials` creates `grafana-admin-password` (mode 0600) in the private directory when it is missing and leaves existing files alone. `_compose` also validates the MinIO and gosu source directories.
- **URLs:** Prometheus `http://127.0.0.1:59090` (alerts under Alerts); Grafana `http://127.0.0.1:53300`, user `admin`, password in `$CORE02_PRIVATE_DIR/grafana-admin-password`, dashboard "Platform overview".
- **Platform scope:** Prometheus reaches the loopback listener at `host.docker.internal:59464`. This works with Docker Desktop on macOS (the owner machine). On a Linux Docker engine `host-gateway` resolves to the docker0 bridge, so a loopback-only listener is unreachable and `AppDown` stays firing. The single-VM deploy in WP1 part 2 runs Prometheus on the host network.
- **Alerts** (`infra/prometheus/rules.yml`, visible in the Prometheus UI; there is no Alertmanager yet):
  - `AppDown`: the app's metrics listener has not answered for 5 minutes.
  - `DatabaseDown`: `jsp_db_up` is 0 for 5 minutes.
  - `SearchDown`: `jsp_search_up` is 0 for 10 minutes.
  - `IngestStale`: no ingest run finished in 2 hours.
  - `SourceFailing`: a source failed in every run for 3 hours.
  - `SourceSilent`: a source has not succeeded for 6 hours.
  - `HighErrorRate`: more than 5% of HTTP requests returned 5xx over 10 minutes, with more than 1 request/s.
  - `RunsStuckQueued`: runs are queued but none finished in 30 minutes.

  `IngestStale` stays silent if no ingest run has ever finished, and `SourceSilent` ignores sources that have never succeeded. Once runs exist, both fire when the hourly job is not installed.

## Verification on the operator machine

After preparing the clean pinned source checkouts described above, set their `*_SOURCE_DIR` variables in this shell and run the lock/runtime/source checks before use. The checker reports missing upstream checkouts as incomplete; a local run with those paths unset is not a pass.

```sh
rtk uv run --locked --project backend python scripts/check_dependencies.py
rtk uv run --locked --project backend pytest backend/tests -q
rtk npm run build --prefix frontend
```

The pinned source commits are listed under `tool.job-search-platform.upstream` in `backend/pyproject.toml`. MinIO OSS is retained under its GNU AGPLv3 license; the upstream repository is archived and unmaintained, so this project owns the patch and maintenance work for its pinned build.

The backend suite needs the local PostgreSQL/MinIO setup and `CORE02_PRIVATE_DIR`. For the browser suite, install the test lock and Chromium, then run the Playwright project:

```sh
rtk npm ci --prefix tests
rtk npm exec --prefix tests -- playwright install --with-deps chromium
rtk npm test --prefix tests
```

The repository Playwright configuration starts a Vite server on `127.0.0.1:4175` for this synthetic browser run. The actual-backend browser check is conditional: the production startup fixture supplies an isolated backend URL and a private synthetic session file (`JSP_E2E_SESSION_FILE`). Run `backend/tests/integration/test_application_startup.py` through pytest to exercise that fixture; do not point it at the owner app or supply real credentials. It is not part of the ordinary synthetic browser run.

To exercise the native runtime without a model provider, run `rtk python3 scripts/prove_hermes.py --offline` after the Hermes setup/build. This proof uses synthetic fixtures and requires Docker. The real provider smoke is separate and requires an owner to configure a provider in Settings first:

```sh
rtk uv run --locked --project backend python scripts/smoke_platform.py --origin http://127.0.0.1:8000
```

It reports `blocked: configure_provider_in_settings` until a provider is configured. A pending provider setup is not a passing live workflow check.

## Stop and recovery

Stop the app with Ctrl-C and wait for it to exit cleanly. Then stop the storage services without removing their volumes:

```sh
rtk uv run --locked --project backend python scripts/local_infra.py stop \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
```

For backup and restore, follow [recovery-proof.md](recovery-proof.md) exactly. Backup requires the app to be stopped. Restore requires a newly created, empty database and bucket with distinct target names; it validates checksums and leaves a private incomplete marker if interrupted. Never point restore at the active database or bucket. Portable archives do not contain provider credentials, owner authentication, or project grants. After restore, create a new owner session and save the provider key again in that machine's Keychain. Interrupted runs require an explicit owner retry, which creates a new run.

After a successful restore, select its existing database and bucket before launching the app:

```sh
export JSP_DATABASE=jsp_restore_rehearsal
export JSP_PRIVATE_BUCKET=job-search-platform-restore-rehearsal
rtk uv run --locked --project backend python scripts/run_local.py --open-browser
```

Keep `CORE02_PRIVATE_DIR` pointing at the private infrastructure credentials for that target. These are local operator settings, never caller-selected protocol parameters. The same exact database/bucket identity controls maintenance and failed-restore quarantine. Only use targets whose restore completed; restarting does not clear an incomplete-restore marker.
