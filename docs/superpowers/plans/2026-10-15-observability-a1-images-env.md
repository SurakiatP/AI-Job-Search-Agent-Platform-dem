# Observability Amendment A1 (zero-CVE images, `.env` config) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the upstream Prometheus and Grafana images with locally built images from pinned source that scan at 0 High / 0 Critical, and move every configurable compose value into `.env`.

**Architecture:** Both images follow the existing `infra/postgres` and `infra/minio` pattern:
- a clean upstream checkout outside the repo, pinned by commit in `backend/pyproject.toml`, validated by `scripts/local_infra.py`, and passed to the build as a named `additional_contexts` entry;
- a committed `go.mod`/`go.sum` overlay (with `golang.org/x/net` v0.60.0), hash-checked against `provenance.json`;
- a Go 1.27.2 builder pinned by digest.

`check_dependencies.py` already forbids `git clone` in Dockerfiles, so nothing is fetched by git at build time.

**Tech Stack:** Docker BuildKit (Colima), Go 1.27.2, Prometheus v3.15.0, Grafana 13.2.4, `grafana-prometheus-datasource` v13.2.3, Python 3.12, pytest.

**Spec:** `docs/superpowers/specs/2026-10-15-observability-metrics-design.md`, section "Amendment A1" (A1.1–A1.8).

## Global Constraints

**Working rules**
- Prefix every shell command with `rtk`. Work in the worktree `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem-worktrees/metrics` on branch `feat/observability-metrics`. Never push.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keep code and docs in English.
- Never put secrets in `.env`, `.env.example`, the repo, logs or images.

**Pinned inputs (exact values)**
- Builder: `golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61`, the same builder as `infra/postgres` and `infra/minio`.
- `golang.org/x/net`: `v0.60.0`.
- Prometheus:
  - source `https://github.com/prometheus/prometheus` at commit `5241a27fe3c6983549fccc32f6e65917408c63cd` (tag v3.15.0);
  - web UI asset `https://github.com/prometheus/prometheus/releases/download/v3.15.0/prometheus-web-ui-3.15.0.tar.gz`, sha256 `fa8c918ed05e3f89e232e9b69eccd6ed074602cd9e8a2cab7a92bec9651974ae`;
  - runtime base `quay.io/prometheus/busybox:latest@sha256:0dcbf965a16f76d5aac8905769f72e43b22862cd01f6f42c7b62955aeb489c3c` (multi-arch index).
- Grafana:
  - base `grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f` (multi-arch index);
  - plugin source `https://github.com/grafana/grafana-prometheus-datasource` at commit `6d21418acde6ce31c9f7a6418a88758842a881bb` (tag v13.2.3).
- Local image tags:
  - `job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6`
  - `job-search-platform/grafana:13.2.4-promds13.2.3-go1.27.2-6d21418acde6`

**Upstream checkouts**
- Upstream checkouts default to `~/.cache/job-search-platform/upstream/prometheus` and `~/.cache/job-search-platform/upstream/grafana-prometheus-datasource`.
- They are overridden by `PROMETHEUS_SOURCE_DIR` and `GRAFANA_PROM_DS_SOURCE_DIR`.
- Each must be a clean, detached checkout of its pinned commit, outside the repo.

**Grafana image settings**
- Remove every bundled plugin except `prometheus`, and remove `plugins-bundled/prometheus/MANIFEST.txt`.
- Set `GF_PLUGINS_PREINSTALL_DISABLED=true` and `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=prometheus`. Allow exactly that one id.
- The rebuilt plugin binary has mode 0755 and runs as user 472.

**`.env` variables and defaults**
- `CORE02_PROMETHEUS_PORT=59090`, `CORE02_GRAFANA_PORT=53300`, `CORE02_MAILPIT_SMTP_PORT=51025`, `CORE02_MAILPIT_UI_PORT=58025`.
- `PROMETHEUS_RETENTION=15d`, `GRAFANA_ADMIN_USER=admin`.
- `METRICS_PORT` (documented as `59464`) and `METRICS_HOST=127.0.0.1`.
- Existing `CORE02_*_PORT` variables stay as they are.

**Resource limits**
- Before any image build, check `df -h /`. Do not start a build with less than 20 GB free.
- Never run two image builds at the same time: the Colima VM ran out of memory when that happened.
- Builds take time: Prometheus about 20 minutes, the Grafana plugin a few minutes. After a build, run `rtk docker builder prune -f`.

**Hard limits**
- Do not touch `jobsearch-core02-*`, `plane-*` or `jsp-accounts-*` containers or volumes.
- Do not run `local_infra.py start`, and do not run `docker compose up` for this task.
- Do not touch the owner database or the `jobs` index.

**Tests**
- Integration tests use `CORE02_PRIVATE_DIR=/Users/parksurakiat/.cache/job-search-platform/core02-runtime-20261003`.
- Unit tests run with `rtk uv run --locked --project backend pytest backend/tests/unit backend/tests/test_dependency_checks.py -q`.

## Review Focus

1. **Missing upstream checkout.** If a fresh machine has no checkout, `local_infra` must fail with a clear `*_source_unavailable` error that names the variable. It must not fail in a confusing way halfway through a build. Tested in Tasks 1 and 2.
2. **Edited overlay.** If the committed `go.mod` or `go.sum` overlay is edited without updating `provenance.json`, both the build and `local_infra` must refuse it with a hash mismatch. Tested in Tasks 1 and 2.
3. **Silent signature bypass widening.** No test may let a second plugin load unsigned. The allow-list must stay exactly `prometheus`. Tested in Task 2.
4. **Ports and `.env`.** Changing a port in `.env` must change the published host port. When nothing is set, every port must equal today's value, so nothing breaks. Tested in Task 4.
5. **Committed template.** `.env.example` must never contain a secret value. The keys `OPENROUTER_API_KEY` and `LITELLM_API_KEY` must stay empty in the committed file. Tested in Task 4.

---

### Task 1: Prometheus built from pinned source

