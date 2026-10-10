# Skill Registry and Extended Agent Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declare each external skill once in `services/skills.py`. Authorization, REST `/tools`, the MCP tools and the A2A cards all read from it. The Extended Agent Card lists only the skills the caller's grant can use.

**Architecture:**
- A frozen `Skill` dataclass and a `SKILLS` tuple make up a plain data registry. Transports loop over it instead of hard-coding names.
- The `Operation` Literal stays in `contracts.py`, and a unit test pins it to the registry.
- `ProtocolJobInput` moves to `contracts.py`, so `skills.py` imports only `contracts`.

**Tech Stack:** Python 3.12, FastAPI, pydantic 2, official `mcp==2.3.0` (MCPServer), official `a2a-sdk==1.2.1`, pytest with real PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-10-skill-registry-design.md`

## Global Constraints

- Registry scope: `evaluate_job` and `draft_documents` only. Owner-only runs (`export_document`, `profile_cv`, `match_jobs`, `extract_experience`) stay outside the registry, grants, MCP and A2A.
- Skill order everywhere: `evaluate_job` first, then `draft_documents`.
- Skill `description` uses the current MCP tool descriptions word for word.
- No new error codes. Errors stay opaque: A2A `request_rejected`/`forbidden`/`unauthorized`, MCP `invalid_parameters`/`request_failed`, REST `ErrorView`.
- `docs/contracts/application-api.yaml` must not change. The runtime OpenAPI must still match it.
- MCP `tools/list` is not filtered by caller.
- `integrations/hermes_runtime.py` is not touched.
- Branch: `feat/skill-registry` from fetched `origin/develop`, with the spec commit cherry-picked or merged from `docs/skill-registry-spec`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run commands from the repo root. Backend tests use `uv run --project backend pytest backend/tests/<path> -q`, and the real-infrastructure tests need the local PostgreSQL/MinIO containers running. The default `CORE02_PRIVATE_DIR` (`~/.cache/job-search-platform/core02-runtime-20261003`) is correct; never print credential values.

## Review Focus

1. An A2A `SendMessage` whose `skill_id` names an owner-only operation (`extract_experience`) must be rejected, and no run may be created. Pinned in Task 3 (`test_a2a_rejects_owner_only_skill_id`).
2. A grant whose capabilities change between calls (for example, it is revoked) must see that change in the next extended card. Pinned in Task 3 (revoked → 401 in `test_extended_agent_card_filters_by_grant_capabilities`).
3. A grant with only `results:read` must get a valid card with an empty skill list, not an error. Pinned in Task 3.
4. The MCP input/output schema and description of each skill tool must stay byte-identical, because external MCP clients cache them. Pinned in Task 2 (a golden fixture captured before the refactor).
5. `GRANT_CAPABILITIES` must remain exactly `{"results:read", "jobs:evaluate", "documents:draft"}` once derived, or stored grants would gain or lose access. Pinned in Task 1 (`test_grant_capabilities_unchanged`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/job_search_platform/services/skills.py` | Create | `Skill`, `SKILLS`, `SKILL_BY_ID` |
| `backend/src/job_search_platform/services/contracts.py` | Modify | Receives `ProtocolJobInput`; `ToolDescriptor.name` uses `Operation` |
| `backend/src/job_search_platform/services/protocol_runs.py` | Modify | Imports `ProtocolJobInput`; operation checks use the registry |
| `backend/src/job_search_platform/services/authorization.py` | Modify | Derives the grant sets and the needed capability from the registry |
| `backend/src/job_search_platform/api/rest.py` | Modify | `GET /tools` builds the skill entries from `SKILLS` |
| `backend/src/job_search_platform/api/mcp.py` | Modify | Skill tools registered in a loop; middleware uses the registry |
| `backend/src/job_search_platform/api/a2a.py` | Modify | Card built from the registry; extended card filtered per caller |
| `backend/tests/unit/test_skills.py` | Create | Registry invariants |
| `backend/tests/fixtures/mcp_skill_tools.json` | Create | Golden MCP skill tool schemas |
| `backend/tests/integration/test_mcp.py` | Modify | Golden schema test |
| `backend/tests/integration/test_a2a.py` | Modify | Extended card and owner-only skill_id tests |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch with the spec**

