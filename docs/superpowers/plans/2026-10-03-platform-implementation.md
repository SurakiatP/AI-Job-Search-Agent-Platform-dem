# AI Job Search Agent Platform Implementation Plan

> **For agentic workers:** Owner-selected execution method: `delegate-build`. Follow its ordered waves, exclusive file ownership and independent final review. Steps use checkboxes. Use the relevant Superpowers implementation and verification instructions within each scoped task; do not substitute a different execution method without the owner.

**Goal:** Deliver a local, single-owner bilingual job-search application backed by real Hermes/Career Ops, PostgreSQL and MinIO OSS, with project-scoped MCP/A2A access.

**Architecture:** One React application and one modular FastAPI backend. Transport adapters call shared authorization, run and artifact services. PostgreSQL stores durable state and queue leases; MinIO stores private objects. Trusted Hermes workers call owner-configured providers; tool execution runs in a separate Docker sandbox per Project.

**Tech Stack:** Python 3.12, FastAPI/Pydantic, SQLAlchemy/Alembic/psycopg, boto3, official MCP/A2A SDKs; React/TypeScript/Vite, Tailwind/shadcn, React Router, react-i18next; Docker Compose, pytest, Playwright and dependency/image scanners.

Date: 2026-10-03. Status: owner-approved for delegate-build execution. The owner approved the specification, reviewed this written plan and then explicitly instructed execution. Runtime and security acceptance gates remain unverified until their tasks pass.

## Global Constraints

- Authoritative behavior: [platform specification](../specs/2026-10-03-platform-design.md), [DESIGN.md](../../../DESIGN.md), [delivery requirements](../../engineering/DELIVERY.md).
- Branch: `feat/platform-foundation`, based on fetched `origin/develop`. Preserve unrelated `.gitignore` and `.python-version`. Do not push, merge, delete branches or force-add local Hub files during implementation.
- The selected chat layout is open chat with an optional document panel. No animations. App name remains **AI Job Search Agent Platform** in both languages.
- Each Project has separate Sessions, CV revisions, Hermes state and tool sandbox. Raw CVs/uploads/chat are owner-only; a results grant intentionally shares generated documents, which can contain personal information.
- Initial workflow uses a supplied job posting and a text PDF, DOCX or pasted CV. OCR, autonomous Thai-board scanning and automatic application submission are outside this release. The owner submits applications manually.
- Preserve the exact limits and owner/private-data policies in the specification. No caller-supplied provider key/model, arbitrary storage key or shell tool.
- All shell commands begin `rtk`; use `rtk proxy` when exact output is needed. Read the Hub in the root agent instructions' order and update it at every wave boundary. Hub files and secret-bearing material stay outside Git and agent task contexts.
- Use `uv` only as Python dependency/environment tooling: it provides the committed lock and repeatable isolated tests. It does not replace PostgreSQL queues, Hermes or application services. Never install dependencies before plan approval.
- Workers write only their owned files. The root integrator owns shared manifests, entrypoints, schema composition, migrations, Compose and lockfiles after their creating task completes. A worker proposes shared-file edits to the integrator instead of racing another worker.
- Fail closed on a missing provider, unsafe artifact, unsupported sandbox tool or unavailable upstream integration. Test doubles establish service semantics; they never count as evidence that Hermes/MinIO work.

## Plans and release boundaries

The subsystems are split into independently testable plans. Execute all three for the approved release; completing one does not complete the platform.

1. [Local workflow and infrastructure](2026-10-03-local-workflow.md): builds infrastructure and a working REST workflow from synthetic CV/job input through Hermes to durable document artifacts.
2. [Frontend](2026-10-03-frontend.md): builds the approved bilingual UI and connects it to the real services.
3. [MCP/A2A and release verification](2026-10-03-protocols-and-verification.md): exposes the same services to project-scoped external clients and verifies the aggregate release.

## Dependency candidates and reproducibility

PyPI/npm metadata was read on 2026-10-03. These are initial exact candidates, not a compatibility or security claim:

| Package group | Candidates |
|---|---|
| API/data | fastapi 0.142.2; pydantic 2.13.5; sqlalchemy 2.1.3; alembic 1.20.0; psycopg 3.3.6; boto3 1.43.108 |
| Protocols/tests | mcp 2.3.0; a2a-sdk 1.2.1; pytest 9.1.1; pip-audit 2.10.1 |
| UI | react/react-dom 19.3.0; vite 8.3.2; typescript 7.0.2; tailwindcss 4.3.3; react-router 8.4.0; react-i18next 17.0.15; i18next 26.4.2 |
| Browser tests | @playwright/test 1.63.0 |

Use Node 24 LTS, with a pinned patch version recorded by CORE-01; React Router's candidate requires Node >=22.22.0. Lock supporting runtime/test packages with the same resolver and record their versions. CORE-01 verifies candidate availability, dependency compatibility and advisories, then records exact accepted versions and image digests in `docs/engineering/dependencies.md`. An incompatible or vulnerable candidate may be replaced with a compatible supported release without changing product behavior; document the reason and re-run affected checks. A change to product architecture/contracts returns to owner review.

