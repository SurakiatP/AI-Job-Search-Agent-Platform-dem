# Dependency and scanner record

Date: 2026-10-03. This is a sanitized snapshot of CORE-01 verification; it is not a full security pass. Exact resolvers are committed in `backend/uv.lock`, `frontend/package-lock.json`, and `tests/package-lock.json`.

## Accepted runtime and direct pins

- Python runtime: CPython 3.12.13 selected by uv 0.12.2; `backend/pyproject.toml` accepts Python `>=3.12,<3.13`.
- JavaScript runtime: Node 24.18.0 and npm 11.16.0. Both frontend manifests require those exact versions.
- Backend direct pins: `fastapi==0.142.2`, `pydantic==2.13.5`, `sqlalchemy==2.1.3`, `alembic==1.20.0`, `psycopg[binary]==3.3.6`, `boto3==1.43.108`, `mcp==2.3.0`, `a2a-sdk==1.2.1`, `python-multipart==0.0.32`, `keyring==25.6.0`, and `uvicorn[standard]==0.41.0`. Build and development tools are `hatchling==1.28.0`, `pytest==9.1.1`, `pytest-asyncio==1.3.0`, and `pip-audit==2.10.1`.
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
- Set `HERMES_ENV_DIR` to the separate Hermes uv project containing `pyproject.toml` and `uv.lock`; it defaults to `infra/hermes`.
- The Hermes project must lock `pip-audit==2.10.1` in its `audit` dependency group. Its audit runs under that project's Python interpreter so environment markers reflect the native runtime, independently of backend Python. The Hermes lock also receives a Trivy filesystem scan and SBOM.
- Scan every built local image with `python3 scripts/security_scan.py --image postgres_image=REF --image minio_image=REF --image hermes_image=REF`. Each scope is required independently. The scanner captures Docker's immutable image ID before scanning and verifies the ID is unchanged after both vulnerability scan and SBOM generation. Pass the exact local image references built for that run.
- Dockerfiles added under `infra/` must use immutable digest-pinned base images. If a build manifest references Hermes, Career Ops, or MinIO, the corresponding external source path above is required and its revision is checked. No nested upstream checkout belongs in this repository.
- Raw audit output remains in the private cache. Commit only sanitized scope status, scanner/database timestamps, findings, immutable image IDs, and SBOM counts here or in the later task's evidence document.
