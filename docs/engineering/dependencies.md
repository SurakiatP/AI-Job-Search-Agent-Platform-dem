# Dependency and scanner record

Date: 2026-10-03. This is a sanitized snapshot of CORE-01 verification; it is not a full security pass. Exact resolvers are committed in `backend/uv.lock`, `frontend/package-lock.json`, and `tests/package-lock.json`.

## Accepted runtime and direct pins

- Python runtime: CPython 3.12.13 selected by uv 0.12.2; `backend/pyproject.toml` accepts Python `>=3.12,<3.13`.
- JavaScript runtime: Node 24.18.0 and npm 11.16.0. Both frontend manifests require those exact versions.
- Backend direct pins: `fastapi==0.142.2`, `pydantic==2.13.5`, `sqlalchemy==2.1.3`, `alembic==1.20.0`, `psycopg[binary]==3.3.6`, `boto3==1.43.108`, `mcp==2.3.0`, `opentelemetry-api==1.45.1`, `opentelemetry-sdk==1.45.1`, `opentelemetry-exporter-otlp-proto-http==1.45.1` (optional OTLP tracing, enabled only by `OTEL_EXPORTER_OTLP_ENDPOINT`), `a2a-sdk==1.2.1`, `python-multipart==0.0.32`, `keyring==25.6.0`, and `uvicorn[standard]==0.41.0`. Build and development tools are `hatchling==1.28.0`, `pytest==9.1.1`, `pytest-asyncio==1.3.0`, and `pip-audit==2.10.1`.
- Frontend direct pins: React and React DOM 19.3.0, React Router 8.4.0, i18next 26.4.2, react-i18next 17.0.15, Vite 8.3.2, TypeScript 7.0.2, Tailwind CSS and `@tailwindcss/vite` 4.3.3, and `@vitejs/plugin-react` 6.1.1. UI support pins include Radix Dialog 1.1.15, Dropdown Menu 2.1.16, Slot 1.2.3, class-variance-authority 0.7.1, clsx 2.1.1, lucide-react 0.577.0, and tailwind-merge 3.5.0. Packaged fonts are Manrope 5.3.0, Noto Sans Thai 5.2.8, and Noto Serif Thai 5.3.0.
- Browser test pin: `@playwright/test==1.63.0`.

## Candidate changes

- npm rejected Vite 8.3.2 with the plan's `@vitejs/plugin-react` 5.1.1 because that plugin declares Vite support only through Vite 7. Registry metadata showed plugin 6.1.1 supports Vite `^8.0.0`; that exact version resolved without bypassing peer checks.
- The first Python audit found eight advisory entries for `python-multipart==0.0.26` (four unique IDs: PYSEC-2026-3036, PYSEC-2026-3037, PYSEC-2026-3039, PYSEC-2026-3040). The report supplied fixes at 0.0.27, 0.0.30, and 0.0.31, but no severity field. CORE-01 failed closed and upgraded to PyPI's then-current 0.0.32 release (Python >=3.10); a second locked audit reported zero advisories.
- DESIGN.md specifies Manrope, Noto Sans Thai, and Noto Serif Thai roles. Registry metadata did not contain Noto Serif Thai 5.2.8; exact 5.3.0 releases were available for Noto Serif Thai and Manrope. The unused Noto Sans Latin package was removed.

## Verification evidence

At 2026-10-03 15:32 UTC, using Trivy vulnerability DB updated at 2026-10-03 07:01:46 UTC:

- `uv run --locked --project backend pip-audit` over a private `uv export --locked --all-groups` requirements file: 0 advisories.
- `npm audit` on frontend and browser-test locks: 0 advisories at every reported severity.
- Trivy filesystem scans and CycloneDX SBOMs, including development dependencies: backend 0 High/Critical and 108 SBOM components; frontend 0 High/Critical and 169 components; browser tests 0 High/Critical and 4 components.
- SBOM/audit JSON, stderr, and exported requirements are stored outside Git under `/Users/parksurakiat/.cache/job-search-platform/security/20261003T153224.902949Z` with private directory/file permissions. The user-facing summary contains counts and scope only.

