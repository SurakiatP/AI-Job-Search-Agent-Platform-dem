Method: dual-agent (A: `/root/finish_design_a` · B: `/root/finish_audit_b`)

# Core workspace implementation and visual review

Date: 2026-10-16  
Branch: `feat/ux-core-workspaces`  
Baseline: `c4905b9264edca82d39fc6e406152138bd8c401d`  
Status: Implemented and synthetically verified; stopped for owner visual review. Uncommitted; no push, merge or deployment.

## Scope and milestone outcomes

The owner's later implementation request approved the Collection Index direction and the initial three surfaces. The earlier audit/proposal remains historical evidence. This implementation uses the existing React/Vite/TypeScript/Tailwind/Radix architecture and existing REST/SSE contracts.

### 1. Shared foundation and Overview

- Consolidated semantic colours, bilingual typography, control sizes, visible focus and flat work surfaces in the existing primitive system. Retained the existing Button adapter.
- Grouped navigation into Work, Materials and Utilities. Added a stable Evaluations index and explicit project switcher with the existing rename/delete/session/undo capabilities. Preserved session deep links and mobile drawer behaviour.
- Overview now leads with pending decisions and CV readiness, then current work and supporting material. It names the primary CV rather than selecting an unrelated highest revision number. A failed resource does not erase successfully loaded panels. Sessionless work links to Agent activity; operation names and partial outputs remain accurate.
- Fixed project creation: one successful project POST leads to CV setup, without an invalid unpaired-session POST. Uncertain outcomes offer project-list recovery. Removed the unsaved goal field. Settings links preserve explicit project scope; a narrow Webhooks overflow repair keeps the existing supporting page usable.
- Mobile semantic order is attention → current work → CV → documents → activity. Supporting counts and manual-submission guidance remain secondary.

**Verification:** Core21 tests, existing navigation/shell/journey regressions and final aggregate below. Explicit project switch, session delete/undo, settings scope, uncertain creation, partial resource failure and both languages/themes are covered. Overview before/after12 combinations each, plus populated desktop/mobile evidence.

### 2. Job Search workspace

- Kept query, location and work mode in the primary search area. Posting age and additional filters are progressively disclosed, while active chips retain direct removal and URL state.
- Improved list/inspector hierarchy, source labels, save/evaluate actions and narrow-screen detail/Back flow. Keyboard focus deliberately enters detail and returns to the selected result. A populated mobile search reaches the first opportunity within the initial viewport.
- Preserved saved searches, digest controls, pagination, hide/undo, project response isolation, real API handlers and source/sample distinctions. Empty saved-search controls are compact.
- Distinguished keyword coverage from AI estimates, uncertainty, missing scores, partial ranking and the bounded ranking pool. No hiring probability is claimed.

**Verification:** Search and saved-search focused subset20/20; final aggregate includes it. URL state, loading/empty/error/sample, later-page failure, running/partial Smart match, request counts and stale-project responses have regressions. Before/after12 combinations each with font checks.

### 3. Evaluation Session workspace

- Persistent named CV/revision and job/revision above four task tabs: Evaluation, Prepare documents, Application answers and History.
- Current run, pending approval and required-input state remain visible across task changes. One run watcher stays mounted; drafts survive task switching. Legacy unpaired sessions remain read-only and newer CVs do not replace existing bindings.
- Accurate operation headings distinguish evaluation, tailoring, answers, document work and recording Applied. Resume copy describes a restarted round with carried limits. Output language is explicitly labelled above the task tabs and is independent of UI language.
- Retained report copy, document revisions/history, partial outputs, approval identity/scope, cancellation/retry, SSE reconciliation and manual-submission semantics.

**Verification:** Session-owned subset29/29 before finish corrections; focused Session9/9 after corrections; final aggregate includes all retained Session regression specs. New finish tests verify operation names and the answer-language POST. Before/after12 combinations each use valid native3.6/5 synthetic scores.

## Files and component ownership

- **Shared:** `frontend/src/styles.css`, `app/providers.tsx`, `app/router.tsx`, `components/AppShell.tsx`, `ProjectSidebar.tsx`, `ProjectTree.tsx`, `Header.tsx`, `FitScore.tsx`, `components/ui/{button,input,card}.tsx`, `locales/common.{en,th}.json`.
- **Overview/setup/index:** `features/overview/OverviewPage.tsx`, `features/projects/NewProjectPage.tsx`, new `features/sessions/SessionsPage.tsx`.
- **Search:** `features/search/{SearchPage,AdvancedFilters,SavedSearches}.tsx`, new `locales/search-workspace.{en,th}.json`.
- **Session:** `features/chat/{SessionPage,RunTimeline,ApplyCard,ApprovalCard,TailorCard}.tsx`, new `locales/session-workspace.{en,th}.json`.
- **Compatibility repairs:** `features/settings/{SettingsPage,WebhookSettings}.tsx` only; no Settings redesign.
- **Tests:** new `core-workspaces.spec.ts`, `search-workspace.spec.ts`, `session-workspace.spec.ts`, `ux-finish.spec.ts`; retained journey/navigation/accessibility/account/gateway/session/durable-run/provenance/owner/workflow/saved-search/Webhooks specs adapted to the new UI. No test was disabled, deleted or skipped to pass this redesign. The pre-existing real-backend test retains its configuration gate.
- **Design and evidence:** [DESIGN.md](../../DESIGN.md), [.impeccable/design.json](../../.impeccable/design.json), this report, two finish assessments, detector JSON, [verification.json](verification.json), screenshot gallery and manifest. Prior research artifacts are preserved.

