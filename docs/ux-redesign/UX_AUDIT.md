Method: dual-agent (A: `/root/ux_assessment_a` · B: `/root/ux_assessment_b`)

# UX audit

Review completed: 2026-10-16; baseline evidence captured 2026-10-15.  
Baseline: `origin/develop` at `c4905b9264edca82d39fc6e406152138bd8c401d`  
Branch: `docs/ux-redesign-plan`  
Status: Completed analysis and design recommendations for owner review. No implementation approval or production-readiness certification.

## 1. Scope and method

The requested scope is the existing bilingual web application for individual job seekers in Thailand. The requested journey is project setup → CV readiness → discovery → evaluation → document preparation → manual application → tracking.

Impeccable 4.5.2 is the design workflow. Its `context` command was invoked once in this session. Its audit, critique, init, shape, and Operate guidance were read. The application was inspected through the browser using its actual FastAPI backend and synthetic persisted records. No browser API responses were intercepted or replaced.

The owner explicitly approved two independent reviewers and confirmed the product facts from the brief. [PRODUCT.md](../../PRODUCT.md) records those facts. Assessment A reviewed design/source/live screens without reading the parent draft or detector findings. Assessment B independently ran the deterministic scan and reviewed source/browser evidence, saved its findings privately, and reported only its completion/path. The parent read B's findings only after A had completed. Neither reviewer changed application source or ran tests. This report synthesizes their assessments with the parent's earlier synthetic-browser evidence; it does not concatenate their priority lists or count detector warnings as user defects.

The root `DESIGN.md` is absent at this baseline. Existing visual decisions were recovered from source and the historical [2026-10-07 UI specification](../superpowers/specs/2026-10-07-ui-redesign-design.md). That specification is context; it is not silently replaced by this evidence draft.

### Environment

- App: temporary local origin `http://127.0.0.1:8020`, built from this worktree.
- Persistence: separate audit PostgreSQL database and MinIO bucket, with a synthetic account, two initial projects, one synthetic CV revision, one experience fact, four jobs, four paired sessions, and four pre-seeded completed evaluation records.
- Evaluation records explicitly identify themselves as synthetic UI fixtures. Scores and reports are not evidence of model quality or successful AI execution.
- No AI provider credentials were configured. No real AI evaluation, document generation, application submission, email, Telegram, webhook, or external agent operation was performed.
- Existing owner app processes on other ports were left untouched.
- A frontend production build succeeded. Its output included a single JavaScript chunk of 1,042.64 kB (305.37 kB gzip), CSS 72.60 kB (17.82 kB gzip), and Vite's chunk-size warning. This is build evidence, not a Core Web Vitals measurement.
- No automated test suite was run or changed. Browser inspection is a bounded UX review, not an end-to-end release verification.

### Evidence labels

- **Observed:** visible in the running synthetic application, screenshot or DOM evidence retained.
- **Source:** present in current implementation or contract, without claiming the behavior was exercised.
- **Gap:** a state, integration, or measurement that was not verified.

## 2. Current stack and route inventory

Source: [frontend/package.json](../../frontend/package.json), [router.tsx](../../frontend/src/app/router.tsx).

| Layer | Current implementation |
| --- | --- |
| UI/runtime | React 19.3.0, TypeScript 7.0.2, Vite 8.3.2 |
| Routing | React Router 8.4.0 |
| Styling | Tailwind CSS 4.3.3, semantic CSS custom properties, legacy component CSS |
| Primitives | Radix Dialog, Dropdown Menu, Slot, Tabs; repository-owned shadcn-style components |
| UI helpers | class-variance-authority, clsx, tailwind-merge, Lucide |
| Language/content | i18next, react-i18next, react-markdown, remark-gfm |
| Fonts in source | Noto Sans Thai for UI, Noto Serif Thai for landing, Manrope for English documents |
| Data updates | REST requests through existing hooks/client; persisted SSE run events plus reconciliation |
| Backend boundary | Python/FastAPI, shared service layer, PostgreSQL, MinIO, Meilisearch, worker execution and provider integrations |