```bash
rtk git fetch origin
rtk git switch -c feat/skill-registry origin/develop
rtk git merge --ff-only docs/skill-registry-spec || rtk git cherry-pick origin/develop..docs/skill-registry-spec
```

Expected: `docs/superpowers/specs/2026-10-10-skill-registry-design.md` and this plan are both present on `feat/skill-registry`.

---

### Task 1: Registry module and service-layer consumers

**Files:**
- Create: `backend/src/job_search_platform/services/skills.py`
- Create: `backend/tests/unit/test_skills.py`
- Modify: `backend/src/job_search_platform/services/contracts.py` (`ProtocolJobInput` after `JobCreate` ~line 204; `ToolDescriptor` ~line 471)
- Modify: `backend/src/job_search_platform/services/protocol_runs.py:1-55`
- Modify: `backend/src/job_search_platform/services/authorization.py:14-16, 64-69`
- Modify: `backend/src/job_search_platform/api/rest.py:1021-1034`

**Interfaces:**
- Produces (used by Tasks 2 and 3):
  - `job_search_platform.services.skills.Skill` is a frozen dataclass with these fields: `id: Operation`, `name: str`, `description: str`, `capability: Capability`, `tags: tuple[str, ...]`, `examples: tuple[str, ...]`, `input_model: type[DTO]`.
  - `SKILLS: tuple[Skill, ...]`
  - `SKILL_BY_ID: dict[str, Skill]`
  - `job_search_platform.services.contracts.ProtocolJobInput` is also importable from `services.protocol_runs`.

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/unit/test_skills.py`:

```python
from __future__ import annotations

from typing import get_args

from job_search_platform.services.authorization import GRANT_CAPABILITIES, GRANT_WORK_RESOURCES
from job_search_platform.services.contracts import Capability, Operation, ProtocolJobInput, ToolDescriptor
from job_search_platform.services.skills import SKILL_BY_ID, SKILLS


def test_registry_matches_operation_literal_in_order():
    assert tuple(skill.id for skill in SKILLS) == get_args(Operation)
    assert len(SKILL_BY_ID) == len(SKILLS)


def test_every_skill_capability_is_a_grant_capability():
    assert {skill.capability for skill in SKILLS} <= set(get_args(Capability))
    assert SKILL_BY_ID["evaluate_job"].capability == "jobs:evaluate"
    assert SKILL_BY_ID["draft_documents"].capability == "documents:draft"
    assert all(skill.input_model is ProtocolJobInput for skill in SKILLS)


def test_owner_only_operations_are_not_skills():
    for operation in ("export_document", "profile_cv", "match_jobs", "extract_experience"):
        assert operation not in SKILL_BY_ID
        assert operation not in GRANT_WORK_RESOURCES


def test_grant_capabilities_unchanged():
    assert GRANT_CAPABILITIES == frozenset({"results:read", "jobs:evaluate", "documents:draft"})
    assert GRANT_WORK_RESOURCES == frozenset({"evaluate_job", "draft_documents"})


def test_tool_descriptor_name_is_one_flat_enum():
    name = ToolDescriptor.model_json_schema()["properties"]["name"]
    assert name["enum"] == ["evaluate_job", "draft_documents", "get_run", "cancel_run", "list_results"]
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `uv run --project backend pytest backend/tests/unit/test_skills.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'job_search_platform.services.skills'`, or an ImportError for `ProtocolJobInput` from contracts.

- [ ] **Step 3: Move `ProtocolJobInput` into `contracts.py`**

In `backend/src/job_search_platform/services/contracts.py`, add this directly after `class JobCreate` (~line 204–208). `Annotated`, `Literal`, `UUID`, `StringConstraints` and `model_validator` are already imported there.

```python
class ProtocolJobInput(DTO):
    job: JobCreate | None = None
    job_revision_id: UUID | None = None
    cv_id: UUID | None = None
    output_language: Literal["th", "en"]
    idempotency_key: Annotated[str, StringConstraints(min_length=1, max_length=128)]

    @model_validator(mode="after")
    def validate_intent(self):
        if (self.job is None) == (self.job_revision_id is None):
            raise ValueError("exactly_one_job_source_required")
        if not self.idempotency_key.strip():
            raise ValueError("idempotency_key_required")
        if self.job is not None and not self.job.description.strip():
            raise ValueError("job_description_required")
        return self
```

In the same file, change `ToolDescriptor.name` (~line 472):