No backend, API-contract, dependency-manifest, lockfile, infrastructure or provider configuration changes.

## Verification results

Authoritative machine-readable results and all148 test titles: [verification.json](verification.json).

| Gate | Result | Practical scope |
| --- | --- | --- |
| `npm run build --prefix frontend` | PASS, exit0 | `tsc -b` and Vite production build |
| Full existing + new Playwright suite | **147 passed,1 skipped,0 failed,0 flaky** | Chromium, synthetic intercepted APIs;54.5s |
| Finish regression proof |6 failed before correction →6 passed after | Focus return/entry, operation naming, answer-language POST, mobile order/result distance |
| Frontend npm audit |0 reported vulnerabilities | Current locked frontend dependency tree,2026-10-16 |
| Browser-tests npm audit |0 reported vulnerabilities | Current locked test dependency tree,2026-10-16 |
| Before/after screenshot matrix |72 PNGs |3 surfaces ×3 viewports ×2 languages ×2 themes ×2 stages |
| Additional Overview state captures |2 PNGs | Populated attention/active/partial material, desktop/mobile |
| Independent critique / audit / polish | Completed; material corrections confirmed | Original scores retained below; no post-fix score inflation |

Final browser command:

```sh
rtk proxy env JSP_E2E_BASE_URL=http://127.0.0.1:4177 PLAYWRIGHT_OUTPUT_DIR=/tmp/jsp-ux-delivery-regression npm test --prefix tests -- --workers=3 --reporter=json
```

All tests use synthetic records. The skipped `actual-backend.spec.ts` requires `JSP_E2E_SESSION_FILE`; no real-provider or deployed-backend acceptance is claimed. Source preserves the existing API clients and handlers; intercepted browser tests prove frontend behaviour against fixture contracts.

### States and accessibility evidence

Tests cover loading, empty, resource error, successful mutation, queued/running, waiting for approval, needs input, completed, failed, interrupted, cancelled and partial results. They also cover SSE reconnect, no extra mutation on task switching, bound/newer CV, read-only legacy context, scope switching, uncertainty recovery, and retained drafts.

Keyboard evidence includes skip-to-main, drawer focus trapping/Escape/return, project-switcher focus return, task tabs, and Search detail entry/return. Existing responsive regression checks320/768/1440px across supported routes; the three-surface screenshot matrix uses390px mobile,768px Overview tablet/820px Search and Session tablet, and1440px desktop. Thai/English and light/dark are explicitly asserted. Bundled fonts are awaited before final captures.

This is bounded accessibility evidence, not full WCAG certification. No VoiceOver/NVDA session, complete200%browser-zoom matrix, physical-device touch test or cross-engine matrix was performed.

## Screenshot evidence

Open the [before/after gallery](implementation-evidence/index.html) and select workspace, viewport, language and theme. Images and [manifest](implementation-evidence/manifest.json) are portable repository artifacts with PNG dimensions and SHA-256 hashes. The gallery displays screenshots, not a second interactive application or a backend demo.

BEFORE was reproduced with `git archive c4905b9 frontend tests`, a production build using the locked existing dependencies, and a temporary Vite preview. AFTER is the implemented working frontend with the corresponding synthetic fixture. Both wait for the bundled fonts. Temporary baseline servers/build snapshots were removed. Original audit screenshots remain separate historical evidence.

- Overview: [before](implementation-evidence/overview-before-desktop-en-light.png), [after](implementation-evidence/overview-after-desktop-en-light.png), [populated desktop](implementation-evidence/overview-populated-desktop.png), [populated mobile](implementation-evidence/overview-populated-mobile.png).
- Search: [before](implementation-evidence/search-before-desktop-en-light.png), [after](implementation-evidence/search-after-desktop-en-light.png), [mobile](implementation-evidence/search-after-mobile-en-light.png).
- Session: [before](implementation-evidence/session-before-desktop-en-light.png), [after](implementation-evidence/session-after-desktop-en-light.png), [Thai dark mobile](implementation-evidence/session-after-mobile-th-dark.png).

## Impeccable critique and audit

### Design specificity and overall impression

The implemented shell and source context are recognizably grounded in this product: an individual works within a named project and evaluates an immutable CV/job pair. The strongest improvements are actionable attention, readable revision identity and task separation. The indigo rail and consistent bilingual type provide cohesion without decorative KPI scaffolding. Mobile Search still has a substantial setup area; its first result is now visible near the end of the initial viewport.