Pinned upstream source inputs:

- Hermes: `c8301ea6c9b797184df16a9c5dd462400b264ff4`.
- Career Ops: `c1d0d1f3229daad3f2f5a7a4e46c9b256db51ea7`, full checkout with its referenced scripts/modes.
- MinIO OSS: `7aac2a2c5b7c882e68c1ce017d8256be2feea27f`, AGPLv3, source build; upstream is archived/unmaintained. Verify the source requirements and final image. Do not silently substitute AIStor or treat an old binary as maintained.

No download, build, container start, dependency install, scanner run or live provider call has been performed in this planning phase.

## Ordered waves

The delegate-build planner receives these complete plans after review. It may subdivide a task into sequential steps, but must preserve dependencies, file ownership, contracts and acceptance criteria.

| Wave | Tasks | Parallelism and gate |
|---|---|---|
| 0 | CORE-01 | One owner: package locks, bootstrap and security tooling. Fail on unresolved unsafe dependencies. |
| 1 | CORE-02 + CORE-03 + UI-01 | Independent infrastructure proof, Hermes compatibility proof and UI shell. No shared manifests may be edited concurrently. |
| 2 | CORE-04 | One owner: schema, transactional repositories and authorization contracts. Native Hermes/MinIO proofs must have passed. |
| 3 | CORE-05 + CORE-06 + CORE-07 | Separate storage, run-lifecycle and owner/secret modules and test files. Import CORE-04 types; shared wiring remains root-owned. |
| 4 | CORE-08 | Integrate real Hermes execution into the durable lifecycle; prove isolation, export, stop and interruption. |
| 5 | CORE-09 + UI-02 | REST/SSE adapter and UI route/screens against fixed schemas. UI-02 uses synthetic contract fixtures until the adapter is ready. |
| 6 | UI-03 | Complete the typed API client and real workflow binding before Settings consumes them. |
| 7 | UI-04 + PROTO-01 + PROTO-02 | Independent Settings, MCP and A2A scopes; root assembles shared entrypoints after the wave. |
| 8 | CORE-10 + UI-05 | Separate backend restore/lifecycle proof and Playwright journeys. Each uses its own test database/bucket/server ports. |
| 9 | PROTO-03 then PROTO-04 | Integrate security verification and docs, then independent reviewer of the full diff. Never run the final reviewer concurrently with edits. |

Use at most three implementation workers concurrently, within the available four-agent total. Finish, inspect and verify every wave before starting a dependent one.

## Delegation allocation

- Planner: `gpt-6.1-sol`, effort `high`; review these plans into ordered scoped tasks.
- Implementation: `gpt-6-luna`, effort `high`; one task per worker, only relevant contracts/files and synthetic data.
- Final reviewer: fresh `gpt-6.1-sol`, effort `high`; inspect aggregate behavior and run checks independently. Return explicit PASS/FAIL, with evidence and gaps.
- Root: review wave scopes, integrate shared files, resolve defects within the approved scope and maintain the Hub. Workers do not commit concurrently. Root commits after wave verification.

## Review Focus

1. Cross-project IDs and a revoked grant during a live SSE/MCP/A2A connection: CORE-04, CORE-09, PROTO-01/02/03 deny access, including events and downloads.
2. Two dispatchers, duplicate requests, backend death and surviving execution containers: CORE-06/08/10 prove leases, idempotency and real stop without automatic replay of old work.
3. Object upload succeeds while metadata commit fails, plus mixed DB/object backups: CORE-05/10 exercise publication reconciliation, checksum validation and coordinated restore.
4. Thai text PDF versus scanned PDF, broken DOCX and Thai PDF glyphs: CORE-03/08 and UI-03 distinguish supported inputs and prove export content/layout with synthetic data.
5. Secrets entering tool environments, malicious job text/paths and unmaintained MinIO dependencies: CORE-02/03/07/08 and PROTO-03 test deny/redaction paths and record CVE coverage. A missing scanner result or skipped live proof cannot be reported as PASS.

## Completion and integration

- [ ] Each task's targeted checks and the aggregate tests pass, including real PostgreSQL/MinIO and Hermes compatibility evidence.
- [ ] A synthetic live-provider smoke run proves the owner's configured provider path; if no provider is configured, record the live check as blocked rather than claiming full runtime verification. Provision through owner Settings, never through agent prompts or printed environment values.
- [ ] No unresolved exploitable Critical/High finding. Any remaining Critical/High finding needs the documented owner acceptance required by DELIVERY.md before merge/release.
- [ ] The independent reviewer reports PASS for the approved release, with exact commands, scan scope, advisory timestamps and limitations.
- [ ] Root updates Hub statuses and commits the verified changes on the feature branch. Merge into develop is a later completion step; no push or merge happens during planning.

**Execution authorization:** The owner approved this written plan and instructed delegate-build execution on 2026-10-03. Preserve its acceptance gates and report actual evidence at every wave.