The redesign must retain the existing framework and feature architecture. No Next.js migration or backend/API redesign is authorized.

| Current path | Purpose / capabilities to preserve |
| --- | --- |
| `/` | Landing, entry to product |
| `/login`, `/signup`, `/verify-email` | Authentication and verification |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/digest/unsubscribe` | Saved-search digest unsubscribe |
| `/app` | Entry redirect based on available projects |
| `/app/search` | Carries landing search query into a project |
| `/app/projects`, `/app/projects/new` | Project list and creation |
| `/app/projects/:projectId/overview` | Project summary, CV, jobs, documents, agent activity |
| `/app/projects/:projectId/profile` | Multiple CVs/revisions, primary CV, experience bank, preferences |
| `/app/projects/:projectId/search` | General search, Smart match, filters, saved searches/digests, hidden results |
| `/app/projects/:projectId/sessions/:sessionId` | Immutable CV/job pairing, evaluation, drafting, tailoring, answer packs, run status and approval handling |
| `/app/projects/:projectId/applications` | Application board |
| `/app/projects/:projectId/jobs` | Existing alias to Applications |
| `/app/projects/:projectId/jobs/:jobId` | Posting/evaluation details, stage, recruiter contact, correspondence, notes, timeline |
| `/app/projects/:projectId/documents` | Document library and trash |
| `/app/projects/:projectId/documents/:documentId` | Document reading/editing, immutable revisions, provenance/export/restore actions |
| `/app/projects/:projectId/console` | Task timeline, approvals, connected agents, MCP/A2A instructions |
| `/app/settings` | Appearance, gateway status, tools, project sharing, webhooks and Telegram |
| `/app/account` | Account management |
| `/app/oauth/consent` | External agent OAuth consent |

## 3. Browser coverage and screenshots

Screenshots contain synthetic data only. JPEG extensions reflect the actual browser output format. Desktop viewport was requested as 1440 × 900; full-page captures may use the scrollbar-adjusted content width. Mobile viewport was 390 × 844. This is a representative sample, not every combination of route, state, language and theme.

| Surface/state | Coverage | Evidence |
| --- | --- | --- |
| Populated Overview | Thai, light and dark, desktop | [Light](evidence/overview-th-light-desktop.jpg), [dark](evidence/overview-th-dark-desktop.jpg) |
| Empty Overview | English, dark, desktop and mobile | [Desktop](evidence/overview-empty-en-dark-desktop.jpg), [mobile](evidence/overview-empty-en-dark-mobile.jpg) |
| Search | Thai, light, desktop; general-search error and Smart match copy/transition inspected | [Search dependency error](evidence/search-th-light-desktop.jpg) |
| Evaluation session | Thai/light desktop, English/light mobile; paired CV/job and synthetic completed report | [Desktop](evidence/session-th-light-desktop.jpg), [mobile](evidence/session-en-light-mobile.jpg) |
| Applications | English, light desktop/mobile and dark desktop | [Desktop light](evidence/applications-en-light-desktop.jpg), [desktop dark](evidence/applications-en-dark-desktop.jpg), [mobile](evidence/applications-en-light-mobile.jpg) |
| Job/application detail | English, dark, desktop; saved job, report, contact/log/note forms | [Detail](evidence/job-en-dark-desktop.jpg) |
| Profile/CV | English, dark, desktop; synthetic CV and experience fact, provider-unconfigured message | [Profile](evidence/profile-en-dark-desktop.jpg) |
| Document library | English, dark, empty state | [Library](evidence/documents-en-dark-empty.jpg) |
| Agent Console | English, dark, completed tasks | [Console](evidence/console-en-dark-desktop.jpg) |
| Project sharing settings | English, dark, project selector; no token created | [Settings](evidence/settings-sharing-en-dark.jpg) |
| New project | Thai, light; submitted once with synthetic values | [After submit](evidence/project-create-after-submit.jpg), [persisted project list](evidence/projects-after-create-error.jpg) |

### Material coverage gaps

- Search and facet requests returned HTTP 500 in the isolated review process. The UI's retry/sample-data affordances were observed. The cause was not classified, so this is **not** evidence that production search is broken. Populated search results, paging, save/hide and completed Smart match need real dependency-connected browser review.
- The seeded document did not appear in the library because its complete publication/provenance fixture was not populated. Document detail, editing, export and history were source-inspected; this fixture limitation is not a product defect.
- Active streaming, reconnect, cancellation, expired/stale approval, `needs_input`, interrupted runs, real generated document states, quotas and account verification gates were not exercised live.
- No screen-reader session, comprehensive keyboard traversal, contrast scan, 200–400% zoom review, full 320px matrix or measured CWV run has been performed. B verified the skip link focuses the main landmark and a Console tab responds to ArrowRight; these are bounded positive checks, not general keyboard certification.
- The browser exposes read-only DOM evaluation. Mutable detector overlay injection is unavailable. No user-visible Impeccable overlay is claimed. B completed the CLI detector and source triage after independent assessment setup; its results appear below.

## 4. Verified creation-flow evidence

**Observed:** Submitting a valid synthetic project name and goal leaves the user on the creation form with the generic Thai error “ไม่สามารถโหลดข้อมูลนี้ได้”. Opening the project list afterwards shows the newly persisted project.

Safe request metadata from the isolated backend:

| Time (UTC, 2026-10-15) | Request | Result |
| --- | --- | --- |
| 16:09:32.220 | `POST /projects` | 201 |
| 16:09:32.226 | `POST /projects/{project_id}/sessions` | 422 |

**Source:** [NewProjectPage.tsx](../../frontend/src/features/projects/NewProjectPage.tsx), lines 21–28, first creates a project with `{name}`, then attempts to create a session with only `{title: 'New session'}`. Navigation to the CV page requires both requests to succeed. [SessionCreate](../../docs/contracts/application-api.yaml), lines 1653 onward, requires `cv_revision_id` and exactly one existing/new job input. The [backend create_session handler](../../backend/src/job_search_platform/api/rest.py), line 297 onward, creates a paired session and evaluation together.

Consequences supported by this evidence: the displayed failure is misleading after partial success; another submission would issue another project-creation request; a newcomer cannot reach the intended CV step through this successful-submit path. The required goal is passed as navigation state only; searches for `initialGoal` and `initialSessionId` found no consumer outside `NewProjectPage`.

No fix has been applied. A future frontend-only repair must follow the current contract and must not reintroduce an unpaired session API. Severity and implementation sequencing belong in the completed audit/plan.

## 5. Source observations for independent assessment

These notes describe current behavior. The independent design assessment and synthesized priorities appear in section 8.

| Topic | Evidence / current behavior | Verification level |
| --- | --- | --- |
| Project navigation | `ProjectSidebar.tsx:35–59` combines project/session tree, repeated project heading, seven project destinations and global controls. Evaluate links to `sessions[0]` when present; the API lists sessions in creation order. With no session it opens creation. | Source + screenshots |
| Settings scope | `SettingsPage.tsx:28–29` starts with no selected project and falls back to the first returned project. The route carries section but not the previously active project. Gateway/appearance and project-specific sharing/tools/webhooks occupy one page. | Source + screenshot; wrong-project write not performed |
| Overview dependencies | `OverviewPage.tsx:64–73` loads five resources and replaces the whole content on any resource error. | Source only for partial failure |
| Overview task coverage | `OverviewPage.tsx:41,80,139–141` includes queued/running/waiting_approval, omits needs_input from this activity selection, calls every non-evaluation operation “Drafting documents”, and forms a session link even when a run is sessionless. | Source only for omitted/sessionless states |
| Session hierarchy | `SessionPage.tsx` vertically stacks evaluation, report, draft actions, tailoring, answer preparation and session documents. CV/job revision identity and newer-CV guidance are already present. | Source + desktop/mobile screenshot |
| Submission wording | `ApplyCard.tsx:15` labels the English approval action “Request submit”; nearby helper copy correctly says approving only records the job as applied. `ApprovalCard` explicitly describes manual submission. | Source; the approval action was not performed |
| Approval target visibility | `ApprovalCard.tsx:14–19` binds confirmation state to identity but displays generic “Document revision” / “File” as its target. `ApprovalsTab.tsx` expands application-pack detail for submit_application; other pending actions render an action label and optional session link. | Source only; pending approval not seeded |
| Applications | `ApplicationBoard.tsx:48–62` uses six active columns with minimum 15rem widths and horizontal overflow on desktop. Mobile stacks all stages vertically. Stage changes use a menu, not drag and drop; rejected/withdrawn are grouped in Closed. | Source + screenshots; no stage mutation performed |
| Contact/history | `ApplicationPanel.tsx` supports recruiter fields, external mailto, sent/received correspondence logs, notes, actor attribution and stage timeline. Its copy states that opening the mail app does not send mail. | Source + detail screen |
| UI component overlap | `components/Button.tsx` and `components/ui/button.tsx` coexist. Global form rules in `app/routes.css` overlap utilities and feature-local control classes. | Source |
| Control sizing | `ui/button.tsx` defines 40px default/icon, 36px small and 44px large minimums. Mobile session DOM measurement found a 36px preview control alongside 44px actions. This alone is not proof of WCAG failure: WCAG 2.2 AA minimum and preferred 44px touch size must be distinguished. | Source + read-only DOM geometry |
| Localization | JSON locale resources coexist with feature-local Thai/English dictionaries. UI-language changes preserve synthetic content language. Some product terms such as Smart match and Agent Console remain English by design. | Source + sampled UI; translation completeness not certified |
| Existing accessibility | Skip link, visible labels, aria-invalid/describedby on the project form, status/alert semantics, focus styles, Radix dialogs/tabs and reduced-motion rules exist. They must be retained and individually verified during implementation. | Source + sampled DOM, no full conformance claim |
| Bundle structure | `router.tsx` eagerly imports page features. The observed build emits the large chunk described above. Actual latency, INP and LCP are unmeasured. | Source + build |

## 6. Existing behavior that redesign must preserve

This is a preservation inventory, not approval to change behavior.

| Capability / invariant | Current evidence |
| --- | --- |
| Project-scoped resources and external capabilities | Versioned application API, project route parameters, shared authorization services |
| Multiple CVs, primary selection, revision preview/upload/deletion semantics | `features/profile`, `components/CvPreview.tsx`, CV/session DTOs |
| Immutable paired CV and job revisions; newer CV creates a new session | `NewSessionDialog.tsx`, `SessionPage.tsx`, `SessionCreate` contract |
| Duplicate-pair recovery | `NewSessionDialog.tsx` handles `session_pair_exists` by linking the existing session |
| Deterministic keyword coverage distinct from evaluation score and AI match ranking | `SkillCoverage`, `FitScore`, `RunResults`, Search result types |
| Experience evidence and unsupported-claim handling | `features/profile`, `TailorCard`, `ApplyCard`, evidence services |
| Draft/revise/redraft, document versions, preview/copy/export/trash/restore and provenance | `features/documents`, `DocCard`, document/publication services |
| Tailoring auto and interactive modes; original CV remains intact | `TailorCard`, tailoring contracts/services |
| Application question types, required answers, owner confirmation, parked answer packs | `ApplyCard`, `apply_prepare` / run input contract |
| Manual submission plus separate applied-record approval | `ApplyCard`, `ApprovalCard`, `ApprovalsTab`, application services |
| All eight tracking stages, contacts, correspondence and event history | `lib/applicationStages.ts`, `ApplicationBoard`, `ApplicationPanel` |
| Run identifiers, immutable retry relationships, approval identities, cancellation pending and persisted events | `features/chat/useRun.ts`, `lib/run-events.ts`, REST/SSE contracts |
| Sessionless owner operations and legacy read-only sessions | `useRun`, run operations, `SessionPage` |
| Saved searches, digest unsubscribe, hidden results, source freshness indicators | `features/search`, `features/digest`, search contract |
| Account states, OAuth consent, tools, project grants, webhooks, Telegram and MCP/A2A access boundaries | Corresponding feature modules and versioned contracts |
| Thai/English UI, independently chosen document language, light/dark/system themes and reduced motion | Locale providers, preferences, `styles.css`, accessibility regression sources |

Source review of `tests/e2e` found existing suites for accounts, navigation, actual backend, workflows, durable runs, document provenance, CV tailoring, experience, saved searches, applications, gateway, settings, tools, OAuth, webhooks and Telegram. The route matrix inside `accessibility.spec.ts` does not currently list Overview, Search or Console; separate suites may cover parts of these. No test was disabled or rewritten.

## 7. Reference research ledger

Only publicly accessible surfaces were inspected. No account creation, paid-library access or paywall bypass was attempted. Reference screenshots are research evidence, not assets for the application's design.

| Reference | What was inspected | Useful principle / limitation |
| --- | --- | --- |
| [Linear](https://linear.app/) | Public site and public interactive product demo | Context separated from the work area; restrained chrome and fine type hierarchy. No authenticated workspace research. |
| [Teal](https://www.tealhq.com/tools/job-tracker) | Public tracker page and embedded product images | Stage-based tracking with richer job detail, contacts and checklists. Marketing evidence cannot prove the complete interaction behavior. |
| [Huntr](https://huntr.co/) | Public landing and product navigation | Communicates discovery-to-tracking as a connected job-seeker workflow. Some hero/video assets were incomplete; no logged-in tracker was inspected. |
| [Mobbin](https://mobbin.com/) | Public homepage, visible shipped-screen/flow library description and teasers | Library interiors and specific authenticated flows remain uninspected. User-supplied screenshots are needed before citing a specific Mobbin flow as evidence. |
| [Godly](https://godly.website/) | Public Design feed with interface/branding/motion categories | Curation shows distinct graphic systems and focused visual signatures. Feed thumbnails do not establish SaaS usability; avoid importing promotional spectacle into daily work. |
| [shadcn/ui](https://ui.shadcn.com/) | Public live component examples and composable-library explanation | Reusable repository-owned primitives with semantic variants. Its examples are a component foundation, not a complete product IA or a reason to replace the existing Radix architecture. |

Reference captures are retained locally with the research workspace. Visual direction options, IA, screen specifications, migration strategy, roadmap, acceptance targets and owner decisions are in [REDESIGN_PLAN.md](REDESIGN_PLAN.md). The redesign remains analysis/design only.

## 8. Synthesized critique

### Design specificity and overall impression

The product's **behavior is specific and valuable**: named CV/job revision pairs, evidence-aware preparation, real application stages, document history, and manual-submission explanations. The surrounding composition is much more interchangeable: a long session tree, repeated project context, three inventory metrics, nested cards, and several equally prominent workflow forms. The largest opportunity is to expose the useful job-search system as a coherent next-action journey.

The current indigo palette, Thai font support and Radix foundation can carry a premium redesign. A new framework, ornamental dashboard, or replacement of every familiar control would add cost without addressing the root problems.

### Nielsen design health: 22/40

Assessment A scored every heuristic; none is n/a. Four means excellent. The skill's broad band is “Acceptable” (55%), with material issues. This is a heuristic review of the sampled product, not a usability-study score or release gate.

| Heuristic | Score /4 | Evidence-backed assessment |
| --- | --- | --- |
| Visibility of system status | 2 | Explicit run/status/cancellation vocabulary exists, but completed-status furniture precedes results and operation labels collapse different tasks |
| Match with the real world | 2 | Jobs/CVs/stages are familiar; Session, Agent Console, LLM round and provider-variable instructions require interpretation |
| User control and freedom | 3 | Back/cancel, revision-preserving actions, theme/locale controls and recovery affordances are present; live active-run behavior was not exercised |
| Consistency and standards | 3 | Shared primitives and repeated patterns help; Evaluate changes meaning depending on existing sessions, and legacy forms differ |
| Error prevention | 2 | Pair preview, field validation and approval boundaries help; project creation still sends an invalid second request |
| Recognition rather than recall | 2 | Pair identity is visible, but faded names and separate sessions/jobs/documents/approvals require mental mapping |
| Flexibility and efficiency | 2 | Saved searches, reusable CVs and menus help; board-only tracking and long forms impose scanning |
| Aesthetic and minimalist design | 2 | Restrained foundations; equal-weight panels and empty metrics dilute task priority |
| Error recognition and recovery | 2 | Search retry/sample state is helpful; project partial success is presented as a generic load failure |
| Help and documentation | 2 | Useful trust copy exists locally; the complete first-use and manual-application sequence is not taught together |
| **Total** | **22/40** | **Clearer task structure and truthful recovery are the first priorities** |

Assessment B's separate evidence-limited technical rubric was 11/20: accessibility 2, performance 2, theming 3, responsive design 2, implementation integrity 2. The two rubrics measure different things and are not added or averaged.

### Strengths to retain

1. **Trust boundaries are already visible.** Named revision pairing, originals-preserved copy, evidence guidance and “you submit yourself” explanations support a careful applicant.
2. **The app is richer than a generic chat.** Evaluations, matched/missing keywords, experience facts, document history, application stages and run activity supply useful domain structure.
3. **The UI has a workable foundation.** Shared primitives, labels, skip link, focus styles, status/alert semantics, theme tokens, Thai font support and responsive drawer/stacking reduce the cost of a coherent redesign.

### Root causes

- Navigation follows implementation objects and history alongside user tasks, so the user must decide where a piece of work belongs.
- Readiness and attention are not consistently derived from current resources/states; inventory and completed activity can outrank the prerequisite or action needed now.
- Presentation has grown around backend operations independently in each feature. That creates repeated cards, generic operation labels, divergent approval detail and inconsistent scope entry.
- Older frontend assumptions coexist with newer paired-session contracts. Shared primitives exist, but compatibility CSS/copy/state mappings have not been consolidated fully.

## 9. Severity-ranked findings

Severity is relative to the affected task: P0 blocks that task's normal completion, P1 causes major difficulty or informed-decision risk, P2 has a workable alternative but adds friction, P3 is refinement. Effort S/M/L denotes relative frontend complexity, not an estimate in days.

**Inventory: 1 P0, 4 P1, 4 P2, 1 P3.** These are ten synthesized user/engineering issues. The detector's two pattern warnings are a separate inventory.

| ID | Severity / effort | Finding and user impact | Evidence / confidence | Proposed response |
| --- | --- | --- | --- | --- |
| U01 | **P0 · S–M** | New-project submit cannot complete its intended transition after persisting a project; generic failure invites repeat creation and hides what survived | Observed 201→422 and persisted project; `NewProjectPage.tsx:24–28`, `SessionCreate`; high | Finish creation on the project response, route to CV readiness, start paired session only with real inputs, recover uncertain outcome and resolve unsaved goal copy |
| U02 | **P1 · M** | Approval review can ask the user to confirm a target without identifying the actual file/document revision; English “Request submit” also suggests a broader effect than the helper text | `ApprovalCard.tsx:14–35`, `ApprovalsTab.tsx:64–75`, `ApplyCard.tsx:15`; source-confirmed, pending live fixture | One review pattern: exact project/action/target/revision/expiry and supported preview; consistent “Record as applied” language; preserve server enforcement |
| U03 | **P1 · M** | Sidebar repeats project context and mixes session history with project tasks; Evaluate opens the first session rather than a stable evaluation destination. Long names produce two scroll axes | A live/source; B measured sidebar client248px vs scroll270px at 1280×720; `ProjectSidebar.tsx:35–67`, `AppShell.tsx:25–27`; high | Project selector, grouped task navigation, evaluation index, constrained intrinsic widths and full-name access |
| U04 | **P1 · S–M** | Project-specific settings fall back to the first project after entering a global route; users can arrive with the wrong assumed scope | `SettingsPage.tsx:28–29,43–57`; source and scope selector observed, wrong-project write not performed | Carry explicit project context into settings, label global/project scope, require an explicit valid selection when context is missing |
| U05 | **P1 · M** | First-use Overview promotes evaluation/zero inventory before CV readiness; attention misses needs_input, labels non-evaluation tasks as drafting, assumes a session link, and blocks all panels if one load fails | A empty desktop and mobile images; `OverviewPage.tsx:41,64–82,84–141`; high for order, source-only edge cases | Readiness/attention first, named CV selection, complete operation/state mapping, correct sessionless destinations, independent resource errors |
| U06 | **P2 · M** | Evaluation result is followed by several full preparation forms without selecting the next task; completed-run detail and raw operational/setup language dilute the result | A live completed session and mobile image; `SessionPage.tsx:161–182`, `RunTimeline.tsx:19,37`; high for hierarchy, active-run gap | Task tabs/progressive disclosure, compact persistent run state, evidence close to result and plain-language setup recovery |
| U07 | **P2 · M** | Board-only tracking requires horizontal browsing on desktop and reading every stage on mobile; later stages can be distant and empty columns consume attention | Live/screenshots; `ApplicationBoard.tsx:40–62`; high | Retain Board and menu moves; add compact List and stage filtering, full contact/history detail, preserve all eight stages |
| U08 | **P2 · M** | Duplicate Button families, global form selectors, feature-local control styles and mixed copy ownership increase inconsistency and regression cost; small controls are unevenly suited to touch | `components/Button.tsx`, `components/ui/button.tsx`, `app/routes.css`, locale/feature dictionaries; sampled32/36/40/44px controls | Canonical primitive with compatibility adapter, scoped forms, shared state/copy helpers and target-size rules; verify accessibility instead of assuming violations |
| U09 | **P2 · S–M** | Eager route imports concentrate page features in a large initial bundle, creating avoidable fetch/parse risk | `router.tsx:6–24`; parent production build ~305kB gzip JS; no CWV timings | Route-level lazy loading with stable accessible fallbacks; measure representative devices before release |
| U10 | **P3 · S** | Landing gradient text is a decorative pattern without an established role in the proposed productivity identity | Detector + active landing selectors; no measured contrast failure | Reconsider with the landing direction; verify contrast if retained. It does not outrank workflow repairs |

### Top five priorities to implement after approval

1. **U01: truthful creation and recovery** — `$impeccable harden` / `clarify`. A newcomer must reach CV readiness without a failed dummy-session request.
2. **U02: informed approval and accurate effect** — `$impeccable clarify` / `harden`. Show what will change before a consequential decision.
3. **U03 + U04: stable navigation and scope** — `$impeccable distill` / `adapt`. Separate choosing a project from doing work in it; keep settings scope explicit.
4. **U05: readiness and attention** — `$impeccable onboard` / `layout`. Put the prerequisite or pending owner action ahead of empty inventory.
5. **U06: one preparation task at a time** — `$impeccable shape` / `distill`. Preserve every operation while reducing simultaneous choices.

A labelled U01 as P1 because project-list recovery exists; B labelled it P0 because the create-submit transition cannot succeed. The synthesis uses **P0 for that specific first-run submit flow**, supported by the parent's real 201→422 reproduction. This is not a claim of a platform-wide outage or lost project data. Settings/approval findings are not allegations of backend authorization bypass.

## 10. Cognitive load and emotional journey

| Impeccable checklist | Result | Concrete evidence |
| --- | --- | --- |
| Single focus | Fail | Completed evaluation immediately exposes drafting, tailoring and application-question choices |
| Chunking | Fail | Seven project destinations plus expanded sessions/global controls; six application stages and six search presets |
| Related information grouped | Pass | Named cards/sections group CV, evaluation, questions and preferences |
| Visual hierarchy | Fail | Zero counts/evaluate lead empty Overview; Add CV appears later, especially on mobile |
| One decision at a time | Fail | Document type/language, tailoring mode and question entry compete on one page |
| Minimal simultaneous choices | Fail | Multiple clusters exceed four; Console has six status filters and advanced search exposes large option groups |
| Working-memory support | Partial failure | Pair header helps, but users bridge session output, Documents, application detail and approval inbox |
| Progressive disclosure | Partial success | Advanced filters, closed stages, menus and reports use disclosure; the main preparation stack does not |

Five clear failures plus one partial failure indicate high extraneous load under the skill's heuristic. The four-choice guideline is a design lens, not a universal maximum or a WCAG rule; group necessary choices and retain expert access rather than deleting options.

| Journey moment | Emotional effect now | Proposed improvement |
| --- | --- | --- |
| Create project | Generic failure after partial success damages confidence early | Confirm the saved outcome and give the next prerequisite |
| Empty project | Many zero/empty modules feel like administration | One readiness sequence with immediate Add CV or Browse jobs |
| Evaluation result | Strongest useful peak: fit/gaps/evidence clarify an opportunity | Lead with that result and one next preparation choice |
| Preparation | Originals/evidence reassure, while several forms revive uncertainty | Reveal the chosen task; make revisions and incomplete facts explicit |
| Applied record | Trust copy helps, but “submit” wording can overpromise | State that the platform records status and the user submits externally |
| Return visit | Stages and history provide continuity; scanning is costly | Surface pending attention and resumable work, retain complete history |

### Persona red flags

- **Nok, first-time Thai job seeker:** Evaluate is prominent before a CV exists, and provider-variable instructions require technical knowledge at the first failure. Use prerequisite-led setup and actionable plain-language recovery.
- **Sam, distracted phone user:** a long evaluation/form page and vertically stacked empty board stages make the next action hard to find. Use task disclosure and a compact stage-filtered list.
- **May, careful applicant:** provenance/original-preservation copy builds trust, but an unnamed approval target and ambiguous submit label undermine an informed decision. Keep exact identity and manual-submission semantics beside actions.

### Smaller observations

Use meaningful h2 section headings under page h1 (some card titles currently render h3), keep critical names fully accessible without hover/marquee dependence, and move Telegram discovery toward notification terminology while preserving its current account scope. Preserve explicit text status alongside colour. Each is a specific refinement, not a measured claim of total accessibility failure.

## 11. Deterministic and browser technical evidence

Assessment B ran this command once in the UX worktree:

```sh
rtk proxy /Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable detect --json frontend/src
```

Exit **2** means findings, not a crash; stderr was empty. Raw findings are in [evidence/detector.json](evidence/detector.json). The detector produced **two warnings, zero errors**, both category `slop`; it did not produce P0–P3 priorities or a conformance report.

| Rule / location | Triage |
| --- | --- |
| `side-tab` — `app/routes.css:14` | Matches `.landing-review-note`'s accent border. No current TSX consumer was found. Inactive-source signal, not a confirmed visible defect; do not count it as a user issue |
| `gradient-text` — `features/landing/landing.css:40` | Active landing text pattern. Aesthetic guidance only; gradient contrast was not measured. Included as U10/P3 |

The deterministic scan did **not** identify the main workflow failures. Independent design, source/contract review and real browser evidence supplied those findings. Fixing both warnings would not resolve the major UX problems.

B measured sidebar overflow within the fixed rail (248px client width / 270px scroll width), not overall document overflow. Its skip-link and Console-arrow-key samples passed. Sampled targets ranged from 32–44px; sub-44px controls are usability candidates, not automatically WCAG minimum-target failures. Root theme tokens and existing focus/label/status support were confirmed in source. Actual contrast matrices, mobile focus trapping, full screen-reader behavior and real CWV remain unmeasured. No overlay could be injected through the read-only browser API, so no reliable user-visible detector overlay exists.

## 12. Recommended follow-through and decision stop

The [redesign plan](REDESIGN_PLAN.md) turns these findings into preserved-feature mapping, IA, primary journeys, four core layouts, design tokens/component strategy, migration controls, phased delivery and measurable targets. It prioritizes truthful workflow continuity and scope before visual migration, then brings readiness/discovery and preparation/tracking into one coherent system.

Owner decisions remain open: visual direction; grouped navigation and mobile pattern; session task tabs and Applications List/Board default; phased acceptance scope; and treatment of the currently unsaved goal field. Review these proposals before implementation. No app source, backend/API behavior or test suite was changed, and no commit/push/merge is implied.
