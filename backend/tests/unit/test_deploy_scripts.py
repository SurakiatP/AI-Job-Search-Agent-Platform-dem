"""WP1 part 2: deploy helpers refuse unsafe states (placeholders, open perms, schema mismatch, failed health)."""
from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
DEPLOY = ROOT / "infra/deploy"


def _sh(script: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["bash", "-c", f"set -euo pipefail; source '{DEPLOY / 'lib.sh'}'; {script}"],
                          capture_output=True, text=True, env={**os.environ, **(env or {})}, timeout=30)


def _env_file(tmp_path: Path, text: str, mode: int = 0o600) -> Path:
    path = tmp_path / "app.env"
    path.write_text(text)
    path.chmod(mode)
    return path


def test_example_has_every_name_and_only_placeholders():
    text = (DEPLOY / "app.env.example").read_text()
    for name in ("DOMAIN", "ACME_EMAIL", "APP_PUBLIC_ORIGIN", "SHARE_PUBLIC_ORIGIN", "CORE02_PRIVATE_DIR",
                 "METRICS_PORT", "OPENROUTER_API_KEY", "SMTP_HOST", "SMTP_PASSWORD", "CORE02_COMPOSE_OVERRIDE"):
        assert f"\n{name}=" in "\n" + text, name
    assert "sk-or-" not in text and "CHANGE_ME" in text


def test_check_app_env_rejects_placeholder(tmp_path):
    path = _env_file(tmp_path, "DOMAIN=CHANGE_ME\n")
    result = _sh(f"check_app_env '{path}'")
    assert result.returncode != 0 and "CHANGE_ME" in result.stderr


def test_check_app_env_rejects_group_or_world_readable(tmp_path):
    path = _env_file(tmp_path, "DOMAIN=example.test\n", mode=0o644)
    result = _sh(f"check_app_env '{path}'")
    assert result.returncode != 0 and "0600" in result.stderr


def test_check_app_env_accepts_complete_private_file(tmp_path):
    path = _env_file(tmp_path, "DOMAIN=example.test\nACME_EMAIL=ops@example.test\n")
    assert _sh(f"check_app_env '{path}'").returncode == 0


def test_real_example_filled_in_passes_check(tmp_path):
    lines = [ln.replace("CHANGE_ME", "x") if not ln.lstrip().startswith("#") else ln
             for ln in (DEPLOY / "app.env.example").read_text().splitlines()]
    path = _env_file(tmp_path, "\n".join(lines) + "\n")
    assert _sh(f"check_app_env '{path}'").returncode == 0


def test_load_app_env_parses_without_executing(tmp_path):
    pwned = tmp_path / "pwned"
    path = _env_file(tmp_path, "# c\n\nCADDY_TLS=tls internal\nSMTP_PASSWORD=a$b c\"d\nQUOTED=\"x y\"\n"
                               f"EVIL=$(touch {pwned})\n")
    result = _sh(f"load_app_env '{path}'; printf '%s|%s|%s|%s' \"$CADDY_TLS\" \"$SMTP_PASSWORD\" \"$QUOTED\" \"$EVIL\"")
    assert result.returncode == 0, result.stderr
    assert result.stdout == f'tls internal|a$b c"d|x y|$(touch {pwned})'
    assert not pwned.exists()


def test_load_app_env_rejects_bad_key(tmp_path):
    path = _env_file(tmp_path, "bad key=1\n")
    assert _sh(f"load_app_env '{path}'").returncode != 0


def test_deploy_scripts_do_not_source_env():
    for name in ("deploy.sh", "bootstrap.sh"):
        text = (DEPLOY / name).read_text()
        assert 'source "$env_file"' not in text and 'load_app_env "$env_file"' in text and "CURL_EXTRA=-k" in text


def _stub(tmp_path: Path, name: str, body: str) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    path = bin_dir / name
    path.write_text("#!/usr/bin/env bash\n" + body + "\n")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def test_wait_ready_fails_after_deadline(tmp_path):
    _stub(tmp_path, "curl", "exit 22")
    result = _sh("wait_ready https://example.test/api/v1/health/ready 2",
                 {"PATH": f"{tmp_path / 'bin'}:{os.environ['PATH']}"})
    assert result.returncode != 0


