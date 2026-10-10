# Skill registry and Extended Agent Card — design

Status: approved in chat 2026-10-10 (Q1–Q3, approach 1, sections 1–3 "as recommended"). The spec awaits owner review.
Phase 2 of the TOR AI roadmap (Python stack). Covers TOR FR-A04 and FR-P05.

## Goal

Each external skill is declared once in Python. The MCP tools, the A2A Agent Card skills, grant authorization and the REST `/tools` list are all read from that declaration. The Extended Agent Card shows only the skills that the caller's grant can use.

## Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Registry scope | Only the existing external task skills, `evaluate_job` and `draft_documents`. Direct-call skills (`jobs.search`, `jobs.fit`) wait for phase 4. `get_run`, `cancel_run` and `list_results` stay protocol plumbing. |
| Q2 | REST surface | Keep `POST /projects/{pid}/runs`. `RunRequest.operation: Operation` already derives the OpenAPI enum. No per-skill routes and no `GET /skills`. |
| Q3 | Public Agent Card | Lists every external skill (no change). The Extended Agent Card filters skills by the caller's persisted grant capabilities. |
| Approach | How to declare | A plain data registry (a frozen dataclass and a tuple), not decorators and not code generation. Both skills share one handler (`ProtocolRuns.submit`), so the registry has no `handler` field yet. Phase 4 adds one when a direct-call skill exists. |

## Registry: `services/skills.py` (new)

```python
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
    Skill(id="evaluate_job", name="Evaluate job", capability="jobs:evaluate", input_model=ProtocolJobInput, ...),
    Skill(id="draft_documents", name="Draft application documents", capability="documents:draft", input_model=ProtocolJobInput, ...),
)
SKILL_BY_ID: dict[str, Skill] = {skill.id: skill for skill in SKILLS}
```

- One `description` per skill serves the MCP tool, the A2A skill and `GET /tools`. Use the current MCP tool descriptions word for word, because MCP clients see them. As a result, the A2A card and `GET /tools` text changes to that wording. No test or contract pins the old text.
- Order matters: the card and the tool list keep the current order, `evaluate_job` first.
- `Operation = Literal["evaluate_job", "draft_documents"]` stays in `contracts.py`. Moving it into `skills.py` would cause a circular import, because `authorization.py` imports the registry, and `contracts` and `protocol_runs` sit on that path. A unit test asserts that the registry ids equal `get_args(Operation)`. Adding a skill therefore touches one Literal value and one registry entry, and the test fails if either is missing.
- `ProtocolJobInput` moves from `services/protocol_runs.py` to `services/contracts.py`, so `skills.py` imports only `contracts`. `protocol_runs` imports it back, so `from job_search_platform.services.protocol_runs import ProtocolJobInput` keeps working.

## Consumers

| File | Today | After |
|---|---|---|
| `services/authorization.py` | `GRANT_CAPABILITIES`, `GRANT_WORK_RESOURCES` and the capability lookup at line ~66 are hard-coded. | `GRANT_CAPABILITIES = frozenset(get_args(Capability))`. `GRANT_WORK_RESOURCES = frozenset(SKILL_BY_ID)`. `needed = SKILL_BY_ID[resource_kind].capability`. The approval-resource mapping is unchanged. |
| `services/protocol_runs.py` | `Literal["evaluate_job", "draft_documents"]`, plus a tuple check. | `operation: Operation` and `if operation not in SKILL_BY_ID`. |
| `api/a2a.py` | `_CAPABILITY_FOR_SKILL`, `_OPERATION_FOR_SKILL` and a hand-written skills list in `_agent_card`. | Both dicts are deleted. `on_message_send` looks the skill up in `SKILL_BY_ID` and validates with `skill.input_model`. `_agent_card(base_url, skills)` builds each skill entry from `Skill`. inputModes, outputModes and securityRequirements are constant per card, so they are not stored in the registry. |
| `api/mcp.py` | Two hand-written `@server.tool` functions, a `Literal` in `submit`, and the name set in `sanitize_invalid_tool_arguments`. | A loop runs `server.add_tool(_skill_tool(skill), name=skill.id, description=skill.description, structured_output=True)`. `_skill_tool` returns the same handler body (`require_arguments` → `submit(skill.id, ...)`). It sets `__annotations__["request"] = skill.input_model`, because the SDK derives the input schema from the function signature. The middleware looks the skill up in `SKILL_BY_ID` and uses `skill.input_model.model_validate`, and the error text stays `invalid_parameters`. `get_run`, `cancel_run`, `list_results` and the resources are unchanged. |
| `api/rest.py` `GET /tools` | Five hard-coded descriptors. | The skill descriptors come from `SKILLS`. The three plumbing descriptors stay written out. |
| `services/contracts.py` `ToolDescriptor.name` | A Literal that lists the skill names. | `Operation \| Literal["get_run", "cancel_run", "list_results"]`. The OpenAPI enum stays the same. |
| `integrations/hermes_runtime.py` | A Literal that also includes `extract_experience`. | Unchanged. It is the runner input, not an external surface. |