**Files:**
- Create: `infra/prometheus/Dockerfile`, `infra/prometheus/go.mod`, `infra/prometheus/go.sum`, `infra/prometheus/provenance.json`
- Modify: `backend/pyproject.toml` (`[tool.job-search-platform.upstream]`), `scripts/check_dependencies.py`, `scripts/local_infra.py`, `infra/compose.yaml` (the `prometheus` service)
- Test: `backend/tests/unit/test_observability_infra.py`, `backend/tests/unit/test_observability_sources.py` (new), `backend/tests/test_dependency_checks.py`

**Interfaces:**
- Produces, in `scripts/local_infra.py`:
  - constants `PROMETHEUS_COMMIT`, `DEFAULT_PROMETHEUS_SOURCE`, `PROMETHEUS_BUILDER_IMAGE`;
  - `validate_pinned_source(path: Path, commit: str, label: str, required: tuple[str, ...]) -> Path`. It raises `ConfigurationError(f"{label}_source_must_be_external" | "_unavailable" | "_revision_mismatch" | "_status_unavailable" | "_dirty" | "_incomplete")`;
  - `validate_go_overlay(directory: Path, commit: str, label: str) -> None`. It raises `ConfigurationError(f"{label}_overlay_source_mismatch" | "_overlay_hash_mismatch" | "_overlay_invalid")`.
- `compose_environment()` sets `PROMETHEUS_SOURCE_DIR` (resolved, defaulting to `DEFAULT_PROMETHEUS_SOURCE`) and `PROMETHEUS_SOURCE_COMMIT`.
- `_compose()` validates the source and the overlay before running, the same way it already does for gosu.

- [ ] **Step 1: Acquire the upstream checkout** (network allowed):

```bash
UP="$HOME/.cache/job-search-platform/upstream"
rtk git clone --no-checkout --filter=blob:none https://github.com/prometheus/prometheus.git "$UP/prometheus"
rtk git -C "$UP/prometheus" checkout --detach 5241a27fe3c6983549fccc32f6e65917408c63cd
rtk git -C "$UP/prometheus" status --porcelain=v1 --untracked-files=all --ignored   # must print nothing
```

- [ ] **Step 2: Generate the dependency overlay** (Go 1.27.2 in a throwaway container, with the source mounted read-only):

```bash
rtk docker run --rm -v "$UP/prometheus:/src:ro" -v "$PWD/infra/prometheus:/out" \
  golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 \
  sh -c 'cp -r /src /w && cd /w && GOTOOLCHAIN=local go get golang.org/x/net@v0.60.0 && cp go.mod go.sum /out/'
shasum -a 256 infra/prometheus/go.mod infra/prometheus/go.sum
```

Write `infra/prometheus/provenance.json` with the two hashes:

```json
{
  "schema_version": 1,
  "source_repository": "https://github.com/prometheus/prometheus",
  "source_commit": "5241a27fe3c6983549fccc32f6e65917408c63cd",
  "version": "3.15.0",
  "license": "Apache-2.0",
  "builder_image": "golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61",
  "base_image": "quay.io/prometheus/busybox:latest@sha256:0dcbf965a16f76d5aac8905769f72e43b22862cd01f6f42c7b62955aeb489c3c",
  "web_ui_asset": "prometheus-web-ui-3.15.0.tar.gz",
  "web_ui_sha256": "fa8c918ed05e3f89e232e9b69eccd6ed074602cd9e8a2cab7a92bec9651974ae",
  "overlay_reason": "golang.org/x/net v0.60.0 and builder go1.27.2 fix CVE-2026-78667/78669/97031 found by Trivy in upstream prom/prometheus:v3.15.0 (spec A1).",
  "go_mod_sha256": "<sha256 of infra/prometheus/go.mod>",
  "go_sum_sha256": "<sha256 of infra/prometheus/go.sum>"
}
```

The two `<sha256 …>` values are the `shasum` outputs from this step. Fill them in before committing.

- [ ] **Step 3: Write the failing tests.**

New file `backend/tests/unit/test_observability_sources.py`:

```python
"""WP1 A1: pinned upstream sources and Go dependency overlays for the locally built observability images."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
import local_infra  # noqa: E402


def _overlay(directory: Path):
    provenance = json.loads((directory / "provenance.json").read_text())
    return provenance, {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in ("go.mod", "go.sum")}


def test_prometheus_overlay_matches_provenance():
    provenance, digests = _overlay(ROOT / "infra/prometheus")
    assert provenance["source_commit"] == local_infra.PROMETHEUS_COMMIT == "5241a27fe3c6983549fccc32f6e65917408c63cd"
    assert provenance["go_mod_sha256"] == digests["go.mod"] and provenance["go_sum_sha256"] == digests["go.sum"]
    assert "golang.org/x/net v0.60.0" in (ROOT / "infra/prometheus/go.mod").read_text()
    local_infra.validate_go_overlay(ROOT / "infra/prometheus", local_infra.PROMETHEUS_COMMIT, "prometheus")


def test_edited_overlay_is_refused(tmp_path):
    for name in ("go.mod", "go.sum", "provenance.json"):
        (tmp_path / name).write_bytes((ROOT / "infra/prometheus" / name).read_bytes())
    (tmp_path / "go.mod").write_text((tmp_path / "go.mod").read_text() + "\n// edited\n")
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_overlay_hash_mismatch"):
        local_infra.validate_go_overlay(tmp_path, local_infra.PROMETHEUS_COMMIT, "prometheus")


def _repo(tmp_path, name="src"):
    path = tmp_path / name
    path.mkdir()
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    (path / "go.mod").write_text("module x\n")
    subprocess.run(["git", "-C", str(path), "add", "."], check=True)
    subprocess.run(["git", "-C", str(path), "-c", "user.email=t@example.test", "-c", "user.name=t",
                    "commit", "-qm", "x"], check=True)
    head = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    return path, head


def test_pinned_source_validation(tmp_path):
    path, head = _repo(tmp_path)
    assert local_infra.validate_pinned_source(path, head, "prometheus", ("go.mod",)) == path.resolve()
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_source_revision_mismatch"):
        local_infra.validate_pinned_source(path, "0" * 40, "prometheus", ("go.mod",))
    (path / "stray").write_text("x")
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_source_dirty"):
        local_infra.validate_pinned_source(path, head, "prometheus", ("go.mod",))
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_source_unavailable|prometheus_source_revision_mismatch"):
        local_infra.validate_pinned_source(tmp_path / "missing", head, "prometheus", ("go.mod",))
    with pytest.raises(local_infra.ConfigurationError, match="prometheus_source_must_be_external"):
        local_infra.validate_pinned_source(ROOT, head, "prometheus", ("go.mod",))


def test_prometheus_dockerfile_pins_inputs():
    text = (ROOT / "infra/prometheus/Dockerfile").read_text()
    assert "golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61" in text
    assert "quay.io/prometheus/busybox:latest@sha256:0dcbf965a16f76d5aac8905769f72e43b22862cd01f6f42c7b62955aeb489c3c" in text
    assert "--checksum=sha256:fa8c918ed05e3f89e232e9b69eccd6ed074602cd9e8a2cab7a92bec9651974ae" in text
    assert "COPY --from=prometheus_source" in text and "git clone" not in text
    assert "go mod verify" in text and "-mod=readonly" in text and "GOTOOLCHAIN=local" in text
```