def test_wait_ready_resolves_domain_to_loopback(tmp_path):
    _stub(tmp_path, "curl", 'echo "$@" > "$0.args"')
    result = _sh("wait_ready https://example.test/api/v1/health/ready 5",
                 {"PATH": f"{tmp_path / 'bin'}:{os.environ['PATH']}", "DOMAIN": "example.test"})
    assert result.returncode == 0
    assert "--resolve example.test:443:127.0.0.1" in (tmp_path / "bin" / "curl.args").read_text()


def test_wait_ready_succeeds(tmp_path):
    _stub(tmp_path, "curl", "exit 0")
    result = _sh("wait_ready https://example.test/api/v1/health/ready 5",
                 {"PATH": f"{tmp_path / 'bin'}:{os.environ['PATH']}"})
    assert result.returncode == 0


@pytest.mark.parametrize("db_head,code_head,ok", [("0029_job_crawl", "0029_job_crawl", True),
                                                  ("0030_next", "0029_job_crawl", False)])
def test_rollback_guard(tmp_path, db_head, code_head, ok):
    result = _sh(f"guard_schema '{db_head}' '{code_head}'")
    assert (result.returncode == 0) is ok
    if not ok:
        assert "restore.py" in result.stderr


def test_deploy_restores_previous_release_on_failed_health():
    text = (DEPLOY / "deploy.sh").read_text()
    assert "wait_ready" in text
    fail_branch = text.split("if ! wait_ready", 1)[1].split("\nfi", 1)[0]
    assert 'ln -sfn "$previous"' in fail_branch and "systemctl restart job-search-platform" in fail_branch
    assert 'apply_infra "$previous"' in fail_branch and fail_branch.count("wait_ready") == 1 and "infra_reapplied" in fail_branch
    assert "db-head" in text and "cd '$release' && uv run --locked --project backend python scripts/migration_state.py db-head" in text
    assert '"$release.partial"' in text and 'mv "$release.partial" "$release"' in text
    assert "exit 1" in fail_branch


def test_deploy_takes_backup_before_switching():
    text = (DEPLOY / "deploy.sh").read_text()
    assert text.index("scripts/backup.py") < text.index('ln -sfn "$release"')


def test_deploy_refuses_branches_and_checks_schema_before_switch():
    text = (DEPLOY / "deploy.sh").read_text()
    assert "refs/tags/" in text
    assert text.index("migration_state.py knows") < text.index("scripts/backup.py") < text.index('ln -sfn "$release"')


def test_units_use_jsp_and_private_env():
    for name in ("job-search-platform.service", "job-search-ingest.service", "job-search-backup.service"):
        text = (DEPLOY / name).read_text()
        assert "User=jsp" in text and "EnvironmentFile=/etc/job-search-platform/private/app.env" in text
        assert "WorkingDirectory=/opt/job-search-platform/current" in text
    app = (DEPLOY / "job-search-platform.service").read_text()
    assert "--enable-sharing" in app and "Restart=on-failure" in app
    assert "OnCalendar=hourly" in (DEPLOY / "job-search-ingest.timer").read_text()
    backup_timer = (DEPLOY / "job-search-backup.timer").read_text()
    assert "OnCalendar=*-*-* 03:00:00" in backup_timer and "Persistent=true" in backup_timer
    assert "-mtime +7" in (DEPLOY / "job-search-backup.service").read_text()


def test_caddyfile_proxies_both_origins_to_loopback():
    text = (DEPLOY / "Caddyfile").read_text()
    assert "{$DOMAIN}" in text and "agents.{$DOMAIN}" in text
    assert "reverse_proxy 127.0.0.1:8000" in text and "reverse_proxy 127.0.0.1:8001" in text
    assert "{$CADDY_TLS" in text


def test_shell_scripts_parse():
    for name in ("lib.sh", "bootstrap.sh", "deploy.sh"):
        assert subprocess.run(["bash", "-n", str(DEPLOY / name)]).returncode == 0, name


