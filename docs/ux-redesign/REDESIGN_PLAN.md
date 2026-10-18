# UX/UI redesign proposal

Date: 2026-10-16  
Baseline: develop `c4905b9264edca82d39fc6e406152138bd8c401d`  
Status: **Proposal for owner review. No implementation approval.**

Product facts were explicitly confirmed by the owner and are recorded in [PRODUCT.md](../../PRODUCT.md). Current-state evidence and limitations are in [UX_AUDIT.md](UX_AUDIT.md). This proposal preserves the existing React/Vite/TypeScript/Tailwind/Radix application and backend/API behavior. It does not authorize source changes, deployment, migration, dependency upgrades, or removal of working features.

## 1. Design brief

**Person and situation.** An individual in Thailand compares Thai/English opportunities, revisits a CV after work, prepares an application carefully, and checks progress on a phone. Job seeking already involves uncertainty. The interface should make the next action and the state of their work clear.

**Product-specific truth.** A result belongs to a particular CV revision and job revision, with a run, evidence where available, and document history. The product helps prepare material; actual application submission remains the person's responsibility.

**Visitor mode: Operate.** Task completion, readable Thai, reliable states, standard controls, and continuity across projects outrank decorative expression. Distinctiveness comes from a coherent indigo shell, disciplined bilingual typography, and an identifiable treatment of revision provenance.

**Proposed outcome.** A user can answer four questions from every work screen: Which project am I in? Which CV/job is this based on? What needs my attention? What can I do next?

**Boundaries.** Preserve account/verification gates, project permissions, CV versions, experience evidence, filters/saved searches/digests, session pairing, all run operations and states, approvals, document history/export/trash, application history, and integrations. Existing routes and query parameters remain usable. No new hiring-probability claim, automatic application submission, artificial progress percentage, unsupported reminders, or fictional “success” data.

## 2. Strategy and alternatives

### Recommended product structure

Use a **task-oriented project workspace**: one project selector, four Work destinations, two Materials destinations, and a persistent activity/approval utility. Replace the session tree in the global sidebar with an explicit Evaluations index. Keep source/history details available where the user makes a decision.

Repair first-run continuity and scope/state errors before introducing the new shell. Redesign one complete CV-to-application slice, then migrate supporting surfaces using the same components. A visual replacement that preserves ambiguous states would leave the principal usability problems in place.

| Structural approach | Strength | Cost / risk | Decision |
| --- | --- | --- | --- |
| Task-oriented project workspace | Matches the discovery → evaluation → preparation → tracking journey; existing routes remain recognizable | Requires an evaluations index and scoped settings entry points | Recommended |
| One job workspace with everything in a drawer | Keeps one opportunity in context | Deep documents, long reports and approval review outgrow a drawer; more focus/URL complexity | Use a bounded inspector for discovery, retain full detail routes |
| Guided wizard for the whole product | Strong first-use guidance | Returning users need parallel tasks, history and shortcuts; forcing a linear wizard impedes them | Use a short setup sequence and contextual next actions, not a universal wizard |

### Visual directions for approval

Impeccable shape was used to explore a replacement visual system within the brief's calm productivity constraints. These are design options, not approved directions. Every option retains standard web navigation, forms, tabs and tables; its reference world contributes typography, palette, density and one signature treatment.

| Direction | Visual system and first viewport | Signature treatment | Honest risk |
| --- | --- | --- | --- |
| **Collection Index** — lead proposal | A bilingual collection-catalogue discipline translated into a working app: cool white work area, a clearly indigo project rail, dark readable Thai text, aligned opportunity rows, compact action queue, CV context beside work | A consistent source label on evaluations/documents: named CV + revision, named job + revision, run/history link. The identity stays readable before opening detail | Can become overly archival if provenance occupies more space than the next action |
| **Personal Dossier** — Impeccable's pick | A professional application dossier: restrained indigo header, generous readiness panel, current opportunities below, material/history inline | A concise preparation strip that connects the selected pair to the next available preparation action | Most familiar productivity-SaaS option; needs excellent typography and content to feel distinctive |
| **Clear Signal** — competitive alternate | A typographic, high-clarity treatment with a strong navy/indigo context band, larger Thai headings, flatter surfaces and compact data below | One continuous selection band connects the selected opportunity with its context inspector; state is also written in text | Large headings can waste space; strong colour must remain calm on mobile and in dark mode |

The fully familiar category-standard alternative remains available if the owner prefers it. It is not the recommendation. The complete Impeccable direction exploration and challenger evaluation are in [DIRECTION_STUDY.md](DIRECTION_STUDY.md); the choice remains open until owner review. The screen specifications below are the recommended task structure and can be carried into the chosen visual system.

### Decisions preserved or revised

Review the [static visual comparison](concepts/index.html) alongside the specifications. These overview concepts use synthetic content and inert controls; they are approval material, not application implementation. Detailed tokens below describe the lead proposal's intended system; alternative sketches explore hierarchy and scale and do not supersede the specification until the owner selects a direction.

