# Local recovery procedure

CORE-10 archives the PostgreSQL database and the exact MinIO objects referenced by published file rows as one private bundle. The archive contains a custom-format PostgreSQL dump, a schema/source-pin manifest, and object bytes with SHA-256 checksums. It is written outside the repository with mode `0600`; its temporary directory and the maintenance-lock directory use mode `0700`.

Before a backup, stop the local application cleanly and wait for its process to exit. Its shared per-database-and-bucket OS lock covers launcher nonce writes, migrations, startup reconciliation, and the full application lifetime. Backup and restore acquire that same lock before database or S3 access and fail with `maintenance_active` while the app holds it. The recovery scripts never stop or restart PostgreSQL or MinIO. Backup uses the existing supervisor's exact project/run/instance checks to reconcile recorded native executions; uncertain cleanup or remaining active work refuses the capture. Queued runs receive an `interrupted` state and durable event before the database dump, so startup cannot silently dispatch them.

Create the archive in a private directory outside the repository:

```sh
uv run --project backend python scripts/backup.py \
  --archive "$HOME/.local/share/job-search-platform/recovery/platform-2026-10-04.tar.gz"
```

The script reads database and MinIO credentials from the private runtime directory selected by `CORE02_PRIVATE_DIR` (or the local default). Credentials are not accepted on the command line or written to the archive manifest. The dump omits owner sessions, launch nonces, and grants. It preserves provider configuration IDs and run history, replacing provider and `Run.config_snapshot.secret_reference` values with inert `restored-unconfigured:<provider-id>` references and removing credential-valued snapshot fields. A private temporary source dump is restored into a uniquely named staging database, sanitized there, and removed before the portable dump is placed in the archive. The final dump is scanned after rendering with `pg_restore`; it contains no source Keychain references or credential values.

Restore into a new, pre-created empty PostgreSQL database and empty bucket. Synthetic targets named `jsp_test_*` or `jsp_restore_*` are allowed by default; restoring into another empty database requires the explicit `--allow-owner-data` option. Restore never drops a database, truncates existing application data, or overwrites bucket objects.

```sh
uv run --project backend python scripts/restore.py \
  --archive "$HOME/.local/share/job-search-platform/recovery/platform-2026-10-04.tar.gz" \
  --target-database jsp_restore_rehearsal \
  --target-bucket job-search-platform-restore-rehearsal
```

Before writing to the restored target, the tool validates archive members and checksums, source pins, Alembic revision, PostgreSQL major version, target emptiness, and every object body. It places a private per-target `restore-incomplete` marker before writing. It copies and reads back objects, restores the database in one PostgreSQL transaction, confirms file metadata, and excludes portable authentication state. The marker clears only after every check succeeds. A failed or interrupted restore leaves the marker in place, and app startup refuses that target. Recreate the still-synthetic empty database and bucket before retrying; the restore tool will not overwrite partial state.

After a portable restore, launch the app as a new owner to create a fresh owner session. Configure provider credentials again through Settings; the destination Keychain is separate. Shared-project grants and nonces are absent. Interrupted runs stay interrupted until the owner manually retries them; the retry has a new run ID and `retry_of` reference. Completed published results remain available with their checksums and document references.

## Verification evidence

On 2026-10-04, the scoped recovery suite used unique synthetic PostgreSQL databases and OSS MinIO buckets. It covered the process-lock race, missing and tampered objects, rejection of an active run, database/object round trip containing a CV, job, generated PDF and text attachment, document previews and revision references, private archive modes, empty-target enforcement, authentication reset, and preservation of existing target data. The restore fixture also includes completed and interrupted runs, a linked `RunArtifact`, and synthetic provider/run Keychain references. It verifies preserved run and artifact relationships, no source references in rendered portable SQL, staging-database cleanup, and a distinct manual retry after creating a fresh owner session and provider configuration. The interrupted-run proof started the installed pinned Hermes bridge in an isolated labeled native execution container, killed the exact bridge, ran the production supervisor startup reconciliation, verified the container was gone, preserved a separately completed published PDF, and created a distinct manual retry. No model provider was configured or called.

The restore, interrupted-run, and maintenance integration files passed: 14 tests. These local synthetic tests do not establish a live-provider workflow or external-host deployment behavior.

## Opening the restored application

After successful restore, set local `JSP_DATABASE` and `JSP_PRIVATE_BUCKET` to the restored target names, retain the target infrastructure `CORE02_PRIVATE_DIR`, then launch with `scripts/run_local.py --open-browser`. The defaults continue to select the normal local database/bucket. Maintenance locks and quarantine use the selected target identity. The real restore fixture now verifies owner applied-state persistence and reconnects through the actual application factory to the restored database/bucket before any provider or native work is started.