The required external-runtime scopes remain incomplete: separate Hermes environment, PostgreSQL image, MinIO image, Hermes worker image, and MinIO Go/build dependencies. No images or source build inputs exist in this wave. `scripts/security_scan.py` therefore exits 1 and lists these scopes as missing. It must not be reported as a full security PASS. Container image checks include OS and installed-language dependencies and produce CycloneDX SBOMs; source scanning covers MinIO Go modules and its SBOM when available.

## Later-wave scan inputs

- Set `HERMES_SOURCE_DIR`, `CAREER_OPS_SOURCE_DIR`, and `MINIO_SOURCE_DIR` to the corresponding externally cached Git checkouts. `scripts/check_dependencies.py` compares each checkout's `HEAD` with the immutable commit in `backend/pyproject.toml`. The MinIO path must contain `go.mod` for its Go/build scan.
- Set `HERMES_ENV_DIR` to the separate Hermes uv project containing `pyproject.toml` and `uv.lock`; its default is the external cache `~/.cache/job-search-platform/hermes-environment`. Setup copies the versioned `infra/hermes` Python manifests and runtime selection there unchanged. The native Node manifest/lock remain in `infra/hermes` and are scanned independently.
- The Hermes project must lock `pip-audit==2.10.1` in its `audit` dependency group. Its audit runs under that project's Python interpreter so environment markers reflect the native runtime, independently of backend Python. The Hermes lock also receives a Trivy filesystem scan and SBOM.
- Native Career Ops Node dependencies have a separate required `hermes_node` npm-audit scope; a backend or frontend audit does not satisfy it.
- Scan every built local image with `python3 scripts/security_scan.py --image postgres_image=REF --image minio_image=REF --image hermes_image=REF`. Each scope is required independently. The scanner captures Docker's immutable image ID before scanning and verifies the ID is unchanged after both vulnerability scan and SBOM generation. Pass the exact local image references built for that run.
- Dockerfiles added under `infra/` must use immutable digest-pinned base images. If a build manifest references Hermes, Career Ops, or MinIO, the corresponding external source path above is required and its revision is checked. No nested upstream checkout belongs in this repository.
- Raw audit output remains in the private cache. Commit only sanitized scope status, scanner/database timestamps, findings, immutable image IDs, and SBOM counts here or in the later task's evidence document.

Root scanner integration (2026-10-04): native Hermes audits the actual locked local environment under its own Python interpreter after byte-for-byte manifest validation. Universal exports include an inactive Android Git requirement that pip-audit validates before its marker; `--local` avoids that false collection failure without skipping installed dependencies. The independent installed audit covered 84 packages, with zero findings and zero skipped packages. MinIO Go/build scans use the hash-verified dependency overlay and validate the clean upstream source. Parser Cargo.lock is hash-verified and independently required; release-source inventory is not compiled-wheel attestation. UNKNOWN findings remain visible. Scanner summaries are written to private evidence directories.

PostgreSQL remediation adds the independently required `postgres_go_build_dependencies` scope: validate clean gosu source and hash-verified overlay, audit effective Go module inventory, and scan the final binary/OS image. Its new Alpine cluster uses a fresh explicitly named volume; existing Bookworm PGDATA is preserved and cannot be mounted under Alpine without a tested logical restore/collation validation.

Installed protocol SDK inspection (2026-10-04): MCP2.3.0 uses `mcp.server.mcpserver.MCPServer` (FastMCP moved in v2) and exposes `streamable_http_app`. A2A SDK1.2.1 assembles through `a2a.server.routes` public route factories; the previous `a2a.server.apps` path is absent. Use current official SDK types/routes/clients and record actual negotiated protocol versions during PROTO-01/02. These imports are not protocol/security verification.