| Existing decision | Proposed handling | Reason |
| --- | --- | --- |
| Indigo accent, semantic green/amber/red | Retain indigo; give the shell a recognizable indigo family and reserve state colours for meaning | Brand continuity with stronger scope/selection hierarchy |
| Noto Sans Thai UI, document-specific typography | Retain the available font families; establish explicit Thai reading/control metrics | Avoid unnecessary dependencies and typography drift |
| Light/dark/system and Thai/English | Retain, with equivalent information and control states | Existing capability and user requirement |
| Project/session tree plus project navigation | Replace duplicated hierarchy with a project switcher and explicit evaluation list | Scales to many sessions without expanding every project |
| Overview counts and multiple equally weighted cards | Lead with attention/readiness, then work, then supporting counts | Helps both empty and returning states |
| Session as a long stack of all operations | Use task tabs with persistent pair, current run and attention state | Preserves capabilities while reducing simultaneous decisions |
| Application board as the only main view | Add List/Board views; recommend List by default, preserve Board | Faster scanning and useful mobile density without discarding the board |
| Generic settings page with implicit project fallback | Separate account-level settings from explicit project-scoped entry | Reduces accidental scope changes; backend endpoints remain unchanged |

Root DESIGN.md is missing. This proposal does not restore an old file or declare a new approved design system. After direction approval and a finished implementation, derive DESIGN.md from the shipped system, and record that status in the Hub.

## 3. Information architecture and navigation

```text
Account / appearance / language
└─ Project selector: current project + search/select + create/manage
   ├─ Work
   │  ├─ Overview
   │  ├─ Find jobs
   │  ├─ Evaluations
   │  └─ Applications
   ├─ Materials
   │  ├─ CV & experience
   │  └─ Documents
   └─ Utilities
      ├─ Agent activity [attention count]
      │  ├─ Runs
      │  ├─ Approvals
      │  ├─ Connected agents
      │  └─ Connect MCP / A2A
      └─ Project settings
```

**Desktop.** A 232–248px rail with one current-project switcher. Work has four sibling actions, Materials two, Utilities two. Account settings sit in the account menu. No second project heading or expanded session history in the main rail. Current page has a stable active state; breadcrumbs name the project and entity. A “New evaluation” action appears in the evaluation index and relevant job contexts.

**Mobile.** A compact top bar holds the current project and a labelled menu trigger. Four bottom destinations are proposed: Overview / Find jobs / Applications / More. More opens the full grouped navigation, including Evaluations, Materials, Activity and settings. A pending-action count is also visible in the top bar. The menu supports focus trapping, Escape/back, close and focus return. Bottom navigation respects safe areas and never covers form actions or document content. If owner prefers the existing drawer-only model, retain it with the same grouped information architecture.

**Project switching.** Change only on an explicit selection. Cancel old requests/streams and reset entity selection/drafts to the new scope. Do not carry a selected CV, job or approval across projects. Keep unsaved-work recovery scoped to project/entity. A missing or removed project has a recovery link to Projects, never a silent fallback to another project's resources.

### Route and feature map

| Proposed visible entry | Existing route / future frontend route | Preservation rule |
| --- | --- | --- |
| Overview | `/app/projects/:p/overview` | Keep project-home redirect |
| Find jobs | `/app/projects/:p/search` | Keep filters/query parameters, general/Smart match modes, source/sample distinction |
| Evaluations | Proposed frontend-only `/app/projects/:p/sessions` | Compose existing sessions/runs/CV/job reads; no new backend endpoint. Preserve every `/sessions/:s` deep link |
| Applications | `/app/projects/:p/applications` | Keep `/jobs` alias and `/jobs/:j` detail routes |
| CV & experience | `/app/projects/:p/profile` | Preserve all CV and evidence actions; preferences can become a clearly labelled subsection |
| Documents | `/app/projects/:p/documents` and `/:d` | Preserve revision/history/export/trash links and edit query behavior |
| Agent activity | `/app/projects/:p/console` | Preserve existing tab values and external links; old “Agent Console” label remains searchable/help terminology |
| Project settings | Scoped frontend entry or existing settings URL with explicit project query | Adapt to current project-specific endpoints. Never silently pick `projects[0]` for a consequential action |
| Account settings | `/app/account`, `/app/settings` | Appearance/gateway remain global; distinguish project tools/sharing/webhooks and account Telegram scope as implemented |
| Public/account/integration routes | Current router | Preserve auth, password reset, verification, digest unsubscribe and OAuth consent flows |

Header/menu labels may change without renaming backend operations or feature folders. A “Settings for: <project>” scope banner remains visible on all project-specific forms. Gateway status is not presented as an inline provider-key editor unless the current API actually supports that action.

## 4. Primary journey