In `backend/tests/unit/test_observability_infra.py`:
- Replace `test_services_pinned_and_loopback_only`'s Prometheus image assertion. The test must now assert:
  - `prom["image"] == "job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6"`;
  - `prom["build"]["context"] == "./prometheus"`;
  - `prom["build"]["additional_contexts"]["prometheus_source"]` starts with `${PROMETHEUS_SOURCE_DIR:?`;
  - `prom["build"]["args"]["PROMETHEUS_SOURCE_COMMIT"]` starts with `${PROMETHEUS_SOURCE_COMMIT:?`.
  
  Keep the rest of that test as it is for now. Task 4 changes the ports.
- Change `PROM_IMAGE` in the promtool test to the local tag. Skip the test when `docker image inspect` of that tag fails, so it still skips in CI.

In `backend/tests/test_dependency_checks.py`, add:

```python
def test_upstream_pins_include_observability_sources():
    pins = check_dependencies._upstream_pins((check_dependencies.ROOT / "backend/pyproject.toml").read_text())
    assert pins["prometheus"] == "5241a27fe3c6983549fccc32f6e65917408c63cd"


def test_prometheus_dockerfile_requires_its_source_dir(tmp_path, monkeypatch):
    infra = tmp_path / "infra"
    infra.mkdir()
    (infra / "Dockerfile").write_text("FROM scratch\nLABEL src=https://github.com/prometheus/prometheus\n")
    monkeypatch.setattr(check_dependencies, "ROOT", tmp_path)
    monkeypatch.delenv("PROMETHEUS_SOURCE_DIR", raising=False)
    problems = []
    check_dependencies._check_container_build_inputs(problems)
    assert any("set PROMETHEUS_SOURCE_DIR" in p for p in problems)
```

If an existing test asserts the old `_upstream_pins` error text or the exact set of pins, update it to the new set and keep its intent.

- [ ] **Step 4: Run the tests and confirm they fail.**

Run: `rtk uv run --locked --project backend pytest backend/tests/unit/test_observability_sources.py backend/tests/unit/test_observability_infra.py backend/tests/test_dependency_checks.py -q`
Expected: FAIL. The names don't exist yet, there is no Dockerfile, and the compose file still uses the upstream image.

- [ ] **Step 5: Implement.**

`backend/pyproject.toml`: add `prometheus = "5241a27fe3c6983549fccc32f6e65917408c63cd"` to `[tool.job-search-platform.upstream]`.

`scripts/check_dependencies.py`:
- In `_upstream_pins`, the expected set becomes `{"hermes", "career-ops", "minio", "gosu", "prometheus"}`. Task 2 adds the plugin pin. The error text becomes `"Hermes, Career Ops, MinIO, gosu and Prometheus require exact 40-character commits"`.
- In `_check_container_build_inputs`, add `"prometheus/prometheus": "PROMETHEUS_SOURCE_DIR"` to `env_names`. The key is the repo slug, so Grafana's `plugins-bundled/prometheus` path does not match it.

`scripts/local_infra.py`, next to the gosu constants:

```python
PROMETHEUS_COMMIT = "5241a27fe3c6983549fccc32f6e65917408c63cd"
DEFAULT_PROMETHEUS_SOURCE = Path.home() / ".cache" / "job-search-platform" / "upstream" / "prometheus"
PROMETHEUS_BUILDER_IMAGE = GOSU_BUILDER_IMAGE  # same pinned golang:1.27.2-bookworm digest
```

If the gosu builder constant has a different name, read the file and reuse whatever constant holds the `golang:1.27.2-bookworm@sha256:5cf2…` string.

Add these after `validate_dependency_overlay`:

```python
def validate_pinned_source(path: Path, commit: str, label: str, required: tuple[str, ...]) -> Path:
    """A clean, detached upstream checkout at exactly `commit`, outside the repository (spec A1.1)."""
    source = path.expanduser().resolve()
    root = ROOT.resolve()
    if source == root or root in source.parents:
        raise ConfigurationError(f"{label}_source_must_be_external")
    try:
        revision = subprocess.run(["git", "-C", str(source), "rev-parse", "HEAD"],
                                  capture_output=True, text=True, timeout=10, check=False)
        status = subprocess.run(["git", "-C", str(source), "status", "--porcelain=v1", "--untracked-files=all", "--ignored"],
                                capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ConfigurationError(f"{label}_source_unavailable") from error
    if revision.returncode or revision.stdout.strip() != commit:
        raise ConfigurationError(f"{label}_source_revision_mismatch")
    if status.returncode:
        raise ConfigurationError(f"{label}_source_status_unavailable")
    if status.stdout.strip():
        raise ConfigurationError(f"{label}_source_dirty")
    if any(not (source / name).is_file() for name in required):
        raise ConfigurationError(f"{label}_source_incomplete")
    return source


def validate_go_overlay(directory: Path, commit: str, label: str) -> None:
    """go.mod/go.sum overlay hashes must match provenance.json for the pinned source (spec A1.1)."""
    try:
        provenance = json.loads((directory / "provenance.json").read_text(encoding="utf-8"))
        if provenance.get("source_commit") != commit:
            raise ConfigurationError(f"{label}_overlay_source_mismatch")
        for file_name, key in (("go.mod", "go_mod_sha256"), ("go.sum", "go_sum_sha256")):
            if hashlib.sha256((directory / file_name).read_bytes()).hexdigest() != provenance.get(key):
                raise ConfigurationError(f"{label}_overlay_hash_mismatch")
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"{label}_overlay_invalid") from error
```

