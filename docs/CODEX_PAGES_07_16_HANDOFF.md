# Pages 07–16 — Claude Code handoff requirements

Date: 2026-10-17 (Asia/Bangkok). Owner requested ten additional page concepts in one batch. **Pages 07–16 are drafts pending visual review; page06 is approved. No application implementation in this round.**

## Review index

| Page | Handoff and image | Status |
|---|---|---|
| 07 | [CV & Experience](07_CV_EXPERIENCE_DESIGN.md) · [PNG](codex_gen_page/07-cv-experience-desktop-light-v1.png) | Awaiting owner review |
| 08 | [Documents](08_DOCUMENTS_DESIGN.md) · [PNG](codex_gen_page/08-documents-desktop-light-v1.png) | Awaiting owner review |
| 09 | [Document Detail](09_DOCUMENT_DETAIL_DESIGN.md) · [PNG](codex_gen_page/09-document-detail-desktop-light-v1.png) | Awaiting owner review |
| 10 | [Agent Activity](10_AGENT_ACTIVITY_DESIGN.md) · [PNG](codex_gen_page/10-agent-activity-desktop-light-v1.png) | Awaiting owner review |
| 11 | [Settings](11_SETTINGS_DESIGN.md) · [PNG](codex_gen_page/11-settings-desktop-light-v1.png) | Awaiting owner review |
| 12 | [Projects](12_PROJECTS_DESIGN.md) · [PNG](codex_gen_page/12-projects-desktop-light-v1.png) | Awaiting owner review |
| 13 | [New Project](13_NEW_PROJECT_DESIGN.md) · [PNG](codex_gen_page/13-new-project-desktop-light-v1.png) | Awaiting owner review |
| 14 | [Public Landing](14_LANDING_DESIGN.md) · [PNG](codex_gen_page/14-landing-desktop-light-v1.png) | Awaiting owner review |
| 15 | [Login](15_LOGIN_DESIGN.md) · [PNG](codex_gen_page/15-login-desktop-light-v1.png) | Awaiting owner review |
| 16 | [Sign Up](16_SIGNUP_DESIGN.md) · [PNG](codex_gen_page/16-signup-desktop-light-v1.png) | Awaiting owner review |

## Authority and location

Use each numbered page Markdown and its linked PNG together with `PRODUCT.md`, `DESIGN.md`, `frontend/AGENTS.md`, `tests/e2e/AGENTS.md`, the approved UX audit/plan and existing source contracts. Active implementation checkout: `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem`, branch `feat/ux-core-workspaces`. The main checkout does not contain this uncommitted redesign. Do not reset, overwrite or move existing source changes.

Images show composition, not functional proof. They use synthetic English content and desktop/light only. All generated counts, dates, resume achievements, contacts and sample IDs must be replaced by actual authorized data. Do not add features or backend fields to reproduce incidental image details. Keep unsupported or unavailable metadata absent or explicitly unknown. Main content must be accessible components, not rasterized UI.

## Shared component system

Reuse existing shell, navigation, buttons, inputs, PasswordInput, dialogs, tabs, badges, Markdown, resource/error states and API helpers. Refactor the existing system later; do not create a second set of primitives. Use `DESIGN.md`: pale indigo rail, neutral workspace, flat white surfaces, restrained indigo actions, semantic status colors and shared dark equivalents. Standardize logo/icon family and active navigation across all images. Public/auth screens use Header instead of project rail. Keep Thai font support and readable line height, 24–28px application headings, 14–16px content, consistent spacing and visible focus.

## Responsive, bilingual and accessibility requirements

- Desktop: preserve readable widths; avoid stretching forms and document prose across the viewport. Tablet: collapse secondary columns when needed. Mobile: one column, existing rail drawer, wrapping actions and long Thai text; no unreachable controls or page-level horizontal overflow. Wide tables become accessible stacked records or a clearly labeled local scroll region with important actions reachable.
- Translate labels, hints, errors, status names, dates and accessible names using existing i18n. Product language and generated-document language remain separate preferences. Never translate immutable user document content automatically when switching the interface language.
- Verify light/dark/system behavior where supported; use semantic tokens rather than literal screenshot colors. Every status includes text; do not rely on color alone.
- Logical headings/landmarks, skip link, keyboard access, native form labeling, visible focus, adequate hit targets, tab arrow-key semantics, modal focus trap/restoration and live announcements are required. Respect reduced motion. No new decorative animation is needed for this batch.

## States and security boundaries

- Loading: contextual skeleton/status without fake progress. Empty: explain the next actual supported action. Error: localized cause/retry; preserve already loaded content where safe. Pending save: prevent duplicate writes and keep field values. Success: announce actual completion, not optimistic server guesses.
- Running, approval required, failed/cancelled and partial states follow real run/session semantics. Waiting for a person must not animate as though AI is running. SSE reconnect must not duplicate events or decisions. Relevant approval actions retain target identity and existing account gates.
- Preserve project isolation, owner/session permissions, exact CV/job/document revision identities, safe Markdown and validated URLs. No real credentials, tokens or personal data in screenshots, committed fixtures, generic drafts or logs. One-time secrets remain one-time. Stage changes are tracking only; email actions use the existing email client flow.
- Source files and API types are the contract authority. Read the exact payload/method before implementation; the handoffs summarize existing operations and do not supersede them. Preserve all existing lower-page sections and secondary tabs even when the single image does not picture them.

## Later implementation gates

Implement incrementally after review. For each changed journey, run frontend build/type checking, relevant existing Playwright regressions and new/updated synthetic fixture tests. Cover success, failure, empty, pending, authorization and asynchronous states relevant to that page. Verify desktop/tablet/mobile, Thai/English, light/dark and keyboard behavior; capture actual browser screenshots. Run Impeccable critique/audit/polish and fix critical/high issues. Do not weaken tests, require provider credentials for UI fixtures, or alter backend behavior.

## Evidence for this batch

Image files, embedded prompts, dimensions and SHA256 manifests are artifact provenance only. Markdown links/checklist and unchanged source hashes are checked separately. **No new browser screenshots, accessibility runs, frontend build or regression results are claimed by these concepts.** Historical implementation results do not verify the new designs.

See [the checklist](CODEX_PAGE_DESIGN_CHECKLIST.md) for page links and approval status. Historical checkpoint: pages17–22 remained after this batch; their concepts are now complete in the [all-pages handoff](CODEX_ALL_PAGES_HANDOFF.md), pending owner review.

## Artifact verification — 2026-10-17

- Ten selected PNGs and individual handoffs/manifests present; dimensions and SHA256 match.
- Local Markdown links resolve; checklist has 22 page rows and reports 16 ready / 6 approved / 6 not started.
- Impeccable prompt scan: 17 rasters, zero missing embedded prompts. `git diff --check` passed.
- All 403 recorded frontend/backend/test source hashes match the previous image-round baseline. No code implementation or new frontend/browser test results.
- Local Hub tracking, working log and UI-001 registry note updated.
