# MCP, A2A and Release Verification Implementation Plan

> **For agentic workers:** Use the owner-selected `delegate-build` method and [master waves](2026-10-03-platform-implementation.md). The final reviewer is fresh and independent of implementation.

**Goal:** Make the working local platform callable through official HTTP MCP/A2A with consistent Project authorization, then verify the whole release.

**Architecture:** Both protocol adapters call the existing Actor/RunService/artifact services. PostgreSQL remains the durable task/event source. A shared listener starts only when the owner explicitly enables it; owner management stays on its loopback surface.

**Tech Stack:** Official `mcp` 2.3.0 and `a2a-sdk` 1.2.1 candidates from the master plan, shared FastAPI/Python services, pytest, Playwright, pip-audit, JavaScript audit and Trivy. CORE-01 locks compatible inspected revisions; no hand-built wire protocol.

## Global Constraints

Use only the capabilities `results:read`, `jobs:evaluate`, `documents:draft`. Grant scope comes from the authenticated token; requests cannot select a different Project or override provider/model/secret configuration. Original CV/uploads/private chat remain owner-only. Result artifacts can contain owner information; granting results access intentionally shares those generated documents.

Bind loopback by default. Explicit LAN enablement exposes only shared protocol surfaces with Project tokens, configured allowed hosts/origins and workload limits. Do not enable public hosting, owner management over LAN, unauthenticated tools or unsolicited outbound callbacks. HTTPS and appropriate owner authentication require separate server-deployment review.

## Review Focus

- MCP sessions and A2A task IDs must not become authorization shortcuts after token revocation.
- A2A cancellation means execution stopped, not merely an acknowledged request.
- Native Hermes MCP/stdin and its in-memory A2A registry do not replace platform services.
- SDK compatibility, protocol version and actual network transports need client tests.
- All runtime/security evidence must refer to exact built/resolved inputs; blocked live tests and missing scanner coverage remain visible.

### PROTO-01 — HTTP MCP adapter and official-client tests

**Depends on:** CORE-09. **Owns:** `backend/src/job_search_platform/api/mcp.py`, `backend/tests/integration/test_mcp.py`, `docs/contracts/mcp.md`. **Root-owned integration:** shared server listener/lifespan and entrypoint wiring.

- [ ] Inspect the locked SDK's Streamable HTTP server/client interfaces and supported protocol version. Record SDK version, official specification URL/revision and negotiated version in the contract. Use the official transport implementation rather than manually constructing JSON-RPC responses. Authentication must resolve Actor on every request/event; an MCP session ID is not identity.
- [ ] Bind exactly `evaluate_job`, `draft_documents`, `get_run`, `cancel_run`, `list_results`. Use typed bounded parameters: input resource IDs, output th/en, idempotency key and run ID; a supplied job text can create a new job revision internally under the evaluation permission, without granting general Project CRUD. The adapter binds project_id from Actor and invokes the existing service. Return run ID/status promptly for long work.

```python
async def evaluate_job(actor: Actor, request: EvaluateJobInput) -> RunView:
    project_id = require_grant_project(actor)
    submission = await job_inputs.to_run_request(actor, project_id, request)
    return await runs.submit(actor, project_id, submission)
```

- [ ] Expose authorized result/artifact resources using server-created opaque resource identifiers. Results/downloads require results:read. Never expose raw input, storage keys, provider configuration, shell execution or private chat. Cancel uses owner or the still-valid original creating grant, consistent with REST. Do not send native tool logs in MCP result errors.
- [ ] Write tests using the real official SDK HTTP client and a live local app, not direct Python calls. Test initialize/tool listing, submission, later polling, duplicate key, resource read and cancel. Revocation must deny new operations/resources and close or deny further protected stream responses.

```python
async def test_mcp_session_does_not_outlive_revoked_grant(mcp_client, owner_api):
    await mcp_client.initialize()
    await owner_api.revoke(mcp_client.grant_id)
    response = await mcp_client.call_tool("list_results", {})
    assert_protocol_access_denied(response)
```

- [ ] Run `rtk proxy uv run --project backend pytest backend/tests/integration/test_mcp.py -q`. Include malformed params, foreign run ID, raw CV resource guessing, missing/expired token, wrong capability, duplicate body conflict and cross-session token reuse. Compare underlying durable run IDs with equivalent REST operations.

**Acceptance:** Official Streamable HTTP clients can use authorized services; session state never bypasses current Project authorization or revocation.

### PROTO-02 — Durable A2A tasks, Agent Card and real cancellation

**Depends on:** CORE-09. **Owns:** `backend/src/job_search_platform/api/a2a.py`, `backend/tests/integration/test_a2a.py`, `docs/contracts/a2a.md`. **Root-owned integration:** shared listener/lifespan and entrypoint wiring.

- [ ] Inspect the locked SDK's official Agent Card/task transport models, supported specification revision and client APIs. Record the exact negotiated protocol and expose a truthful Agent Card at the SDK-defined discovery path. Advertise only supported evaluate_job/draft_documents skills, bearer authentication, actual configured endpoint and implemented transports. Discovery contains no Project lists or private user data.
- [ ] Implement the SDK request handler using Actor and the same RunService. Task IDs map to persisted run UUIDs; client context/input references must resolve within the authenticated Project. A repeated idempotent submission creates no duplicate native run. Do not use native Hermes's in-memory task registry or an adapter-only dict as durable state.

```python
A2A_STATE = {
    "queued": "submitted", "running": "working", "waiting_approval": "input-required",
    "completed": "completed", "failed": "failed", "cancelled": "canceled",
    "interrupted": "failed",
}
```