| Step | User goal and primary action | Completion / trusted source | Recovery and boundary |
| --- | --- | --- | --- |
| 1. Set up project | Enter a meaningful name → Create project | Existing project POST returns project identity → CV page | Do not create a dummy session. Goal must not appear “saved” without a supported persistence field. For an uncertain network outcome, reconcile the project list and let the user select/recover; do not blindly create again |
| 2. Prepare CV | Upload CV, name it, inspect preview/revision, choose primary if desired | Existing CV/revision/upload and experience APIs | Separate uploaded, processing, ready, parse failure, provider unavailable and missing facts. General search remains usable without a CV |
| 3. Discover | Search, filter, inspect source/freshness, save opportunity | Current search/hidden/saved-job/saved-search APIs | Preserve filters and scroll when opening a job. Smart match names the exact selected CV and provider/privacy status. Sample browsing never looks like a live result |
| 4. Evaluate | Review selected CV/job pair → Start evaluation | Current paired-session POST starts evaluation atomically | Duplicate pair opens existing session; newer CV starts a new pair. Account/provider gates explain the actionable next step |
| 5. Prepare documents | Read fit report; choose cover letter/message/tailoring or answer pack | Current run/result/document/revision APIs | Keep unsupported facts visible, allow required owner answers, preserve revisions, show partial/stale output clearly |
| 6. Submit manually | Open employer site and use reviewed material | External action is performed by the user | External link, copy or export does not change status to Applied. Show “You submit this yourself” at this boundary |
| 7. Record and track | Record Applied through the supported manual stage action or existing approval workflow | Current application status/history API or approval result | Preserve the distinction between manual tracking and agent-requested approval; update only after server confirmation. Notes and logged mail describe records, not platform delivery |

The journey is guidance. Returning users can add jobs manually, revisit an old session, generate a document, or update an application without restarting setup.

## 5. Overview specification

### Proposed desktop layout

```text
Project rail │ Project name                       Activity [2]
             │ One concise readiness / attention message
             │ [Review 1 approval]   [Answer 1 question]
             ├───────────────────────────────────────────────
             │ Continue your work                 │ Your CV
             │ Opportunity · company · stage      │ Named CV v3
             │ Next available action + pair label │ Ready / issue
             │ Recent evaluations / applications  │ Preview / manage
             ├────────────────────────────────────┤
             │ Latest documents                   │ Activity summary
             │ Type · revision · source · status   │ Real run labels
             └────────────────────────────────────┴──────────
             Supporting counts with exact definitions
```

- **First focus:** an action required from the user, otherwise CV readiness, otherwise a useful continuation into discovery/evaluation. Show one dominant action; do not place three unrelated primary buttons in one row.
- Attention cards derive from pending approvals and `needs_input` runs, including sessionless owner operations. Route to a session only when `session_id` exists; otherwise to the matching Activity run detail.
- The CV module uses the selected/primary named CV from `/cvs`. Do not label the highest revision number across unrelated named CVs as “your latest CV.” Multiple CVs are a valid working state.
- Use accurate operation labels for evaluate, draft, export, extract experience, profile, match, tailor, prepare answers, record-applied approval, and follow-up drafting.
- Main rows show title/company, current stage, named pair/revision where relevant, updated time where supplied, and one next action. Omit unavailable data instead of substituting a fake value.
- Supporting counts retain their definitions. “Applied and later stages” may include hired according to the current stage set; provide a concise explanation. They count platform records, not employer delivery confirmations.

| State | Display / action |
| --- | --- |
| No CV and no jobs | “Start with your CV” plus a secondary “Browse jobs”; short 3-step setup summary, no large wall of zero counts |
| CV uploaded but parse/extraction issue | Specific processing/error state, retry or inspect facts as supported; don't call CV ready based only on file presence |
| Ready CV, no job | Find jobs / paste a job, with selected CV context |
| Pending approval or required input | Attention panel above summary, count from current server state, link to exact item |
| One panel fails | Keep other successful panels usable; panel-level error and retry; never call a failed load “empty” |
| Background refresh | Retain existing data, identify stale/refetch state, preserve keyboard focus |
| Mobile | Attention → current work → CV → documents → activity/counts; no sidebar-column content pushed beyond all low-priority summaries |

## 6. Job Search specification

```text
Find jobs                            [Saved searches] [Hidden]
[General search | Smart match]      [CV name · v3] when relevant
[Query_________________] [Location] [Work mode] [Filters (3)]
Applied filter chips / clear / save this search
Results count + sort semantics + source/update context
┌─ Results list ──────────────────┬─ Selected opportunity ────┐
│ Role / company / source / age   │ Full title/company/source │
│ Location · salary if supplied  │ Save / Evaluate with CV   │
│ Match method + missing info    │ Description and details   │
│ Save · Hide · Open             │ Job/CV context            │
└────────────────────────────────┴───────────────────────────┘
```

- Keep search/filter controls ahead of saved-search promotion. Saved searches are a compact entry and a contextual “Save this search” action after valid filters, with existing digest/push/Telegram settings intact.
- Always show query, location and work mode; move category, posting age, seniority, employment type, company type, skills, posting language and minimum salary into a labelled filter panel, showing active chips and a filter count. Preserve current API behavior and supported multi-value semantics; do not imply an unsupported filter is applied.
- Desktop at sufficient width: list/detail split with an independently bounded, keyboard-accessible inspector. At narrower desktop/tablet widths, use list plus the existing full detail/drawer pattern. At phone widths, use a single list and detail route/sheet with a clear Back restoring filter/scroll state.
- Standard result rows contain title, company, source, location/work mode and freshness; salary only when supplied, with currency/period. A stale/source warning is text plus icon. Do not infer that a fresh cached record is still accepting applications.
- Keep three concepts distinct: general search relevance; deterministic CV keyword coverage; AI-assisted Smart match ranking. Label method, denominator/unit, CV revision, and unavailable/partial status. Do not convert a score into “chance of getting hired” or “ATS pass.”
- Smart match requires a selected usable revision; name it near the mode. Preserve disclosure of which service receives CV content. Explain provider unavailable without exposing deployment variable names in the primary task.
- An in-progress AI ranking may show available deterministic results with an explicit pending state only where the existing response supports this. Preserve the backend's ranking pool/pagination limits and partial counts; do not label a limited pool “all jobs.”
- Hide/undo/hidden-results controls keep current scope semantics. Save/evaluate disabled reasons must be visible to keyboard/touch users; `title` alone is insufficient.

