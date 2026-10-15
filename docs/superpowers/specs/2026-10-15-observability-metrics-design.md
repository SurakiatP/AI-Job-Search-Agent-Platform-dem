# Prometheus metrics and local Grafana (TOR WP1, part 1 of 3) — design

Status: owner-approved decisions, 2026-10-15 (Q1–Q15). Written spec approved by the owner on 2026-10-15.
Branch: `feat/observability-metrics` from `origin/develop` (e7eedfe).

## Goal

TOR WP1 "Platform Foundation" covers four things: forking freehire, observability, IaC, and platform branding and domain. The TOR §7 observability stack is "OpenTelemetry, Prometheus, Grafana, Langfuse". OpenTelemetry tracing to self-hosted Langfuse is already built (`integrations/tracing.py`); Prometheus and Grafana are missing.

The owner split WP1 into three sub-projects, each with its own spec, plan and PR:
1. observability (this spec);
2. IaC for a single-VM deploy (later, with an ADR choosing systemd as TOR §7 requires);
3. branding and domain (later).

Done means:
- the app exposes Prometheus metrics on a loopback-only listener when configured;
- Prometheus and Grafana run in the dev compose stack, with a provisioned "Platform overview" dashboard and alert rules visible in the Prometheus UI;
- everything is tested on the owner machine, without a server.

## Decisions

| # | Decision |
|---|---|
| O1 | WP1 is split into three sub-projects (Q1). This spec is the first. |
| O2 | The "fork freehire" item is closed by ADR-015, which records the deviation as TOR §7 allows (Q2). |
| O3 | Metrics use `prometheus_client` (Apache-2.0, no dependencies), single-process mode (Q3). The app is one process, so no multiprocess mode. |
| O4 | `/metrics` is served by a separate listener bound to loopback, off unless `METRICS_PORT` is set. It is never behind the reverse proxy and needs no secret (Q5, Q14). |
| O5 | Prometheus and Grafana are compose services, pinned by digest, with loopback-only ports. Prometheus keeps 15 days. Grafana's admin password is generated into the private dir (Q6, Q11). |
| O6 | One provisioned dashboard and Prometheus alert rules, visible in the Prometheus UI. No Alertmanager and no outbound notifications until a server exists (Q7). |
| O7 | Tracing is unchanged. No per-request HTTP spans and no extra trace backend (Q8). |
| O8 | Database-derived and Meilisearch values are computed at scrape time and cached for 30 s. A failed source reports `*_up 0` and never fails the scrape (Q12). |
| O9 | Labels never hold user ids, emails, query strings or raw paths. HTTP routes use the route template, else `other` (Q13). |

## Metrics

All names carry the prefix `jsp_`. "Counter", "Histogram" and "Gauge" are the `prometheus_client` types.

### Recorded in-process

| Metric | Type | Labels | Recorded at |
|---|---|---|---|
| `jsp_http_requests_total` | Counter | `method`, `route`, `status_class` (`2xx`…`5xx`) | `RequestLogMiddleware`, after the response |
| `jsp_http_request_duration_seconds` | Histogram | `method`, `route` | same |
| `jsp_runs_total` | Counter | `operation`, `outcome` | `executor.execute`, when a run's execution ends |
| `jsp_run_duration_seconds` | Histogram | `operation` | same |
| `jsp_llm_requests_total` | Counter | `kind` (`agent_round`, `jev`), `model` | `tracing.llm_round` and `tracing.jev_decision` call sites |
| `jsp_llm_duration_seconds` | Histogram | `kind`, `model` | same |
| `jsp_llm_tokens_total` | Counter | `kind`, `model`, `direction` (`input`, `output`) | same, when the provider reports tokens |

