# Local Workflow Implementation Plan

> **For agentic workers:** Execute through the owner-selected `delegate-build` waves in [the master plan](2026-10-03-platform-implementation.md). Steps use checkboxes; verify before committing.

**Goal:** Produce a real, durable local CV/job evaluation and document-generation workflow, independent of the frontend.

**Architecture:** FastAPI routes call project-scoped services; PostgreSQL repositories own transactions, queue claims and event sequences. S3 publishes only validated ready files. Trusted Hermes processes use separate project homes and dispatch untrusted tools into project Docker sandboxes.

**Tech Stack:** Python 3.12, uv, FastAPI, SQLAlchemy/Alembic/psycopg, boto3, Keychain adapter, Hermes/Career Ops, PostgreSQL, MinIO OSS, Docker and pytest.

## Global Constraints

All constraints in the master plan and DELIVERY.md apply. Only synthetic Thai/English CVs may be used in development tests. Do not read existing `.env` files, key stores or private CVs. Tests needing credentials receive them through runtime adapters; no credential values appear in commands or reports. Default tool execution network is disabled for the supplied-input workflow; provider calls belong to the trusted worker. A future public URL fetcher needs a separately verified egress policy, including private addresses and DNS rebinding.

## Review Focus

- CORE-02 and CORE-10 must use actual PostgreSQL/MinIO, including a source-built MinIO image.
- CORE-03 and CORE-08 must exercise actual pinned Hermes/Career Ops, not only fake worker interfaces.
- CORE-04/06 test real transaction races, not sequential simulations.
- CORE-05/08 exercise unsafe uploads and exports before publication.
- CORE-07/09 exercise owner bootstrap, credential redaction and private-input denial.

## Shared contracts established by CORE-04

Use UUIDs for project/resource/run IDs and UTC aware timestamps. Public state is exactly `queued`, `running`, `waiting_approval`, `completed`, `failed`, `cancelled`, `interrupted`. A cancellation request is an internal timestamp, not premature public `cancelled` state.

```python
@dataclass(frozen=True)
class Actor:
    kind: Literal["owner", "grant"]
    owner_session_id: UUID | None
    grant_id: UUID | None
    project_id: UUID | None
    capabilities: frozenset[str]

class RunRequest(BaseModel):
    session_id: UUID
    operation: Literal["evaluate_job", "draft_documents"]
    cv_revision_id: UUID | None  # None selects the current base revision atomically
    job_revision_id: UUID
    output_language: Literal["th", "en"]
    idempotency_key: str = Field(min_length=1, max_length=128)

class RunService(Protocol):
    async def submit(self, actor: Actor, project_id: UUID, request: RunRequest) -> RunView: ...
    async def get(self, actor: Actor, project_id: UUID, run_id: UUID) -> RunView: ...
    async def cancel(self, actor: Actor, project_id: UUID, run_id: UUID) -> RunView: ...
    async def events(self, actor: Actor, project_id: UUID, run_id: UUID, after: int) -> AsyncIterator[RunEvent]: ...
```

The ellipses above define protocol signatures, not incomplete implementation steps. Resolve foreign resource IDs by `(project_id, resource_id)`. Shared DTOs never contain storage keys, private raw input, credentials or native worker tracebacks.

### CORE-01 — Reproducible foundation and verification tooling