A missing directory makes `git -C` exit non-zero. That shows up as `_revision_mismatch`, which the test accepts, and as `_unavailable` when git itself is missing.

In `compose_environment`, after the gosu lines:

```python
    environment["PROMETHEUS_SOURCE_DIR"] = str(Path(os.environ.get("PROMETHEUS_SOURCE_DIR", str(DEFAULT_PROMETHEUS_SOURCE))).expanduser().resolve())
    environment["PROMETHEUS_SOURCE_COMMIT"] = PROMETHEUS_COMMIT
```

In `_compose`, after `validate_dependency_overlay()`:

```python
    validate_pinned_source(Path(os.environ.get("PROMETHEUS_SOURCE_DIR", str(DEFAULT_PROMETHEUS_SOURCE))),
                           PROMETHEUS_COMMIT, "prometheus", ("go.mod", "go.sum", "LICENSE", "NOTICE", "scripts/compress_assets.sh"))
    validate_go_overlay(ROOT / "infra" / "prometheus", PROMETHEUS_COMMIT, "prometheus")
```

`infra/prometheus/Dockerfile`:

```dockerfile
# Prometheus v3.15.0 built from the pinned source with Go 1.27.2 and golang.org/x/net v0.60.0 (spec A1.2):
# upstream prom/prometheus:v3.15.0 carried CVE-2026-78667/78669/97031 in its Go toolchain and x/net.
FROM --platform=$BUILDPLATFORM golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 AS build
ARG TARGETARCH
ARG PROMETHEUS_SOURCE_COMMIT
WORKDIR /src
COPY --from=prometheus_source / /src/
COPY go.mod go.sum provenance.json /src/
ADD --checksum=sha256:fa8c918ed05e3f89e232e9b69eccd6ed074602cd9e8a2cab7a92bec9651974ae \
    https://github.com/prometheus/prometheus/releases/download/v3.15.0/prometheus-web-ui-3.15.0.tar.gz /ui.tgz
RUN test "$PROMETHEUS_SOURCE_COMMIT" = "5241a27fe3c6983549fccc32f6e65917408c63cd" \
    && test "$(go version | awk '{ print $3 }')" = "go1.27.2" \
    && grep -F '"source_commit": "5241a27fe3c6983549fccc32f6e65917408c63cd"' provenance.json \
    && test "$(sha256sum go.mod | awk '{ print $1 }')" = "$(sed -n 's/.*"go_mod_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && test "$(sha256sum go.sum | awk '{ print $1 }')" = "$(sed -n 's/.*"go_sum_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && tar xzf /ui.tgz -C web/ui && scripts/compress_assets.sh \
    && GOTOOLCHAIN=local go mod verify \
    && LD="-s -w -X github.com/prometheus/common/version.Version=3.15.0 -X github.com/prometheus/common/version.Revision=5241a27fe3c6983549fccc32f6e65917408c63cd -X github.com/prometheus/common/version.Branch=HEAD -X github.com/prometheus/common/version.BuildUser=job-search-platform -X github.com/prometheus/common/version.BuildDate=20261015-00:00:00" \
    && for cmd in prometheus promtool; do \
         GOOS=linux GOARCH=$TARGETARCH CGO_ENABLED=0 GOTOOLCHAIN=local go build -mod=readonly -buildvcs=false -trimpath \
           -tags netgo,builtinassets -ldflags "$LD" -o /out/$cmd ./cmd/$cmd || exit 1; done \
    && install -D -m 0644 LICENSE /out/licenses/prometheus/LICENSE && install -D -m 0644 NOTICE /out/licenses/prometheus/NOTICE

FROM quay.io/prometheus/busybox:latest@sha256:0dcbf965a16f76d5aac8905769f72e43b22862cd01f6f42c7b62955aeb489c3c
LABEL org.opencontainers.image.title="Prometheus source build" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="3.15.0" \
      org.opencontainers.image.source="https://github.com/prometheus/prometheus" \
      org.opencontainers.image.revision="5241a27fe3c6983549fccc32f6e65917408c63cd"
COPY --from=build --chmod=0755 /out/prometheus /bin/prometheus
COPY --from=build --chmod=0755 /out/promtool /bin/promtool
COPY --from=build /out/licenses/prometheus/ /licenses/prometheus/
RUN mkdir -p /prometheus /etc/prometheus && chown -R nobody:nobody /prometheus && chmod g+w /prometheus
USER nobody
WORKDIR /prometheus
EXPOSE 9090
VOLUME ["/prometheus"]
ENTRYPOINT ["/bin/prometheus"]
CMD ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus"]
```

If `scripts/compress_assets.sh` needs a tool missing from the builder, or the UI path differs, adjust only that line and report what changed and why.

`infra/compose.yaml`, in the `prometheus` service, replace the `image:` line and its comment with:

```yaml
    # Prometheus v3.15.0 built from pinned source (Go 1.27.2, x/net v0.60.0): 0 High/Critical (spec A1.2).
    image: job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6
    build:
      context: ./prometheus
      dockerfile: Dockerfile
      additional_contexts:
        prometheus_source: ${PROMETHEUS_SOURCE_DIR:?Set PROMETHEUS_SOURCE_DIR to the pinned external Prometheus checkout}
      args:
        PROMETHEUS_SOURCE_COMMIT: ${PROMETHEUS_SOURCE_COMMIT:?Set PROMETHEUS_SOURCE_COMMIT using scripts/local_infra.py}
```

The `./prometheus` volume mount for the config stays as it is.

- [ ] **Step 6: Run the tests and confirm they pass.**

Run the Step 4 command, then the full unit command from the Global Constraints.
Expected: all tests pass.

- [ ] **Step 7: Build once and verify.**

Check `df -h /` first; you need at least 20 GB free. Run the build in the background and poll it, because it takes about 20 minutes:

