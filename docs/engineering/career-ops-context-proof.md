# CareerOps native context proof

The trusted native bridge loads the complete pinned CareerOps router and a bounded operation context before starting the model turn. `evaluate_job` receives `modes/_shared.md` and `modes/oferta.md`. The combined CV-and-cover `draft_documents` operation receives the shared context, `modes/text.md` for CV tailoring, `modes/cover.md` for the cover letter, and their writing guidance. The platform renders the returned draft outside Hermes, so the standalone PDF mode's renderer commands are not part of the native tool context. Both operations use only allowlisted files from CareerOps revision `c1d0d1f3229daad3f2f5a7a4e46c9b256db51ea7`. The bridge verifies the source checkout HEAD, Hermes `skill_view` identity, file bytes against the pinned Git objects, and per-file/total size bounds. Unsupported operations, missing source metadata, or unapproved files fail closed.

The assembled CareerOps material is passed in `AIAgent.run_conversation(..., system_message=...)` after the platform instructions. A final adapter boundary restates that platform security, approvals, capabilities, and JSON output contract take precedence; it also restricts work to the supplied-posting evaluation or document draft. The posting and candidate CV arrive in the platform request. Upstream file references describe the standalone installation and do not grant access to host or user-layer paths; the model may use only request content and sandbox paths explicitly identified by the platform.

The offline test calls pinned Hermes `skill_view`, builds the bridge context, runs the actual pinned `AIAgent.run_conversation` path, and intercepts its OpenAI-compatible HTTP request with `httpx.MockTransport`. It uses a synthetic key and a synthetic response; no provider or external network is called. It asserts the router, CV-tailoring, cover-letter, and common-guidance markers in the assembled draft request, selected-operation separation, the five existing restricted tool names, and fail-closed behavior for invalid operations, missing source roots, and unapproved files. The emitted evidence contains only operation names, marker booleans, tool names, and the assembled system-context SHA-256.

Run with the configured offline Hermes runtime:

```sh
rtk uv run --project backend pytest -q -s backend/tests/integration/test_career_ops_context.py
```

This proves native request context assembly for the pinned source and the two platform operations. It does not prove provider behavior, application submission, board scanning, or a live model workflow.