**Depends on:** reviewed master plan. **Owns:** `backend/pyproject.toml`, `backend/uv.lock`, `backend/src/job_search_platform/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_dependency_checks.py`, `backend/.gitignore`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/.gitignore`, `tests/package.json`, `tests/package-lock.json`, `tests/.gitignore`, `scripts/check_dependencies.py`, `scripts/security_scan.py`, `docs/engineering/dependencies.md`.

- [x] Create a Python src-layout package and pytest configuration. Use `uv lock --project backend` to resolve the master plan's candidate pins; add only required packages for ASGI serving, async tests, multipart upload, Keychain and lock/audit tooling. Record every accepted version and candidate rejection reason.
- [x] Create the minimal Vite configuration, exact dependency manifest and lock using `npm install --package-lock-only --prefix frontend`. Include Tailwind's Vite adapter, React integration, accessible shadcn component dependencies and locally packaged Thai/English fonts. Do not run a component generator that changes unrelated files. Pin Node 24 LTS and record the patch version.
- [x] Implement dependency checks: `check_dependencies.py` parses the lockfiles, rejects unresolved source branches/tags and ensures runtime versions meet manifests. For upstream checkouts, require the three exact commits in the master plan.
- [x] Write security tooling that runs pip-audit on the backend and Hermes environments, JavaScript audits on frontend/test locks, and Trivy on built infrastructure/worker images. Emit sanitized JSON plus an SBOM. Use named evidence directories outside Git for raw logs; write only non-sensitive summarized findings to documentation. Return nonzero on unresolved High/Critical findings or missing required scanner coverage.

```python
def test_required_scan_cannot_pass_when_image_is_missing(tmp_path):
    result = evaluate_scan_coverage({"backend": "complete", "minio_image": "missing"})
    assert not result.passed
    assert "minio_image" in result.missing
```

- [x] Run `rtk proxy uv run --project backend pytest backend/tests/test_dependency_checks.py -q`; red must fail on missing coverage/lock drift before the evaluator is implemented. Run `rtk proxy python3 scripts/check_dependencies.py` and lock consistency checks; green must pass without a product runtime claim. Commit only the owned foundation files through the root integrator.

**Acceptance:** Repeatable package resolution, documented exact pins and real scanner entrypoints; no secret-bearing file tracked. Initial CVE results are recorded honestly and block unsafe candidates before downstream runtime tests.

### CORE-02 — Real PostgreSQL/MinIO build and storage proof

**Depends on:** CORE-01. **Owns:** `infra/compose.yaml`, `infra/minio/Dockerfile`, `infra/.gitignore`, `scripts/local_infra.py`, `scripts/prove_storage.py`, `backend/tests/integration/test_storage_infrastructure.py`, `docs/engineering/storage-proof.md`.

- [x] Build MinIO from the pinned OSS commit with its verified Go toolchain and retained license notices. Pin build/base inputs and final image digest; scan build dependencies and final image, including Go coverage. Keep upstream AGPLv3 and maintenance status in evidence.
- [x] Configure PostgreSQL and MinIO on loopback only. Use separate internal infrastructure networking and health checks. Generate infrastructure credentials through a local setup command and store them in a private directory outside the repository; use Docker secret files or a verified supported file-based mechanism. The command reports paths/status only, never values. Do not use sample hard-coded credentials.
- [x] Implement `local_infra.py start/status/stop` using bounded subprocess calls. Validate private-directory permissions and refuse secrets beneath the Git root. Never destroy volumes on normal stop. A separate test-only reset can delete only resources carrying the test label.

```python
def test_infra_rejects_repository_secret_directory(repo_root):
    with pytest.raises(ConfigurationError, match="secret_directory_in_repository"):
        validate_private_directory(repo_root / "infra" / "secrets", repo_root)