Rules for labels:
- `route` is `scope["route"].path` (for example `/projects/{project_id}/job-search`, relative to `/api/v1`). When no route matched, it is `other`. Static assets (`/assets/...`) and the SPA fallback use `other`.
- `method` is limited to the standard HTTP verbs; anything else becomes `OTHER`.
- `model` is the configured model name, cut to 100 characters. Unknown becomes `unknown`.
- `operation` is the run's operation id from the skill registry. `outcome` is the run's final status (`completed`, `failed`, `cancelled`, `interrupted`, `waiting_approval`, `needs_input`) read after execution, else `error`.

### Computed at scrape time (cached 30 s)

| Metric | Type | Labels | Source |
|---|---|---|---|
| `jsp_db_up` | Gauge | — | the queries below succeed |
| `jsp_runs_in_state` | Gauge | `status` | `SELECT status, count(*) FROM runs GROUP BY status` |
| `jsp_job_postings` | Gauge | `source` | `job_postings` by `source`, canonical rows only |
| `jsp_ingest_last_run_timestamp_seconds` | Gauge | `status` | latest finished `ingest_runs` row per status |
| `jsp_ingest_source_last_success_timestamp_seconds` | Gauge | `source` | the newest run whose `per_board` entry for that source is `ok` |
| `jsp_ingest_source_state` | Gauge | `source`, `state` (`ok`, `failed`, `skipped`) | 1 for the state in the latest run, else 0 |
| `jsp_ingest_source_rows` | Gauge | `source`, `kind` (`fetched`, `created`, `deleted`) | the latest run's per-source counts |
| `jsp_search_up` | Gauge | — | Meilisearch `/health` answers |
| `jsp_search_documents` | Gauge | — | the `jobs` index document count |

`source` in the ingest metrics groups `per_board` keys:
- `freehire`;
- `greenhouse`, `lever` and `smartrecruiters`, summed over their boards, so board tokens never become labels;
- `crawl:jobtopgun` and `crawl:jobbkk`, shortened to `jobtopgun` and `jobbkk`.

Ingest is a run-once process, so it does not push metrics; the app reads `ingest_runs`, which the ingest run already writes. There is no pushgateway.

Cache and failure rules:
- One collector computes all scrape-time values at most once every 30 s, behind a lock, and serves the cached values in between.
- The queries use a dedicated short session with `statement_timeout = 2s`.
- If the database is unreachable, `jsp_db_up` is 0 and the database-derived series are omitted for that scrape. The same rule applies to Meilisearch, with a 2 s timeout.
- The collector never raises into the scrape.

## Exposure

- `config.metrics_port()` reads `METRICS_PORT`. Unset means no listener.
- `config.metrics_host()` reads `METRICS_HOST`, default `127.0.0.1`. Any value that is not a loopback address (`127.0.0.0/8`, `::1`) makes startup fail with `metrics_host_not_loopback`, so the listener cannot be exposed by mistake.
- At application startup (`lifespan`), `prometheus_client.start_http_server(port, addr)` serves the default registry on its own thread. Shutdown stops it.
- The main app gets no `/metrics` route, so the reverse proxy and the public port never serve metrics.
- The process collector and platform collector from `prometheus_client` stay registered (CPU, memory, file descriptors, Python GC).
- `scripts/ingest_jobs.py` never starts a listener.

## Prometheus and Grafana

New compose services in `infra/compose.yaml`, alongside the existing ones:
- **`prometheus`**, `prom/prometheus` at the latest stable version, pinned by digest:
  - port `127.0.0.1:59090:9090`;
  - volume `prometheus-data`;
  - flags `--storage.tsdb.retention.time=15d` and `--web.listen-address=0.0.0.0:9090`;
  - config `infra/prometheus/prometheus.yml`, read-only. It scrapes `host.docker.internal:59464` (the app on the host, `METRICS_PORT=59464`) every 30 s, with `extra_hosts: ["host.docker.internal:host-gateway"]` so it also works on Linux;
  - rules `infra/prometheus/rules.yml`, read-only.
