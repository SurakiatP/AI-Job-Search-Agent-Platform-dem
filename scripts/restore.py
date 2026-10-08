"""Restore a private CORE-10 archive to an explicitly empty target."""

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
from pathlib import Path, PurePosixPath

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backup as backup_support
from backup import RecoveryError
from job_search_platform.services.maintenance import (
    acquire_maintenance_lock, clear_restore_incomplete, mark_restore_incomplete,
)


def _read_archive(path: Path, work_dir: Path) -> tuple[dict, Path, list[tuple[dict, Path]]]:
    if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise RecoveryError("backup_archive_permissions_or_path_invalid")
    try:
        archive = tarfile.open(path, "r:gz")
    except (OSError, tarfile.TarError) as exc:
        raise RecoveryError("backup_archive_invalid") from exc
    with archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or "manifest.json" not in names or "database.dump" not in names:
            raise RecoveryError("backup_archive_manifest_invalid")
        if any(not member.isfile() or member.name.startswith("/") or ".." in PurePosixPath(member.name).parts for member in members):
            raise RecoveryError("backup_archive_member_invalid")
        manifest_bytes = _member_bytes(archive, "manifest.json", 1024 * 1024)
        try:
            manifest = json.loads(manifest_bytes)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise RecoveryError("backup_archive_manifest_invalid") from exc
        if not isinstance(manifest, dict) or manifest.get("format") != "job-search-platform-recovery-v1":
            raise RecoveryError("backup_archive_version_unsupported")
        dump_member = next((member for member in members if member.name == "database.dump"), None)
        if dump_member is None or dump_member.size <= 0 or dump_member.size > 20 * 1024**3:
            raise RecoveryError("backup_archive_database_dump_invalid")
        dump_path = work_dir / "database.dump"
        dump_path.write_bytes(_member_bytes(archive, "database.dump", dump_member.size))
        listed = manifest.get("objects")
        if not isinstance(listed, list):
            raise RecoveryError("backup_archive_objects_invalid")
        expected_names = {"manifest.json", "database.dump"}
        checked: list[tuple[dict, Path]] = []
        for index, entry in enumerate(listed):
            if not isinstance(entry, dict):
                raise RecoveryError("backup_archive_objects_invalid")
            name = entry.get("archive_path")
            if name != f"objects/{index:08d}.blob" or name in expected_names:
                raise RecoveryError("backup_archive_object_path_invalid")
            expected_names.add(name)
            key = entry.get("storage_key")
            if not isinstance(key, str) or not key or key.startswith("/") or ".." in PurePosixPath(key).parts:
                raise RecoveryError("backup_archive_object_key_invalid")
            size = entry.get("size_bytes")
            digest = entry.get("sha256")
            if not isinstance(size, int) or not 0 <= size <= backup_support.MAX_OBJECT_SIZE:
                raise RecoveryError("backup_archive_object_size_invalid")
            if not isinstance(digest, str) or len(digest) != 64:
                raise RecoveryError("backup_archive_object_checksum_invalid")
            body = _member_bytes(archive, name, backup_support.MAX_OBJECT_SIZE)
            if len(body) != size or hashlib.sha256(body).hexdigest() != digest:
                raise RecoveryError("backup_archive_object_checksum_mismatch")
            object_path = work_dir / f"object-{index:08d}.blob"
            object_path.write_bytes(body)
            checked.append((entry, object_path))
        if set(names) != expected_names:
            raise RecoveryError("backup_archive_unexpected_members")
        return manifest, dump_path, checked


def _member_bytes(archive: tarfile.TarFile, name: str, limit: int) -> bytes:
    try:
        member = archive.getmember(name)
    except KeyError as exc:
        raise RecoveryError("backup_archive_member_missing") from exc
    if member.size > limit:
        raise RecoveryError("backup_archive_member_too_large")
    stream = archive.extractfile(member)
    if stream is None:
        raise RecoveryError("backup_archive_member_invalid")
    with stream:
        return stream.read(limit + 1)


def _current_metadata() -> tuple[dict[str, str], str]:
    pins = backup_support._source_pins()
    cfg = backup_support.Config()
    cfg.set_main_option("script_location", str(backup_support.ROOT / "backend" / "migrations"))
    head = backup_support.ScriptDirectory.from_config(cfg).get_current_head()
    return pins, head


