# Single-VM infrastructure as code (TOR WP1, part 2 of 3) — design

Status: owner-approved decisions, 2026-10-15 (Q5–Q12, sharing origin, design sections 1–2). Written spec approved by the owner on 2026-10-15.
Branch: `docs/iac-single-vm` from `origin/develop` (c3a82a3).
ADR: [ADR-017](../../adr/ADR-017-systemd-single-vm.md) chooses systemd over Kubernetes, as TOR §7 requires.

## Goal

TOR WP1 part 2: make the platform deployable to one fresh server, repeatably, with HTTPS. There is no server yet, so everything is proven in a throwaway local VM.

Done means:
- a fresh Ubuntu 24.04 VM given `infra/deploy/cloud-init.yaml` ends with the app reachable over HTTPS, and only ports 22, 80 and 443 open;
- `deploy.sh <tag>` updates to a tagged release and rolls back on a failed health check;
- hourly ingest and daily backup run as systemd timers;
- the full path is rehearsed in a Colima VM, then the VM is deleted.

## Decisions

| # | Decision |
|---|---|
| D1 | One Ubuntu 24.04 LTS VM. Nothing cloud-specific; OpenTofu is added when the client picks a cloud (Q5). Recommended size: 4 vCPU, 8 GB RAM, 80 GB disk, because Prometheus is built from source on the VM. |
| D2 | The app runs as a systemd service on the host, because it runs Hermes natively and starts sandboxes with the Docker CLI. Infra services run with Compose. Recorded in ADR-017 (Q6). |
| D3 | Caddy terminates TLS with automatic Let's Encrypt certificates. The domain comes from `app.env`; branding and the real domain are part 3. Only 22, 80 and 443 are public (Q7). |
| D4 | The project-token sharing listener (MCP/A2A) is served at its own origin `https://agents.<domain>`, proxied to `127.0.0.1:8001` (owner choice A, 2026-10-15). |
| D5 | The app trusts `X-Forwarded-For` only from Caddy on `127.0.0.1`. This closes the FR-P03 trusted-proxy follow-up (Q7). |
| D6 | cloud-init prepares the host; an idempotent `bootstrap.sh` installs the platform; `deploy.sh` updates and rolls back by tag (Q8). |
| D7 | systemd timers: ingest hourly, backup daily, 7 days of local backups. Off-site copy is an owner TODO (Q9). |
| D8 | Prometheus and Grafana use host networking and listen on loopback only. Grafana is reached through an SSH tunnel. Langfuse stays optional (the existing `langfuse` profile). No Alertmanager (Q10). |
| D9 | Production mail uses the existing generic `SMTP_*` settings. Mailpit is dev-only (Q11). |
| D10 | Proof without a server: static checks in CI, plus a full rehearsal in a throwaway Colima profile `jsp-iac` (Q12). |

## Host layout

| Path | Owner, mode | Contents |
|---|---|---|
| `/opt/job-search-platform/releases/<tag>/` | `jsp`, 0755 | one checkout per deployed tag |
| `/opt/job-search-platform/current` | symlink | the active release |
| `/var/lib/job-search-platform/` | `jsp`, 0700 | home of `jsp`: `~/.cache/job-search-platform/` holds the Hermes runtime, upstream checkouts and project workspaces, exactly as on the dev machine, so `Path.home()` paths in the code need no change |
| `/etc/job-search-platform/private/` | `jsp`, 0700; files 0600 | `CORE02_PRIVATE_DIR` (generated credentials) and `app.env` |
| `/var/backups/job-search-platform/` | `jsp`, 0700 | daily backup archives |

`jsp` is a system user in the `docker` group. Membership of `docker` is equivalent to root on the host; ADR-017 records why it is accepted.

`app.env` is the systemd `EnvironmentFile` for the app and the timers, and the `--env-file` for Compose. It holds the domain, `APP_PUBLIC_ORIGIN=https://<domain>`, `SHARE_PUBLIC_ORIGIN=https://agents.<domain>`, `ACME_EMAIL`, `CORE02_PRIVATE_DIR`, `METRICS_PORT`, the source-dir variables, `OPENROUTER_API_KEY` and `SMTP_*`. The template `infra/deploy/app.env.example` has every name with a placeholder and no secret.

## Runtime topology