REST `POST /projects/{pid}/runs` needs no change.

## Extended Agent Card (FR-P05)

- Public card (`/.well-known/agent-card.json`): `_agent_card(base_url, SKILLS)` with `capabilities.extended_agent_card = True`. Today the flag is unset, so clients cannot discover the extended card.
- `on_get_extended_agent_card`: `actor = await self._actor(context)`, then the handler returns `_agent_card(self.base_url, [s for s in SKILLS if s.capability in actor.capabilities])`.
  - `grants.authenticate` reads the grant from PostgreSQL on every request, so `actor.capabilities` is the current persisted set.
  - A revoked, expired or missing grant gets `unauthorized`.
  - A grant with only `results:read` gets a valid card that lists no skills.
- The card is built per request and not cached, because there are two skills and the cost is negligible.

## Error handling

No new error codes and no new entry points; the registry only moves where values are declared. Each surface keeps its current opaque errors:
- A2A: an unknown skill or invalid input gives `request_rejected`. A missing or wrong capability gives `forbidden`, and an unauthenticated caller gives `unauthorized`.
- MCP: `invalid_parameters` and `request_failed`.
- REST: the existing `ErrorView`.

## Out of scope

- Filtering MCP `tools/list` by caller. FR-P05 is A2A only, and every tool call is already authorized. Filtering the list needs per-request authentication on list calls, which belongs with OAuth 2.1 and MRTR later.
- Direct-call skills and a `handler` field (phase 4).
- Per-skill REST routes and `GET /projects/{pid}/skills`.
- Owner-only runs (`export_document`, `profile_cv`, `match_jobs`, `extract_experience`). They stay outside the registry, grants, MCP and A2A.

## Testing

New file `tests/unit/test_skills.py`:
1. The registry ids equal `get_args(Operation)` in the same order, with no duplicates. Every `skill.capability` is in `get_args(Capability)`.
2. None of the owner-only operations are in `SKILL_BY_ID`.

Additions to existing files:
3. `test_a2a.py`:
   - The public card has `capabilities.extended_agent_card == true`.
   - The extended card for a `jobs:evaluate`-only grant lists only `evaluate_job`.
   - A `results:read`-only grant gets no skills.
   - A revoked grant gets `unauthorized`.
4. `test_mcp.py`: the `inputSchema` of `evaluate_job` and `draft_documents` equals the schema of `ProtocolJobInput`. This proves the annotation set in the loop gives the same schema as before.

Existing tests that must pass unchanged:
- `test_a2a.py` skill order (line ~183) and `test_mcp.py` tool names (line ~142).
- The owner-only exclusion pins from b9f1c13.
- `test_protocol_run_intake.py` and `test_paired_sessions.py`, which import `ProtocolJobInput` from `protocol_runs`.
- The OpenAPI contract test against `docs/contracts/application-api.yaml`. The YAML must not change.

## Acceptance

- The backend suite has at least 371 passing tests, plus the new ones. The two baseline failures may remain (`test_application_startup` built-frontend smoke and `test_storage_infrastructure` restart proof).
- `grep -rn '"evaluate_job"' backend/src` matches only `contracts.py`, `skills.py` and `hermes_runtime.py`.
- Live smoke on 127.0.0.1:8000:
  - The public card shows `extended_agent_card: true` and both skills.
  - The extended card with a real `jobs:evaluate`-only grant shows only `evaluate_job`.
  - One `evaluate_job` A2A call still creates a run.