**Required states:** first query, loading, no matches, cleared filters, source unavailable with Retry, explicit Sample mode, load-more error retaining existing rows, hidden-only results, CV missing, profile processing/failure, provider unavailable, ranking queued/running/partial/completed, save conflict, account gate, and selected result removed by a filter change. Sample mode keeps a persistent “Fictional examples” label, disables real save/evaluate actions as currently implemented, and provides Back to live results.

## 7. Evaluation Session specification

```text
Evaluations / Frontend Engineer · company                 More
[CV Frontend · v3] ↔ [Job · r1]     [View sources/history]
[Real operation + status + elapsed / connection state] [Stop]
[Attention: exact approval or missing answers, when present]
[Evaluation] [Prepare documents] [Application answers] [History]
┌─ Current task ───────────────────┬─ Context / evidence ──────┐
│ Fit evaluation 4.0 / 5           │ Named revisions / origin  │
│ Keyword coverage 3 / 4           │ Relevant experience facts │
│ Strengths / gaps / report       │ Details on request        │
│ [Prepare a document]            │                           │
└─────────────────────────────────┴───────────────────────────┘
```

Sample values above describe synthetic design content. They are not benchmark results or a proposed conversion between score systems.

### Interaction contract

- The pair header is a persistent context cue on desktop, an unclipped wrapping block on mobile. Each source is a normal link/preview control. It never silently switches to a newer revision.
- A newer-CV message names both the current pair and the available newer version, with **Start a new evaluation with latest CV**. Preserve the old session, its results and links. Legacy unpaired sessions remain explicitly read-only with a new-pair action.
- **Evaluation:** one compact score section, separately labelled keyword coverage, structured report and source links. Preserve report copy/Markdown copy and complete reading access. Avoid repeating the same result heading in multiple nested cards.
- **Prepare documents:** choose cover letter, application message or CV tailoring. Language is independent of UI language. Preserve direct edit, AI revision instructions, redraft confirmation, automatic/interactive tailoring, proposal selection and promotion approval. Keep “creates a new revision” adjacent to revision/redraft actions.
- **Application answers:** preserve text/boolean/choice questions, required/optional flags, add/remove and all supported limits. A parked pack prioritizes missing answers. Distinguish supported answer, owner answer, suggestion requiring confirmation, and unsupported answer with reason. Show cited fact identities/content when authorized and available, not an invented “verified” badge.
- **History:** session runs/events and document revisions with timestamps, operation, actor/source, retry links, interruption/resume events, partial output and publication state. Keep old revisions readable/exportable as supported. Link to existing document detail for long editing/history rather than duplicating a second editor.
- Global current-run and attention states remain visible when switching tabs. Do not hide approval or `needs_input` behind a tab badge alone.

### Run and approval states

| Server state / condition | Required UI meaning and action |
| --- | --- |
| `queued` | Queued, operation name and requested time; no invented percent/ETA |
| `running` | Current supplied step, real progress only if available; connection state separate from execution state |
| SSE reconnecting | “Reconnecting to updates; the task may still be running”; retain run ID/cursor, bounded recovery through existing watcher, do not start another run |
| Cancellation requested | “Waiting for cancellation confirmation”; keep current status until authoritative confirmation, prevent duplicate requests |
| `waiting_approval` | Exact action, project, target identity/revision, expiry, and effect; supported preview/details, explicit approve/reject |
| Approval stale/expired/consumed | Show current server outcome and refresh/review route; do not silently approve a changed target or reuse old confirmation |
| `needs_input` | Explain what is missing; use existing input/proposal endpoint on the same run where supported |
| `completed` | Result is available; show partial/provenance caveats independently. Completion does not mean submitted externally |
| `failed`, `interrupted`, `cancelled` | Distinct labels; retain output/history where supported, explain whether retry creates a new run |
| `run_resumed` | Explain one automatic restart of the round after server restart, with carried limits. Do not imply checkpoint continuation; preserve ADR-013's one-time limit |
| Provider/account gate | Plain-language reason and the correct settings/verification action; existing material remains readable |

Approval details must use existing run/document/revision/file reads. Show exact IDs under Details when a human-readable target cannot be resolved; never fabricate a filename or before/after diff. Preserve current authorization/expiry/digest checks and owner confirmation requirements. Centralize the presentation so session and inbox describe the same action consistently. Existing autopilot settings and auto-approved actor history remain visible and bounded by current backend policy; this redesign does not widen them.

## 8. Applications specification