```

- [x] Implement `prove_storage.py`: connect to PostgreSQL, create/update/select a synthetic test row in a rollbackable test database; create a private S3 bucket, upload/read/check SHA-256, restart MinIO and verify persistence, then delete only the probe objects. Report image/source IDs and checksum results, never connection credentials.
- [x] Run red/green unit validation, then `rtk proxy python3 scripts/local_infra.py start` and `rtk proxy uv run --project backend pytest backend/tests/integration/test_storage_infrastructure.py -q`. Record actual source-build, health, restart, S3 and CVE evidence.

**Acceptance:** Pinned source-built MinIO and PostgreSQL work with private persistence. Unbuildable or unsafe MinIO remains a blocker; no product substitution or unsupported security assurance.

### CORE-03 — Hermes/Career Ops compatibility and isolation probe

**Depends on:** CORE-01. **Owns:** `scripts/prove_hermes.py`, `backend/src/job_search_platform/integrations/hermes_runtime.py`, `backend/tests/integration/test_hermes_runtime.py`, `backend/tests/fixtures/synthetic_cv.txt`, `backend/tests/fixtures/synthetic_job.txt`, `infra/hermes/`, `docs/engineering/hermes-proof.md`.

- [x] Acquire full pinned Hermes and Career Ops sources into an external immutable dependency cache, with no nested Git repository committed. Install Hermes into its own locked runtime environment so it cannot silently change the backend resolver result.
- [x] Inspect the pinned native startup/run/events/stop/approval/session interfaces and document exact native launch/configuration and API mappings. Implement a small typed `HermesRuntime` adapter with `start_project`, `submit`, `events`, `stop`, `health` and `close` methods. Validate native response schemas and sanitize errors; no browser or external client reaches this native service.
- [x] Load the Career Ops router and referenced modes/scripts from the full checkout. Reuse verified parsing/export code. Prove text PDF/DOCX/pasted input and Thai/English outputs using synthetic fixtures; identify scanned PDFs rather than silently returning an empty CV.
- [x] For two synthetic projects, configure separate Hermes homes and Docker tool workspaces. Test terminal, read/write/edit/search and every other enabled tool against traversal, another project's marker, host home and environment access. Disable unsupported tools before exposing them. Containers are non-privileged, have resource limits, no Docker socket and no provider credentials; supplied-input execution has no network.

```python
async def test_native_tool_cannot_read_another_project(native_runtime, project_pair):
    first, second = project_pair
    result = await native_runtime.probe_file_read(first, second.marker_path)
    assert result.denied
    assert second.marker_text not in result.public_text
