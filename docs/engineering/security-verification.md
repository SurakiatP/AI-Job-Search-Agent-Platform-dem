# Security verification

Security results apply only to the dependencies, images, source revisions, and advisory database recorded for that run. A clean scan is not a claim that all vulnerabilities are known or that the application is safe for public hosting. Keep raw audit output and SBOMs in the private cache created by `scripts/security_scan.py`; commit only sanitized evidence.

## CI checks

`.github/workflows/verify.yml` runs on pull requests, pushes to `develop`, and manual dispatch. It grants `contents: read` and pins each GitHub Action to a commit. The workflow uses the locked Python and Node dependencies to run:

- the self-contained dependency/lock-verification tests in `backend/tests/test_dependency_checks.py`;
- `pip-audit` against the locked backend environment;
- the locked frontend installation and production build;
- npm audits for the frontend and browser-test lockfiles;
- the synthetic Playwright browser suite against a loopback Vite server, with Chromium installed by Playwright.

CI uses synthetic source fixtures and no owner/provider credentials or personal data. The focused Python tests do not use the local database fixtures. The browser job starts its own loopback Vite process and points Playwright at it; the actual-backend browser check remains conditional and is skipped without the configured backend. The workflow does not provision PostgreSQL, MinIO, the native Hermes sandbox, macOS Keychain, or owner settings. It does not run native integration tests, a live-provider smoke, or the full image scan; it does not publish or deploy. A green workflow is evidence for those CI checks only.

## Operator checks

Run `scripts/check_dependencies.py` after installing the pinned Python and Node runtimes. It checks the lockfiles and, when source paths are supplied, verifies the upstream commit pins. For the complete source/image scan, prepare the detached pinned Hermes, Career Ops, MinIO, and gosu checkouts, the locked Hermes environment, and all three built local images. Keep source trees and raw reports outside the repository. Set these path variables to the matching prepared locations: `HERMES_SOURCE_DIR`, `CAREER_OPS_SOURCE_DIR`, `HERMES_ENV_DIR`, `MINIO_SOURCE_DIR`, and `GOSU_SOURCE_DIR`.

Run the full scanner against the image tags built from the checked-in Compose and Hermes setup inputs:

```sh
rtk uv run --locked --project backend python scripts/security_scan.py \
  --image postgres_image=job-search-platform/postgres:17.11-alpine-gosu-1.19-6456aaa0f3c8 \
  --image minio_image=job-search-platform/minio-oss:7aac2a2c5b7c882e68c1ce017d8256be2feea27f \
  --image hermes_image=job-search-platform-hermes:core-03
```

The scanner records the immutable image ID behind each local tag before scanning, verifies it did not change, produces SBOMs, and keeps raw reports in the private cache. It requires independent scopes for backend and Hermes Python, frontend and Hermes Node, test dependencies, the Hermes environment, PostgreSQL, MinIO, Hermes image, MinIO Go/build dependencies, PostgreSQL gosu Go/build dependencies, and the parser source inventory. Missing source paths, unavailable scanner databases, malformed output, image drift, or failed scopes must be reported as incomplete/failed; a partial scan is not a full pass. The source inventory for the parser does not attest that the compiled wheel was built from that source.

After a dependency, base-image, lockfile, or source-pin change, rerun affected tests and the corresponding audits. Record UTC scan time, scanner and advisory database versions/timestamps, exact source revisions and image IDs, SBOM counts, every scope status, and unresolved findings in the sanitized dependency record. Do not suppress findings to obtain a passing result. DELIVERY.md requires owner review before merge or release for unresolved Critical/High findings. Preserve UNKNOWN findings and incomplete coverage in the report.

## Current recorded evidence

The latest recorded aggregate on 2026-10-04 used Trivy 0.75.0 and an advisory database updated at `2026-10-04 01:47:20 UTC`. All eleven required scopes completed; no known High or Critical findings were reported. The MinIO Go inventory still reports `GO-2026-5932` with UNKNOWN severity. The parser scan covers the pinned release-source inventory and does not attest the compiled wheel. No findings were suppressed. Exact image IDs, SBOM scope, source revisions, and private evidence location are recorded in [dependencies.md](dependencies.md).

This evidence is a time-stamped local scan, not a result from CI and not a replacement for rerunning the scan after relevant changes. The live-provider workflow also remains a separate owner-configured check; offline CI and dependency scans cannot establish it.