def _assert_target_empty(engine) -> str:
    with engine.connect() as connection:
        version = connection.execute(text("SELECT current_setting('server_version')")).scalar_one()
        objects = connection.execute(text("""
            SELECT count(*) FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND c.relkind IN ('r','p','v','m','S','f')
        """)).scalar_one()
        schemas = connection.execute(text("""
            SELECT count(*) FROM pg_namespace
            WHERE left(nspname, 3) <> 'pg_'
              AND nspname NOT IN ('information_schema', 'public')
        """)).scalar_one()
    if objects or schemas:
        raise RecoveryError("restore_database_target_must_be_empty")
    return version


def _assert_bucket_empty(client, bucket: str) -> None:
    try:
        response = client.list_objects_v2(Bucket=bucket, MaxKeys=1)
    except Exception as exc:
        raise RecoveryError("restore_object_target_unavailable") from exc
    if response.get("KeyCount", 0) or response.get("Contents"):
        raise RecoveryError("restore_bucket_target_must_be_empty")


def _restore_dump(dump: Path, private_dir: Path, args) -> None:
    username = backup_support._read_secret(private_dir, "postgres-user")
    password = backup_support._read_secret(private_dir, "postgres-password")
    passfile = backup_support._temp_pgpass(private_dir, username, password, args.postgres_port, args.target_database)
    env = os.environ.copy()
    env.update({
        "PGPASSFILE": str(passfile), "PGHOST": "127.0.0.1", "PGPORT": str(args.postgres_port),
        "PGUSER": username, "PGDATABASE": args.target_database,
    })
    try:
        result = subprocess.run(
            ["pg_restore", "--exit-on-error", "--no-owner", "--no-acl", "--single-transaction", "--dbname", args.target_database, str(dump)],
            env=env, capture_output=True, timeout=1800, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecoveryError("postgres_restore_unavailable_or_timed_out") from exc
    finally:
        passfile.unlink(missing_ok=True)
    if result.returncode:
        raise RecoveryError("postgres_restore_failed")


def _invalidate_auth_and_keychain(engine) -> None:
    from job_search_platform.db.models import Grant, OwnerLaunchNonce, OwnerSession, ProviderConfiguration, Run

    with Session(engine) as session, session.begin():
        session.query(OwnerLaunchNonce).delete(synchronize_session=False)
        session.query(OwnerSession).filter(OwnerSession.revoked_at.is_(None)).update(
            {OwnerSession.revoked_at: text("clock_timestamp()")}, synchronize_session=False
        )
        session.query(Grant).filter(Grant.revoked_at.is_(None)).update(
            {Grant.revoked_at: text("clock_timestamp()")}, synchronize_session=False
        )
        # Rewriting immutable revision/run snapshots is only allowed in this
        # isolated restore transaction. The same inert form is used by backup.
        session.execute(text("DROP TRIGGER provider_configurations_immutable ON provider_configurations"))
        session.execute(text("DROP TRIGGER runs_snapshot_immutable ON runs"))
        for provider in session.query(ProviderConfiguration).all():
            provider.secret_reference = f"restored-unconfigured:{provider.id}"
        for run in session.query(Run).all():
            run.config_snapshot = backup_support._sanitize_snapshot(
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


def _verify_file_rows(engine, entries: list[tuple[dict, Path]]) -> None:
    from job_search_platform.db.models import StoredFile

    expected = {str(entry["storage_key"]): entry for entry, _path in entries}
    with Session(engine) as session:
        rows = session.query(StoredFile).all()
        if len(rows) != len(expected):
            raise RecoveryError("restored_file_metadata_mismatch")
        for row in rows:
            item = expected.get(row.storage_key)
            if item is None or row.id.hex != str(item["file_id"]).replace("-", ""):
                raise RecoveryError("restored_file_metadata_mismatch")
            if row.publication_state != "published" or row.size_bytes != item["size_bytes"] or row.checksum_sha256 != item["sha256"]:
                raise RecoveryError("restored_file_metadata_mismatch")


def restore(args) -> dict[str, object]:
    private_dir = backup_support._private_dir(args.private_dir)
    target_bucket = args.target_bucket
    if not target_bucket or "/" in target_bucket:
        raise RecoveryError("restore_bucket_target_invalid")
    if not (args.target_database.startswith("jsp_test_") or args.target_database.startswith("jsp_restore_")) and not args.allow_owner_data:
        raise RecoveryError("owner_data_restore_requires_explicit_flag")
    target_url = URL.create(
        "postgresql+psycopg", username=backup_support._read_secret(private_dir, "postgres-user"),
        password=backup_support._read_secret(private_dir, "postgres-password"), host="127.0.0.1",
        port=args.postgres_port, database=args.target_database,
    )
    with tempfile.TemporaryDirectory(prefix="jsp-restore-", dir=private_dir) as temp_name:
        work_dir = Path(temp_name)
        manifest, dump, objects = _read_archive(args.archive.expanduser().absolute(), work_dir)
        pins, migration_head = _current_metadata()
        if manifest.get("source_pins") != pins:
            raise RecoveryError("restore_source_pins_mismatch")
        schema = manifest.get("schema")
        if not isinstance(schema, dict) or schema.get("alembic_revision") != migration_head or schema.get("alembic_head") != migration_head:
            raise RecoveryError("restore_migration_revision_mismatch")
        if manifest.get("source_database") == args.target_database or manifest.get("source_bucket") == target_bucket:
            raise RecoveryError("restore_target_must_be_distinct")
        with acquire_maintenance_lock(private_dir, target_url.render_as_string(hide_password=True), target_bucket):
            engine = create_engine(target_url, pool_pre_ping=True)
            client = backup_support._s3(private_dir, args)
            try:
                target_version = _assert_target_empty(engine)
                if target_version.split(".", 1)[0] != str(schema.get("postgres_version", "")).split(".", 1)[0]:
                    raise RecoveryError("restore_postgres_major_version_mismatch")
                _assert_bucket_empty(client, target_bucket)
                mark_restore_incomplete(private_dir, target_url.render_as_string(hide_password=True), target_bucket)
                uploaded: list[str] = []
                try:
                    for item, object_path in objects:
                        body = object_path.read_bytes()
                        client.put_object(
                            Bucket=target_bucket, Key=item["storage_key"], Body=body,
                            Metadata={"sha256": item["sha256"]},
                        )
                        uploaded.append(str(item["storage_key"]))
                    for item, _object_path in objects:
                        response = client.get_object(Bucket=target_bucket, Key=item["storage_key"])
                        with response["Body"] as body_stream:
                            body = body_stream.read(backup_support.MAX_OBJECT_SIZE + 1)
                        if len(body) != item["size_bytes"] or hashlib.sha256(body).hexdigest() != item["sha256"]:
                            raise RecoveryError("restored_object_readiness_failed")

                    _restore_dump(dump, private_dir, args)
                    with engine.connect() as connection:
                        restored_revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                    if restored_revision != migration_head:
                        raise RecoveryError("restored_migration_revision_mismatch")
                    _verify_file_rows(engine, objects)
                    _invalidate_auth_and_keychain(engine)
                    clear_restore_incomplete(private_dir, target_url.render_as_string(hide_password=True), target_bucket)
                except BaseException:
                    # The bucket was verified empty under the lock. Remove only
                    # objects this invocation successfully created; a failed
                    # cleanup leaves the persistent marker blocking app startup.
                    for key in uploaded:
                        try:
                            client.delete_object(Bucket=target_bucket, Key=key)
                        except Exception:
                            pass
                    raise
                return {"status": "restored", "database": args.target_database, "bucket": target_bucket, "objects": len(objects), "authentication": "reset"}
            finally:
                engine.dispose()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--archive", type=Path, required=True)
    result.add_argument("--target-database", required=True)
    result.add_argument("--target-bucket", required=True)
    result.add_argument("--allow-owner-data", action="store_true", help="permit an explicitly empty non-synthetic database name")
    result.add_argument("--private-dir", type=Path, default=Path(os.environ.get("CORE02_PRIVATE_DIR", backup_support.DEFAULT_PRIVATE_DIR)))
    result.add_argument("--postgres-port", type=int, default=backup_support._port("CORE02_POSTGRES_PORT", 55432))
    result.add_argument("--minio-port", type=int, default=backup_support._port("CORE02_MINIO_PORT", 59000))
    return result


def main(argv: list[str] | None = None) -> int:
    try:
        result = restore(parser().parse_args(argv))
    except Exception as exc:
        reason = exc.args[0] if isinstance(exc, RecoveryError) else "restore_failed"
        print(json.dumps({"status": "failed", "reason": str(reason)}, sort_keys=True), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