```

- [x] Run `rtk proxy python3 scripts/prove_hermes.py --offline` for native startup/skill loading/tools/stop without a provider call, followed by integration tests. The offline proof must invoke actual native tool execution. Record an explicit blocked status for any native function that cannot be exercised offline. A live-provider synthetic smoke belongs to CORE-08.

**Acceptance:** Native interface compatibility, complete skill loading and tool isolation are evidence-backed. A mere profile/home difference is insufficient. Stop or unsupported isolation is a blocker for later worker integration.

### CORE-04 — Schema, shared DTOs and authorization boundary

**Depends on:** CORE-02 and CORE-03. **Owns:** `backend/src/job_search_platform/db/models.py`, `backend/src/job_search_platform/db/session.py`, `backend/src/job_search_platform/db/repositories.py`, `backend/src/job_search_platform/services/contracts.py`, `backend/src/job_search_platform/services/authorization.py`, `backend/src/job_search_platform/services/errors.py`, `backend/migrations/`, `backend/tests/conftest.py`, `backend/tests/helpers.py`, `backend/tests/integration/test_project_authorization.py`, `backend/tests/integration/test_schema.py`, `docs/contracts/application-api.yaml`.

- [x] Define the schema for projects, sessions/messages, job/CV/document revisions, provider secret references, runs/events, files, grants and approvals. Scope every foreign reference to a Project using composite keys or service checks inside the transaction. Store grant hashes, never grant values. Store provider/model/secret reference, never provider secrets.
- [x] Add unique `(project_id, actor_scope, idempotency_key)` run identity and an immutable canonical request digest. Add a partial unique index on project_id for `running`/`waiting_approval` runs; event sequence is unique per run. Include lease owner/expiry, cancellation_requested_at, retry_of and input/config snapshots.

```sql
CREATE UNIQUE INDEX one_active_run_per_project ON runs(project_id)
WHERE status IN ('running', 'waiting_approval');
CREATE UNIQUE INDEX run_event_sequence ON run_events(run_id, sequence);
```

- [x] Implement `authorize(actor, project_id, action, resource_kind)` with owner grants versus `results:read`, `jobs:evaluate`, `documents:draft`. Deny grants raw CV/uploads/chat and owner management. Resolve grant expiry/revocation from persisted state on every request and stream event. Use generic scoped `not_found` for foreign resource IDs, `forbidden` for unavailable capabilities.
- [x] Write the Pydantic DTOs above and API schema with the full routes from REST-001. Errors contain stable `code`, `message_key`, `retryable`, optional field names and correlation ID; never raw exception text. Add owner CRUD for projects/sessions/jobs/preferences and revision views, run operations, uploads/downloads, approvals, token and provider settings.
- [x] Define shared synthetic owner/grant/Project/Session/request constructors in tests/helpers.py and database fixtures in conftest.py. Tests for parallel tasks get distinct test databases/buckets and ports; no concurrent global reset. Later workers keep task-specific fixtures within their own test modules and request shared-fixture edits from root at a wave boundary.
- [x] Run `rtk proxy uv run --project backend pytest backend/tests/integration/test_schema.py backend/tests/integration/test_project_authorization.py -q` against actual PostgreSQL. First fail a grant attempting to retrieve another project's raw CV; green must include expired/revoked grants and composite-reference rejection. Upgrade an empty DB and re-run migration from the preceding revision with synthetic data preserved.

**Acceptance:** Fixed DTOs and route contract consumed unchanged by later tasks; project-scoped storage references and authorization have passing real-DB denial tests.

### CORE-05 — Upload, parsing metadata and artifact publication

**Depends on:** CORE-04. **Owns:** `backend/src/job_search_platform/integrations/object_store.py`, `backend/src/job_search_platform/services/files.py`, `backend/src/job_search_platform/services/documents.py`, `backend/tests/integration/test_file_publication.py`, `backend/tests/test_upload_validation.py`.

- [x] Implement a boto3 adapter for a private bucket using server-selected opaque keys. File metadata states are pending/ready/failed; only ready objects become inputs/downloads. Accept at most 20 MiB while streaming; validate actual PDF/DOCX content/MIME and checksum, reject malformed/oversized/scanned-only input with specific stable errors. Parse inside the verified sandbox with size/time/zip-expansion bounds; never extract DOCX paths on the host.
- [x] Implement `Files.upload(actor, project_id, stream, declared_type, display_name)` and `Artifacts.publish(project_id, run_id, validated_manifest)`. Use pending metadata, object write/checksum, then ready transaction. On object success plus transaction failure, keep the object inaccessible and reconcile from persisted pending records. Never assume DB and S3 share a transaction.
- [x] Implement owner-only raw downloads and authorized generated-artifact downloads. Prefer authenticated streaming for strict revocation; never accept a caller's arbitrary object key. Validate artifact path remains under the run staging directory and filename/MIME/checksum match before publishing. Never follow symlinks out of staging.

```python
async def test_commit_failure_does_not_publish_uploaded_object(files, fail_ready_commit):
    with pytest.raises(StorageCommitError):
        await files.upload(owner, project_id, synthetic_pdf_stream, "application/pdf", "cv.pdf")
    assert await files.list_ready(owner, project_id) == []
    assert await files.reconcile_pending() == 1