```python
class ToolDescriptor(DTO):
    # A nested Literal flattens to one OpenAPI enum; `Operation | Literal[...]` would emit anyOf.
    name: Literal[Operation, Literal["get_run", "cancel_run", "list_results"]]
```

- [ ] **Step 4: Create the registry**

Create `backend/src/job_search_platform/services/skills.py`:

```python
"""Single declaration of every externally callable skill (TOR FR-A04).

MCP tools, A2A Agent Card skills, grant authorization and REST /tools read
from SKILLS. Owner-only runs (export_document, profile_cv, match_jobs,
extract_experience) are deliberately absent. Adding a skill means one entry
here plus its id in contracts.Operation; tests/unit/test_skills.py pins both.
"""
from __future__ import annotations

from dataclasses import dataclass

from job_search_platform.services.contracts import DTO, Capability, Operation, ProtocolJobInput


@dataclass(frozen=True)
class Skill:
    id: Operation
    name: str
    description: str
    capability: Capability
    tags: tuple[str, ...]
    examples: tuple[str, ...]
    input_model: type[DTO]


SKILLS: tuple[Skill, ...] = (
    Skill(
        id="evaluate_job",
        name="Evaluate job",
        description="Evaluate one supplied job posting or same-Project job revision against the current CV.",
        capability="jobs:evaluate",
        tags=("jobs", "evaluation"),
        examples=("Evaluate this job posting",),
        input_model=ProtocolJobInput,
    ),
    Skill(
        id="draft_documents",
        name="Draft application documents",
        description="Draft application documents for one supplied job posting or same-Project job revision.",
        capability="documents:draft",
        tags=("documents", "drafting"),
        examples=("Draft application documents for this job",),
        input_model=ProtocolJobInput,
    ),
)
SKILL_BY_ID: dict[str, Skill] = {skill.id: skill for skill in SKILLS}
```

- [ ] **Step 5: Point `protocol_runs.py` at contracts and the registry**

In `backend/src/job_search_platform/services/protocol_runs.py`:
- Delete the `class ProtocolJobInput` block (lines 22–37).
- Change the contracts import to `from job_search_platform.services.contracts import Actor, Operation, ProtocolJobInput, RunRequest, RunView`.
- Add `from job_search_platform.services.skills import SKILL_BY_ID`.
- Remove the imports that are now unused: `Annotated`, `Literal`, `StringConstraints`, `model_validator`, `DTO` and `JobCreate`. Keep any that the rest of the file still uses; check with `rtk grep`.

Then replace the `submit` signature and the operation check:

```python
    async def submit(
        self, actor: Actor, operation: Operation, request: ProtocolJobInput,
    ) -> RunView:
        if actor.kind != "grant" or actor.project_id is None or actor.grant_id is None:
            raise ServiceError("forbidden")
        if operation not in SKILL_BY_ID:
            raise ServiceError("forbidden")
        return await asyncio.to_thread(self._submit, actor, operation, request)
```

- [ ] **Step 6: Derive the authorization sets**

In `backend/src/job_search_platform/services/authorization.py`:

```python
from typing import get_args

from job_search_platform.services.contracts import Actor, Capability
from job_search_platform.services.skills import SKILL_BY_ID

GRANT_CAPABILITIES = frozenset(get_args(Capability))
RESULT_RESOURCES = frozenset({"run", "event", "result", "generated_document"})
GRANT_WORK_RESOURCES = frozenset(SKILL_BY_ID)
```

Replace lines 65–69:

```python
    if resource_kind in GRANT_WORK_RESOURCES:
        if SKILL_BY_ID[resource_kind].capability not in persisted:
            raise ServiceError("forbidden")
        return
```

Leave the approval branch (lines 56–61) unchanged.

- [ ] **Step 7: Build REST `/tools` from the registry**

In `backend/src/job_search_platform/api/rest.py`, add `from job_search_platform.services.skills import SKILLS` and replace `list_tools` (~line 1021):

```python
@router.get("/tools", response_model=ToolsView)
async def list_tools(actor=Depends(owner_actor)):
    return {"tools": [
        *({"name": skill.id, "description": skill.description, "required_capability": skill.capability}
          for skill in SKILLS),
        {"name": "get_run", "description": "Read an authorized Project run and its published result view.",
         "required_capability": "results:read"},
        {"name": "cancel_run", "description": "Request cancellation of an authorized Project run.",
         "required_capability": "jobs:evaluate"},
        {"name": "list_results", "description": "List authorized Project runs and generated results.",
         "required_capability": "results:read"},
    ]}
```