- **`grafana`**, `grafana/grafana-oss` at the latest stable version, pinned by digest:
  - port `127.0.0.1:53300:3000` (53000 is already Langfuse);
  - volume `grafana-data`;
  - `GF_AUTH_ANONYMOUS_ENABLED=false`, `GF_ANALYTICS_REPORTING_ENABLED=false`, `GF_ANALYTICS_CHECK_FOR_UPDATES=false`, `GF_USERS_ALLOW_SIGN_UP=false`;
  - `GF_SECURITY_ADMIN_PASSWORD__FILE=/run/secrets/grafana-admin-password`, a compose secret read from the private dir file `grafana-admin-password`. `scripts/local_infra.py` generates that file once with mode 0600, like the other credentials;
  - provisioning from `infra/grafana/provisioning/` (datasource `Prometheus` at `http://prometheus:9090`, and a dashboard provider), and the dashboard JSON from `infra/grafana/dashboards/platform-overview.json`, all read-only.

Licences: Prometheus is Apache-2.0. Grafana OSS is AGPL-3.0; it runs as a separate, unmodified service and is never linked into the app, the same position as the Meilisearch and MinIO services.

Security gate (DELIVERY.md):
- Trivy scans both images, and the results are recorded in `docs/engineering/dependencies.md` before merge. A Critical or High finding blocks delivery unless the owner accepts it.
- `pip-audit` covers `prometheus_client`.

### Dashboard "Platform overview"

One dashboard, six rows:
1. **Health:** `jsp_db_up`, `jsp_search_up`, and Prometheus's `up` for the app target.
2. **HTTP:** request rate by `status_class`; p50, p95 and p99 latency; the 5xx ratio; the top 10 routes by rate.
3. **Runs:** runs in each state; run completions by `outcome`; p95 run duration by `operation`.
4. **LLM:** request rate and p95 latency by `kind` and `model`; token rate by `direction`.
5. **Job sources:** time since the last success per source; the latest state per source; fetched, created and deleted per source; postings per source; search documents.
6. **Process:** resident memory, CPU and open file descriptors.

### Alert rules (visible in the Prometheus UI, not delivered)

| Alert | Expression (summary) | For |
|---|---|---|
| `AppDown` | `up{job="app"} == 0` | 5m |
| `DatabaseDown` | `jsp_db_up == 0` | 5m |
| `SearchDown` | `jsp_search_up == 0` | 10m |
| `IngestStale` | `time() - max(jsp_ingest_last_run_timestamp_seconds) > 2 * 3600` | 15m |
| `SourceFailing` | `jsp_ingest_source_state{state="failed"} == 1` | 3h, about three hourly runs |
| `SourceSilent` | `time() - jsp_ingest_source_last_success_timestamp_seconds > 6 * 3600` | 15m |
| `HighErrorRate` | 5xx ratio over 10m > 5%, with at least 1 request/s | 10m |
| `RunsStuckQueued` | `jsp_runs_in_state{status="queued"} > 0` and no completions in 30m | 30m |

`IngestStale` and `SourceSilent` fire on the owner machine while launchd is not installed. That is the intended signal.

## Code layout

- `integrations/metrics.py`:
  - the metric objects;
  - `observe_request(method, route, status, seconds)`, `observe_run(operation, outcome, seconds)` and `observe_llm(kind, model, seconds, input_tokens, output_tokens)`;
  - `ScrapeCollector(sessions, search_probe, clock, ttl=30)`, registered once;
  - `start_listener(host, port, sessions, search_probe)`.
  
  Every `observe_*` function swallows its own errors, like `tracing`.
- Hooks, one line each:
  - `RequestLogMiddleware`, where the route and status are already known;
  - `executor.execute`, around the existing `run.execute` span;
  - `tracing.llm_round` and `tracing.jev_decision` call sites.
- `main.py` lifespan: start and stop the listener when configured.
- `config.py`: `metrics_port()` and `metrics_host()`.
- `scripts/local_infra.py`: add `grafana-admin-password` to `SECRETS`, so `ensure_credentials` creates it once with mode 0600. The two services are not profiled, so `start` brings them up with the rest of the stack.

## Testing