```text
Applications                             [Add job] [Find jobs]
[List | Board] [Stage: active] [Search this project____]
[Saved 8] [Applied & later 12] [Needs attention 2]   definitions
Title / company │ Stage │ Last activity │ Contact │ Actions
Frontend role   │ Saved │ Today         │ —       │ Evaluate / …
Product role    │ Interview │ 2 days ago │ Named   │ Open / …
-------------------------------------------------------------
Selected application detail / full route:
Posting & pair · Documents · Contact · Correspondence · Timeline
Manual submission explanation next to applied-record action
```

- Recommend List as the first view for dense comparison; retain an explicit Board toggle. Store view preference by user/project without changing status data. Filtering and sorting use existing returned fields; acknowledge collection limits instead of pretending server-wide pagination exists.
- Board retains all eight stages: Saved, Applied, Responded, Interview, Offer, Hired, Rejected, Withdrawn. Rejected/Withdrawn remain accessible through Closed and filters. Add a visible horizontal-scroll cue on desktop; keep stage counts and labels readable.
- On mobile, recommend a stage-filtered list; Board stays optional with a clear stage selector. Do not make a person scroll through every empty column before finding an application.
- Preserve menu/select stage changes. Drag-and-drop is deferred; adding it would require pointer and keyboard parity, real server confirmation and rollback. No draggable styling before it works.
- Detail retains recruiter name/email/role, external mailto, sent/received correspondence log, occurred date, notes, actor attribution, stage history, evaluation/document/source links, add-job/paste and remove semantics.
- Manual Applied tracking and the existing agent-requested Applied approval remain separate supported paths. Copy says **Record as applied** / **ขอบันทึกว่าสมัครแล้ว**. The approval says that it updates the platform's record. Clicking an employer link, copying text, exporting a file, logging mail or approving preparation never stands in for actual delivery.
- On uncertain stage-save outcome, refetch authoritative detail/history before offering another mutation. Retain the row with a pending indicator, restore prior state on a confirmed failure, announce success/error with focus preserved.
- Do not introduce due-date reminders, calendar bookings, automated email sending, interview scheduling, or new status values. Such functionality needs a separate product/API decision.

## 9. Supporting screens

| Surface | Required redesign treatment |
| --- | --- |
| Evaluations index | Existing sessions with CV name/revision, job/company, latest status and updated/requested time where supported; query/filter within available collection; Start evaluation and resume/open existing pair |
| CV & experience | Named CV list with primary badge, current revision/preview, add/upload/rename/delete and revision history; distinguish extraction/provider state from upload success. Experience list has add/edit/remove and extraction actions; preserve owner-only visibility and removed-fact behavior |
| Document library/detail | Type/language/source/revision/status list; partial and unpublished failures explicit; full reading/editor plus revision picker, copy, supported export, approval/promotion, trash/restore/expiry guidance. Keep generated content language stable when UI locale changes |
| Agent activity | Plain-language operation labels, Runs/Approvals/Connected agents/Connect tabs, exact scope, identifiable targets, sessionless runs, real event history and cancellation/retry semantics |
| Settings | Explicit global vs project scope, labelled defaults, destructive/revocation confirmation as currently required. Retain tools, gateway status/manage link, project sharing, capabilities, expiries, webhook and Telegram setup/status. Do not expose secret values through visual previews |
| Auth/account/consent | Same typography/tokens/form states; preserve CSRF/auth/verification/password rules, quota/permission errors, OAuth requested scope and consent boundaries |
| Landing | Align names and product claims with actual capabilities; visual rebranding is a separate surface decision. Keep existing entry/search/login/digest paths |

## 10. Proposed design system

All values below are proposal tokens awaiting approval and implementation verification. Keep existing semantic token names where possible. Add roles deliberately; avoid an unrelated palette in each feature.

### Palette and surfaces

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#F6F7FB` | `#111522` | Full workspace |
| Surface | `#FFFFFF` | `#1A2030` | Reading/work panels |
| Subtle surface | `#EEF1F8` | `#232B3D` | Grouping, header rows |
| Shell | `#E8EBFA` | `#202642` | Recognizable project/navigation region |
| Text | `#17233B` | `#EDF1FA` | Primary reading |
| Muted text | `#53627A` | `#AEBBD0` | Supporting text; never the sole error label |
| Primary | `#4F46E5` | `#ABA7FF` | Primary action/selection, with separately tested foreground |
| Primary foreground | `#FFFFFF` | `#171B2B` | Text on primary |
| Control border | `#7C88A1` | `#75839F` | Essential control boundaries; decorative dividers use a quieter separate token |
| Success ink | `#166445` | `#85D7B0` | Confirmed success/completion, paired with text |
| Warning ink | `#80500D` | `#F2C779` | Attention/partial/stale, paired with text |
| Destructive ink | `#B42336` | `#FF9AAA` | Errors/destructive actions, paired with text |

State backgrounds are separate subtle tokens, validated against state ink. Normal links and neutral navigation do not all need the primary colour. Selected project, current page, primary action and status each have different roles. Dark mode is a designed mapping, not a global inversion. System mode follows OS preference until a user explicitly chooses a theme.

Calculated sRGB contrast for selected **proposed** pairs: primary light 6.29:1, primary dark 7.90:1, body light 15.67:1, body dark 14.35:1, muted light 6.18:1, muted dark 8.37:1; control border against its surface 3.56:1 light / 4.26:1 dark. These arithmetic checks do not certify actual rendered states, transparency, focus/disabled variants, or the existing UI; the implementation still needs the full contrast/state review.