def test_backup_stops_app_around_backup():
    unit = (DEPLOY / "job-search-backup.service").read_text()
    assert "After=docker.service" in unit
    assert "RuntimeDirectory=job-search-backup" in unit
    pre = next(line for line in unit.splitlines() if line.startswith("ExecStartPre="))
    post = next(line for line in unit.splitlines() if line.startswith("ExecStopPost="))
    assert "is-active --quiet job-search-platform" in pre and "was-active" in pre and "systemctl stop job-search-platform" in pre
    assert "-f /run/job-search-backup/was-active" in post and "systemctl start job-search-platform" in post
    assert "ExecStartPost=/usr/bin/find" in unit
    text = (DEPLOY / "deploy.sh").read_text()
    stop = text.index("systemctl stop job-search-platform")
    assert stop < text.index("scripts/backup.py") < text.index("systemctl start job-search-platform")
    assert "backup_ok" in text


def test_failed_deploy_leaves_app_stopped_when_previous_cannot_read_schema():
    text = (DEPLOY / "deploy.sh").read_text()
    fail_branch = text.split("if ! wait_ready", 1)[1].split("\nfi", 1)[0]
    knows = fail_branch.index("migration_state.py knows")
    assert fail_branch.index("db-head") < knows < fail_branch.index("systemctl stop job-search-platform")
    assert "guard_schema" in fail_branch and "scripts/restore.py --archive $archive" in fail_branch
    assert fail_branch.index("systemctl stop job-search-platform") < fail_branch.index("systemctl restart job-search-platform")


def test_deploy_refreshes_infra_sources_and_recovers_from_failed_infra_start():
    text = (DEPLOY / "deploy.sh").read_text()
    apply = text.split("apply_infra() {", 1)[1].split("\n}\n", 1)[0]
    for needle in ("fetch_all_pinned", "infra/hermes/setup.py --acquire --build", "/etc/systemd/system/", "daemon-reload", "local_infra.py start"):
        assert needle in apply, needle
    assert 'apply_infra "$release"' in text and 'apply_infra "$previous"' in text
    assert "fetch_pinned" in (DEPLOY / "lib.sh").read_text() and "fetch_pinned()" not in (DEPLOY / "bootstrap.sh").read_text()


def test_deploy_verifies_tag_not_branch_after_clone():
    text = (DEPLOY / "deploy.sh").read_text()
    assert "refs/tags/$tag^{commit}" in text and text.index("git clone") < text.index("refs/tags/$tag^{commit}") < text.index('mv "$release.partial"')


def test_edge_hardening():
    assert "admin off" in (DEPLOY / "Caddyfile").read_text()
    assert "ufw allow 443/udp" in (DEPLOY / "cloud-init.yaml").read_text()


def test_fetch_all_pinned_stops_at_first_failed_step(tmp_path):
    log = tmp_path / "log"
    for failing in ("pin", "fetch_pinned"):
        log.write_text("")
        pin_body = f'echo "pin $1" >> {log}; ' + ('return 1' if failing == "pin" else 'echo abc123')
        fetch_body = f'echo "fetch $1" >> {log}; ' + ('return 1' if failing == "fetch_pinned" else 'true')
        result = _sh(f"pin() {{ {pin_body}; }}; fetch_pinned() {{ {fetch_body}; }}; "
                     "if ! fetch_all_pinned; then echo FAILED; fi")
        assert "FAILED" in result.stdout, failing
        assert len(log.read_text().splitlines()) == (1 if failing == "pin" else 2), (failing, log.read_text())
    # empty commit from pin is also a failure
    log.write_text("")
    result = _sh(f"pin() {{ echo; }}; fetch_pinned() {{ echo fetch >> {log}; }}; if ! fetch_all_pinned; then echo FAILED; fi")
    assert "FAILED" in result.stdout and log.read_text() == ""


def test_apply_infra_propagates_every_step_failure():
    text = (DEPLOY / "deploy.sh").read_text()
    apply = text.split("apply_infra() {", 1)[1].split("\n}\n", 1)[0]
    steps = [line for line in apply.splitlines()[2:] if line.strip() and not line.strip().startswith("#")]
    assert len(steps) == 6 and "local_infra.py start" in steps[-1], steps
    assert all("|| return 1" in line for line in steps[:-1]), steps


def test_infra_diff_ignores_runtime_bytecode():
    assert 'diff -rq -x __pycache__ "$previous/infra" "$release/infra"' in (DEPLOY / "deploy.sh").read_text()