```text
internet ──80/443──> Caddy (container, host network)
                       ├─ <domain>          -> 127.0.0.1:8000  app owner listener
                       └─ agents.<domain>   -> 127.0.0.1:8001  app sharing listener
app (systemd, user jsp) -> Compose services on 127.0.0.1 ports (unchanged)
                        -> docker CLI -> Hermes sandboxes
Prometheus (host network, 127.0.0.1:59090) -> scrapes 127.0.0.1:59464
Grafana    (host network, 127.0.0.1:53300) -> reads 127.0.0.1:59090
```

Caddy passes the `Host` header through unchanged, so the existing origin and host checks in `owner_sessions` keep working, and cookies are `Secure` because `APP_PUBLIC_ORIGIN` is `https://`.

## Code changes to the app

Kept to the minimum the deploy needs.

1. **Linux start-up without Keychain.** `main.py` builds `MacOSKeychain()` unconditionally, and its constructor raises on any platform other than macOS, so the app cannot start on Linux. No code reads `services.secret_store`. Build it only when `sys.platform == "darwin"`, else `None`.
2. **Proxy headers.** `run_local.py` gets `--behind-proxy`. It sets uvicorn `proxy_headers=True, forwarded_allow_ips="127.0.0.1"` on both listeners. Without the flag nothing changes. The rate-limit key in `api/accounts.py` (`request.client.host`) then sees the real client IP behind Caddy and the peer IP everywhere else.
3. **Compose override.** `local_infra._compose` appends a second `--file` when `CORE02_COMPOSE_OVERRIDE` is set. `bootstrap.sh` then reuses `local_infra.py start` for build, credentials and LiteLLM seed.
4. **Grafana datasource URL from the environment.** `infra/grafana/provisioning/datasources/prometheus.yml` uses `${GRAFANA_PROMETHEUS_URL}`. The base Compose file sets `http://prometheus:9090`; the production override sets `http://127.0.0.1:59090`.

## Repository additions

```text
infra/compose.prod.yaml                 override, layered on infra/compose.yaml
infra/prometheus/prometheus.prod.yml    scrape targets for host networking
infra/caddy/                            Dockerfile, go.mod/go.sum overlay, provenance.json: Caddy built from pinned source
scripts/migration_state.py              code-head | db-head | knows <rev>, used by deploy.sh's schema guard
infra/deploy/
  cloud-init.yaml
  bootstrap.sh
  deploy.sh
  app.env.example
  lib.sh                                shared helpers: app.env parser, readiness poll, schema guard
  caddy-image.txt                       pinned Caddy image tag (equals the compose.prod.yaml image line)
  Caddyfile
  job-search-platform.service
  job-search-ingest.service  job-search-ingest.timer
  job-search-backup.service  job-search-backup.timer
  README.md                             runbook: create VM, DNS, first boot, deploy, rollback, restore, tunnel to Grafana
```

### `infra/compose.prod.yaml`

An override, not a copy. It changes only:
- `mailpit`: `profiles: ["dev"]`, so it never starts in production;
- `prometheus`: `network_mode: host`, `ports: !reset []`, `extra_hosts: !reset []`, listen address `127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}`, config `prometheus.prod.yml` (targets `127.0.0.1:59464` and itself);
- `grafana`: `network_mode: host`, `ports: !reset []`, `GF_SERVER_HTTP_ADDR=127.0.0.1`, `GF_SERVER_HTTP_PORT=${CORE02_GRAFANA_PORT:-53300}`, `GRAFANA_PROMETHEUS_URL=http://127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}`;
- `caddy`: a new service, image pinned by digest, `network_mode: host`, mounts `infra/deploy/Caddyfile` read-only and named volumes for `/data` and `/config`, with `DOMAIN` and `ACME_EMAIL` from `app.env`.

Every other service keeps its `127.0.0.1:` port binding. Because nothing but Caddy listens on a public address, Docker's iptables rules do not bypass ufw.

### `Caddyfile`

Two site blocks, `{$DOMAIN}` and `agents.{$DOMAIN}`, each `reverse_proxy 127.0.0.1:<port>` with `email {$ACME_EMAIL}`. A `{$CADDY_TLS:}` placeholder lets the rehearsal set `tls internal`; in production it is empty. Caddy's default `X-Forwarded-For` handling replaces any client-sent value.

### Caddy image and CVEs

The Caddy image joins `scripts/security_scan.py` and the DELIVERY gate (no known High/Critical). If the official image fails the gate, it is built from pinned source with the external-checkout pattern used for Prometheus (LEARNINGS 2026-10-15). The scan result decides this in the plan; it is not assumed.

## Provisioning

### `cloud-init.yaml`