### Typography, spacing and responsive rules

| Element | Proposed rule |
| --- | --- |
| UI family | Existing Noto Sans Thai, 400/500/600. Keep established document fonts and export behavior separately |
| Page title | 28px desktop / 24px mobile, weight 600, Thai-friendly line height around 1.45 |
| Section heading | 18–20px / 1.5, weight 600 |
| Body / forms | 16px / 1.65–1.8; input text stays at least 16px on mobile |
| Dense rows | 14px / 1.6; essential labels/status remain readable and never depend on tiny low-contrast text |
| Metadata | 12–13px / 1.5 for secondary facts only; reveal complete names/IDs via accessible detail |
| Numbers | Tabular numerals for comparable counts/dates/scores; preserve each score's denominator and method |
| Thai text | No artificial letter-spacing, forced uppercase, fixed-height clipping or indiscriminate truncation of critical names/status |
| Spacing | 4/8/12/16/24/32/48px scale; 24px desktop page gutter, 16px mobile; related field groups closer than distinct tasks |
| Shape | 8px controls, 12px major panels; restrained shadow only for elevation, not every row |
| Width | Fluid work area; long reading text around 65–80 Latin characters or equivalent Thai reading measure; don't stretch reports across a 1600px row |
| Breakpoints | Existing Tailwind breakpoints retained. Below 768px single task column; 768–1199px adapt rail/inspector as space permits; ≥1200px optional split workspace. Behavior follows content fit, not device names alone |

At 320px and 200% zoom, preserve all content/actions without document-wide horizontal scrolling. Tables/boards may have a labelled bounded scroll region or a responsive list alternative. Long Thai/English project names, job titles, filenames, URLs and IDs must have a full-text access path. Avoid hover-only reveals and marquee motion as the only way to read a name.

### Components and states

Use one Button/Input/Select/Dialog/Tabs/Dropdown family built on the current primitives. Variants are primary, secondary/outline, quiet, destructive; sizes distinguish touch and desktop density. Preferred touch targets are ≥44 × 44px; WCAG 2.2 AA minimum target rules and exceptions are evaluated separately, rather than treating every 36px control as a failure.

Shared patterns: PageHeader, ProjectContext, PairProvenance, AttentionPanel, RunStatusStrip, MetricWithMethod, FilterBar, ResourcePanel, EntityList/Table, EmptyState, InlineError, FieldMessage, RevisionHistory and ApprovalReview. An empty state gives a next action; a failed request never renders as an empty state. Loading skeletons reserve realistic space and have an accessible label; background refresh preserves the current data and focus. Disabled controls have visible explanatory copy when the reason matters.

**Motion.** Use 120–180ms focus/selection/overlay transitions and a restrained result arrival highlight. Never animate a score as if its value were still being calculated after completion. No card tilts, dashboard entry cascades, infinite marquees or decorative progress animation in the work area. Reduced motion removes spatial effects; state text, focus and event order remain clear. A new live event does not pull scroll or keyboard focus away from an active form.

**Accessibility target for implementation:** WCAG 2.2 AA. Verify normal text contrast ≥4.5:1, large text ≥3:1 and required non-text contrast ≥3:1 for each real foreground/background pair; focus must remain visible/uncropped, selection and errors must not rely on colour alone. Use native forms and semantic tables, accessible names for icon buttons, field associations/error summaries, controlled live announcements, keyboard-complete dialogs/menus/tabs and logical heading order. Screen-reader testing and real keyboard traversal remain required; detector output alone is insufficient.

### Bilingual copy examples

| Meaning | Thai | English |
| --- | --- | --- |
| Creation success | สร้างโปรเจกต์แล้ว เพิ่ม CV เพื่อเริ่มประเมินงาน | Project created. Add a CV to start evaluating jobs. |
| New pair | เริ่มประเมินด้วย CV นี้ | Evaluate with this CV |
| Provider unavailable | ยังใช้ AI ไม่ได้ ดูสถานะและวิธีตั้งค่า | AI is unavailable. View status and setup guidance. |
| Waiting for owner | ต้องการข้อมูลจากคุณ | Needs your input |
| Manual tracking | บันทึกว่าสมัครแล้ว | Record as applied |
| Approval effect | อนุมัติให้บันทึกสถานะในระบบ คุณเป็นผู้ส่งใบสมัครจริง | Approve updating this record. You submit the actual application. |
| Keyword coverage | พบคำสำคัญตรงกัน 3 จาก 4 รายการ | 3 of 4 keywords matched |
| Uncertain connection | กำลังเชื่อมต่อการอัปเดตอีกครั้ง งานอาจยังทำอยู่ | Reconnecting to updates. The task may still be running. |

Consolidate new and migrated UI copy into current i18next namespaces. Keep API error codes stable and map them to actionable copy; deployment variable names may live in expandable administrator guidance. Format dates/numbers with the UI locale, retain exact date/time in detail, and avoid false translations of user content.

## 11. Component and data architecture

