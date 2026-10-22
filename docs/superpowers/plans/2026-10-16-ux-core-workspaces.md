# Core Workspaces UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Track steps with checkboxes. Execution and the two feature workers are already authorized; stop after the finished milestone is ready for visual review.

**Goal:** Implement the shared design system, shell/navigation, Overview, Search, and Evaluation Session from the approved redesign proposal, then stop for the owner's visual review.

**Architecture:** Preserve the feature-based React frontend and all existing REST/SSE behavior. Main owns shared files, Overview, project creation, and the evaluations index; Search and Session workers own disjoint feature folders, locale namespaces, and browser specs. Build on existing Radix controls and current feature logic; introduce no required shared component interface.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, Radix UI, react-router, i18next, existing Playwright.

**Spec:** [REDESIGN_PLAN.md](../../ux-redesign/REDESIGN_PLAN.md), [UX_AUDIT.md](../../ux-redesign/UX_AUDIT.md), [PRODUCT.md](../../../PRODUCT.md), [DELIVERY.md](../../engineering/DELIVERY.md), and existing [application API](../../contracts/application-api.yaml). The owner's later approval authorizes this scoped implementation despite the proposal documents' earlier approval-pending wording.

## Global Constraints

- Worktree: `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem`; task branch `feat/ux-core-workspaces`, based on fetched `origin/develop`.
- Keep React, Vite, TypeScript, Tailwind CSS, Radix UI, existing feature-based frontend architecture. No backend, API, dependency, lockfile, infrastructure, or provider changes.
- Preserve project isolation, immutable revisions, provenance, approval requirements, document history, manual submission semantics, and existing deep links.
- Existing user/job/document content keeps its language. All new UI copy uses Thai and English i18next resources; generated-document language stays independent.
- Synthetic fixtures and screenshots must be visibly synthetic. Do not invent application data, result counts, progress, source freshness, metric meanings, or approval identities.
- Main reads root `DESIGN.md` if present and records its review status in the local Hub. If absent, use the approved proposal and existing primitives as implementation authority; derive `DESIGN.md` and its Impeccable sidecar from the finished artifact.
- No commits, push, PR, merge, deployment, further screen redesign, or scope expansion in this milestone. Hub files remain local and uncommitted.
- Prefix every shell command with `rtk`. Dependencies are already available through symlinks; use the existing synthetic Vite server at `http://127.0.0.1:4177` and separate Playwright output directories.

## Review Focus

1. Switching project while requests are pending must never display another project's pair, results, drafts, or mutation target. Pin project switching and delayed responses in Core/Search/Session specs.
2. Session task switching, refresh, and SSE reconnect must keep a single run watcher, persisted event ordering, and one intended mutation. Pin request counts and reconnect history in the Session spec.
3. A newer CV must not replace the session's bound revision; unpaired legacy sessions remain read-only. Pin original pair identity, newer-CV action, and disabled legacy mutations in the Session spec.
4. Search sample/source-unavailable/partial-pool results and evaluation fit/keyword/AI scores must retain their distinct meanings. Pin source labels, partial counts, denominators, and no unsupported hiring claim in Search/Session specs.
5. Creating a project must finish on the successful project response without an invalid unpaired-session request; unknown create outcomes must not encourage blind duplicate creation. Pin POST counts, profile destination, visible failure recovery, and honest goal copy in the Core spec.

## Ownership and Dependencies

| ID / owner | Exclusive files | Dependencies / acceptance |
| --- | --- | --- |
| CORE / Main | `frontend/src/styles.css`, `frontend/src/app/**`, `frontend/src/components/**`, `frontend/src/locales/common.{th,en}.json`, `frontend/src/features/overview/**`, `frontend/src/features/projects/**`, `frontend/src/features/sessions/**`; `tests/e2e/core-workspaces.spec.ts`; shared-shell selector updates in `navigation.spec.ts`, `shell.spec.ts`, `accessibility.spec.ts`, `full-journey.spec.ts`, `workflow.spec.ts`, `workflow-regressions.spec.js`; root `DESIGN.md` and sidecar at finish | Existing REST/SSE types and controls. Own shared locale registration and shell compatibility. |
| SEARCH / Worker A | `frontend/src/features/search/**`, `frontend/src/locales/search-workspace.{th,en}.json`, `tests/e2e/search-workspace.spec.ts`, Search-only assertion updates in `tests/e2e/saved-searches.spec.ts` | Existing primitives and API helpers; preserve search/run/filter logic. No shared styles/config/fixtures edits. |
| SESSION / Worker B | `frontend/src/features/chat/**`, `frontend/src/locales/session-workspace.{th,en}.json`, `tests/e2e/session-workspace.spec.ts`; Session-only assertion updates in `agent-tools.spec.ts`, `cv-tailoring.spec.ts`, `durable-runs.spec.ts`, `document-provenance.spec.ts` | Existing primitives and `useRun`; preserve all run/input/approval/SSE logic. No shared styles/config/fixtures edits. |
| FINISH / Main with independent reviewer and Impeccable documenter | Combined diff review; documenter leases only root `DESIGN.md` and its sidecar after implementation | All owned work integrated; relevant checks and visual evidence recorded. |

