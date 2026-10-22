# CORE-02 storage proof

## Scope

CORE-02 provides a project-scoped local Compose stack with PostgreSQL 17 and a source-built MinIO OSS server. PostgreSQL is pinned to `postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652`. MinIO source is pinned to upstream commit `7aac2a2c5b7c882e68c1ce017d8256be2feea27f` (`https://github.com/minio/minio`); its source tree is externally mounted and must be clean at that commit.

The MinIO dependency overlay is stored in `infra/minio/go.mod`, `infra/minio/go.sum`, and `infra/minio/provenance.json`. The overlay upgrades vulnerable dependencies and requires Go 1.26.0. `local_infra.py` checks the provenance commit, Go version, and both SHA-256 hashes before invoking Compose. The Docker build repeats those checks, runs `go mod verify`, and builds with `-mod=readonly`, so it cannot silently rewrite the lock. The overlay is pinned by these hashes:

| File | SHA-256 |
| --- | --- |
| `go.mod` | `34955c16f33a8d452d4b275788c3fd479bcff24b195da2aaaf2d21e429d8e049` |
| `go.sum` | `681ff94f027c822739befb5ef49b3482ebe0629bf9383a4f6085250700568b6e` |

The Compose project publishes PostgreSQL on `127.0.0.1:55432` and MinIO on `127.0.0.1:59000`. The Docker bridge provides NAT egress; this setup does not claim an egress-isolated storage network. Credentials remain in the private runtime directory and are mounted as secret files.

## Reproduction

Set `MINIO_SOURCE_DIR` to a clean checkout at the pinned MinIO commit and `CORE02_PRIVATE_DIR` to the private directory initialized for this proof. Do not display or copy credential contents. Then run:

```text
rtk proxy env CORE02_PRIVATE_DIR=/Users/parksurakiat/.cache/job-search-platform/core02-runtime-20261003 MINIO_SOURCE_DIR=/Users/parksurakiat/.cache/job-search-platform/upstream/minio rtk uv run --project backend python scripts/local_infra.py start --private-dir /Users/parksurakiat/.cache/job-search-platform/core02-runtime-20261003 --source-dir /Users/parksurakiat/.cache/job-search-platform/upstream/minio
rtk uv run --project backend python scripts/prove_storage.py --private-dir /Users/parksurakiat/.cache/job-search-platform/core02-runtime-20261003
rtk proxy env CORE02_PRIVATE_DIR=/Users/parksurakiat/.cache/job-search-platform/core02-runtime-20261003 MINIO_SOURCE_DIR=/Users/parksurakiat/.cache/job-search-platform/upstream/minio rtk uv run --project backend pytest backend/tests/integration/test_storage_infrastructure.py -q
```

The final integration run passed **7 tests**. The storage proof verified a PostgreSQL round trip, S3 object checksum `6561f8db9c0286635310479c4808f33980d9cf7a70fb31025f46199bb44b9fef`, anonymous-read denial, and object persistence after restarting MinIO. The final MinIO image ID was `sha256:eea4f85903934b217321297d2ca3602be29c7724990206149f312de321c915bf`; PostgreSQL used `sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652`.

## Dependency security evidence

The final image was scanned with Trivy 0.75.0 and vulnerability DB timestamp `2026-10-03 07:01:46 UTC`. The compiled MinIO binary report contains no Critical, High, Medium, or Low findings. It retains `GO-2026-5932` as an **UNKNOWN** advisory for `golang.org/x/crypto/openpgp` in `golang.org/x/crypto v0.56.0`; Trivy reports no fixed version. A pinned-container `go list -buildvcs=false -deps .` check did not include `golang.org/x/crypto/openpgp`, and a source search found no OpenPGP imports or calls. The advisory package is therefore not linked into this MinIO binary. The finding remains in the raw report; it is not suppressed.

Raw Trivy JSON and the CycloneDX SBOM are kept outside Git at `/Users/parksurakiat/.cache/job-search-platform/security/core02-20261003T161300Z/minio-overlay-final-image.json` and `/Users/parksurakiat/.cache/job-search-platform/security/core02-20261003T161300Z/minio-overlay-final-sbom.json`. The earlier MinIO dependency and binary scan reports and their SBOM are in that same private evidence directory. The vulnerability database and tool versions are recorded above; reports must be regenerated when that database changes.

This is MinIO-specific evidence, not an aggregate security pass for the platform. The PostgreSQL scan has separate unresolved advisories, and the dependency checker currently reports missing `CAREER_OPS_SOURCE_DIR` until the pinned Hermes source is available. Keep those results visible in the aggregate gate.

## PostgreSQL image remediation check

The current PostgreSQL pin is PostgreSQL 17.11 on Debian 12.15: `postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652`. With Trivy 0.75.0 and the database timestamp above, the OS target reported 15 Critical and 81 High package findings (32 distinct advisory IDs); the image's `gosu` Go binary added 1 Critical and 21 High findings. The OS findings include `util-linux`, Perl, SQLite, libxml2, zlib, LDAP, and other packages. Trivy returned no fixed version for the 32 distinct OS High/Critical advisories. The scanner reports installed packages; those package findings do not by themselves establish exploitability from the PostgreSQL server process.

Two official same-major alternatives were checked by immutable manifest digest. `postgres:17-trixie@sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f` is also PostgreSQL 17.11, but retains 1 OS Critical and 68 OS High rows plus the old `gosu` findings. `postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` has zero OS High/Critical rows, but its bundled `gosu` adds 1 Critical and 21 High findings. A one-off Bookworm `apt-get upgrade` candidate changed only `libssl3`, `openssl`, and `tzdata`; it retained the original OS Critical/High counts and used mutable package indexes, so it is not a pinned fix.