Unit tests, no network:
- every metric name and label set matches this spec;
- the route template is used, an unmatched route becomes `other`, and an unknown method becomes `OTHER`;
- run, LLM and token observations, including missing token counts;
- the collector:
  - groups `per_board` keys into sources as specified;
  - serves cached values within 30 s and recomputes after;
  - sets `jsp_db_up 0` and omits database series when the session raises;
  - sets `jsp_search_up 0` when the probe raises;
- `metrics_host()` rejects a non-loopback address.

Integration tests (Postgres, marked `integration`):
- the app started with `METRICS_PORT` on a free port serves `/metrics` on loopback. After one API request it contains `jsp_http_requests_total` with that route template. The main app answers 404 for `/metrics`;
- the collector against a migrated database with synthetic `ingest_runs` and `job_postings` rows reports the expected source gauges.

Configuration checks, run as tests that skip when Docker is unavailable:
- `promtool check config` and `promtool check rules`, from the pinned Prometheus image;
- every metric name used in `platform-overview.json` and `rules.yml` exists in the registry or is a Prometheus built-in (`up`, `process_*`, `python_*`).

Live smoke on the owner machine:
- start only `prometheus` and `grafana` with `docker compose ... up --detach --no-deps prometheus grafana`, using the owner's `.env` (LEARNINGS 2026-10-15);
- run the app with `METRICS_PORT=59464`;
- confirm the Prometheus target is `up`, the rules are loaded, and the Grafana dashboard shows data after a few requests.

CI is unchanged. Unit tests run there. The Docker-based checks skip there.

## Docs to update

- `docs/engineering/local-operation.md`: a new "Metrics and Grafana" section covering how to enable `METRICS_PORT`, the URLs and ports, the admin password file, and what the alerts mean.
- `infra/AGENTS.md` and `backend/AGENTS.md`: the new services, files and module.
- `docs/engineering/dependencies.md`: `prometheus_client`, and the two image scans.
- ADR-015: the Observability row becomes "OpenTelemetry + Langfuse, Prometheus + Grafana (local)".
- `docs/demo/tor-roadmap.md` (Thai): WP1 status.

## Out of scope

- Alertmanager and outbound alert delivery (until a server exists).
- HTTP request tracing and a trace backend (Tempo, Jaeger).
- Log aggregation (Loki).
- Multi-process metrics.
- IaC and deployment (WP1 part 2), and branding and domain (WP1 part 3).

## Amendment A1 (2026-10-15): zero High/Critical images and `.env` configuration

Status: owner-approved decisions, 2026-10-15 (Q1–Q4 of the follow-up grill). The written amendment awaits owner review.

The upstream images failed the DELIVERY.md security gate. Trivy 0.75.0 found the following (CVE-2026-78667, -78669 and -97031: Go stdlib 1.27.1/1.26.x and `golang.org/x/net` 0.58–0.59):
- **`prom/prometheus:v3.15.0`:** 8 High, in `bin/prometheus` and `bin/promtool`.
- **`grafana/grafana:13.2.4`:** 56 High, all in bundled datasource plugin binaries. `grafana-server` itself is clean.

Both images were already the latest releases, and no fixed release existed. The owner asked for the findings to be fixed rather than accepted, and for every configurable value to move to `.env`.

### Decisions