```bash
rtk docker buildx build --load -t job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6 \
  --build-context prometheus_source="$HOME/.cache/job-search-platform/upstream/prometheus" \
  --build-arg PROMETHEUS_SOURCE_COMMIT=5241a27fe3c6983549fccc32f6e65917408c63cd infra/prometheus
rtk docker run --rm job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6 --version
rtk docker run --rm --entrypoint /bin/promtool job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6 check config /dev/null || true
trivy image --quiet --scanners vuln --severity HIGH,CRITICAL job-search-platform/prometheus:3.15.0-go1.27.2-5241a27fe3c6
rtk docker builder prune -f
```

Expected:
- the version line shows `3.15.0` and revision `5241a27…`;
- Trivy shows 0 HIGH and 0 CRITICAL;
- the promtool tests in `test_observability_infra.py` now run (the image exists) and pass.

- [ ] **Step 8: Commit.**

```bash
rtk git add infra/prometheus backend/pyproject.toml scripts/check_dependencies.py scripts/local_infra.py infra/compose.yaml backend/tests/unit/test_observability_sources.py backend/tests/unit/test_observability_infra.py backend/tests/test_dependency_checks.py
rtk git commit -m "feat(metrics): build Prometheus 3.15.0 from pinned source with Go 1.27.2 (A1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Grafana with a rebuilt Prometheus datasource plugin

**Files:**
- Create: `infra/grafana/Dockerfile`, `infra/grafana/go.mod`, `infra/grafana/go.sum`, `infra/grafana/provenance.json`
- Modify: `backend/pyproject.toml`, `scripts/check_dependencies.py`, `scripts/local_infra.py`, `infra/compose.yaml` (the `grafana` service)
- Test: `backend/tests/unit/test_observability_sources.py`, `backend/tests/unit/test_observability_infra.py`, `backend/tests/test_dependency_checks.py`

**Interfaces:**
- Consumes: Task 1's `validate_pinned_source` and `validate_go_overlay`.
- Produces:
  - `local_infra` constants `GRAFANA_PROM_DS_COMMIT` and `DEFAULT_GRAFANA_PROM_DS_SOURCE`;
  - `compose_environment()` sets `GRAFANA_PROM_DS_SOURCE_DIR` and `GRAFANA_PROM_DS_SOURCE_COMMIT`;
  - `_compose()` validates the plugin source and the `infra/grafana` overlay.

- [ ] **Step 1: Acquire the plugin checkout** (network allowed):

```bash
UP="$HOME/.cache/job-search-platform/upstream"
rtk git clone --no-checkout --filter=blob:none https://github.com/grafana/grafana-prometheus-datasource.git "$UP/grafana-prometheus-datasource"
rtk git -C "$UP/grafana-prometheus-datasource" checkout --detach 6d21418acde6ce31c9f7a6418a88758842a881bb
rtk git -C "$UP/grafana-prometheus-datasource" status --porcelain=v1 --untracked-files=all --ignored   # must print nothing
```

- [ ] **Step 2: Generate the overlay.** Run the same docker command as Task 1 Step 2, but mount the plugin checkout and write to `infra/grafana`.

Write `infra/grafana/provenance.json` with these fields:
- `source_repository`: `https://github.com/grafana/grafana-prometheus-datasource`
- `source_commit`: `6d21418acde6ce31c9f7a6418a88758842a881bb`
- `plugin_id`: `prometheus`
- `plugin_version`: `13.2.3`
- `license`: `AGPL-3.0-only`. Check the repo's LICENSE and use what it actually says.
- `builder_image`: the golang digest
- `base_image`: the Grafana digest
- `unsigned_plugin_allowlist`: `["prometheus"]`
- `overlay_reason`: the same CVE ids as Task 1
- `go_mod_sha256` and `go_sum_sha256`

- [ ] **Step 3: Write the failing tests.**

Append to `backend/tests/unit/test_observability_sources.py`:

```python
def test_grafana_overlay_and_dockerfile():
    provenance, digests = _overlay(ROOT / "infra/grafana")
    assert provenance["source_commit"] == local_infra.GRAFANA_PROM_DS_COMMIT == "6d21418acde6ce31c9f7a6418a88758842a881bb"
    assert provenance["go_mod_sha256"] == digests["go.mod"] and provenance["go_sum_sha256"] == digests["go.sum"]
    assert provenance["unsigned_plugin_allowlist"] == ["prometheus"]
    local_infra.validate_go_overlay(ROOT / "infra/grafana", local_infra.GRAFANA_PROM_DS_COMMIT, "grafana_prom_ds")
    text = (ROOT / "infra/grafana/Dockerfile").read_text()
    assert "grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f" in text
    assert "COPY --from=grafana_prom_ds_source" in text and "git clone" not in text
    assert "GF_PLUGINS_PREINSTALL_DISABLED=true" in text
    assert "--chmod=0755" in text and "rm -f /usr/share/grafana/data/plugins-bundled/prometheus/MANIFEST.txt" in text


def test_unsigned_plugin_allowlist_is_exactly_prometheus():
    import re
    text = (ROOT / "infra/grafana/Dockerfile").read_text()
    assert re.findall(r"GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=(\S+)", text) == ["prometheus"]
    compose = (ROOT / "infra/compose.yaml").read_text()
    assert "ALLOW_LOADING_UNSIGNED" not in compose  # never widened outside the image
```

In `test_observability_infra.py`, assert all of the following:
- the Grafana service image is the local tag;
- its build context is `./grafana`;
- `additional_contexts.grafana_prom_ds_source` starts with `${GRAFANA_PROM_DS_SOURCE_DIR:?`;
- the build args include `GRAFANA_PROM_DS_SOURCE_COMMIT`.

In `test_dependency_checks.py`, extend the pins test so it also asserts `pins["grafana-prometheus-datasource"] == "6d21418acde6ce31c9f7a6418a88758842a881bb"`.

- [ ] **Step 4: Run the tests and confirm they fail.**

- [ ] **Step 5: Implement.**

`pyproject.toml`: add `grafana-prometheus-datasource = "6d21418acde6ce31c9f7a6418a88758842a881bb"`.

`check_dependencies.py`:
- add `"grafana-prometheus-datasource"` to the expected pin set;
- add `"grafana-prometheus-datasource": "GRAFANA_PROM_DS_SOURCE_DIR"` to `env_names`;
- extend the error text accordingly.