Workers are not alone in the codebase. Never revert other edits. A worker needing an unowned file sends a precise request to Main; ownership is transferred explicitly before edits. Main alone changes `frontend/src/app/providers.tsx`, shared fixtures, and test configuration; no fixture/config changes are planned.

**Locale contract:** Search creates namespace `searchWorkspace` through `useTranslation('searchWorkspace')`; Session creates `sessionWorkspace` through `useTranslation('sessionWorkspace')`. Main registers both locale pairs in `providers.tsx` under those exact resource names. Existing `common`/`settings` namespaces and default namespace remain compatible. Workers use existing primitives and feature-local utility classes; shared layout changes are communicated to Main.

## Wave 0 — Baseline and Interface Freeze (Main)

- [x] Confirm branch/status and local Hub context; preserve unrelated files. Record the scoped approval, DESIGN review status, file leases, and baseline in Hub.
- [x] Read `frontend/AGENTS.md`, `tests/e2e/AGENTS.md`, the three spec documents, and current source for each owned feature before editing.
- [x] Run baseline build and focused existing browser journeys once. Record failures separately from new regressions; do not repair unrelated failures.

```sh
rtk npm run build --prefix frontend
rtk proxy env JSP_E2E_BASE_URL=http://127.0.0.1:4177 PLAYWRIGHT_OUTPUT_DIR=/tmp/ux-core-baseline npm test --prefix tests -- --workers=1 e2e/navigation.spec.ts e2e/shell.spec.ts e2e/workflow.spec.ts e2e/durable-runs.spec.ts e2e/saved-searches.spec.ts
```

- [x] Freeze the ownership table and locale contract above. Dispatch Search and Session workers with the relevant spec sections, review focus, existing server, test output path, and no-commit instruction.
- [x] Main and both workers capture BEFORE screenshots using the same synthetic fixture content planned for AFTER comparisons. Main holds shared style/token changes until both feature workers confirm their captures are complete. Existing shell/navigation baseline: 17 tests passed on `:4177` before implementation; retain Main's recorded command/output as evidence.

## Wave 1 — Shared Foundation, Shell, Overview (Main)

May overlap Wave 2 because workers use existing primitive exports and own no shared files.

- [x] Add `core-workspaces.spec.ts` with regressions for project 201 without session POST, explicit project switching, stable evaluations index, no-CV readiness, attention for `needs_input`/approval, one failed resource with other content retained, and Thai/English shell names. Override synthetic routes inside this spec; keep shared fixtures unchanged.
- [x] Consolidate existing semantic tokens, typography, spacing, focus/disabled/error states, and canonical Button compatibility without changing primitive APIs. Apply the approved calm indigo system in light/dark; use 16px mobile inputs, wrapping names, visible focus and text status, restrained reduced-motion behavior.
- [x] Replace the everyday expanded tree with a project switcher Radix Dialog containing the existing `ProjectTree`. Retain rename/delete/undo/new-session controls there. Provide grouped Work/Materials/Utilities links with stable `/app/projects/:projectId/sessions` Evaluations destination; keep the existing accessible mobile drawer and shortcut. Preserve account/settings and all supported deep links.
- [x] Add the project-scoped evaluations index under `features/sessions/`, using current sessions/runs data and `NewSessionDialog`. Display actual pair/status information when supplied; do not invent missing fields. New session creation still requires real CV/job revisions.
- [x] Fix `NewProjectPage.tsx`: remove the dummy session request, finish successful creation at the new project's profile/CV readiness screen, and remove any implication that the unpersisted goal is saved. Preserve drafts and validation; uncertain failure recovery should allow inspecting/reloading the project list before another create.
- [x] Recompose Overview around readiness, attention, current work, and supporting material. Map actual operation/status combinations, route sessionless work to the correct existing destination, and isolate resource failures/retries. A failed request is never shown as an empty collection.
- [x] Register `searchWorkspace` and `sessionWorkspace` locale files once workers create them. Update only Main-owned shared-shell assertions that changed with the intentional navigation contract.