```

- [x] Run `rtk proxy uv run --project backend pytest backend/tests/test_upload_validation.py backend/tests/integration/test_file_publication.py -q` with actual S3 and injected DB failure. Include symlink/traversal, zip expansion, unsupported scanned PDF and missing object tests.

**Acceptance:** No partial/unsafe object is published; grants cannot read original uploads, and all downloads enforce current Project access.

### CORE-06 — Durable runs, leases, limits and approvals

**Depends on:** CORE-04. **Owns:** `backend/src/job_search_platform/services/runs.py`, `backend/src/job_search_platform/services/approvals.py`, `backend/src/job_search_platform/workers/queue.py`, `backend/tests/integration/test_runs.py`, `backend/tests/integration/test_queue_races.py`, `backend/tests/integration/test_approvals.py`.

- [x] Implement the RunService signatures and snapshot revision IDs plus document language/provider configuration during submission. Canonicalize the request and bind idempotency to Project+actor. Same key/body returns the same run; changed body returns `idempotency_conflict`. Retry creates a new run with retry_of; no checkpoint-resume claim.
- [x] Claim work under a short transaction: serialize global capacity selection with a PostgreSQL advisory transaction lock, lock queue candidates with `FOR UPDATE SKIP LOCKED`, verify Project occupancy, apply the active unique index, then assign lease. Heartbeat must match lease owner. Default maximum is two active Projects, one active run per Project, ten queued runs per Project and twenty external submissions/hour/grant; apply DB-backed counters atomically.
- [x] Persist events with transaction-assigned sequence numbers. Implement limit checks before dispatch and during execution: fifteen minutes active execution, thirty tool calls; pause execution time while awaiting approval. Approval expires after twenty-four hours, binds target/revision/change digest and is consumed once. Expiry fails the run with `approval_expired`; only owner can resolve/promote/delete, with current revision checked in the same transaction.
- [x] A queued cancellation can finish immediately. Running cancellation stores intent; CORE-08 confirms execution stops before public cancelled state. Owner or the same still-valid creating grant can cancel. Other same-project grants cannot cancel that run. Terminal cancellation requests are idempotent and cannot rewrite completed outputs.

```python
async def test_same_key_different_body_conflicts(run_service, actor, project_id, request):
    first = await run_service.submit(actor, project_id, request)
    assert (await run_service.submit(actor, project_id, request)).id == first.id
    with pytest.raises(ServiceError, match="idempotency_conflict"):
        await run_service.submit(actor, project_id, request.model_copy(update={"output_language": "en"}))
```

- [x] Run `rtk proxy uv run --project backend pytest backend/tests/integration/test_runs.py backend/tests/integration/test_queue_races.py backend/tests/integration/test_approvals.py -q`. Use two actual DB connections/workers with a barrier; assert one claim per Project and two globally, not merely sequential successful queries. Test approval replay, stale revision, expiry and unauthorized cancellation.

**Acceptance:** Queue/idempotency/limits survive concurrent clients and preserve snapshots. No lease theft or stale approval can change durable data.

### CORE-07 — Owner session, settings and secret adapter

**Depends on:** CORE-04. **Owns:** `backend/src/job_search_platform/services/owner_sessions.py`, `backend/src/job_search_platform/services/settings.py`, `backend/src/job_search_platform/services/grants.py`, `backend/src/job_search_platform/integrations/secrets.py`, `backend/tests/test_owner_sessions.py`, `backend/tests/test_secret_redaction.py`, `backend/tests/integration/test_grants.py`.

- [x] Implement one-time random launch nonce exchange, persisted hashed nonce/session records with expiry and atomic consume. Require exact configured loopback Origin/Host; issue HttpOnly/SameSite owner cookie. Reject untrusted Origin and missing/expired/replayed nonce. State-changing owner routes require CSRF token and Origin; no login/account page.
- [x] Implement macOS Keychain access through the Python adapter, not command-line arguments containing keys. Settings accept a key once, save the reference and return configured status/masked metadata only. Missing/unavailable Keychain yields `secret_store_unavailable`; never fall back to plaintext DB/localStorage. A synthetic in-memory adapter is test-only.
- [x] Implement owner provider/model configuration and tool connector configuration for supported allowlisted adapters. Show which provider receives CV data. Connection tests are bounded and redact credentials. Requests cannot override model/keys. Configuration changes create a new revision for future runs; existing run snapshots remain unchanged.
- [x] Issue random project tokens, store only keyed/secure hashes plus expiry/capabilities/audit fields. Return the full token once on creation, never on list/read. Revoke atomically. Warn in UI contract that `results:read` shares generated CV/Cover Letter contents; no cost-cap guarantee.

```python
async def test_launch_nonce_is_single_use(owner_sessions, launch):
    await owner_sessions.exchange(launch.nonce, launch.origin)
    with pytest.raises(ServiceError, match="invalid_launch"):
        await owner_sessions.exchange(launch.nonce, launch.origin)
