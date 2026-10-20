# Single-VM runbook

Runs the platform on one Ubuntu 24.04 VM under systemd with Caddy for HTTPS (ADR-017, spec `docs/superpowers/specs/2026-10-15-iac-single-vm-design.md`). Every command here runs on the server unless it says "dev machine".

Paths: releases in `/opt/job-search-platform/releases/<tag>`, `current` symlink to the live one, secrets in `/etc/job-search-platform/private/` (`app.env`, and `core02/` for generated credentials), backups in `/var/backups/job-search-platform/`, service user `jsp`. Never delete the release `current` points at, nor the one that last applied `infra/` (running containers bind-mount files from it).

## 1. Create the VM

Ubuntu 24.04, 4 vCPU, 8 GB RAM, 80 GB disk (the first image builds need about 20 GB free), your SSH public key. Open only 22, 80 and 443 at the provider firewall (cloud-init also enables `ufw` for the same three).

Edit `REPO_URL` and `RELEASE_TAG` in `infra/deploy/cloud-init.yaml` (dev machine), then pass the file as the VM's user-data. cloud-init creates the `jsp` user, installs Docker, PostgreSQL 17 client tools (backup/restore need pg_dump 17; Ubuntu ships 16), Node.js 24.18.0, uv and ufw, forbids SSH passwords, and clones the tag to `/opt/job-search-platform/releases/<tag>` with `current` pointing at it. It stops before `bootstrap.sh`: secrets must not travel in user-data. Wait for `cloud-init status --wait` to report `done`. If first boot fails, read `/var/log/cloud-init-output.log`.

## 2. DNS

Before the first start, point A (and AAAA) records for `<domain>` and `agents.<domain>` at the VM. Let's Encrypt validates both names on first start.

## 3. Secrets

```bash
sudo install -o jsp -g jsp -m 0600 /opt/job-search-platform/current/infra/deploy/app.env.example /etc/job-search-platform/private/app.env
sudoedit /etc/job-search-platform/private/app.env
```

Replace every `CHANGE_ME` (`DOMAIN`, `ACME_EMAIL`, `APP_PUBLIC_ORIGIN`, `SHARE_PUBLIC_ORIGIN`, `OPENROUTER_API_KEY`, `SMTP_*`). Keep `CADDY_TLS` empty in production. `bootstrap.sh` and `deploy.sh` refuse to run while a `CHANGE_ME` remains or the file is not mode 0600.

## 4. First install

```bash
sudo /opt/job-search-platform/current/infra/deploy/bootstrap.sh
```

It fetches the pinned upstream sources (MinIO, gosu, Prometheus, Caddy, Grafana datasource), builds the images (expect 30-60 minutes on the first run; Prometheus alone takes 15-20), starts the Compose services with `CORE02_COMPOSE_OVERRIDE=infra/compose.prod.yaml`, builds the frontend, installs the systemd units and enables the app and both timers. It ends with `ready: https://<domain>/login`. It is safe to re-run.

Secret files and the server group. Compose bind-mounts secret files with the host owner and mode (it ignores `uid`/`gid`/`mode` on file secrets), so a non-root container (MinIO uid 10001, Grafana uid 472) could not read a `jsp`-owned 0600 file. On servers `app.env` sets `CORE02_SECRETS_GROUP_READ=1`: `scripts/local_infra.py` writes the secret and derived files in `core02/` as 0640 (and tightens nothing wider), accepts 0640 but nothing with group-write/execute or any other bit, and exports `CORE02_SECRETS_GID` (the group of `core02/`), which `infra/compose.prod.yaml` adds to each such service with `group_add`. The directory stays 0700, so only `jsp`'s own group, which only those containers join, can read the files. Development leaves the flag unset and keeps 0600.

## 5. Deploy

On the dev machine, tag and push:

```bash
git tag v1.2.3 && git push origin v1.2.3
```

On the server:

```bash
sudo /opt/job-search-platform/current/infra/deploy/deploy.sh v1.2.3
```

`deploy.sh` refuses a tag that does not exist on the remote (never a branch), stops the app, writes a backup to `/var/backups/job-search-platform/pre-deploy-<tag>-<timestamp>` and starts the app again (a backup needs the maintenance lock, so it cannot run beside the app; if the backup fails the deploy aborts with the previous release running), builds the frontend, and, only when `infra/` changed, refreshes the pinned upstream sources, the Hermes runtime and the systemd units (`daemon-reload`) and re-applies the Compose stack (if that fails it re-applies the previous release's stack and exits non-zero with `current` unchanged), switches `current`, restarts `job-search-platform` (migrations run at app start) and waits 60 s for `/health/ready`. If the check fails it switches `current` back and re-applies the previous infra, then checks whether the previous release knows the database's revision. If it does, it restarts, waits for ready and exits non-zero. If it does not (the new release already migrated), it leaves the app stopped, prints the schema refusal and the `restore.py` command with the pre-deploy archive path, and exits non-zero. The restart interrupts in-flight runs; they follow the normal interruption handling.

## 6. Rollback

```bash
sudo /opt/job-search-platform/current/infra/deploy/deploy.sh <older tag>
```

Migrations only go forward. If the older tag does not know the database's current Alembic revision, the script refuses (before any backup or switch) with `database is at <db head> but this release expects <code head>; code-only rollback is unsafe.` Running old code on a newer schema could corrupt data, so this is never automatic. The same message appears, with the app left stopped, if a failed deploy had already migrated the schema (the automatic rollback only restores code and refuses to start old code on a newer schema). In both cases restore the pre-deploy archive into a fresh database and bucket (section 7) and point the app at them.

## 7. Restore from a backup

Daily archives are `/var/backups/job-search-platform/daily-<UTC stamp>` (03:00, kept 7 days); deploy archives are `pre-deploy-*`. `restore.py` never overwrites: the target database and bucket must already exist and be empty, and must differ from the source (`jobsearch_platform_core02` and `job-search-platform-private` by default).

Run the restore as `jsp` with the app environment loaded by the shipped parser (never `source` `app.env`; it is `KEY=VALUE` data, not shell). Use a root shell (`sudo -i`). Stop the app first, because it holds the maintenance lock for the database and bucket it uses:

```bash
systemctl stop job-search-platform
source /opt/job-search-platform/current/infra/deploy/lib.sh && load_app_env /etc/job-search-platform/private/app.env
rjsp() { sudo -u jsp --preserve-env -H bash -c "cd /opt/job-search-platform/current && $*"; }
ARCHIVE=/var/backups/job-search-platform/daily-<stamp>   # or pre-deploy-<tag>-<stamp>
NEWDB=jsp_restore_$(date -u +%Y%m%d)
NEWBUCKET=jsp-restore-$(date -u +%Y%m%d)

# 1. empty target database (inside the postgres container)
docker exec -i "$(docker ps -qf label=com.docker.compose.service=postgres)" \
  sh -c "psql -U \"\$(cat /run/secrets/postgres_user)\" -d postgres -c 'CREATE DATABASE $NEWDB'"
# 2. empty target bucket
rjsp "uv run --locked --project backend python -c \"
import boto3, os, pathlib
d = pathlib.Path(os.environ['CORE02_PRIVATE_DIR'])
boto3.client('s3', endpoint_url='http://127.0.0.1:59000', region_name='us-east-1',
  aws_access_key_id=(d/'minio-access-key').read_text().strip(),
  aws_secret_access_key=(d/'minio-secret-key').read_text().strip()).create_bucket(Bucket='$NEWBUCKET')\""
# 3. restore
rjsp "uv run --locked --project backend python scripts/restore.py --archive $ARCHIVE --target-database $NEWDB --target-bucket $NEWBUCKET"
```

`--allow-owner-data` is needed only when the target database name does not start with `jsp_test_` or `jsp_restore_`. Use a `jsp_restore_*` name as above and the flag is not needed. A failed restore leaves a `restore-incomplete` marker and the app refuses that target: drop and recreate the database and bucket before retrying.

Switch the app to the restored data by adding these lines to `/etc/job-search-platform/private/app.env`, then start it:

```bash
JSP_DATABASE=jsp_restore_YYYYMMDD
JSP_PRIVATE_BUCKET=jsp-restore-YYYYMMDD
```

```bash
systemctl start job-search-platform
```

Restore drops accounts, sessions, provider credentials and shares by design: create a user again (`uv run --locked --project backend python scripts/accounts.py create-user --email <email>`, see `docs/engineering/local-operation.md`), re-enter provider keys in Settings, and retry interrupted runs manually. After a schema rollback, finish by running `deploy.sh <older tag>` again. Details: `docs/engineering/recovery-proof.md`.

## 8. Grafana and Prometheus

Both listen on loopback only (Grafana 53300, Prometheus 59090). Tunnel from your machine:

```bash
ssh -L 53300:127.0.0.1:53300 -L 59090:127.0.0.1:59090 <user>@<host>
```

Open `http://127.0.0.1:53300` (user `admin`, or `GRAFANA_ADMIN_USER`). The password is the file `/etc/job-search-platform/private/core02/grafana-admin-password` (`CORE02_PRIVATE_DIR`):

```bash
sudo cat /etc/job-search-platform/private/core02/grafana-admin-password
```

Alert rules show in the Prometheus UI (`http://127.0.0.1:59090/alerts`); there is no Alertmanager. The app metrics listener is `127.0.0.1:59464` (`METRICS_PORT`) and is never proxied.

## 9. Logs and timers

```bash
sudo journalctl -u job-search-platform -f
sudo journalctl -u job-search-ingest -u job-search-backup --since today
systemctl list-timers 'job-search-*'
sudo systemctl start job-search-backup   # run a backup now
sudo systemctl start job-search-ingest   # run an ingest now
docker ps --filter label=com.docker.compose.project=jobsearch-core02
```

The backup stops the app for its duration (the maintenance lock, CORE-10, needs a stopped app for a consistent backup) and starts it again afterwards, success or failure: a few minutes of downtime nightly at 03:00 server time; in-flight runs follow the normal interruption handling. Ingest runs hourly, backup daily at 03:00; both are `Persistent=true`, so a missed run happens after boot.

## 10. Langfuse (optional)

Tracing is off by default. It adds about 2-3 GB RAM and 5 GB of images. Enable it with the existing profile switch: add `LANGFUSE_HOST=http://127.0.0.1:53000` to `app.env`, then re-apply the stack and restart the app:

```bash
sudo bash -c 'source /opt/job-search-platform/current/infra/deploy/lib.sh && load_app_env /etc/job-search-platform/private/app.env && sudo -u jsp --preserve-env -H bash -c "cd /opt/job-search-platform/current && uv run --locked --project backend python scripts/local_infra.py start"'
sudo systemctl restart job-search-platform
```

Reach the UI through `ssh -L 53000:127.0.0.1:53000 <user>@<host>`. Login details are in `docs/engineering/local-operation.md` ("Langfuse run tracing"). To turn it off, clear `LANGFUSE_HOST`, run the same `local_infra.py stop`, then `start`.

## 11. Off-site backup (owner TODO)

Backups live on the same disk as the data. Until you copy them elsewhere, losing the VM loses the backups. From a machine you control, for example:

```bash
rsync -a --rsync-path="sudo rsync" <user>@<host>:/var/backups/job-search-platform/ ./jsp-backups/
```

Archives contain user data and are mode 0700/0600: store them encrypted. Automating this is out of scope until the client picks a cloud.