Runs once on first boot:
1. create the system user `jsp` with home `/var/lib/job-search-platform`;
2. install Docker Engine and the Compose plugin from Docker's apt repository, plus `git`, `ufw`, Node.js 24.18.0 (the CI version), and `uv` at the version pinned in the repo;
3. add `jsp` to `docker`;
4. `ufw default deny incoming`, allow 22, 80 and 443, enable;
5. clone the repository at the tag given in the file into `releases/<tag>`, point `current` at it, then run `bootstrap.sh` as root.

The repository URL and tag are the two values the operator edits.

### `bootstrap.sh`

Idempotent; safe to re-run after a failure. Runs as root, drops to `jsp` for everything except installing files under `/etc`:
1. create the host layout above; copy `app.env.example` to `app.env` if absent, then stop with a message if any placeholder remains;
2. fetch the upstream checkouts (minio, gosu, prometheus, grafana-prometheus-datasource) at the commits pinned in `scripts/local_infra.py`, into `~/.cache/job-search-platform/upstream/`;
3. `uv sync --locked`; `infra/hermes/setup.py --acquire --build`;
4. `local_infra.py start` with `CORE02_COMPOSE_OVERRIDE=infra/compose.prod.yaml`, under `uv run --env-file app.env`;
5. build the frontend with `npm ci && npm run build` (so `run_local.py` finds `frontend/dist` and never calls its `rtk npm` build path, which is a dev-machine tool);
6. install the systemd units, `daemon-reload`, enable and start the app and both timers;
7. wait for `https://<domain>/api/v1/health/ready`.

Starting Langfuse stays opt-in through the existing `langfuse` profile switch.

## Deploy and rollback

`deploy.sh <tag>`, run as root:
1. fetch `<tag>` into `releases/<tag>` (refuse a tag that does not exist; never deploy a branch);
2. run `backup.py` into `/var/backups/job-search-platform/pre-deploy-<tag>-<timestamp>`;
3. in the new release: `uv sync --locked`, build the frontend;
4. if the new release's infra inputs differ from the current one (Compose files, Dockerfiles, pins), run step 4 of bootstrap from the new release;
5. switch `current` to the new release, `systemctl restart job-search-platform` (migrations run at app start, as today);
6. poll `/api/v1/health/ready` for 60 s. On failure, switch `current` back, restart, and exit non-zero.

Rollback is `deploy.sh <older tag>`. Alembic migrations are forward-only. If the older tag's migration head differs from the database's `alembic_version`, `deploy.sh` refuses and prints the `restore.py` command for the pre-deploy backup instead. Running old code on a newer schema could corrupt data, so this is never automatic.

The automatic rollback in step 6 covers code only. If the failed release already migrated the schema, the script says so and points to the same restore path.

## Timers

| Unit | Schedule | Command |
|---|---|---|
| `job-search-ingest` | hourly, `Persistent=true` | `uv run --locked --project backend python scripts/ingest_jobs.py run` |
| `job-search-backup` | daily 03:00, `Persistent=true` | `backup.py --archive /var/backups/job-search-platform/daily-<date>`, then `find /var/backups/job-search-platform -mindepth 1 -maxdepth 1 -mtime +7 -exec rm -rf {} +` |

Both run as `jsp` from `/opt/job-search-platform/current` with `EnvironmentFile=/etc/job-search-platform/private/app.env`, and log to the journal. The launchd plist stays for the Mac dev setup.

## Observability on the server

- `METRICS_PORT=59464` in `app.env`; the listener is loopback-only, as in part 1.
- Grafana: `ssh -L 53300:127.0.0.1:53300 <host>`, then open `http://127.0.0.1:53300`.
- Alert rules stay visible in the Prometheus UI only (no Alertmanager).

## Testing

**Static, in CI** (`backend/tests/test_deploy_config.py`):
- `docker compose -f infra/compose.yaml -f infra/compose.prod.yaml config` succeeds, and every published port in the merged config binds `127.0.0.1`; only `caddy`, `prometheus` and `grafana` use host networking;
- `cloud-init schema --config-file infra/deploy/cloud-init.yaml` passes when `cloud-init` is installed, else the test is skipped and says so;

**Unit:**
- `--behind-proxy`: a request from `127.0.0.1` with `X-Forwarded-For: 203.0.113.9` is rate-limited as `203.0.113.9`; the same header from any other peer is ignored; without the flag the header is ignored;
- with `sys.platform` patched to `linux`, `build_services` does not construct `MacOSKeychain`;
- `_compose` appends the override file only when `CORE02_COMPOSE_OVERRIDE` is set.