```

- [x] Run `rtk proxy uv run --project backend pytest backend/tests/test_owner_sessions.py backend/tests/test_secret_redaction.py backend/tests/integration/test_grants.py -q`. Use recognizable synthetic key/token sentinels and assert absence from captured logs, public events/DTOs and DB fields. Verify native Keychain save/read/delete with a disposable synthetic test entry on macOS, without examining other entries.

**Acceptance:** Owner identity differs from grant identity; secrets have a real local backend and no round-trip disclosure; grant revocation and one-time display work.

### CORE-08 — Worker integration, generation and real stop

**Depends on:** CORE-05, CORE-06, CORE-07. **Owns:** `backend/src/job_search_platform/workers/executor.py`, `backend/src/job_search_platform/workers/sandbox.py`, `backend/src/job_search_platform/workers/supervisor.py`, `backend/tests/integration/test_worker_lifecycle.py`, `backend/tests/integration/test_document_exports.py`, `scripts/smoke_workflow.py`.

- [x] Wire the proven HermesRuntime into claimed runs. Materialize immutable input snapshots read-only, assign the Project home/workspace, dispatch Career Ops evaluate/draft operations and map validated native results to shared DTOs. Reject unsupported native response shapes. Tool arguments/results remain private; persist only sanitized public progress and generated artifact IDs.
- [x] Trusted worker receives provider credentials through controlled configuration and minimal environment. Its tool subprocess/container environment is separately built from an allowlist and cannot inherit keys. Label containers/process groups with project/run IDs; mount only own inputs/staging/workspace, with quotas/timeouts and no privileged mode/network for the initial supplied-input operation.
- [x] Validate both evaluation evidence and draft content, then reuse verified Career Ops exporters. Render Thai PDFs with appropriate embedded font and inspect glyphs/pages; verify DOCX text and document language. If an exporter fails, fail with `export_failed` and retain explicitly marked partial results; never label a partial file completed.
- [x] Implement stop escalation: request native stop, verify worker/tool process and container cessation, then persist cancelled. On backend shutdown stop dispatch, terminate owned execution and persist interrupted. Startup reconciles stale lease owners and labeled containers before dispatch; it stops unfinished old work rather than re-enqueueing it automatically.

```python
async def test_cancel_means_execution_has_stopped(supervisor, long_running_native_run):
    run = long_running_native_run
    await supervisor.request_cancel(run.id)
    await supervisor.wait_terminal(run.id, timeout=10)
    assert not await supervisor.execution_exists(run.id)
    assert await supervisor.public_status(run.id) == "cancelled"
