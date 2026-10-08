"""Create a private, coordinated PostgreSQL + MinIO logical backup."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import stat
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import boto3
from alembic.config import Config
from alembic.script import ScriptDirectory
from botocore.config import Config as BotoConfig
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))
from job_search_platform.db.models import ProviderConfiguration, Run, StoredFile  # noqa: E402
from job_search_platform.services.maintenance import (  # noqa: E402
    acquire_maintenance_lock, assert_restore_ready,
)

DEFAULT_PRIVATE_DIR = Path.home() / ".cache" / "job-search-platform" / "core02-runtime-20261003"
DEFAULT_DATABASE = "jobsearch_platform_core02"
DEFAULT_BUCKET = "job-search-platform-private"
SECRET_NAMES = {
    "postgres_user": "postgres-user",
    "postgres_password": "postgres-password",
    "minio_access": "minio-access-key",
    "minio_secret": "minio-secret-key",
}
MAX_OBJECT_SIZE = 20 * 1024 * 1024


class RecoveryError(RuntimeError):
    """Safe-to-report backup/restore validation error."""


def _read_secret(private_dir: Path, name: str) -> str:
    path = private_dir / name
    if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise RecoveryError("private_runtime_credentials_unavailable")
    return path.read_text(encoding="utf-8").strip()


def _private_dir(path: Path) -> Path:
    if path.is_symlink() or not path.is_dir() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise RecoveryError("private_runtime_directory_invalid")
    resolved = path.resolve()
    if resolved == ROOT or ROOT in resolved.parents:
        raise RecoveryError("private_runtime_directory_in_repository")
    return resolved


def _port(env_name: str, default: int) -> int:
    try:
        value = int(os.environ.get(env_name, str(default)))
    except ValueError as exc:
        raise RecoveryError("storage_port_invalid") from exc
    if not 1 <= value <= 65535:
        raise RecoveryError("storage_port_invalid")
    return value


def _db_url(args, private_dir: Path) -> URL:
    return URL.create(
        "postgresql+psycopg",
        username=_read_secret(private_dir, SECRET_NAMES["postgres_user"]),
        password=_read_secret(private_dir, SECRET_NAMES["postgres_password"]),
        host="127.0.0.1",
        port=args.postgres_port,
        database=args.database,
    )


def _s3(private_dir: Path, args):
    return boto3.client(
        "s3",
        endpoint_url=f"http://127.0.0.1:{args.minio_port}",
        aws_access_key_id=_read_secret(private_dir, SECRET_NAMES["minio_access"]),
        aws_secret_access_key=_read_secret(private_dir, SECRET_NAMES["minio_secret"]),
        region_name="us-east-1",
        config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 2}),
    )


def _temp_pgpass(private_dir: Path, user: str, password: str, port: int, database: str) -> Path:
    def escape(value: str) -> str:
        return value.replace("\\", "\\\\").replace(":", "\\:")

    path = private_dir / f".pgpass-recovery-{secrets.token_hex(12)}"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(f"*:{port}:{escape(database)}:{escape(user)}:{escape(password)}\n")
        output.flush()
        os.fsync(output.fileno())
    return path


def _run_pg_dump(db_url: URL, private_dir: Path, args, destination: Path) -> None:
    username = _read_secret(private_dir, SECRET_NAMES["postgres_user"])
    password = _read_secret(private_dir, SECRET_NAMES["postgres_password"])
    database = str(db_url.database)
    passfile = _temp_pgpass(private_dir, username, password, args.postgres_port, database)
    env = os.environ.copy()
    env.update({
        "PGPASSFILE": str(passfile), "PGHOST": "127.0.0.1",
            "PGPORT": str(args.postgres_port), "PGUSER": username, "PGDATABASE": database,
    })
    command = [
        "pg_dump",
        "--format=custom", "--no-owner", "--no-acl", "--file", str(destination),
        "--exclude-table-data=owner_sessions", "--exclude-table-data=owner_launch_nonces",
            "--exclude-table-data=grants",
    ]
    try:
        result = subprocess.run(command, env=env, capture_output=True, timeout=900, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecoveryError("postgres_dump_unavailable_or_timed_out") from exc
    finally:
        passfile.unlink(missing_ok=True)
    if result.returncode:
        raise RecoveryError("postgres_dump_failed")


def _run_pg_restore(dump: Path, database: str, private_dir: Path, args) -> None:
    username = _read_secret(private_dir, SECRET_NAMES["postgres_user"])
    password = _read_secret(private_dir, SECRET_NAMES["postgres_password"])
    passfile = _temp_pgpass(private_dir, username, password, args.postgres_port, database)
    env = os.environ.copy()
    env.update({
        "PGPASSFILE": str(passfile), "PGHOST": "127.0.0.1",
        "PGPORT": str(args.postgres_port), "PGUSER": username,
        "PGDATABASE": database,
    })
    try:
        result = subprocess.run(
            ["pg_restore", "--exit-on-error", "--no-owner", "--no-acl",
             "--single-transaction", "--dbname", database, str(dump)],
            env=env, capture_output=True, timeout=1800, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecoveryError("postgres_stage_restore_unavailable_or_timed_out") from exc
    finally:
        passfile.unlink(missing_ok=True)
    if result.returncode:
        raise RecoveryError("postgres_stage_restore_failed")


def _sensitive_snapshot_values(value: object, key: str = "") -> set[str]:
    values: set[str] = set()
    normalized = key.casefold().replace("-", "_")
    sensitive = any(part in normalized for part in (
        "secret", "credential", "token", "password", "api_key", "private_key",
    ))
    if isinstance(value, dict):
        for child_key, child in value.items():
            values.update(_sensitive_snapshot_values(child, str(child_key)))
    elif isinstance(value, list):
        for child in value:
            values.update(_sensitive_snapshot_values(child, key))
    elif sensitive and isinstance(value, str) and value:
        values.add(value)
    return values


def _sanitize_snapshot(value: object, provider_id: object) -> object:
    if isinstance(value, dict):
        sanitized = {}
        for child_key, child in value.items():
            normalized = str(child_key).casefold().replace("-", "_")
            if normalized == "secret_reference":
                sanitized[child_key] = f"restored-unconfigured:{provider_id}"
            elif any(part in normalized for part in (
                "secret", "credential", "token", "password", "api_key", "private_key",
            )):
                continue
            else:
                sanitized[child_key] = _sanitize_snapshot(child, provider_id)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_snapshot(child, provider_id) for child in value]
    return value


def _create_stage_database(db_url: URL, database: str) -> None:
    if not database.startswith("jsp_recovery_stage_") or not database[19:].isalnum():
        raise RecoveryError("stage_database_name_invalid")
    admin_engine = create_engine(db_url.set(database="postgres"), pool_pre_ping=True)
    try:
        with admin_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.exec_driver_sql(f'CREATE DATABASE "{database}"')
    except Exception as exc:
        raise RecoveryError("stage_database_create_failed") from exc
    finally:
        admin_engine.dispose()


def _drop_stage_database(db_url: URL, database: str) -> None:
    if not database.startswith("jsp_recovery_stage_") or not database[19:].isalnum():
        raise RecoveryError("stage_database_name_invalid")
    admin_engine = create_engine(db_url.set(database="postgres"), pool_pre_ping=True)
    try:
        with admin_engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.execute(text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :database AND pid <> pg_backend_pid()"
            ), {"database": database})
            connection.exec_driver_sql(f'DROP DATABASE "{database}"')
    except Exception as exc:
        raise RecoveryError("stage_database_cleanup_failed") from exc
    finally:
        admin_engine.dispose()


def _verify_dump_excludes_values(dump: Path, forbidden_values: set[str]) -> None:
    markers = [value.encode("utf-8") for value in forbidden_values if len(value) >= 4]
    if not markers:
        return
    try:
        process = subprocess.Popen(
            ["pg_restore", "--file", "-", str(dump)],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        assert process.stdout is not None
        overlap = max(map(len, markers)) - 1
        tail = b""
        while chunk := process.stdout.read(64 * 1024):
            searchable = tail + chunk
            if any(marker in searchable for marker in markers):
                process.kill()
                process.wait(timeout=5)
                raise RecoveryError("portable_dump_contains_sensitive_reference")
            tail = searchable[-overlap:] if overlap else b""
        if process.wait(timeout=900):
            raise RecoveryError("portable_dump_validation_failed")
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecoveryError("portable_dump_validation_failed") from exc


def _sanitized_stage_dump(source_url: URL, private_dir: Path, args, work_dir: Path) -> Path:
    raw_dump = work_dir / "source.private.dump"
    final_dump = work_dir / "database.dump"
    stage_name = f"jsp_recovery_stage_{secrets.token_hex(12)}"
    forbidden_values: set[str] = set()
    source_engine = create_engine(source_url, pool_pre_ping=True)
    try:
        with Session(source_engine) as session:
            forbidden_values.update(
                row.secret_reference for row in session.scalars(select(ProviderConfiguration))
                if row.secret_reference
            )
            for snapshot in session.scalars(select(Run.config_snapshot)):
                forbidden_values.update(_sensitive_snapshot_values(snapshot))
        _run_pg_dump(source_url, private_dir, args, raw_dump)
    finally:
        source_engine.dispose()

    created = False
    try:
        _create_stage_database(source_url, stage_name)
        created = True
        _run_pg_restore(raw_dump, stage_name, private_dir, args)
        stage_url = source_url.set(database=stage_name)
        stage_engine = create_engine(stage_url, pool_pre_ping=True)
        try:
            with Session(stage_engine) as session, session.begin():
                # The source schema intentionally makes revisions and run input
                # snapshots immutable. The isolated staging copy must pass
                # through that guard only for this secret-redaction transform.
                session.execute(text(
                    "DROP TRIGGER provider_configurations_immutable "
                    "ON provider_configurations"
                ))
                session.execute(text("DROP TRIGGER runs_snapshot_immutable ON runs"))
                providers = session.scalars(select(ProviderConfiguration)).all()
                for provider in providers:
                    provider.secret_reference = f"restored-unconfigured:{provider.id}"
                runs = session.scalars(select(Run)).all()
                for run in runs:
                    run.config_snapshot = _sanitize_snapshot(
                        run.config_snapshot, run.provider_configuration_id
                    )
                session.flush()
                session.execute(text(
                    "CREATE TRIGGER provider_configurations_immutable "
                    "BEFORE UPDATE ON provider_configurations "
                    "FOR EACH ROW EXECUTE FUNCTION reject_revision_mutation()"
                ))
                session.execute(text(
                    "CREATE TRIGGER runs_snapshot_immutable BEFORE UPDATE ON runs "
                    "FOR EACH ROW EXECUTE FUNCTION reject_run_snapshot_mutation()"
                ))
            _run_pg_dump(stage_url, private_dir, args, final_dump)
        except RecoveryError:
            raise
        except Exception as exc:
            raise RecoveryError("stage_database_sanitization_failed") from exc
        finally:
            stage_engine.dispose()
    finally:
        if created:
            _drop_stage_database(source_url, stage_name)
    raw_dump.unlink(missing_ok=True)
    if forbidden_values:
        _verify_dump_excludes_values(final_dump, forbidden_values)
    return final_dump


def _schema_metadata(engine) -> dict[str, str]:
    with engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        pg_version = connection.execute(text("SELECT current_setting('server_version')")).scalar_one()
    config = Config()
    config.set_main_option("script_location", str(ROOT / "backend" / "migrations"))
    head = ScriptDirectory.from_config(config).get_current_head()
    if revision != head:
        raise RecoveryError("database_migration_revision_not_current")
    return {"alembic_revision": revision, "alembic_head": head, "postgres_version": pg_version}


def _source_pins() -> dict[str, str]:
    try:
        minio = json.loads((ROOT / "infra" / "minio" / "provenance.json").read_text(encoding="utf-8"))
        revision = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=10, check=True,
        ).stdout.strip()
        runtime_path = Path.home() / ".cache" / "job-search-platform" / "hermes-runtime.json"
        runtime = json.loads(runtime_path.read_text(encoding="utf-8"))
        image = runtime["image"]
        if not isinstance(image, str) or not image:
            raise ValueError
        return {
            "application_revision": revision,
            "minio_source_commit": str(minio["source_commit"]),
            "hermes_runtime_image": image,
        }
    except (OSError, subprocess.SubprocessError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise RecoveryError("source_pin_metadata_unavailable") from exc


def _target_archive(path: Path) -> tuple[Path, Path]:
    if path.exists() or path.is_symlink():
        raise RecoveryError("backup_destination_must_be_new")
    parent = path.expanduser().absolute().parent
    if parent.is_symlink() or not parent.is_dir() or stat.S_IMODE(parent.stat().st_mode) & 0o077:
        raise RecoveryError("backup_destination_directory_must_be_private")
    if ROOT == parent.resolve() or ROOT in parent.resolve().parents:
        raise RecoveryError("backup_destination_must_be_outside_repository")
    temporary = parent / f".{path.name}.{secrets.token_hex(8)}.partial"
    return parent, temporary


def _snapshot_objects(db, client, bucket: str, work_dir: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    rows = db.scalars(select(StoredFile).order_by(StoredFile.storage_key)).all()
    if any(row.publication_state != "published" for row in rows):
        raise RecoveryError("pending_file_publication_prevents_backup")
    for index, row in enumerate(rows):
        key = row.storage_key
        if not key or key.startswith("/") or ".." in PurePosixPath(key).parts:
            raise RecoveryError("stored_object_key_invalid")
        try:
            response = client.get_object(Bucket=bucket, Key=key)
            body_stream = response["Body"]
            try:
                body = body_stream.read(MAX_OBJECT_SIZE + 1)
            finally:
                body_stream.close()
        except Exception as exc:
            raise RecoveryError("stored_object_unavailable") from exc
        checksum = hashlib.sha256(body).hexdigest()
        if len(body) != row.size_bytes or checksum != row.checksum_sha256:
            raise RecoveryError("stored_object_checksum_mismatch")
        name = f"objects/{index:08d}.blob"
        object_path = work_dir / name
        object_path.parent.mkdir(mode=0o700, exist_ok=True)
        object_path.write_bytes(body)
        entries.append({
            "archive_path": name,
            "storage_key": key,
            "file_id": str(row.id),
            "size_bytes": len(body),
            "sha256": checksum,
        })
    return entries


def _reconcile_native_state(engine) -> None:
    """Use the production exact-identity cleanup path before offline capture."""
    import asyncio
    from sqlalchemy.orm import sessionmaker
    from job_search_platform.workers.queue import PostgresRunQueue
    from job_search_platform.workers.supervisor import WorkerSupervisor
    from job_search_platform.integrations.hermes_runtime import HermesRuntime

    metadata_path = Path.home() / ".cache" / "job-search-platform" / "hermes-runtime.json"
    from sqlalchemy.orm import Session
    with Session(engine) as session:
        active = session.scalars(
            select(Run).where(Run.status.in_(("running", "waiting_approval")))
        ).all()
        if any(
            run.status == "waiting_approval"
            or not any(value is not None for value in (run.execution_pid, run.sandbox_id, run.adapter_instance_id))
            for run in active
        ):
            raise RecoveryError("active_execution_requires_graceful_app_shutdown")
    try:
        runtime_data = json.loads(metadata_path.read_text(encoding="utf-8"))
        runtime = HermesRuntime(
            runtime_data["image"],
            environment=Path(runtime_data["environment"]),
            hermes_source=Path(runtime_data["hermes"]["source"]),
            career_ops_source=Path(runtime_data["career-ops"]["source"]),
        )
        sessions = sessionmaker(bind=engine, expire_on_commit=False)
        queue = PostgresRunQueue(sessions)
        supervisor = WorkerSupervisor(sessions, queue, object(), runtime)
        asyncio.run(supervisor.reconcile_startup())
    except Exception as exc:
        raise RecoveryError("native_execution_cleanup_unconfirmed") from exc
    with engine.connect() as connection:
        active = connection.execute(
            select(Run.id).where(Run.status.in_(("running", "waiting_approval"))).limit(1)
        ).first()
    if active:
        raise RecoveryError("active_execution_requires_graceful_app_shutdown")


def create_backup(args) -> dict[str, object]:
    private_dir = _private_dir(args.private_dir)
    bucket = args.bucket
    db_url = _db_url(args, private_dir)
    destination = args.archive.expanduser().absolute()
    _parent, temporary = _target_archive(destination)
    # Hold the target lock for the whole capture; an application lifetime lock
    # must be released through an explicit, graceful shutdown first.
    with acquire_maintenance_lock(private_dir, db_url.render_as_string(hide_password=True), bucket):
        assert_restore_ready(private_dir, db_url.render_as_string(hide_password=True), bucket)
        engine = create_engine(db_url, pool_pre_ping=True)
        try:
            _reconcile_native_state(engine)
            schema = _schema_metadata(engine)
            with engine.connect() as connection:
                # A queued run would be dispatched after restart. Preserve the
                # truthful interruption state instead of replaying it.
                queued = connection.execute(select(Run.id).where(Run.status == "queued")).all()
            if queued:
                _interrupt_queued(engine, [row[0] for row in queued])
                schema = _schema_metadata(engine)
            client = _s3(private_dir, args)
            with tempfile.TemporaryDirectory(prefix="jsp-backup-", dir=private_dir) as temp_name:
                work_dir = Path(temp_name)
                dump = _sanitized_stage_dump(db_url, private_dir, args, work_dir)
                with Session(engine) as session:
                    object_manifest = _snapshot_objects(session, client, bucket, work_dir)
                manifest = {
                    "format": "job-search-platform-recovery-v1",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "source_database": args.database,
                    "source_bucket": bucket,
                    "schema": schema,
                    "source_pins": _source_pins(),
                    "objects": object_manifest,
                    "authentication": "owner sessions, launch nonces and grants are invalidated on restore",
                }
                manifest_path = work_dir / "manifest.json"
                manifest_path.write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":")), encoding="utf-8")
                manifest_path.chmod(0o600)
                with tarfile.open(temporary, "w:gz") as archive:
                    archive.add(dump, arcname="database.dump", recursive=False)
                    archive.add(manifest_path, arcname="manifest.json", recursive=False)
                    for entry in object_manifest:
                        archive.add(work_dir / str(entry["archive_path"]), arcname=str(entry["archive_path"]), recursive=False)
            os.chmod(temporary, 0o600)
            os.replace(temporary, destination)
            return {"status": "created", "archive": str(destination), "objects": len(object_manifest)}
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
        finally:
            engine.dispose()


def _interrupt_queued(engine, run_ids) -> None:
    from job_search_platform.services.runs import append_event
    from sqlalchemy.orm import Session
    from job_search_platform.db.models import Run as RunModel

    with Session(engine) as session, session.begin():
        for run_id in run_ids:
            run = session.get(RunModel, run_id, with_for_update=True)
            if run is None or run.status != "queued":
                continue
            run.status = "interrupted"
            run.finished_at = datetime.now(timezone.utc)
            append_event(session, run, "run_interrupted", {"message_key": "errors.maintenance_window"})


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--archive", type=Path, required=True)
    result.add_argument("--private-dir", type=Path, default=Path(os.environ.get("CORE02_PRIVATE_DIR", DEFAULT_PRIVATE_DIR)))
    result.add_argument("--database", default=DEFAULT_DATABASE)
    result.add_argument("--bucket", default=os.environ.get("JSP_PRIVATE_BUCKET", DEFAULT_BUCKET))
    result.add_argument("--postgres-port", type=int, default=_port("CORE02_POSTGRES_PORT", 55432))
    result.add_argument("--minio-port", type=int, default=_port("CORE02_MINIO_PORT", 59000))
    return result


def main(argv: list[str] | None = None) -> int:
    try:
        result = create_backup(parser().parse_args(argv))
    except Exception as exc:
        reason = exc.args[0] if isinstance(exc, RecoveryError) else "backup_failed"
        print(json.dumps({"status": "failed", "reason": str(reason)}, sort_keys=True), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
