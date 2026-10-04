"""Process-wide local maintenance locks for one database and object bucket.

The lock is deliberately an OS file lock: an application process keeps it for
its full lifetime and offline recovery tools must acquire the same lock before
touching either store. It is local coordination, not a distributed lock.
"""

from __future__ import annotations

import fcntl
import hashlib
import os
import stat
from pathlib import Path
from urllib.parse import unquote, urlsplit

from job_search_platform.services.errors import ServiceError


def _database_target(database_url: str) -> str:
    parsed = urlsplit(database_url)
    if not parsed.scheme or not parsed.path:
        raise ValueError("database_target_invalid")
    # Userinfo and query values can contain credentials. Exclude both entirely.
    host = parsed.hostname or "local"
    host = host.casefold()
    if host in {"localhost", "127.0.0.1", "::1"}:
        host = "loopback"
    port = parsed.port or 0
    database = unquote(parsed.path.lstrip("/"))
    scheme = parsed.scheme.split("+", 1)[0]
    if scheme == "postgres":
        scheme = "postgresql"
    if scheme in {"postgresql", "mysql", "mariadb"} and port == 0:
        port = {"postgresql": 5432, "mysql": 3306, "mariadb": 3306}[scheme]
    return f"{scheme}|{host.casefold()}|{port}|{database}"


def maintenance_lock_path(
    private_dir: str | Path, database_url: str, bucket: str
) -> Path:
    """Return a stable private lock path without exposing connection details."""
    if not bucket or "/" in bucket or "\\" in bucket:
        raise ValueError("object_bucket_invalid")
    target = f"{_database_target(database_url)}|{bucket}"
    digest = hashlib.sha256(target.encode("utf-8")).hexdigest()
    return Path(private_dir).expanduser() / "maintenance" / f"{digest}.lock"


def restore_incomplete_path(private_dir: str | Path, database_url: str, bucket: str) -> Path:
    """Return the private fail-closed marker path for a restore target."""
    lock_path = maintenance_lock_path(private_dir, database_url, bucket)
    return lock_path.with_suffix(".restore-incomplete")


def mark_restore_incomplete(private_dir: str | Path, database_url: str, bucket: str) -> Path:
    """Persist a target quarantine marker before the first restore write."""
    path = restore_incomplete_path(private_dir, database_url, bucket)
    root = Path(private_dir).expanduser()
    if root.is_symlink():
        raise RuntimeError("maintenance_private_directory_invalid")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root_info = root.stat()
    if not root.is_dir() or root_info.st_uid != os.getuid() or stat.S_IMODE(root_info.st_mode) & 0o077:
        raise RuntimeError("maintenance_private_directory_permissions")
    path.parent.mkdir(mode=0o700, exist_ok=True)
    parent_info = path.parent.stat()
    if (path.parent.is_symlink() or not path.parent.is_dir() or parent_info.st_uid != os.getuid()
            or stat.S_IMODE(parent_info.st_mode) & 0o077):
        raise RuntimeError("maintenance_lock_directory_invalid")
    if path.is_symlink():
        raise RuntimeError("restore_marker_invalid")
    if path.exists():
        info = path.stat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) & 0o077
                or path.read_bytes() != b"restore_incomplete\n"):
            raise RuntimeError("restore_marker_invalid")
        return path
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.write(descriptor, b"restore_incomplete\n")
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    directory_fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return path


def clear_restore_incomplete(private_dir: str | Path, database_url: str, bucket: str) -> None:
    """Clear quarantine after database and objects pass all readiness checks."""
    path = restore_incomplete_path(private_dir, database_url, bucket)
    if path.is_symlink():
        raise RuntimeError("restore_marker_invalid")
    if path.exists():
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
            raise RuntimeError("restore_marker_invalid")
        path.unlink()
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)


def assert_restore_ready(private_dir: str | Path, database_url: str, bucket: str) -> None:
    """Refuse application startup while a restore is incomplete."""
    path = restore_incomplete_path(private_dir, database_url, bucket)
    if path.is_symlink() or path.exists():
        raise ServiceError("restore_incomplete")


class MaintenanceLock:
    """An acquired exclusive lock. Closing releases it."""

    def __init__(self, descriptor: int, path: Path) -> None:
        self._descriptor = descriptor
        self.path = path

    @property
    def held(self) -> bool:
        return self._descriptor >= 0

    def close(self) -> None:
        descriptor = self._descriptor
        if descriptor < 0:
            return
        self._descriptor = -1
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)

    release = close

    def __enter__(self) -> "MaintenanceLock":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


def acquire_maintenance_lock(
    private_dir: str | Path,
    database_url: str,
    bucket: str,
    *,
    blocking: bool = False,
) -> MaintenanceLock:
    """Acquire the per-target lock or fail with the stable active code.

    The directory and file are private, symlinks are rejected, and the open
    descriptor is non-inheritable so child processes cannot keep the lock.
    """
    path = maintenance_lock_path(private_dir, database_url, bucket)
    parent = path.parent
    root = Path(private_dir).expanduser()
    if root.is_symlink():
        raise RuntimeError("maintenance_private_directory_invalid")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root_info = root.stat()
    if not root.is_dir() or root_info.st_uid != os.getuid() or stat.S_IMODE(root_info.st_mode) & 0o077:
        raise RuntimeError("maintenance_private_directory_permissions")
    parent.mkdir(mode=0o700, exist_ok=True)
    parent_info = parent.stat()
    if (parent.is_symlink() or not parent.is_dir() or parent_info.st_uid != os.getuid()
            or stat.S_IMODE(parent_info.st_mode) & 0o077):
        raise RuntimeError("maintenance_lock_directory_invalid")
    flags = os.O_CREAT | os.O_RDWR
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    os.set_inheritable(descriptor, False)
    try:
        lock_info = os.fstat(descriptor)
        if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != os.getuid():
            raise RuntimeError("maintenance_lock_file_invalid")
        os.fchmod(descriptor, 0o600)
        operation = fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB)
        try:
            fcntl.flock(descriptor, operation)
        except BlockingIOError:
            raise ServiceError("maintenance_active") from None
        return MaintenanceLock(descriptor, path)
    except BaseException:
        os.close(descriptor)
        raise