```

- [ ] Run native lifecycle/export tests and `rtk proxy python3 scripts/smoke_workflow.py --synthetic`. A real provider run requires owner-configured credentials through Settings; no key is passed in flags. Verify CV/job evaluation, Thai and English draft exports, published checksums and persisted reopen. If provider configuration is absent, report the live test blocked and preserve completed offline evidence.

Offline gate accepted 2026-10-04: root backend144 PASS; independent native18 and focused3 PASS, real shutdown probe PASS. Live-provider checkbox remains pending owner Settings (UI-04).

**Acceptance:** Real agent workflow and real sandbox stop, with proper revisions and readable Thai/English artifacts. No fake-success fallback when provider or native runtime fails.

### CORE-09 — REST, SSE and application assembly

**Depends on:** CORE-08. **Owns:** `backend/src/job_search_platform/main.py`, `backend/src/job_search_platform/api/rest.py`, `backend/src/job_search_platform/api/sse.py`, `backend/src/job_search_platform/api/dependencies.py`, `backend/tests/integration/test_rest_api.py`, `backend/tests/integration/test_sse.py`, `scripts/run_local.py`.

- [ ] Assemble the shared services in a FastAPI lifespan with startup reconciliation and graceful shutdown. Implement all CORE-04 routes, multipart file streaming, authenticated download and stable errors. Keep owner UI/application routes on loopback; shared protocol listener remains disabled until explicitly configured.
- [ ] Implement SSE using persisted events: `id` equals per-run sequence; `Last-Event-ID` resumes strictly after that value. Validate nonnegative cursor, authorize before open and recheck grant/session validity before every event/heartbeat. Browser disconnect stops only the stream, not execution; no private tracebacks/tool arguments go into events.

```python
async def test_sse_reconnect_replays_only_missing_events(api, running_run):
    first = await api.read_events(running_run, after=0, limit=2)
    replay = await api.read_events(running_run, after=first[-1].sequence)
    assert all(e.sequence > first[-1].sequence for e in replay)
    assert len({e.sequence for e in first + replay}) == len(first + replay)
```

- [ ] Build a local launcher that prints an owner launch link containing a one-time nonce but no provider/infra secret; frontend exchanges it and immediately removes the nonce from browser history. Do not record the nonce in application logs. Serve frontend from the same origin in local production mode; development proxy has an explicit allowed loopback origin.
- [ ] Run `rtk proxy uv run --project backend pytest backend/tests/integration/test_rest_api.py backend/tests/integration/test_sse.py -q`. Include missing Origin/CSRF, nonce replay, duplicate submission, reconnect, foreign ID, expired grant midstream, browser disconnect and worker restart. Validate runtime OpenAPI against `docs/contracts/application-api.yaml`.

**Acceptance:** Working same-origin local API and durable events; session/Project privileges remain consistent for every route.

### CORE-10 — Restart and coordinated backup/restore

**Depends on:** CORE-09. **Owns:** `scripts/backup.py`, `scripts/restore.py`, `backend/tests/integration/test_recovery.py`, `backend/tests/integration/test_restore.py`, `docs/engineering/recovery-proof.md`.

- [ ] Back up using a maintenance window: pause submissions/dispatch, stop or complete active execution with explicit interrupted status, obtain PostgreSQL dump and S3 object manifest/checksums, copy version-matched objects, and write a non-sensitive manifest with schema/source versions. No credentials or raw private data go into committed evidence.
- [ ] Restore only into an explicitly empty test target by default. Require a separate deliberate target selection for owner data. Validate checksums/metadata, migrations and object readiness before serving; reconcile missing objects as unavailable and never silently return corrupt artifacts. Owner/provider secrets and grant tokens are excluded from transferable raw reports; explain their reconfiguration/revocation requirements.
- [ ] Kill the backend during a native run while preserving published results. Restart and assert no old execution resumes, unfinished status is interrupted, completed artifacts remain accessible and manual retry creates a distinct run. Include stale lease and surviving labeled container cases.

```python
async def test_restart_never_redispatches_interrupted_run(restarted_app, killed_run):
    assert await restarted_app.status(killed_run.id) == "interrupted"
    assert not await restarted_app.execution_exists(killed_run.id)
    retry = await restarted_app.retry_as_owner(killed_run.id)
    assert retry.id != killed_run.id
    assert retry.retry_of == killed_run.id
```

- [ ] Run `rtk proxy uv run --project backend pytest backend/tests/integration/test_recovery.py backend/tests/integration/test_restore.py -q`. Restore synthetic CV/jobs/artifacts into a fresh DB/bucket, reopen the Project and compare checksums/document references. Inject missing/tampered objects and wrong schema manifest to prove failure handling.

**Acceptance:** Actual restart and coordinated restore pass with preserved completed outputs, no duplicate execution and explicit unavailable/corrupt results. Update the Hub and commit through the root integrator after verified completion.
