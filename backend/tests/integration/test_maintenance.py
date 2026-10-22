from __future__ import annotations

import os
import stat

import pytest

from job_search_platform.services.errors import ServiceError
from job_search_platform.services.maintenance import (
    acquire_maintenance_lock, assert_restore_ready, clear_restore_incomplete,
    maintenance_lock_path, mark_restore_incomplete,
)


def test_lock_identity_ignores_credentials_and_changes_for_database_or_bucket(tmp_path):
    first = maintenance_lock_path(
        tmp_path, "postgresql+psycopg://user:secret@localhost:5432/platform?token=x", "private"
    )
    same = maintenance_lock_path(
        tmp_path, "postgresql+psycopg://other:password@localhost:5432/platform?sslkey=y", "private"
    )
    assert first == same
    assert "secret" not in str(first) and "password" not in str(first)
    assert first != maintenance_lock_path(
        tmp_path, "postgresql+psycopg://user:secret@localhost:5432/other", "private"
    )
    assert first == maintenance_lock_path(tmp_path, "postgres://localhost/platform", "private")
    assert first == maintenance_lock_path(tmp_path, "postgres://[::1]/platform", "private")
    assert first == maintenance_lock_path(tmp_path, "postgres://127.0.0.1/platform", "private")
    assert first != maintenance_lock_path(
        tmp_path, "postgresql+psycopg://user:secret@localhost:5432/platform", "another"
    )


def test_lock_is_private_noninheritable_exclusive_and_released(tmp_path):
    first = acquire_maintenance_lock(tmp_path, "postgresql://localhost/platform", "private")
    assert first.held
    assert not os.get_inheritable(first._descriptor)
    assert stat.S_IMODE(first.path.stat().st_mode) == 0o600
    assert stat.S_IMODE(first.path.parent.stat().st_mode) == 0o700
    with pytest.raises(ServiceError, match="maintenance_active"):
        acquire_maintenance_lock(tmp_path, "postgresql://localhost/platform", "private")
    first.release()
    assert not first.held
    with acquire_maintenance_lock(tmp_path, "postgresql://localhost/platform", "private"):
        pass


def test_lock_rejects_private_root_and_lock_path_symlinks(tmp_path):
    root_target = tmp_path / "target"
    root_target.mkdir(mode=0o700)
    root_link = tmp_path / "root-link"
    root_link.symlink_to(root_target, target_is_directory=True)
    with pytest.raises(RuntimeError, match="maintenance_private_directory_invalid"):
        acquire_maintenance_lock(root_link, "postgresql://localhost/platform", "private")

    private = tmp_path / "private"
    private.mkdir(mode=0o700)
    link_parent = private / "maintenance"
    link_parent.symlink_to(root_target, target_is_directory=True)
    with pytest.raises(RuntimeError, match="maintenance_lock_directory_invalid"):
        acquire_maintenance_lock(private, "postgresql://localhost/platform", "private")


def test_incomplete_restore_marker_blocks_startup_until_explicit_success(tmp_path):
    target = (tmp_path, "postgresql://localhost/platform", "private")
    assert_restore_ready(*target)
    marker = mark_restore_incomplete(*target)
    assert stat.S_IMODE(marker.stat().st_mode) == 0o600
    with pytest.raises(ServiceError, match="restore_incomplete"):
        assert_restore_ready(*target)
    clear_restore_incomplete(*target)
    assert_restore_ready(*target)
