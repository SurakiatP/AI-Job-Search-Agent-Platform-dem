# Delivery requirements

Date: 2026-10-03
Status: Owner-approved delivery constraints and implementation plan; delegated execution started on feat/platform-foundation. Acceptance remains evidence-based.

The platform specification in `../superpowers/specs/2026-10-03-platform-design.md` defines behavior and contracts. `../../DESIGN.md` defines the UI. This document adds the owner's requirements for structure, security, CVE checks and delegated implementation; it does not replace either specification.

## Repository layout

Use one repository and one Python backend package. Create directories only when a task adds working code or useful documentation.

```text
frontend/                        React + TypeScript + Vite application
  src/
    app/                         routing, providers and application shell
    features/                    projects, chat, jobs, documents, settings
    components/                  reused UI components
    locales/                     Thai and English translations
    lib/                         API client and shared UI helpers
backend/
  pyproject.toml                 Python dependencies and tooling
  src/job_search_platform/
    api/                         REST, SSE, MCP and A2A transport adapters
    services/                    shared authorization, runs and artifacts
    db/                          models and PostgreSQL queue persistence
    integrations/                Hermes, Career Ops, S3 and secret adapters
    workers/                     execution, leases and interruption handling
  migrations/                    Alembic migrations
  tests/                         unit and backend integration tests
infra/                           Compose and pinned container build inputs
scripts/                         repeatable setup and verification commands
tests/e2e/                       Playwright user journeys
docs/
  engineering/                  delivery and security evidence
  contracts/                    versioned interface definitions when needed
  superpowers/specs/            authoritative architecture
  superpowers/plans/            reviewed implementation plans
DESIGN.md                        frontend rules and interaction design
.integration-hub/                ignored local operational memory
```

Keep frontend features together. Keep all protocol adapters on the same backend services so REST, MCP and A2A enforce the same project authorization. Start with a modular backend, without separate services or a second queue system.

Pin the full Career Ops checkout and Hermes revision through a reproducible dependency/build mechanism. Do not copy only the Career Ops router skill, commit a nested repository, or make third-party source an application-owned module. Validate the acquisition mechanism in the implementation plan.

## Security acceptance evidence

- Local owner access, shared listener controls and project credentials follow AUTH-001. External callers must be denied access to other projects and owner credentials.
- Store provider credentials through the secret adapter. Keep secrets and personal data outside Git, the Hub, logs, agent prompts used for development and test fixtures. Test data must be synthetic.
- Authorize file access before signing downloads. Enforce upload limits, safe filenames and paths, content handling and artifact publication state. Prevent job URLs and downloaded content from reaching host/private services without an explicitly permitted destination policy.
- Job postings, documents and tool output are untrusted content. They cannot grant permission to change credentials, share projects, delete inputs or perform owner-only actions.
- Verify sandbox boundaries for every enabled tool, including file operations and network tools. Project execution containers receive only their own workspace; they must not receive the Docker socket, host home directory or infrastructure/provider secrets.
- The trusted backend may control Docker through a narrow orchestration adapter. Do not expose Docker control as a model tool. Verify that cancellation stops actual execution and that interrupted work cannot silently resume.
- Check run limits, grant revocation and approval scope across every transport. Do not describe work limits as guaranteed provider spending caps.
- Backup and restore must cover PostgreSQL metadata and MinIO objects together, with artifact checksums and a tested recovery procedure.

These are acceptance requirements, not evidence that the controls already work. Public hosting remains a separate deployment review requiring HTTPS and suitable owner authentication.

## Dependency and CVE checks

At dependency selection, lock direct and transitive dependencies and pin container inputs. Produce an SBOM and record exact versions or image digests, scanner versions, advisory database timestamps, scan scope and results. Re-run relevant checks when dependencies or images change and before merge/release.

Use a minimal toolset: `pip-audit` for the resolved Python environment, the selected frontend package manager's audit for JavaScript dependencies, and Trivy for built images/source dependencies and SBOM output where supported. Validate coverage, including Go components in MinIO and the Hermes execution image. A clean scan means no known findings in the recorded scope at that time; it is not a claim of complete security.

Block delivery for known exploitable Critical/High findings. For any unresolved Critical/High advisory, record affected component, reachability evidence, mitigation, residual risk and review date; require explicit owner acceptance before merge/release. Unknown or incomplete scanner coverage must be visible. Do not hide findings by disabling checks or ignoring advisories without evidence.

MinIO OSS must retain the owner's open-source choice and AGPLv3 license. Its researched upstream is archived and unmaintained. Prove a pinned source build, scan both build dependencies and the final image, retain license notices, and document maintenance/patch ownership. An unavailable safe build is a blocker, not permission to substitute a differently licensed product silently.

Use the approved implementation plan for scanner commands, versions, CI placement and evidence paths. Keep dependency installation scoped to the active implementation task.

## Delegated execution and Git

Use branches from the latest fetched `origin/develop`, named by work type: `feat/...`, `fix/...` or `docs/...`. Current preparation branch: `feat/platform-foundation`. Preserve unrelated user files. Do not push or merge as part of preparation.

The owner approved the written specification and reviewed implementation plans and selected `delegate-build` for execution. Use the skill's current Codex mapping: planner and independent reviewer `gpt-6.1-sol` at high effort; workers `gpt-6-luna` at high effort. Announce allocation before each role starts.

Each task must have an identifier, exclusive file ownership, dependencies, contract references, security boundaries and a verifiable acceptance criterion. Parallel tasks must not edit the same files or shared mutable state. Review the combined diff and update local Hub status after every wave. An independent reviewer must run relevant checks and report PASS or FAIL before completion is claimed.

Keep task prompts scoped. Use RTK for shell commands, concise communication and targeted reads. Token optimization must preserve test failures and security evidence. Do not send secrets or private CVs to worker agents, and do not route the same traffic through two optimization proxies.