| # | Decision |
|---|---|
| A1.1 | Both images are built locally from pinned inputs, following the `infra/postgres` and `infra/minio` pattern (Dockerfile, `provenance.json`, a `job-search-platform/...` tag that encodes the pinned source). Merge requires 0 High and 0 Critical. |
| A1.2 | Prometheus is v3.15.0 built from source, pinned by commit (not tag): Go 1.27.2 (`golang:1.27.2-bookworm` by digest, the same builder as `infra/postgres`) and `golang.org/x/net` v0.60.0. The web UI comes from the release asset `prometheus-web-ui-3.15.0.tar.gz`, checked by sha256, and is embedded with `scripts/compress_assets.sh` and `-tags netgo,builtinassets`, so no npm build is needed. The runtime base is `quay.io/prometheus/busybox` (multi-arch index digest), running as `nobody`. |
| A1.3 | Grafana is derived from the pinned `grafana/grafana:13.2.4` image. Every bundled plugin except `prometheus` is removed. The Prometheus datasource backend (`grafana/grafana-prometheus-datasource` v13.2.3, commit `6d21418acde6ce31c9f7a6418a88758842a881bb`) is rebuilt with Go 1.27.2 and x/net v0.60.0, using the shipped binary's build flags (`-tags arrow_json_stdlib`). `GF_PLUGINS_PREINSTALL_DISABLED=true` stops Grafana from downloading plugins at startup. |
| A1.4 | A rebuilt bundled plugin fails Grafana's signature check (`modified`). The image removes that plugin's `MANIFEST.txt` and allow-lists exactly one unsigned plugin id: `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=prometheus`. Trust in that binary rests on our pinned source build. No other plugin can load unsigned. Dashboards can only use the Prometheus datasource, and this is the only one the stack uses. |
| A1.5 | `scripts/security_scan.py` gains the image scopes `prometheus_image` and `grafana_image`, scanned the same way as the others. |
| A1.6 | Every published host port in `infra/compose.yaml` reads `${VAR:-current default}`: `CORE02_PROMETHEUS_PORT` (59090), `CORE02_GRAFANA_PORT` (53300), `CORE02_MAILPIT_SMTP_PORT` (51025) and `CORE02_MAILPIT_UI_PORT` (58025). Existing variables stay. `local_infra.compose_environment` sets the same defaults. Also configurable: `PROMETHEUS_RETENTION` (15d) and `GRAFANA_ADMIN_USER` (admin). Secrets stay in the private directory, never in `.env`. |
| A1.7 | The app's `METRICS_PORT` and `METRICS_HOST` are documented in `.env`. `infra/prometheus/prometheus.yml` cannot read environment variables, so its scrape target stays `host.docker.internal:59464`. `.env.example` and the docs state that changing `METRICS_PORT` requires the same change in that file. |
| A1.8 | `.env.example` is committed as the template (the owner overrode the earlier "leave it alone"). It lists every variable above with its default, and carries no secret values. The owner's `.env` gets the same additions, with values unchanged. |

### Builds and checks

- **Build time and resources:** the Prometheus compile takes about 20 minutes on the 4-CPU Colima VM. Never run two image builds at once (the VM ran out of memory during the spike). Keep at least 20 GB of free host disk before building (LEARNINGS 2026-10-11).
- **Multi-arch:** both Dockerfiles use `--platform=$BUILDPLATFORM` and `GOARCH=$TARGETARCH`. The owner machine builds arm64. amd64 builds are verified in WP1 part 2 (IaC rehearsal).
- **Tests:**
  - **Unit (no Docker):** the compose services use `build:` with the expected local tags. Ports read `${CORE02_*_PORT:-default}`. The Grafana environment includes `GF_PLUGINS_PREINSTALL_DISABLED=true` and the exact one-id unsigned allow-list. `provenance.json` hashes match the files. `.env.example` lists every variable in A1.6–A1.7.
  - **Live, on the owner machine:**
    - Build both images, one at a time.
    - Trivy: 0 High and 0 Critical for each.
    - `prometheus --version` reports 3.15.0, and `/-/ready` and the UI return 200.
    - Start them with `--no-deps` under `.env`. The Prometheus `app` target is up. The Grafana datasource health check is OK and the dashboard has data. Anonymous access returns 401. No plugin download appears in the Grafana log.
    - LiteLLM keeps its provider key.

### Docs

- `docs/engineering/dependencies.md`: the image scan results before (8 and 56 High) and after (0), the pinned inputs, and the unsigned-plugin decision.
- `docs/engineering/local-operation.md`: the build commands and duration, the `.env` variables, and the METRICS_PORT note.
- `infra/AGENTS.md`: the new build inputs.
