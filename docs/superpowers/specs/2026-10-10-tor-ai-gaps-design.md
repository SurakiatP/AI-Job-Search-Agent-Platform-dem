# TOR AI gaps: Typst CV render, registry-generated direct REST, submit autopilot budget

Status: owner-approved on 2026-10-10 in chat ("ทำได้เลย"; item 3 = option B).

This closes three partial items left after the TOR AI phases 2–5.

## 1. FR-C04 — Typst CV render (supersedes the ADR-012 fallback)

- **Image.** Add `typst=0.14.2-r0` and `font-noto-thai=2026.06.01-r0` to the Hermes image's `apk add`. Both are in the base image's Alpine 3.24 repo. Pin them exactly, the same way chromium is pinned.
  - Rebuild with `python3 infra/hermes/setup.py --build`, which writes the new image id to the cached manifest that `main.py` reads.
  - Scan the rebuilt image with Trivy, using the project's `scripts/security_scan.py` image scope. Any High or Critical finding in typst or the fonts blocks the change. Record the result in `docs/engineering/dependencies.md`.
- **Render path.** The bridge `export` op gains an `engine` value, `"chromium"` (default) or `"typst"`. With typst:
  - A trusted Python step turns the Markdown into a `.typ` file.
  - Each block is emitted through Typst **string literals**: `#heading(level: n)[#"..."]`, `#par[#"..."]`, and `#list(..)` for `-`/`*` bullets. Escape only `\` and `"`. Markdown content can never become Typst markup or code.
  - The document sets `#set text(font: ("Noto Sans Thai", "Noto Sans"), lang: ...)` and A4 margins.
  - The command is `typst compile --font-path /usr/share/fonts <file.typ> <out.pdf>`, run inside the network-disabled sandbox through the gated terminal.
  - Never use `typst` packages, because they need the network.
- **Use.** `_export_drafts` picks `engine="typst"` for `document_type == "cv"`, both for tailor autopilot and for the cv `export_document` runs from apply and restore. Cover letters and messages keep chromium.
- **ADR.** ADR-012 is marked superseded: tailored CVs now use Typst.

## 2. FR-A04 — direct skills' REST generated from the registry

- Delete the hand-written `GET /projects/{pid}/agent/jobs/search` and `POST /projects/{pid}/agent/jobs/fit`.
- In `api/rest.py`, loop over `SKILLS` where `kind == "direct"` and register `POST /api/v1/projects/{project_id}/agent/{skill.id with "_" → "/"}`. Each route takes `skill.input_model` as the body and returns `skill.output_model`. It reuses the `run_write_actor` auth and the skill handler.
  - So `jobs_search` becomes `POST /agent/jobs/search` and `jobs_fit` becomes `POST /agent/jobs/fit`.
  - OpenAPI operation ids come from the skill id.
- Update the YAML. Agent search moves from GET to POST, and that is the only contract change.
- Add a test that every direct skill has exactly one REST route, one MCP tool, and one A2A card entry.

## 3. FR-A05 — submit autopilot with a daily budget (option B)

- **Setting.** `project_preferences.submit_autopilot_daily_limit INTEGER NULL`, with a check of 1–20. `NULL` means off, which is the default. It is owner-editable through the existing preferences PATCH and shown in Settings, with Thai and English copy that says it still never sends anything.
- **Behaviour.** When the executor opens a `submit_application` approval (`ApprovalService.request_submission`), it auto-approves in the same transaction, and only when ALL of these hold:
  - the limit is set;
  - the pack is `ready`, `missing_required` is empty, and every non-null answer has `source != "owner"` or is owner-entered;
  - fewer than `limit` submissions were auto-approved for this project since 00:00 Asia/Bangkok today. Count approvals with `decision = 'approve'` and `decided_by = 'autopilot'`; add a `decided_by VARCHAR(16)` column, `owner` or `autopilot`, with `owner` backfilled.
- An auto-approval runs exactly the owner-approve path: mark applied, add an `application_recorded` event, complete the run. It also adds the event `run_progress {step: "autopilot_approved"}`.
- Over budget, or when any condition fails, the run waits for the owner as today.
- Grants can never change the setting.
- **UI.** A Settings field, plus an "Auto-approved" badge on the run and approval.

## Data

Migration `0020_tor_ai_gaps` adds `project_preferences.submit_autopilot_daily_limit` and `approvals.decided_by`. The downgrade drops both.

## Testing

- **Unit.**
  - Typst source generation escapes `"`/`\`, renders `#`, `[`, `$` and `@` literally, and handles Thai text.
  - The budget-day boundary works in Asia/Bangkok time.
- **Integration.**
  - The tailor autopilot export calls the bridge with `engine="typst"` for cv; the fake runtime records the engine.
  - The generated REST routes for both direct skills work, and the old GET returns 404/405.
  - Autopilot:
    - off means the run waits;
    - on with a ready pack means it is completed and applied, with `decided_by='autopilot'`;
    - the (N+1)-th submit on the same day waits;
    - a parked pack is never auto-approved;
    - a grant cannot change the setting.
- **Live.** Rebuild the image, then run one tailor autopilot and check the produced PDF is a valid PDF made by Typst (inspect `Producer` in the PDF metadata).
- **E2E.** The Settings field and the auto-approved badge.