An isolated, local-only candidate replaced Alpine's `gosu` with upstream `tianon/gosu` v1.19 at commit `6456aaa0f3c854d199d0f037f068eb97515b7513`, built using the pinned Go 1.27.1 image `golang:1.27.1-bookworm@sha256:69a7b9788769bec032d238959b61854e9ae87f57be9029ec04e9885fabf99195`. The resulting image ID is `sha256:5f348633f44390e33b0d61247e28e7636748d6dc1cbedcc143a1abca29ad7b35`, based on the pinned PostgreSQL 17.11 Alpine manifest above. Its Trivy scan reports no Critical, High, Medium, or Low findings. It retains one UNKNOWN advisory, `CVE-2026-39824`, for `golang.org/x/sys/windows`; a Linux/arm64 dependency listing and source search found no Windows package import. The candidate starts, passes `pg_isready`, and answered a PostgreSQL version/current-user/database query.

The Alpine candidate is not a drop-in image for the existing Bookworm volume. In isolated synthetic clusters, Debian Bookworm reported `en_US.utf8` collation version `2.36`, while Alpine reported no actual collation version. Mounting the synthetic Bookworm data directory into the Alpine candidate produced PostgreSQL's warning that the database has no actual collation version while version `2.36` is recorded; the candidate's observed text ordering differed. Keep the current image pin for the existing volume unless a glibc-compatible fixed image becomes available, or complete a planned dump/restore with collation and index validation before migrating to Alpine. No shared service or Compose manifest was changed during this comparison.

Candidate scan JSON and SBOMs, including the one-off apt-upgrade image report, remain outside Git at `/Users/parksurakiat/.cache/job-search-platform/security/core02-postgres-candidates-20261004T0011Z/`. The original pinned-image JSON/SBOM are in `/Users/parksurakiat/.cache/job-search-platform/security/core02-20261003T161300Z/`. These are scoped image findings, not a platform security pass.

## CORE-02 PostgreSQL Alpine Compose proof — 2026-10-04

The active Compose stack now builds `job-search-platform/postgres:17.11-alpine-gosu-1.19-6456aaa0f3c8` from the pinned PostgreSQL 17 Alpine base and the pinned upstream gosu v1.19 source commit `6456aaa0f3c854d199d0f037f068eb97515b7513`. The running image ID is `sha256:b65a00df9778bc6f6e8c7f0208555da8f13fb391f92a69c160f853e21aaf8e2c`; it reports PostgreSQL 17.11 and gosu 1.19 built with Go 1.27.1. The clean gosu checkout, builder digest, dependency upgrade, and source/hash checks are recorded in `infra/postgres/provenance.json` and enforced by `infra/postgres/Dockerfile` and `scripts/local_infra.py`.

On this image, `scripts/local_infra.py status` reported PostgreSQL and MinIO healthy. `scripts/prove_storage.py` returned `status: verified`, including PostgreSQL CRUD, denial of anonymous S3 access, object SHA-256 `6561f8db9c0286635310479c4808f33980d9cf7a70fb31025f46199bb44b9fef`, and persistence after MinIO restart. `pytest backend/tests/integration/test_storage_infrastructure.py -q` passed **7 tests**. The PostgreSQL container mounts only `jobsearch-core02-postgres17-alpine-data`; the prior `jobsearch-core02_postgres_data` volume remains present and detached, with no container referencing it. Do not mount the old Bookworm volume on Alpine: the synthetic compatibility test above proved libc collation behavior differs.

Trivy 0.75.0 scanned this exact image on 2026-10-04 local time using vulnerability DB updated `2026-10-03 07:01:46 UTC` (next update `2026-10-04 07:01:46 UTC`). Results contain zero findings in both the Alpine OS package target and bundled gosu Go binary target. Raw JSON and CycloneDX SBOM are stored outside Git at `/Users/parksurakiat/.cache/job-search-platform/security/core02-postgres-candidates-20261004T0011Z/postgres-compose-image-trivy.json` and `/Users/parksurakiat/.cache/job-search-platform/security/core02-postgres-candidates-20261004T0011Z/postgres-compose-image-sbom.cdx.json`. This is a time-bounded scan result, not a claim that the image has no undisclosed vulnerabilities.

Root verification on 2026-10-04: source rebuild moved the MinIO tag to immutable image `sha256:ed336a7464e2eeecf94c70ff5778c6c0dd6ed84cefdb2e6fd67822b8334e5b20` while the old container retained its previous image. Root recreated only MinIO with --no-build/--no-deps/--force-recreate, preserving its existing volume, then repeated all 7 storage tests successfully. The running PostgreSQL image is `sha256:b65a00df9778bc6f6e8c7f0208555da8f13fb391f92a69c160f853e21aaf8e2c`; its new Alpine volume is separate from the preserved Bookworm volume. Complete 11-scope root scan exits0 with no High/Critical findings. MinIO OpenPGP UNKNOWN remains visible with the documented unlinked-package evidence; parser Cargo is release-source inventory, not compiled-wheel attestation. Exact scan summary: `/Users/parksurakiat/.cache/job-search-platform/security/20261003T175618.496420Z/scan-summary.json`. This is scoped foundation evidence; application services and release verification are still pending.