| Layer | Responsibility | Existing boundary to retain |
| --- | --- | --- |
| `components/ui` | Accessible primitive variants, tokens, common control sizes/states | Radix/CVA/Tailwind; no API requests here |
| Shared product patterns in `components` | Project context, provenance, metrics with method, common async/empty/error patterns | Product semantics, no duplicated feature state machine |
| Existing `features/*` folders | Page composition, user intents and domain-specific forms | Keep profile/search/chat/applications/documents/console ownership; no broad directory rename |
| `app` | Shell, route grouping, locale/theme/drafts | Preserve deep links, query compatibility and scoped drafts |
| `lib/api`, `api-types`, `run-events`, `accountGate` | Existing contract access, owner session, SSE reconciliation, account gates | Preserve error shapes, CSRF/auth, idempotency headers and run cursor behavior |

Refactor the legacy Button wrapper into a compatibility adapter to the canonical primitive before retiring it. Migrate feature by feature. Replace broad global input/textarea/select styling with scoped primitive/form styling so utility sizes have predictable effects. Keep compatibility classes until all consumers are moved; remove only proven-unused selectors.

Reuse existing `useResource` and run hooks initially. ResourcePanel can give independent loading/error boundaries without adding a new global state/query library. Split eager route imports with React lazy/Suspense after shell stability, keeping predictable fallback/focus behavior. Share view-state derivation helpers for operation labels, attention states, selected CV and score methods. Keep mutation/stream logic out of presentation-only extraction.

### Contract map: proposed UI → existing data/actions

Paths below are relative to the current `/api/v1` prefix; the versioned application contract remains authority.

| UI purpose | Existing contract surface |
| --- | --- |
| Projects/setup | `/projects`, `/projects/:p` |
| Named CV readiness | `/projects/:p/cvs`, per-CV revisions/preview; `/experience`, `/preferences` |
| Discovery | `/projects/:p/job-search`, `/facets`, `/match`, `/match/runs`, `/hidden`; existing saved-search routes |
| Paired evaluation and index | `/projects/:p/sessions`, per-session details, `/jobs`, `/runs` |
| Preparation/run state | Existing run create/read/cancel/input/proposal routes and SSE event stream |
| Approvals | `/projects/:p/approvals`, per-approval decision; existing target reads |
| Application list/detail | `/projects/:p/applications`, `/jobs/:j/application`, application-status/contact/events |
| Documents/history | `/projects/:p/documents`, per-document revisions/edit/export/trash/restore paths as currently defined |
| Global/project settings | Existing gateway/account/preferences/tools/grant/webhook/Telegram/OAuth endpoints with their current scope |

No proposed feature is contingent on an invented API field. If a screen needs unavailable data, omit that element or explicitly defer it. Session-list pagination, due dates, notification inbox persistence, new telemetry, collaborative roles, job auto-submit and backend score changes are separate scope.

## 12. Migration and regression risks

| Risk | Required control / rollback |
| --- | --- |
| Old deep links or tab queries break | Keep aliases and existing parameter meanings; add new index routes beside existing entity routes. Revert the route/shell slice independently |
| Scope leaks during project switching | Key data/drafts/subscriptions by project+entity, cancel stale work, retain existing authorization client behavior; cross-project checks before release |
| Pair silently changes | Use immutable revision IDs in all start/retry/read paths; compare older/newer CV cases; rollback session composition without changing data |
| SSE state regresses during extraction | Reuse watcher/reconciliation hooks, cursor/order/dedup and scope checks. Separate connection loss from run failure/cancellation; verify ADR-013 event semantics |
| Approval UI loses identity or weakens policy | One shared review presentation bound to exact target/expiry/digest, preserve server decisions; no automatic approval added |
| Applied implies actual external submission | Audit every action/notification/empty/success label, mailto/copy/export and status path in both locales; verify stage changes occur only via supported actions |
| CV/evidence/document history lost in simplified layouts | Maintain a feature-to-route/action checklist and compare representative old/partial/trashed/removed states before retiring old composition |
| Global CSS changes break hidden surfaces | Compatibility adapter, one feature migration at a time, representative auth/settings/forms/docs previews; remove selectors only after consumer inventory |
| Locale/theme/overflow regressions | TH/EN × light/dark × 320/390/768/1440 widths, zoom and reduced motion; long-content fixtures. Preserve local preference keys or migrate them explicitly |
| List sorting/filtering pretends to cover all data | Show available-collection semantics and API limits; preserve source counts and pagination semantics |
| Sample/UI demonstration appears real | Persistent synthetic/sample labels; no fabricated ranking/saving/submission/provider states |
| Added UI dependency introduces CVE/license risk | Prefer current stack. Any approved dependency/font/package change follows DELIVERY.md audit/SBOM/acceptance rules; no new dependency is required by this plan |

Implement on separate task branches from newly fetched `origin/develop` after plan approval. Give each task exclusive ownership of files and contract references. Keep local Hub updates outside Git. This proposal branch is documentation only; no push or merge is implied. No database migration is needed. Rollback is an ordinary revert of a coherent frontend slice, keeping resource identity and API contracts intact. Do not introduce a large feature-flag service just for this redesign.

## 13. Phased roadmap and measurable acceptance

Effort is relative engineering complexity (S/M/L), not a schedule promise. Each phase requires owner-agreed scope, focused review, future regression evidence and a usable whole slice. Acceptance targets below are proposed; none are reported as passed by this design task.