- [ ] Map events and final artifact metadata through SDK models. Interrupted status includes stable interrupted reason; partial results remain identified. Download flows authorize on the platform before returning contents. A2A task lookup/streaming requires current token scope and results permission; waiting approval never lets an external caller approve as owner.
- [ ] On cancel call the actual RunService cancellation path, wait for verified execution stop and then return the SDK canceled state. If stop is still pending or fails, report the protocol's appropriate nonterminal/error response; never claim canceled from a mere native stop acknowledgement. Persisted tasks remain readable after backend restart under current authorization.

```python
async def test_a2a_cancel_waits_for_execution_stop(a2a_client, running_native_task, supervisor):
    response = await a2a_client.cancel(running_native_task.id)
    assert response.status.state == "canceled"
    assert not await supervisor.execution_exists(running_native_task.id)
```

- [ ] Run `rtk proxy uv run --project backend pytest backend/tests/integration/test_a2a.py -q` using the official SDK network client. Test discovery/auth, task restart, cancellation, foreign IDs, revoked token while streaming, input-required owner separation and document-language retention. Verify every state mapping and artifact access against the REST result for that same run.

**Acceptance:** Official A2A clients operate on durable authorized runs; discovery is accurate, restart preserves task state and cancellation truly stops execution.

### PROTO-03 — Aggregate security, scanners and operator documentation

**Depends on:** CORE-10, UI-05, PROTO-01 and PROTO-02. **Owns:** `backend/tests/integration/test_surface_parity.py`, `backend/tests/integration/test_security_boundaries.py`, `.github/workflows/verify.yml`, `docs/engineering/security-verification.md`, `docs/engineering/local-operation.md`, `README.md`. **Root-owned integration:** fixes to earlier task files and scanner coverage manifests after scoped reports.

- [ ] Create a single capability test matrix for REST/MCP/A2A: missing/expired/revoked tokens, another Project, same-Project other grant, results-only caller, evaluate-only caller, draft-only caller, raw inputs/chat, owner-only approval/settings and artifact downloads. Use actual network routes and two synthetic Projects. No grant may override owner provider/model or expose key/secret values through events/errors.
- [ ] Exercise synthetic prompt-injection/job text, malicious paths/symlinks, scanned/broken documents, rate/queue bounds, CSRF/Origin failures, native sandbox escapes, cancellation, stale lease recovery and DB/S3 failure. Use the proven first-workflow network-disabled tool sandbox; test absence of Docker socket, host home, other Project mounts and inherited secret sentinels.

```python
@pytest.mark.parametrize("surface", ["rest", "mcp", "a2a"])
async def test_each_surface_denies_foreign_project(surface, protocol_clients, project_pair):
    first, second = project_pair
    result = await protocol_clients[surface].read_run(first.grant, second.run_id)
    assert result.access_denied
    assert second.private_marker not in result.public_text
```

- [ ] Run all locked-environment audits and Trivy for PostgreSQL, source-built MinIO, Hermes/tool images, and supporting OS/Go dependencies. Record scanner/advisory timestamps, SBOMs, coverage, exact image digests/lock versions and unresolved findings. Fix compatible dependencies and re-run affected tests. Never suppress advisories silently. Unresolved Critical/High findings need the owner review specified by DELIVERY.md before merge/release; record a concrete blocker rather than claiming safety.
- [ ] Add repository-local CI checks for locks/builds/tests and available scanner coverage. Use synthetic fixtures; no actual provider key or personal data in CI. CI cannot claim live-provider verification from offline checks. Pin workflow actions by commit, set minimum permissions and do not publish/deploy images or artifacts automatically.
- [ ] Document setup, owner launch/nonce exchange, provider/Keychain configuration, data sent to providers, local/LAN controls, Project grant semantics, manual submission, cancellation/retry, backup/restore and verified limitations. Explain MinIO license/maintenance, exact tested pins and how to re-run CVE checks. Do not document secret values or pretend local backend implies local LLM.
- [ ] Run `rtk proxy uv run --project backend pytest backend/tests -q`, frontend build, Playwright suite and `rtk proxy python3 scripts/security_scan.py`. Store sanitized evidence and report actual failures/skips. The root integrator verifies whitespace, staged file scope, no nested Git/secrets/local Hub tracked, then commits the wave.

**Acceptance:** Surface parity, meaningful isolation/security checks and current scan evidence pass. Setup/recovery instructions are reproducible and material deployment limitations remain explicit.

### PROTO-04 — Independent final review

**Depends on:** all preceding tasks and root's aggregate diff check. **Owns:** no product files during review; output is a review report. Root alone fixes reported defects and updates `docs/engineering/final-review.md` with sanitized evidence.

- [ ] Spawn a fresh `gpt-6.1-sol` reviewer at effort high, announcing the allocation. Supply the original specification, DESIGN.md, DELIVERY.md, all plans, branch base and final diff; never supply secrets, private CVs or environment file contents.
- [ ] Reviewer inspects aggregate behavior, file ownership/integration, external authorization, actual storage/Hermes wiring, sandbox boundaries and cancellation/recovery. It independently runs the relevant tests/builds/audits and checks evidence for Thai exports, coordinated restore and live-provider smoke. Missing tool/provider access is an explicit gap, not a pass.
- [ ] Require `PASS` or `FAIL`, with commands/results and itemized defects. Root resolves implementation defects within the approved contract and re-runs affected checks; a changed architecture/data scope/acceptance criterion returns to owner review. Obtain a new independent verdict after fixes.
- [ ] On PASS, report completed behavior, evidence, limitations, planner/worker/reviewer models and commit. Update Hub tracking, log and contracts. Stop before any unapproved push/public deployment. Merge into develop only as the agreed later completed-work integration step, with relevant branch checks repeated and no unresolved release blocker.

**Acceptance:** Fresh independent PASS for the aggregate release. A feature list, mock success, old scanner report or skipped native proof cannot satisfy this task.