`local_infra.py`:
- add the constants `GRAFANA_PROM_DS_COMMIT = "6d21418acde6ce31c9f7a6418a88758842a881bb"` and `DEFAULT_GRAFANA_PROM_DS_SOURCE = <upstream>/grafana-prometheus-datasource`;
- in `compose_environment`, add the `GRAFANA_PROM_DS_SOURCE_DIR` and `GRAFANA_PROM_DS_SOURCE_COMMIT` lines;
- in `_compose`, call `validate_pinned_source(..., GRAFANA_PROM_DS_COMMIT, "grafana_prom_ds", ("go.mod", "go.sum", "LICENSE", "pkg/main.go"))` and `validate_go_overlay(ROOT / "infra" / "grafana", GRAFANA_PROM_DS_COMMIT, "grafana_prom_ds")`.

If the plugin's main file is not `pkg/main.go`, list the real file.

`infra/grafana/Dockerfile`:

```dockerfile
# Grafana 13.2.4 with only the Prometheus datasource, its backend rebuilt from pinned source with Go 1.27.2
# and golang.org/x/net v0.60.0 (spec A1.3, A1.4): upstream bundled plugin binaries carried 56 High findings.
FROM --platform=$BUILDPLATFORM golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61 AS build
ARG TARGETARCH
ARG GRAFANA_PROM_DS_SOURCE_COMMIT
WORKDIR /src
COPY --from=grafana_prom_ds_source / /src/
COPY go.mod go.sum provenance.json /src/
RUN test "$GRAFANA_PROM_DS_SOURCE_COMMIT" = "6d21418acde6ce31c9f7a6418a88758842a881bb" \
    && test "$(go version | awk '{ print $3 }')" = "go1.27.2" \
    && grep -F '"source_commit": "6d21418acde6ce31c9f7a6418a88758842a881bb"' provenance.json \
    && test "$(sha256sum go.mod | awk '{ print $1 }')" = "$(sed -n 's/.*"go_mod_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && test "$(sha256sum go.sum | awk '{ print $1 }')" = "$(sed -n 's/.*"go_sum_sha256": "\([0-9a-f]*\)".*/\1/p' provenance.json)" \
    && GOTOOLCHAIN=local go mod verify \
    && GOOS=linux GOARCH=$TARGETARCH CGO_ENABLED=0 GOTOOLCHAIN=local go build -mod=readonly -buildvcs=false -trimpath \
       -tags arrow_json_stdlib \
       -ldflags "-w -s -X 'github.com/grafana/grafana-plugin-sdk-go/build/buildinfo.buildInfoJSON={\"time\":1790683232186,\"pluginID\":\"prometheus\",\"version\":\"13.2.3\"}' -X 'main.pluginID=prometheus' -X 'main.version=13.2.3'" \
       -o /out/gpx_grafana-prometheus-datasource_linux_$TARGETARCH ./pkg

FROM grafana/grafana:13.2.4@sha256:dbbc38ea21103cefb50396340cd88afec779c7e070b0a7bf5a75b4ce46651d3f
ARG TARGETARCH
LABEL org.opencontainers.image.title="Grafana 13.2.4 with source-built Prometheus datasource" \
      org.opencontainers.image.source="https://github.com/grafana/grafana-prometheus-datasource" \
      org.opencontainers.image.revision="6d21418acde6ce31c9f7a6418a88758842a881bb"
USER root
RUN cd /usr/share/grafana/data/plugins-bundled && find . -mindepth 1 -maxdepth 1 ! -name prometheus -exec rm -rf {} + \
    && rm -f /usr/share/grafana/data/plugins-bundled/prometheus/MANIFEST.txt \
              /usr/share/grafana/data/plugins-bundled/prometheus/gpx_grafana-prometheus-datasource_linux_*
COPY --from=build --chown=472:0 --chmod=0755 /out/gpx_grafana-prometheus-datasource_linux_${TARGETARCH} \
     /usr/share/grafana/data/plugins-bundled/prometheus/gpx_grafana-prometheus-datasource_linux_${TARGETARCH}
# The rebuilt binary no longer matches the signed manifest: allow exactly this one plugin id unsigned (spec A1.4),
# and never download plugins at startup.
ENV GF_PLUGINS_PREINSTALL_DISABLED=true \
    GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=prometheus
USER 472
```

`infra/compose.yaml`, `grafana` service: replace the `image:` line and its comment with the local tag plus a `build:` block, in the same shape as Task 1. Use context `./grafana`, `additional_contexts.grafana_prom_ds_source: ${GRAFANA_PROM_DS_SOURCE_DIR:?Set GRAFANA_PROM_DS_SOURCE_DIR to the pinned external grafana-prometheus-datasource checkout}`, and arg `GRAFANA_PROM_DS_SOURCE_COMMIT: ${GRAFANA_PROM_DS_SOURCE_COMMIT:?Set GRAFANA_PROM_DS_SOURCE_COMMIT using scripts/local_infra.py}`.

- [ ] **Step 6: Run the tests and confirm they pass.**

- [ ] **Step 7: Build once and verify.**

Check disk space first. Do not start this while any other build is running.

```bash
rtk docker buildx build --load -t job-search-platform/grafana:13.2.4-promds13.2.3-go1.27.2-6d21418acde6 \
  --build-context grafana_prom_ds_source="$HOME/.cache/job-search-platform/upstream/grafana-prometheus-datasource" \
  --build-arg GRAFANA_PROM_DS_SOURCE_COMMIT=6d21418acde6ce31c9f7a6418a88758842a881bb infra/grafana
trivy image --quiet --scanners vuln --severity HIGH,CRITICAL job-search-platform/grafana:13.2.4-promds13.2.3-go1.27.2-6d21418acde6
rtk docker builder prune -f
```

Expected: 0 HIGH and 0 CRITICAL.

Then run a functional check with throwaway containers only:
- names start with `jsp-a1-`;
- one throwaway network;
- host ports in 59990–59999.

Start the locally built Prometheus scraping itself, and this Grafana with a provisioned datasource pointing at it. Then confirm:
- the datasource health check is OK, and `/api/ds/query` for `up` returns data;
- `docker logs` shows no plugin download from grafana.com.

Remove the containers and the network afterwards.