- [ ] **Step 8: Run the unit test and the affected suites**

Run: `uv run --project backend pytest backend/tests/unit/test_skills.py -q`
Expected: 5 passed.

Run: `uv run --project backend pytest backend/tests/integration/test_protocol_run_intake.py backend/tests/integration/test_project_authorization.py backend/tests/integration/test_paired_sessions.py backend/tests/integration/test_draft_kinds_manual_edit.py backend/tests/integration/test_rest_api.py -q`
Expected: all pass, including `test_runtime_openapi_matches_application_contract_paths_methods_and_schemas`, with no edit to `application-api.yaml`.

- [ ] **Step 9: Commit**

```bash
rtk git add backend/src/job_search_platform/services/skills.py backend/src/job_search_platform/services/contracts.py backend/src/job_search_platform/services/protocol_runs.py backend/src/job_search_platform/services/authorization.py backend/src/job_search_platform/api/rest.py backend/tests/unit/test_skills.py
rtk git commit -m "feat(skills): single skill registry for authorization, intake and REST tools (FR-A04)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: MCP skill tools from the registry

**Files:**
- Create: `backend/tests/fixtures/mcp_skill_tools.json`
- Modify: `backend/tests/integration/test_mcp.py` (new test after `test_mcp_transport_rejects_wildcard_host_or_origin`, ~line 38)
- Modify: `backend/src/job_search_platform/api/mcp.py:1-25, 129-195`

**Interfaces:**
- Consumes: `SKILLS`, `SKILL_BY_ID`, `Skill` from `job_search_platform.services.skills` (Task 1). `Operation` from contracts.
- Produces: no new public names. `create_mcp_server(services)` is unchanged.

- [ ] **Step 1: Capture the golden fixture from the current code (before any mcp.py edit)**

Run from the repo root:

```bash
cd backend && RTK_DISABLED=1 uv run python - <<'EOF'
import asyncio, json
from pathlib import Path
from types import SimpleNamespace
from job_search_platform.api.mcp import create_mcp_server
server = create_mcp_server(SimpleNamespace(sessions=None, grants=None))
tools = {t.name: t for t in asyncio.run(server.list_tools())}
golden = {name: {"description": tools[name].description,
                 "input_schema": tools[name].input_schema,
                 "output_schema": tools[name].output_schema}
          for name in ("evaluate_job", "draft_documents")}
Path("tests/fixtures/mcp_skill_tools.json").write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
EOF
cd ..
```

Expected: `backend/tests/fixtures/mcp_skill_tools.json` exists and contains `evaluate_job` and `draft_documents`.

- [ ] **Step 2: Write the golden test**

Add to `backend/tests/integration/test_mcp.py`, after `test_mcp_transport_rejects_wildcard_host_or_origin`. `json` and `Path` must be imported at the top of the file; add `import json` and `from pathlib import Path` if they are missing.

```python
def test_mcp_skill_tools_match_golden_schemas():
    # External MCP clients cache tool schemas; the registry must not change them.
    golden = json.loads((Path(__file__).resolve().parents[1] / "fixtures" / "mcp_skill_tools.json").read_text())
    server = create_mcp_server(SimpleNamespace(sessions=None, grants=None))
    tools = {tool.name: tool for tool in asyncio.run(server.list_tools())}
    assert [name for name in tools if name in golden] == ["evaluate_job", "draft_documents"]
    for name, expected in golden.items():
        assert tools[name].description == expected["description"]
        assert tools[name].input_schema == expected["input_schema"]
        assert tools[name].output_schema == expected["output_schema"]