The two assessments ran independently. A finished before any detector findings entered parent synthesis. [Assessment A](FINISH_DESIGN_REVIEW.md) inspected17 screenshots and relevant source. [Assessment B](FINISH_TECHNICAL_AUDIT.md) ran the detector once, inspected source/evidence and verified the switcher focus defect in a fresh native browser tab. Both appended bounded correction confirmations. Original scores describe the review before corrections and are preserved honestly.

### Design health score — before finish corrections

| Nielsen heuristic | Score/4 |
| --- | --- |
| Visibility of system status |3 |
| Match with the real world |3 |
| User control and freedom |3 |
| Consistency and standards |3 |
| Error prevention |3 |
| Recognition rather than recall |3 |
| Flexibility and efficiency |3 |
| Aesthetic and minimalist design |3 |
| Error recovery |2 |
| Help and documentation |2 |
| **Total** | **28/40 — Good** |

Historical research baseline:22/40. The archive records22→28/40 across two snapshots. The original audit covered the broader application, while this finish review concentrates on the three core surfaces; the scores are not a directly comparable usability measurement. No fresh numerical score was invented after fixes.

Technical audit: accessibility3, performance2, theming4, responsive3, implementation integrity3 = **15/20 — Good**, before corrections. The implementation expresses a coherent system; retained bundle size remains the principal measured technical debt.

### Priority findings and polish dispositions

| Finding | Initial severity | Disposition |
| --- | --- | --- |
| Most current-run operations called document drafting |P1 | Fixed with the shared10-operation map and neutral fallback; truthful restarted-round copy. Regression exercises four formerly mislabelled operations. |
| Answer output language hidden in another task tab |P2 | Fixed with a shared explicitly labelled control and explanatory text; POST language verified without visiting Documents. |
| First mobile Search result below a full viewport |P2 | Posting age disclosed under More filters, smaller mobile gaps and compact empty saved-search controls. First opportunity now within initial viewport in regression. |
| Mobile Overview CV context after documents |P2 | Semantic DOM and visual order corrected while retaining desktop columns. |
| Search detail entry removes focus |P2 | Focus enters Back; exiting returns focus to the selected result and restores scroll. |
| Project switcher Escape loses focus |P2 | Explicit close autofocus returns to the trigger; native finding has a passing regression. |
| Invalid72/5 synthetic Session fixture and English-only Thai assertion |P2 evidence defect | Replaced with native3.6/5 fixture; localized accessible-name assertion and all before/after captures refreshed. Product score contract unchanged. |
| Eager route bundle |P2, retained debt | Final JS1,078.25kB /313.76kB gzip; CSS73.11kB /18.03kB gzip. Route splitting is deferred; no CWV claim. |

Minor polish also replaced provider environment-variable instructions with connection/setup guidance and stopped the Overview status badge stretching like a progress bar. No unresolved verified P0/P1 remains in the scoped review. Supporting pages retain their existing designs.

### Deterministic scan and browser overlay

[Detector JSON](evidence/finish-b-detector.json): exit2,2 warnings,0 errors. One warning concerns a dead legacy `.side-tab` rule; the other concerns active gradient text on the public landing page, outside this implementation scope. Neither is a verified core-workspace defect. No detector rerun was used to inflate confidence.

Native browser evaluation is read-only, so mutable overlay injection was unavailable. No Impeccable live overlay is claimed. Assessment B used CLI findings and source/native-browser evidence. Audit-only tabs were closed; no detector server was started.

### Personas, cognitive load and remaining opportunity

- **Thai/English job seeker:** shared output language and immutable revision context reduce accidental preparation for the wrong language or source.
- **Keyboard-dependent user:** focus continuity is now explicitly tested at the project-switch and Search detail boundaries. Real screen-reader behaviour remains unverified.
- **Distracted mobile user:** readiness precedes documents, advanced filters are disclosed and opportunities appear earlier. Dense completed-run space can be refined later after visual feedback.

Questions skipped: the owner already selected the three-surface scope and authorized material fixes. Only one product priority remains open in this report (bundle debt); visual acceptance is the next owner decision.

## Known limitations and remaining work

- Synthetic browser verification does not replace actual backend/provider, deployed networking or production-data acceptance. No credentials were required or exposed.
- Measured CWV, screen-reader testing, complete zoom/touch/cross-browser evidence and route bundle optimization remain outstanding.
- The root DESIGN.md and sidecar describe the implemented approved direction; the finished appearance is awaiting owner visual review. No claim of owner acceptance is inferred from successful tests.
- Applications, Profile/CV, document editing/library, Agent activity, Settings, account/auth and public landing redesign are future milestones. Existing capabilities remain reachable; no additional surface redesign was started.
- No commit, push, PR, merge or deployment was performed. The unrelated main-checkout `.python-version` remains untouched.

**Stop condition reached:** review the initial three implemented surfaces before authorizing work on remaining pages.