## Release-candidate scan, 2026-10-04

The corrected invocation supplied the verified MinIO source checkout through `MINIO_SOURCE_DIR` (upstream `7aac2a2c5b7c882e68c1ce017d8256be2feea27f`). Private evidence: `20261004T072955.943096Z/scan-summary.json` under the operator security cache. Exit 0; all eleven named coverage scopes complete, no missing/failed scopes, zero known High/Critical findings. Backend/Hermes Python audits and frontend/tests/Hermes Node audits reported zero findings. Trivy 0.75.0 used advisory DB timestamp `2026-10-04 01:47:20.093525258 UTC`.

Actual image IDs: PostgreSQL `sha256:b65a00df9778bc6f6e8c7f0208555da8f13fb391f92a69c160f853e21aaf8e2c`; MinIO `sha256:ed336a7464e2eeecf94c70ff5778c6c0dd6ed84cefdb2e6fd67822b8334e5b20`; Hermes `sha256:f132adc318b2553808e33b32b830fc99be14f500206a88f47d5dcee97c00432a`. Each has a recorded SBOM. These local image IDs identify the tested builds and are not registry pull references.

MinIO `GO-2026-5932` remains UNKNOWN in both Go inventory and image reports. Parser coverage is release-source inventory; the compiled wheel is unattested. No findings were suppressed. The preceding `20261004T072345.071208Z` attempt exited 1 because the invocation omitted `MINIO_SOURCE_DIR`; its missing Go-build scope remains historical evidence, and is not a passing scan. Live-provider and independent final acceptance remain separate gates.

## Hermes image: Typst CV renderer (2026-10-10)

- Added to the pinned Alpine 3.24 `apk add`: `typst=0.14.2-r0` (CV PDF renderer, no packages, network disabled) and `font-noto-thai=2026.06.01-r0`. Rebuilt image `sha256:ffbda4c7911b7bcaff52ebc259bc2a77425d32685d10542c8ed14c0a6a3cee6a` (previous `sha256:f132adc318b2...`).
- `trivy image --scanners vuln` on the rebuilt image: 0 findings at every severity (0 High/Critical, none in typst or fonts). The previous image had 0 High/Critical and 1 Medium. Full `security_scan.py` was not re-run for this change.

2026-10-10 Go toolchain remediation:
- The PostgreSQL gosu and MinIO builders moved from `golang:1.27.1-bookworm` to `golang:1.27.2-bookworm@sha256:5cf287a799e6b94384bad13d16b14904c531f51ba65792237e122ce42b392f61`. This fixes stdlib CVE-2026-78667, CVE-2026-78669 and CVE-2026-97031.
- The MinIO module overlay gains `golang.org/x/net` v0.60.0 (CVE-2026-78669), together with the x/crypto, x/sync, x/sys, x/term, x/mod and x/text releases it requires. The provenance hashes are refreshed.
- A full `security_scan.py` run found 0 High/Critical across all 11 scopes. Evidence: `~/.cache/job-search-platform/security/20261010T133017.497342Z`.
- One UNKNOWN finding remains visible: GO-2026-5932. It covers the unmaintained `golang.org/x/crypto/openpgp` package inside MinIO, and there is no fix version.

## LiteLLM gateway image (2026-10-10)

- `ghcr.io/berriai/litellm-database:1.104.2@sha256:5a9ff0fd7177372f2ccd8949cb121f67e281f4d13d026af51f9c096c0626f50a` (local image ID `sha256:5a9ff0fd7177372f2ccd8949cb121f67e281f4d13d026af51f9c096c0626f50a`), pinned in `infra/compose.yaml` for `litellm` and `litellm-seed`. `litellm-db` reuses the project PostgreSQL image.
- `trivy image --scanners vuln --severity HIGH,CRITICAL` (Trivy 0.75.0): 0 High/Critical findings. Full `security_scan.py` was not re-run for this change.