```

Also add `create_mcp_server` to the existing `from job_search_platform.api.mcp import ...` line.

- [ ] **Step 3: Run it against the current code; it must pass (characterization)**

Run: `uv run --project backend pytest "backend/tests/integration/test_mcp.py::test_mcp_skill_tools_match_golden_schemas" -q`
Expected: 1 passed.

- [ ] **Step 4: Replace the hand-written skill tools with a loop**

In `backend/src/job_search_platform/api/mcp.py`:
- Change `from job_search_platform.services.protocol_runs import ProtocolJobInput, ProtocolRuns` to `from job_search_platform.services.protocol_runs import ProtocolRuns`.
- Add `from job_search_platform.services.contracts import Operation` (merge it into an existing contracts import if there is one).
- Add `from job_search_platform.services.skills import SKILL_BY_ID, SKILLS, Skill`.
- Drop `Literal` from the `typing` import if nothing else uses it.

Replace the middleware's skill branch (lines 136–139):

```python
                skill = SKILL_BY_ID.get(name)
                if skill is not None:
                    invalid = set(arguments) != {"request"}
                    if not invalid:
                        skill.input_model.model_validate(arguments["request"])
```

The next branch, `elif name in {"get_run", "cancel_run"}:`, stays as it is.

Change the `submit` signature (line 165):

```python
    async def submit(
        operation: Operation,
        request: Any,
        ctx: Context[Any, Any],
    ) -> dict[str, Any]:
```

Delete both `@server.tool(name="evaluate_job"...)` and `@server.tool(name="draft_documents"...)` blocks (lines 179–195) and put this in their place:

```python
    def skill_tool(skill: Skill):
        async def tool(request, ctx: Context[Any, Any]) -> dict[str, Any]:
            require_arguments(ctx, {"request"})
            return await submit(skill.id, request, ctx)
        # The SDK derives the input schema from the signature, so bind the declared model.
        tool.__annotations__["request"] = skill.input_model
        tool.__name__ = tool.__qualname__ = skill.id
        return tool

    for skill in SKILLS:
        server.add_tool(skill_tool(skill), name=skill.id, description=skill.description, structured_output=True)
```

- [ ] **Step 5: Run the golden test and the MCP suite**

Run: `uv run --project backend pytest backend/tests/integration/test_mcp.py -q`
Expected: all pass. That includes the golden test, the tool-name set at ~line 141, `invalid_parameters` without input reflection (~lines 253–270), and `extract_experience` absent from `list_tools` (~line 386).

- [ ] **Step 6: Commit**

```bash
rtk git add backend/src/job_search_platform/api/mcp.py backend/tests/integration/test_mcp.py backend/tests/fixtures/mcp_skill_tools.json
rtk git commit -m "feat(mcp): register skill tools from the skill registry with golden schema pin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A2A card from the registry and a per-caller Extended Agent Card

**Files:**
- Modify: `backend/src/job_search_platform/api/a2a.py:50-63, 214-219, 331-349, 416-467, 497-498`
- Modify: `backend/tests/integration/test_a2a.py` (assert at ~line 183; two new tests at the end of the file)

**Interfaces:**
- Consumes: `SKILLS`, `SKILL_BY_ID`, `Skill` (Task 1).
- Produces: `_agent_card(base_url: str, skills: Sequence[Skill]) -> AgentCard`. `_PlatformRequestHandler.__init__(self, services, *, base_url)` no longer takes `card`.

- [ ] **Step 1: Write the failing tests**

In `test_official_a2a_clients_use_durable_runs_and_authorized_artifacts`, directly after line 183 (`assert [skill["id"] ...]`), add:

```python
        assert card["capabilities"]["extendedAgentCard"] is True
```

Append these two tests to `backend/tests/integration/test_a2a.py`:

```python
async def _extended_card(base_url: str, token: str) -> httpx.Response:
    async with httpx.AsyncClient() as client:
        return await client.post(
            f"{base_url}/",
            json={"jsonrpc": "2.0", "id": 1, "method": "GetExtendedAgentCard", "params": {}},
            headers={"Authorization": f"Bearer {token}", "A2A-Version": "1.0"},
        )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_extended_agent_card_filters_by_grant_capabilities(api_context, unused_tcp_port):
    csrf, project_id, evaluate_grant = await asyncio.to_thread(
        _project_and_grant, api_context, ["jobs:evaluate"]
    )
    read_grant = await asyncio.to_thread(_grant, api_context, project_id, csrf, ["results:read"])
    full_grant = await asyncio.to_thread(
        _grant, api_context, project_id, csrf, ["results:read", "jobs:evaluate", "documents:draft"]
    )
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    try:
        cards = {}
        for label, grant in (("evaluate", evaluate_grant), ("read", read_grant), ("full", full_grant)):
            response = await _extended_card(base_url, grant["token"])
            assert response.status_code == 200, response.text
            cards[label] = response.json()["result"]
        assert [skill["id"] for skill in cards["evaluate"]["skills"]] == ["evaluate_job"]
        assert cards["read"].get("skills", []) == []
        assert [skill["id"] for skill in cards["full"]["skills"]] == ["evaluate_job", "draft_documents"]
        assert "extract_experience" not in json.dumps(cards)

        revoked = api_context.client.delete(
            f"/api/v1/projects/{project_id}/grants/{evaluate_grant['id']}", headers=_write_headers(csrf)
        )
        assert revoked.status_code == 204
        denied = await _extended_card(base_url, evaluate_grant["token"])
        assert denied.status_code == 401
    finally:
        await _stop_a2a(server, server_task)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_a2a_rejects_owner_only_skill_id(api_context, unused_tcp_port):
    csrf, project_id, grant = await asyncio.to_thread(
        _project_and_grant, api_context, ["results:read", "jobs:evaluate", "documents:draft"]
    )
    services = api_context.client.app.state.services
    base_url, _app, server, server_task = await _start_a2a(services, unused_tcp_port)
    try:
        with api_context.sessions() as db:
            before = len(db.scalars(select(Run).where(Run.project_id == project_id)).all())
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/",
                json={
                    "jsonrpc": "2.0", "id": 1, "method": "SendMessage",
                    "params": {"message": {
                        "role": "ROLE_USER",
                        "metadata": {"skill_id": "extract_experience"},
                        "parts": [{"data": {
                            "job": {"title": "Synthetic", "description": "Synthetic input."},
                            "output_language": "en",
                            "idempotency_key": "a2a-owner-only-01",
                        }}],
                    }},
                },
                headers={"Authorization": f"Bearer {grant['token']}", "A2A-Version": "1.0"},
            )
        body = response.json()
        assert "result" not in body and "error" in body
        with api_context.sessions() as db:
            after = len(db.scalars(select(Run).where(Run.project_id == project_id)).all())
        assert after == before
    finally:
        await _stop_a2a(server, server_task)
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `uv run --project backend pytest backend/tests/integration/test_a2a.py -q -k "extended_agent_card or owner_only_skill_id or durable_runs"`
Expected:
- `durable_runs` fails with a KeyError or assertion on `extendedAgentCard`.
- `extended_agent_card` fails. Because the flag is unset, the SDK may reject the call or return the full card, which gives the wrong skills.
- `owner_only_skill_id` passes. This is a characterization test that must stay green.

- [ ] **Step 3: Implement the registry-driven card**

In `backend/src/job_search_platform/api/a2a.py`:
- Delete `_CAPABILITY_FOR_SKILL` and `_OPERATION_FOR_SKILL` (lines 56–63).
- Change the import `from job_search_platform.services.protocol_runs import ProtocolJobInput, ProtocolRuns` to `... import ProtocolRuns`.
- Add `from job_search_platform.services.skills import SKILL_BY_ID, SKILLS, Skill`.
- Add `Sequence` to the `typing` import.

Handler constructor:

```python
class _PlatformRequestHandler(RequestHandler):
    def __init__(self, services: Services, *, base_url: str) -> None:
        self.services = services
        self.intake = ProtocolRuns(services.sessions)
        self.base_url = base_url.rstrip("/")
```

In `on_message_send`, replace lines 340–345 with:

```python
            if set(metadata) != {"skill_id"} or metadata["skill_id"] not in SKILL_BY_ID:
                raise ValueError("invalid skill")
            skill = SKILL_BY_ID[metadata["skill_id"]]
            actor = await self._actor(context, skill.capability)
            payload = MessageToDict(message.parts[0].data, preserving_proto_field_name=True)
            request = skill.input_model.model_validate(payload)
```

Replace line 351 with `run = await self.intake.submit(actor, skill.id, request)`.

Replace `on_get_extended_agent_card`:

```python
    async def on_get_extended_agent_card(self, params: GetExtendedAgentCardRequest, context: ServerCallContext) -> AgentCard:
        actor = await self._actor(context)
        # grants.authenticate re-reads the grant row, so capabilities are current (FR-P05).
        return _agent_card(self.base_url, [skill for skill in SKILLS if skill.capability in actor.capabilities])