**Rehearsal** (manual, recorded in the Hub, needs at least 20 GB free first):
0. `caddy validate` on the Caddyfile through the pinned Caddy image (not in CI, which does not pull that image);
1. `colima start --profile jsp-iac` with an Ubuntu 24.04 image and the cloud-init file; `CADDY_TLS="tls internal"` and a `*.test` domain mapped in the host's `/etc/hosts` for the run only;
2. smoke: sign up and log in through HTTPS, run a job search, see `jsp_` metrics in Prometheus and the dashboard in Grafana through the tunnel, check that `agents.<domain>` serves the Agent Card;
3. check from outside the VM that only 22, 80 and 443 answer;
4. run both timers once with `systemctl start`;
5. `deploy.sh` to a second tag, then roll back; confirm the migration-head refusal with a tag whose head differs;
6. build the two observability images and Caddy for amd64 as well (only arm64 has been tested);
7. `colima delete --profile jsp-iac`, then `docker builder prune` and `fstrim` on the default profile.

## Docs to update

- `infra/deploy/README.md` (new runbook).
- `docs/engineering/local-operation.md`: link to the runbook; note `CORE02_COMPOSE_OVERRIDE` and the pinned proxy trust.
- `infra/AGENTS.md`: the production override and Caddy pin.
- `README.md`: link ADR-017.
- `docs/engineering/dependencies.md`: Caddy image pin and scan evidence.

## Planning amendments

Controller rulings made while planning and building; they supersede the text above where they differ.

1. **No `--behind-proxy` flag.** uvicorn 0.41.0 already trusts `X-Forwarded-For` from `127.0.0.1` by default, and `run_local.py` now pins `proxy_headers=True, forwarded_allow_ips="127.0.0.1"` explicitly. A flag would add nothing, and the pin stops `FORWARDED_ALLOW_IPS` in the environment from widening the trust.
2. **cloud-init stops before `bootstrap.sh`.** Secrets must not enter user-data, so the operator fills `app.env` and then runs `bootstrap.sh` by hand.
3. **Caddy is built from pinned source, not the official image.** `caddy:2.11.7` failed the High/Critical gate with 4 High findings (0 Critical) on arm64 and amd64 (Go 1.26.8, `golang.org/x/net` 0.59.0); the overlay uses x/net v0.60.0 and go1.27.2, tag `job-search-platform/caddy:2.11.7-go1.27.2-72dd0fb067f6`, recorded in `infra/deploy/caddy-image.txt`.
4. **Schema guard uses `scripts/migration_state.py`.** `deploy.sh` refuses (before any backup or switch) when the target release does not know the database's current Alembic revision (`knows <db-head>` fails), so a code-only rollback across a migration never happens; an older release that still knows the revision is allowed.
5. **`app.env` is parsed, not sourced.** `lib.sh` reads plain `KEY=VALUE` lines (the same format as systemd `EnvironmentFile`), so shell syntax in the file cannot run code as root.
6. **`deploy.sh` re-applies infra and re-checks health after rollback.** When `infra/` changed it starts the previous release's stack again and polls readiness, and it still exits non-zero so the failure is visible.
7. **`CORE02_PRIVATE_DIR` is `/etc/job-search-platform/private/core02`.** It sits under the secrets directory (0700, owned by `jsp`) instead of `~jsp/.cache`, so credentials back up and permission with the other secrets.
8. **Caddy checkout is production-only.** `validate_caddy_build_inputs()` runs only when `CORE02_COMPOSE_OVERRIDE` is set, so local development needs no Caddy checkout.
9. **The app is stopped around every backup.** Consistent backups need the maintenance lock (CORE-10), which the running app holds, so `job-search-backup.service` stops the app before and starts it after (success or failure), and `deploy.sh` does the same around its pre-deploy backup. Cost: a nightly downtime of a few minutes at 03:00 server time; in-flight runs follow the existing interruption handling.

## Out of scope

- OpenTofu or any cloud-specific provisioning (when the client picks a cloud).
- Alertmanager and outbound alert delivery.
- Off-site backup (owner TODO; the daily archive is the input to it).
- Zero-downtime or blue-green deploys. A deploy restarts the app; in-flight runs follow the existing interruption handling.
- Branding and the real domain (WP1 part 3).
- Multiple VMs, Kubernetes, managed databases.
