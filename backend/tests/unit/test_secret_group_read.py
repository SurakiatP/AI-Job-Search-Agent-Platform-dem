"""CORE02_SECRETS_GROUP_READ: servers let non-root containers read secrets through the jsp group."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
import local_infra  # noqa: E402
import backup  # noqa: E402
import prove_storage  # noqa: E402
from job_search_platform import main as app_main  # noqa: E402
from job_search_platform.api import mcp_tasks  # noqa: E402
from job_search_platform.integrations import gateway  # noqa: E402

GOOD = (0o640,)
BAD = (0o660, 0o644, 0o604, 0o650)


def _secret(tmp_path, mode):
    path = tmp_path / "s"
    path.write_text("v\n")
    path.chmod(mode)
    return path


def test_check_secret_file_flag_accepts_only_0640(tmp_path, monkeypatch):
    monkeypatch.setenv("CORE02_SECRETS_GROUP_READ", "1")
    local_infra._check_secret_file(_secret(tmp_path, 0o640))
    local_infra._check_secret_file(_secret(tmp_path, 0o600))
    for mode in BAD:
        with pytest.raises(local_infra.ConfigurationError, match="credential_file_permissions"):
            local_infra._check_secret_file(_secret(tmp_path, mode))


def test_check_secret_file_without_flag_rejects_0640(tmp_path, monkeypatch):
    monkeypatch.delenv("CORE02_SECRETS_GROUP_READ", raising=False)
    with pytest.raises(local_infra.ConfigurationError, match="credential_file_permissions"):
        local_infra._check_secret_file(_secret(tmp_path, 0o640))


def test_ensure_credentials_creates_0640_with_flag_0600_without(tmp_path, monkeypatch):
    for flag, mode in (("1", 0o640), (None, 0o600)):
        private = tmp_path / f"p{flag}"
        private.mkdir(mode=0o700)
        if flag:
            monkeypatch.setenv("CORE02_SECRETS_GROUP_READ", flag)
        else:
            monkeypatch.delenv("CORE02_SECRETS_GROUP_READ", raising=False)
        local_infra.ensure_credentials(private)
        names = (*local_infra.SECRET_NAMES, *local_infra.DERIVED_NAMES, local_infra.APP_KEY_FILE)
        for name in names:
            assert (private / name).stat().st_mode & 0o777 == mode, name


def test_ensure_credentials_tightens_wider_never_widens(tmp_path, monkeypatch):
    monkeypatch.setenv("CORE02_SECRETS_GROUP_READ", "1")
    private = tmp_path / "p"
    private.mkdir(mode=0o700)
    local_infra.ensure_credentials(private)
    local_infra.ensure_credentials(private)  # existing 0640 files stay valid
    (private / "postgres-user").chmod(0o600)
    local_infra.ensure_credentials(private)
    local_infra.group_readable_private_files(private)
    assert (private / "postgres-user").stat().st_mode & 0o777 == 0o640


def test_compose_environment_sets_secrets_gid(tmp_path):
    env = local_infra.compose_environment(tmp_path, tmp_path)
    assert env["CORE02_SECRETS_GID"] == str(os.stat(tmp_path).st_gid)


def test_python_readers_accept_0640_only_with_flag(tmp_path, monkeypatch):
    for mode in GOOD + BAD:
        path = _secret(tmp_path, mode)
        for flag in ("1", None):
            if flag:
                monkeypatch.setenv("CORE02_SECRETS_GROUP_READ", flag)
            else:
                monkeypatch.delenv("CORE02_SECRETS_GROUP_READ", raising=False)
            ok = mode in GOOD and flag is not None
            assert (gateway.read_private_file(tmp_path, "s") is not None) is ok, (mode, flag)
            try:
                backup._read_secret(tmp_path, "s")
                got = True
            except backup.RecoveryError:
                got = False
            assert got is ok, (mode, flag)
            try:
                prove_storage._secret(tmp_path, "s")
                got = True
            except local_infra.ConfigurationError:
                got = False
            assert got is ok, (mode, flag)
        path.unlink()


def test_request_state_key_and_main_accept_0640_with_flag(tmp_path, monkeypatch):
    monkeypatch.setenv("CORE02_SECRETS_GROUP_READ", "1")
    key = mcp_tasks.mcp_request_state_key(tmp_path)
    (tmp_path / "mcp-request-state-key").chmod(0o640)
    assert mcp_tasks.mcp_request_state_key(tmp_path) == key
    monkeypatch.setattr(app_main, "PRIVATE_DIR", tmp_path)
    _secret(tmp_path, 0o640)
    assert app_main._private_text("s") == "v"
    (tmp_path / "s").chmod(0o660)
    with pytest.raises(RuntimeError, match="private_runtime_credentials_unavailable"):
        app_main._private_text("s")