- [ ] **Step 8: Commit.**

```bash
rtk git add infra/grafana/Dockerfile infra/grafana/go.mod infra/grafana/go.sum infra/grafana/provenance.json backend/pyproject.toml scripts/check_dependencies.py scripts/local_infra.py infra/compose.yaml backend/tests
rtk git commit -m "feat(metrics): Grafana 13.2.4 with source-built Prometheus datasource only (A1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Security scan covers both images

**Files:**
- Modify: `scripts/check_dependencies.py` (`REQUIRED_SCANS`), `scripts/security_scan.py`
- Test: `backend/tests/test_dependency_checks.py`

- [ ] **Step 1: Write the failing tests** (append to `test_dependency_checks.py`):

```python
def test_observability_images_are_required_scans():
    assert {"prometheus_image", "grafana_image"} <= check_dependencies.REQUIRED_SCANS


def test_image_arguments_accept_observability_scopes():
    refs = security_scan._image_arguments(["prometheus_image=job-search-platform/prometheus:x",
                                           "grafana_image=job-search-platform/grafana:y"])
    assert refs == {"prometheus_image": "job-search-platform/prometheus:x", "grafana_image": "job-search-platform/grafana:y"}
```

The file may import `security_scan` under another name. Use whatever it already uses.

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.**
- Add `"prometheus_image"` and `"grafana_image"` to `REQUIRED_SCANS`.
- In `security_scan.py`, extend the image-scope tuple in `scan()` and the allowed set in `_image_arguments`, including its error message.
- Check for other places that list `postgres_image`, `minio_image` and `hermes_image` together (`--help` text, docs strings) and extend them.
- Keep existing tests' intent. Some use an explicit `required=` set and may need no change.

- [ ] **Step 4: Run** `rtk uv run --locked --project backend pytest backend/tests/test_dependency_checks.py -q`. Expected: pass.

- [ ] **Step 5: Commit** with the message `feat(metrics): security scan requires Prometheus and Grafana images (A1)`, plus the trailer.

---

### Task 4: `.env` configuration and the committed `.env.example`

**Files:**
- Modify: `infra/compose.yaml`, `scripts/local_infra.py` (`compose_environment`)
- Create: `.env.example` (committed)
- Test: `backend/tests/unit/test_observability_infra.py`, `backend/tests/unit/test_env_example.py` (new)

- [ ] **Step 1: Write the failing tests.**

In `test_observability_infra.py`:
- Prometheus ports are `["127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}:9090"]`.
- Grafana ports are `["127.0.0.1:${CORE02_GRAFANA_PORT:-53300}:3000"]`.
- The Prometheus command contains `--storage.tsdb.retention.time=${PROMETHEUS_RETENTION:-15d}`.
- `GF_SECURITY_ADMIN_USER` is `${GRAFANA_ADMIN_USER:-admin}`.
- Add a mailpit assertion: ports are `["127.0.0.1:${CORE02_MAILPIT_SMTP_PORT:-51025}:1025", "127.0.0.1:${CORE02_MAILPIT_UI_PORT:-58025}:8025"]`.
- Add a test that every published port in the compose file (each `ports:` entry of every service) contains `${`, so no host port is hard-coded.

New `backend/tests/unit/test_env_example.py`:

```python
"""A1.6–A1.8: committed .env.example lists every configurable value and holds no secret."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
import local_infra  # noqa: E402

TEXT = (ROOT / ".env.example").read_text(encoding="utf-8")
NAMES = {"CORE02_POSTGRES_PORT", "CORE02_MINIO_PORT", "CORE02_LITELLM_PORT", "CORE02_LANGFUSE_PORT",
         "CORE02_MEILI_PORT", "CORE02_PROMETHEUS_PORT", "CORE02_GRAFANA_PORT", "CORE02_MAILPIT_SMTP_PORT",
         "CORE02_MAILPIT_UI_PORT", "PROMETHEUS_RETENTION", "GRAFANA_ADMIN_USER", "METRICS_PORT", "METRICS_HOST",
         "PROMETHEUS_SOURCE_DIR", "GRAFANA_PROM_DS_SOURCE_DIR", "MEILI_URL", "MEILI_INDEX"}


def test_every_configurable_value_is_listed():
    missing = {name for name in NAMES if not re.search(rf"^#?\s*{name}=", TEXT, re.M)}
    assert not missing, missing


def test_no_secret_values():
    for key in ("OPENROUTER_API_KEY", "LITELLM_API_KEY"):
        assert re.search(rf"^{key}=\s*$", TEXT, re.M), key
    assert not re.search(r"(sk-[A-Za-z0-9]{8,}|pk-lf-|sk-lf-|BEGIN [A-Z ]*PRIVATE KEY)", TEXT)


def test_compose_environment_defaults_match_template(monkeypatch, tmp_path):
    for name in NAMES:
        monkeypatch.delenv(name, raising=False)
    env = local_infra.compose_environment(tmp_path, tmp_path)
    for name, default in (("CORE02_PROMETHEUS_PORT", "59090"), ("CORE02_GRAFANA_PORT", "53300"),
                          ("CORE02_MAILPIT_SMTP_PORT", "51025"), ("CORE02_MAILPIT_UI_PORT", "58025"),
                          ("CORE02_MEILI_PORT", "57700"), ("PROMETHEUS_RETENTION", "15d"),
                          ("GRAFANA_ADMIN_USER", "admin")):
        assert env[name] == default
        assert re.search(rf"^#?\s*{name}={re.escape(default)}\s*$", TEXT, re.M), name
```

`compose_environment` calls the gosu path resolution. If it validates the path rather than just resolving it, monkeypatch the minimum needed, and say so in the report.

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.**

`infra/compose.yaml`:
- Prometheus port: `"127.0.0.1:${CORE02_PROMETHEUS_PORT:-59090}:9090"`.
- Prometheus retention: `--storage.tsdb.retention.time=${PROMETHEUS_RETENTION:-15d}`.
- Grafana port: `"127.0.0.1:${CORE02_GRAFANA_PORT:-53300}:3000"`.
- Grafana admin user: `GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}`.
- Mailpit ports: `"127.0.0.1:${CORE02_MAILPIT_SMTP_PORT:-51025}:1025"` and `"127.0.0.1:${CORE02_MAILPIT_UI_PORT:-58025}:8025"`.

`scripts/local_infra.py` `compose_environment`: add `setdefault` lines for `CORE02_MEILI_PORT`=57700, `CORE02_PROMETHEUS_PORT`=59090, `CORE02_GRAFANA_PORT`=53300, `CORE02_MAILPIT_SMTP_PORT`=51025, `CORE02_MAILPIT_UI_PORT`=58025, `PROMETHEUS_RETENTION`=15d and `GRAFANA_ADMIN_USER`=admin.

`.env.example` (repo root, committed):
- **Start from the owner's existing file.** Copy it from the main checkout: `cp /Users/parksurakiat/AI-Job-Search-Agent-Platform-dem/.env.example .env.example`. It holds no secrets, and the two keys are empty.
- **Keep every existing line.**
- **Add commented defaults** in the existing style:
  - In "Host ports published by the storage stack", add `CORE02_MEILI_PORT=57700`, `CORE02_PROMETHEUS_PORT=59090`, `CORE02_GRAFANA_PORT=53300`, `CORE02_MAILPIT_SMTP_PORT=51025` and `CORE02_MAILPIT_UI_PORT=58025`.
  - Add a section `# --- Search index ---` with `MEILI_URL=http://127.0.0.1:57700` and `MEILI_INDEX=jobs`.
  - Add a section `# --- Metrics and Grafana (WP1) ---` with:
    - `METRICS_PORT=59464`, with a comment saying unset means no metrics listener, and that if you change it you must also change the target in `infra/prometheus/prometheus.yml`;
    - `METRICS_HOST=127.0.0.1`, with a comment saying it must be loopback;
    - `PROMETHEUS_RETENTION=15d`;
    - `GRAFANA_ADMIN_USER=admin`, with a comment saying the password is in `CORE02_PRIVATE_DIR/grafana-admin-password`, never here.
  - In "Optional overrides", add `PROMETHEUS_SOURCE_DIR=/Users/YOU/.cache/job-search-platform/upstream/prometheus` and `GRAFANA_PROM_DS_SOURCE_DIR=/Users/YOU/.cache/job-search-platform/upstream/grafana-prometheus-datasource`.
  - Remove the stale comment line "Reserved for the Langfuse branch; unused for now."

Check `.gitignore` in the worktree. If `.env.example` is ignored, add the negation `!.env.example`.

- [ ] **Step 4: Run the unit command and confirm it passes.**

- [ ] **Step 5: Commit.**

```bash
rtk git add infra/compose.yaml scripts/local_infra.py .env.example .gitignore backend/tests/unit/test_observability_infra.py backend/tests/unit/test_env_example.py
rtk git commit -m "feat(config): every compose port and observability setting via .env; commit .env.example (A1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Leave `.gitignore` out of the `git add` if it is unchanged.

---

### Task 5: Documentation

**Files:**
- Modify: `docs/engineering/dependencies.md`, `docs/engineering/local-operation.md`, `infra/AGENTS.md`

- [ ] **Step 1: Write the docs.**
1. `dependencies.md`: add `## Prometheus and Grafana images (2026-10-15)` with:
   - the upstream scan before the fix (8 and 56 High, 0 Critical; the CVE ids and where they were found);
   - the pinned inputs, taken from both `provenance.json` files;
   - the result of the local builds: 0 High and 0 Critical, with the Trivy version and DB date;
   - the unsigned-plugin decision from spec A1.4, with its consequence;
   - the security scan scopes `prometheus_image` and `grafana_image`.
2. `local-operation.md`:
   - In "Requirements and pinned inputs", add the two `git clone --no-checkout` / `checkout --detach` blocks and their `export` lines, in the same style as gosu. The commits come from `backend/pyproject.toml`.
   - Add both variables to the configuration table.
   - In the Metrics section, explain the first build: Prometheus takes about 20 minutes. Do not build two images at once. Keep 20 GB free.
   - Cover the new `.env` variables and the `METRICS_PORT` / `prometheus.yml` note.
   - Fix the remaining minor problems: the stray colon, and the code fence that sits inside a list.
3. `infra/AGENTS.md`:
   - In the layout, `prometheus/` and `grafana/` now hold Dockerfile, `go.mod`, `go.sum` and `provenance.json`.
   - In the rules, the observability images are source-built. Do not switch back to the upstream images without a scan.

- [ ] **Step 2: Check.**

Run: `rtk grep -n "PROMETHEUS_SOURCE_DIR\|GRAFANA_PROM_DS_SOURCE_DIR" docs/engineering/local-operation.md infra/AGENTS.md && rtk grep -n "unsigned" docs/engineering/dependencies.md`
Expected: matches in every file.

- [ ] **Step 3: Commit** with the message `docs(metrics): source-built observability images, upstream checkouts, .env (A1)`, plus the trailer.

---

### Task 6 (controller only): owner `.env`, full suite, live smoke, merge

- [ ] **Step 1: Owner `.env`.** Append the new variables to `/Users/parksurakiat/AI-Job-Search-Agent-Platform-dem/.env` as commented defaults. Change no existing value and print no value.
- [ ] **Step 2: Full suite.** Run it with `CORE02_PRIVATE_DIR` set. Expected: everything passes except the known baseline.
- [ ] **Step 3: Live smoke.** Use the documented command: `local_infra._compose(["up","--detach","--no-deps","prometheus","grafana"])` under `uv run --env-file .env`, with the upstream checkouts in place. Check:
  - the images are the local tags;
  - Prometheus target `app` is up when a throwaway app runs with `METRICS_PORT=59464`;
  - all 8 rules are loaded;
  - the Grafana datasource health check passes and `/api/ds/query` returns data;
  - an anonymous request gets 401;
  - Grafana did not download any plugin;
  - LiteLLM still has its key.

  Stop both services afterwards.
- [ ] **Step 4: Merge prep.**
  - Run `security_scan.py` with the two image scopes, or run Trivy on both. Expected: 0 and 0.
  - The owner's main checkout has an untracked `.env.example`. Back it up to the scratchpad before pulling `develop`, because the tracked version is a superset.
  - Then push, open the PR, wait for CI, and merge.