Acceptance: valid project creation reaches readiness without 422; stable Evaluations navigation never chooses an arbitrary first session; project controls and old routes work; Overview prioritizes real required action, retains successful content after one request fails, and exposes no cross-project state.

## Wave 2 — Independent Core Workspaces

### SEARCH — Worker A

- [x] Before modifying Search or shared style changes begin, capture the current Search view with the comparison fixture at desktop and mobile; report completion to Main, then proceed.
- [x] Add `search-workspace.spec.ts` using local route overrides for initial/loading/empty/error/sample, retained rows after load-more failure, hidden-only results, running/partial Smart match, and project switch with a delayed old response. Count save/evaluate requests to pin existing idempotence behavior.
- [x] Recompose the existing SearchPage into controls/filter summary/results plus its existing detail inspector. Keep query, location, and work mode visible; group advanced filters with active chips/count and clear actions; keep saved searches, digests, hidden/undo, supported multi-value filters, pagination limits, and URL state.
- [x] Preserve general relevance, deterministic keyword coverage, and AI Smart match as distinct labelled methods. Keep selected CV revision, disclosure, pool/partial counts, source/sample state, unknown salary/freshness, and visible disabled-action reasons accurate. Reuse the current data/run logic; do not create a second search or ranking controller.
- [x] At desktop use the current list/detail pattern with readable row hierarchy; at tablet/mobile provide keyboard/touch detail and Back behavior that preserves query/filter/selection state. Keep complete title/source access and avoid document-wide horizontal overflow.
- [x] Put new copy in `search-workspace.{th,en}.json`. Run the owned spec and existing saved-search spec against the shared server; report exact pass/fail and changed files to Main.

```sh
rtk proxy env JSP_E2E_BASE_URL=http://127.0.0.1:4177 PLAYWRIGHT_OUTPUT_DIR=/tmp/ux-search-workspace npm test --prefix tests -- --workers=1 e2e/search-workspace.spec.ts e2e/saved-searches.spec.ts
```

Acceptance: every existing search/save/evaluate/hidden action remains reachable; source and score semantics are explicit; search state survives the responsive detail flow; no stale project results or duplicate mutations.

### SESSION — Worker B

- [x] Before modifying Session or shared style changes begin, capture the current Session view with the comparison fixture at desktop and mobile; report completion to Main, then proceed.
- [x] Add `session-workspace.spec.ts` with bound/newer/legacy pair fixtures, no-results/completed/partial output, queued/running/waiting approval/needs-input/failed/interrupted/cancelled states, tab switches during a run, SSE reconnect and mutation request counts. Reuse existing fixture routes through local overrides.
- [x] Recompose SessionPage into persistent pair context, global current-run/attention area, and Evaluation / Prepare documents / Application answers / History tabs using existing Radix tabs. Keep `useRun` mounted once above tab content; preserve form draft state and independent document language across tab changes.
- [x] Keep the exact `cv_revision_id`/`job_revision_id`, current source previews, newer-CV new-session action, and read-only legacy boundary. Lead Evaluation with actual report and separately labelled metrics; retain report/Markdown copy.
- [x] Move existing drafting/revision/redraft/tailoring and application-answer controls into the corresponding task panels. Preserve all handlers, limits, evidence/owner/suggestion distinctions, approval/promotion, export/history/trash links, retry-as-new-run, cancellation confirmation, and resume semantics.
- [x] Keep approval and required input visible while any task is selected. Resolve target names only from current authorized data; otherwise show exact identity under details. Preserve approve/reject scope, expiry, server outcome refresh, and truthful “Record as applied” meaning.
- [x] Put new copy in `session-workspace.{th,en}.json`. Update only leased existing Session assertions and run the owned feature checks; report exact pass/fail and changed files to Main.

```sh
rtk proxy env JSP_E2E_BASE_URL=http://127.0.0.1:4177 PLAYWRIGHT_OUTPUT_DIR=/tmp/ux-session-workspace npm test --prefix tests -- --workers=1 e2e/session-workspace.spec.ts e2e/durable-runs.spec.ts e2e/cv-tailoring.spec.ts e2e/agent-tools.spec.ts e2e/document-provenance.spec.ts
```

Acceptance: all preparation capabilities remain reachable; pairing is immutable; tab changes/reconnect do not start another run, lose input, hide required attention, or change approval meaning.

## Wave 3 — Aggregate Review, Polish, Evidence, Stop (Main)