| Phase | Scope / exclusive task boundaries | Exit criteria | Effort |
| --- | --- | --- | --- |
| 0. Contract-aligned continuity | NewProjectPage and scoped state/copy repairs; separate task for attention/approval presentation | A valid create reaches CV readiness after one project creation with no premature session POST; uncertain outcome is recoverable; all eight run states and sessionless links have correct labels/targets; Applied copy consistently describes record-keeping | S–M |
| 1. Foundations + shell | Tokens/primitives compatibility, then shell/router/navigation/locale tasks with explicit file ownership | One canonical control family; old deep links/tab queries work; project scope is visible; keyboard menu/dialog focus returns; no clipped essential content at 320px and 200% zoom; TH/EN/light/dark/reduced-motion sample matrix reviewed; approved direction recorded for later build | M |
| 2. Readiness + discovery | Overview/Profile readiness slice, then Search/results/filter slice | From empty project, ≥4 of 5 representative Thai job seekers can identify the next action without coaching; all existing filters/save/hide/digest controls remain reachable; sample/error/live states unmistakable; navigation back restores filters/selection/scroll; independent resource failure leaves successful modules usable | M–L |
| 3. Evaluation + preparation | Evaluation index/session composition, shared run/approval/provenance, document preparation/history | Users identify exact CV/job versions and distinguish fit score vs keyword match in ≥4/5 sessions; all run/input/approval/retry/cancel/resume and legacy/outdated states retained; supported document revisions/export/trash/provenance actions reachable; no stale confirmation or duplicate run created during reconnect | L |
| 4. Tracking + supporting surfaces | Applications List/Board/detail, then Activity/Settings/Auth/Consent consistency | All eight stages and contact/correspondence/history actions work through current APIs; ≥4/5 participants understand that they submit externally and correctly record it; mobile tracking does not require scrolling all empty stages; account/global/project scopes remain unambiguous | M–L |
| 5. Release proof + documentation | Aggregate frontend regression review, accessibility/manual review, performance split and shipped design documentation | No unresolved P0/P1 regression; existing suites retained and relevant suites plus actual-backend critical journey pass at the reviewed commit; accessible target verified; measured performance budget achieved or exception explicitly accepted; DESIGN.md reflects shipped system; owner approves release | M |

### Release evidence checklist

- **Functional preservation:** 100% of the capability rows in the audit map to a reachable route/action; no removed feature without a separate owner decision. Use existing regression suites for accounts, navigation, actual-backend/full journey, durable runs, document provenance, tailoring, evidence, search/digests, applications, gateway/settings/tools/OAuth/webhooks/Telegram.
- **State coverage:** empty/loading/error/partial/success; all eight run states; cancel pending; reconnect; one-time restart; expired/stale/consumed approvals; legacy unpaired/newer CV; missing provider/account gate; document partial/history/trash; source unavailable/sample/hidden/pagination failure.
- **Accessibility:** keyboard-only task journey and manual screen-reader sampling, semantic automated checks plus triage, required contrast pairs, target sizing, visible focus, no focus loss from live events, zoom and reduced-motion review. Include Overview/Search/Console in the route matrix.
- **Usability study:** at least five representative Thai job seekers, Thai/English material and phone/desktop tasks; record completion/errors/confusion and actual time. Proposed success threshold ≥4/5 unassisted completions for setup-to-evaluation, document revision retrieval and manual-status recording. These are evaluation targets, not study results.
- **Performance:** proposed initial compressed JavaScript budget ≤200 kB after route splitting, with feature chunks measured separately; retain usable loading states and lazy-load nonessential views. Target LCP ≤2.5s, CLS ≤0.1 and INP ≤200ms on an agreed device/network/data scenario. Record cold/warm runs separately; lab measurements are not field p75 and Lighthouse TBT is not INP. Establish real-user interaction evidence when traffic is available.
- **Integrity:** no secret/personal-CV fixture, source-data leak or unauthorised scope request; all applicable DELIVERY.md security/dependency checks for the eventual implementation. This design-only task does not claim a new CVE scan or security certification.

## 14. Owner decisions required

1. **Visual direction:** Collection Index, Personal Dossier, Clear Signal, or the fully familiar category-standard alternative. Indigo retention/refinement is recommended; no new branding is approved yet.
2. **Navigation:** grouped task workspace and explicit Evaluations index; mobile bottom navigation plus More, or grouped drawer-only navigation.
3. **Core screen choices:** attention/readiness-led Overview; desktop Search inspector; task tabs in Evaluation; List as the default Applications view with Board retained.
4. **Delivery scope:** recommended phased migration starting with continuity/scope/state issues; no full application rewrite. Confirm acceptance targets and any target that should remain a research goal rather than a release gate.
5. **Product-goal field:** remove the unsaved required field from first-run creation, or retain only when an existing supported preference is deliberately chosen. A new persistent goal field requires a separate API/product decision.

**Approval stop:** present these documents and design options, collect the owner's decisions, and stop. Approval to research or use reviewers is not approval to implement. Do not write application code, alter backend/API behavior, publish, merge, or create DESIGN.md as an approved authority during this planning task.