```

Replace `_agent_card`. All fields are unchanged except `capabilities`, the signature, and the skills list:

```python
def _agent_card(base_url: str, skills: Sequence[Skill]) -> AgentCard:
    security = [{"schemes": {"bearerAuth": {"list": []}}}]
    return _protobuf(
        AgentCard,
        {
            "name": "Job Search Platform",
            "description": "Evaluate a job posting or draft application documents for the Project authorized by the supplied bearer grant.",
            "supportedInterfaces": [
                {"url": base_url, "protocolBinding": "JSONRPC", "protocolVersion": "1.0"},
                {"url": base_url, "protocolBinding": "HTTP+JSON", "protocolVersion": "1.0"},
            ],
            "version": "0.1.0",
            "capabilities": {"streaming": False, "pushNotifications": False, "extendedAgentCard": True},
            "securitySchemes": {
                "bearerAuth": {
                    "httpAuthSecurityScheme": {
                        "scheme": "bearer",
                        "bearerFormat": "Project capability token",
                    }
                }
            },
            "securityRequirements": security,
            "defaultInputModes": ["application/json"],
            "defaultOutputModes": ["application/json", "text/markdown"],
            "skills": [
                {
                    "id": skill.id,
                    "name": skill.name,
                    "description": skill.description,
                    "tags": list(skill.tags),
                    "examples": list(skill.examples),
                    "inputModes": ["application/json"],
                    "outputModes": ["application/json"],
                    "securityRequirements": security,
                }
                for skill in skills
            ],
        },
    )
```

In `create_a2a_app` (~lines 497–498):

```python
    card = _agent_card(normalized_base_url, SKILLS)
    handler = _PlatformRequestHandler(services, base_url=normalized_base_url)
```

- [ ] **Step 4: Run the A2A suite**

Run: `uv run --project backend pytest backend/tests/integration/test_a2a.py -q`
Expected: all pass.

If `GetExtendedAgentCard` returns a JSON-RPC error rather than 200 with `result`, check the SDK route. `create_jsonrpc_routes` dispatches `GetExtendedAgentCard` to `handler.on_get_extended_agent_card`; see `a2a/server/routes/jsonrpc_dispatcher.py`. Fix the server, not the test. Before changing the test, confirm the method name the SDK client sends in `a2a/client/transports/jsonrpc.py` (~line 292).

- [ ] **Step 5: Commit**

```bash
rtk git add backend/src/job_search_platform/api/a2a.py backend/tests/integration/test_a2a.py
rtk git commit -m "feat(a2a): agent card from skill registry; extended card filtered by grant capabilities (FR-P05)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Whole-branch verification and live smoke

**Files:** none (verification only). Hub updates are local and never committed.

- [ ] **Step 1: Run the full backend suite**

Run: `uv run --project backend pytest backend/tests -q`
Expected: at least 371 + 8 new tests passing. The only failures allowed are the 2 baseline ones (`test_application_startup` built-frontend smoke and `test_storage_infrastructure` restart proof).

- [ ] **Step 2: Grep acceptance**

Run: `rtk grep -rn '"evaluate_job"' backend/src`
Expected: matches only in `services/contracts.py`, `services/skills.py` and `integrations/hermes_runtime.py`.

- [ ] **Step 3: Confirm the contract is unchanged**

Run: `rtk git diff origin/develop -- docs/contracts/application-api.yaml`
Expected: empty.

- [ ] **Step 4: Live smoke on the owner app**

Restart the owner app from `feat/skill-registry`:

```bash
PYTHONUNBUFFERED=1 uv run --locked --project backend python scripts/run_local.py --build-frontend --enable-sharing --share-host 127.0.0.1 --share-port 8001 --open-browser
```

Then:
1. `curl -s http://127.0.0.1:8001/.well-known/agent-card.json` shows `"extendedAgentCard": true` and the skills `evaluate_job` and `draft_documents`.
2. The owner creates a `jobs:evaluate`-only grant in Agent Console → Connected agents. Pass the token through the clipboard and never print it. `GetExtendedAgentCard` with that token returns only `evaluate_job`.
3. One A2A `SendMessage` `evaluate_job` with that grant creates a run that is visible in the Console timeline.
4. Revoke the grant afterwards.

- [ ] **Step 5: Final review, then PR**

Run the final Opus whole-branch review. Then push `feat/skill-registry` and open a PR to `develop`. Merge only with owner approval.
