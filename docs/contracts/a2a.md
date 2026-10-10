# A2A contract

The A2A adapter uses the pinned `a2a-sdk==1.2.1` and its official server routes, request models, and client. It implements A2A protocol version `1.0` over JSON-RPC and HTTP+JSON. Clients send `A2A-Version: 1.0` on protocol requests. The official discovery route is `/.well-known/agent-card.json`; its two advertised interface URLs equal the configured A2A `base_url`. The card advertises HTTP bearer authentication and exactly two skills: `evaluate_job` and `draft_documents`.

The shared listener mounts the A2A application at its root. It does not mount owner routes, REST routes, or the frontend. SDK tenant routes are disabled because a token already identifies its Project and requests cannot select another tenant. The card is public and contains only static product capabilities and configured endpoint information.

## Authentication and scope

Every protocol request and artifact download requires a current Project bearer grant. The adapter authenticates through `services.grants.authenticate` and binds the resulting `Actor` to existing platform services. SDK task IDs are durable platform Run UUIDs; they grant no access by themselves. Task reads require `results:read`. Artifact downloads require `results:read` and resolve through the existing document and run services. Cancellation uses the same currently valid grant and `RunService.cancel`; the service restricts it to Runs created under that grant. External callers cannot approve owner-gated actions.

New work is admitted through `ProtocolRuns.submit(actor, operation, request)`, which creates the server-owned grant session and admits the Run atomically. The adapter does not create an A2A task store or keep task state in process memory. A restart reads the same Run and result metadata from PostgreSQL.

## Requests

Both official bindings accept A2A `SendMessage` with one user message, one `DataPart`, and `message.metadata.skill_id` set to one of the two advertised skill IDs. The data part must be a JSON object accepted by the shared `ProtocolJobInput` DTO:

```json
{
  "job": {
    "title": "Platform engineer",
    "company": "Example Co",
    "source_url": "https://jobs.example.test/platform",
    "description": "Synthetic job description"
  },
  "output_language": "en",
  "idempotency_key": "caller-generated-key"
}
```

Exactly one of `job` or `job_revision_id` is required. `output_language` is `th` or `en`; `idempotency_key` is required and at most 128 characters. Extra fields are rejected. The job revision, CV, Project, provider, model, secret, and conversation session cannot be selected through A2A. A supplied job posting is admitted as a same-Project revision through the shared intake service. A repeated key with the same request returns the existing Run; a conflicting request is rejected.

Rejected DTO values and SDK parse failures return a generic protocol error. The SDK route loggers that can print request bodies or caller IDs are filtered by the adapter. Responses and task history do not include submitted job text, CVs, raw uploads, owner chat, provider configuration, or credentials.

## Tasks and results

`SendMessage` returns a task whose `id` is the persisted Run UUID. `GetTask` resolves that UUID through `RunService.get` on every request. A stable A2A context ID is derived from the Run ID; it is not a platform session selector.

| Durable Run status | A2A task state | Public detail |
|---|---|---|
| `queued` | `submitted` | Run ID and operation |
| `running` | `working` | Run ID and operation |
| `waiting_approval` | `input-required` | States that owner approval is required in the platform |
| `needs_input` | `input-required` | States that owner input is required in the platform |
| `completed` | `completed` | Authorized opaque references to the evaluation report and published documents |
| `failed` | `failed` | No private worker error text |
| `interrupted` | `failed` | Stable `terminal_reason: interrupted` metadata |
| `cancelled` | `canceled` | Returned only after the durable Run is canceled |

Completed evaluation reports and published generated documents are exposed through the adapter’s authorized resource routes:

- `GET /artifacts/evaluations/{run_id}`
- `GET /artifacts/documents/{document_id}`

The task contains opaque artifact identifiers and these resource URIs, never artifact contents. Each download reauthenticates the grant and delegates to the same authorized run/document services that enforce publication provenance. Responses are private, non-cacheable Markdown.

The card advertises `streaming: false` and `pushNotifications: false`. Task reads are ordinary authorized requests; no stream or SDK in-memory event channel is used. Task listing and push notification configuration are unsupported.

Cancellation is accepted through the official SDK `CancelTask` operation. A queued Run can become durably canceled immediately. For executing work, the first response remains `submitted` or `working` and carries `cancellation_requested: true` until the worker’s cleanup path has stopped the native execution and written a terminal Run status. The adapter never maps a cancellation request by itself to A2A `canceled`.

## Verification

`backend/tests/integration/test_a2a.py` uses official SDK clients over live TCP for both advertised bindings and real PostgreSQL/MinIO test fixtures. It covers discovery, strict input, idempotent intake, restart reads, task state, artifact authorization and revocation, and cancellation against the pinned offline Hermes runtime. Tests use synthetic data and no provider key.