- [x] Inspect each worker's exact file list and combined diff. Check namespace registration, route continuity, project boundaries, preserved capabilities, and unintended changes before aggregate checks.
- [x] Run build and scoped aggregate browser checks. After those pass, run the existing browser suite once to catch shared-token/shell regressions. Fix in-scope failures through the owning worker; preserve evidence for unrelated failures. No new axe dependency: use existing accessibility checks and keyboard/contrast inspection; run axe only if an existing available dependency supports it.

```sh
rtk npm run build --prefix frontend
rtk proxy env JSP_E2E_BASE_URL=http://127.0.0.1:4177 PLAYWRIGHT_OUTPUT_DIR=/tmp/ux-core-aggregate npm test --prefix tests -- --workers=1 e2e/core-workspaces.spec.ts e2e/search-workspace.spec.ts e2e/session-workspace.spec.ts e2e/navigation.spec.ts e2e/accessibility.spec.ts
rtk proxy env JSP_E2E_BASE_URL=http://127.0.0.1:4177 PLAYWRIGHT_OUTPUT_DIR=/tmp/ux-core-regression npm test --prefix tests -- --workers=1
```

- [x] Inspect real browser views for Overview, Search, and Session at 1440px desktop, 820px tablet, and 390px mobile; add a 320px overflow and 200% zoom check. Cover Thai/English and light/dark, keyboard navigation, drawer/dialog focus return, tabs, long Thai/English names, reduced motion, loading/error/empty/running/waiting approval/partial output. Reuse matrix fixtures; do not claim live provider acceptance from synthetic runs.
- [x] Apply the requested Impeccable critique/audit/polish to the built result. Run the detector once after material implementation, triage findings, and use the independent finish reviewer for the combined artifact and five review-focus risks. Correct material findings and rerun only affected checks.
- [x] Have the Impeccable document scan derives root `DESIGN.md` and its required sidecar from the shipped artifact; document only implemented tokens/components/responsive behavior, with explicit reviewed scope. Main records test outcomes, visual evidence, remaining limitations, and DESIGN review in local Hub after every wave.
- [x] Confirm changed files stay within this milestone and no dependency/backend/API files changed. Present working preview plus desktop/mobile evidence and exact verification results. **STOP for the owner's visual review.** Applications List/Board, supporting-screen redesign, landing work, deployment, and merge remain future work.

Security/CVE gate: this milestone changes no dependencies or runtime images. Existing security acceptance still applies; before a later merge/release run the relevant current dependency checks required by DELIVERY.md and report scope/date honestly. No release-readiness or live-provider claim is part of this visual review milestone.

## Delivery evidence — 2026-10-16

- Completed the scoped implementation and bounded correction pass; stop for owner visual review. No push/merge/deployment. [Implementation report](../../ux-redesign/IMPLEMENTATION_REPORT.md) and [verification](../../ux-redesign/verification.json) are authoritative.
- Final build/typecheck PASS; full Chromium suite147PASS/1pre-existing actual-backend SKIP/0FAIL/0FLAKY. The skip requires JSP_E2E_SESSION_FILE, not provider credentials. npm audits frontend/tests0reported findings. No backend/API/dependency/lockfile changes.
- Six finish regressions failed before correction and passed after. Independent A28/40 and B15/20 describe the original finish review; all scoped P0/P1 resolved, bounded source/visual confirmation recorded. Scores were not invented again after fixes. One detector run:2warnings/0errors, triaged out of the core scope/dead CSS. CLI fallback; no mutable native overlay.
-72font-loaded BEFORE/AFTER PNGs plus2populated Overview images packaged. Reproduced baseline exactc4905b9 production build with corresponding synthetic fixture. Overview tablet768px; Search/Session tablet820px; mobile390px; desktop1440px. Current verification includes existing320px route regression.
- Parent performed Impeccable document scan of shipped tokens/components and wrote DESIGN.md plus schemaVersion2 sidecar; independent A checked source fidelity. This replaced a separate documentation agent without changing evidence requirements.
- **Verification boundary:** checked boxes above denote the bounded implemented/tested milestone. A complete200%browser-zoom matrix, screen-reader session, physical touch/cross-engine testing and measuredCWV were not performed. Those remain explicit acceptance limitations, not implied PASS results.
- Source changes after worker freeze were leased back to parent for finish corrections. Only owned capture tests were delegated again. Existing assertions were retained; two final compatibility selectors/copy assertions updated to the intentional output-language and provider-copy changes.
- Baseline/test-only servers stopped; screenshot review server retained at127.0.0.1:4180 (PID28111), intentionally user-facing. Start it again with `python3 -m http.server 4180 --bind 127.0.0.1 --directory docs/ux-redesign` if needed. No app backend started.
- Remaining surface redesign is not authorized in this milestone. Await owner review of the three shipped core surfaces.
