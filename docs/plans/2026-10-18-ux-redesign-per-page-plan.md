# UX/UI redesign — per-page change plan (22 pages)

Date: 2026-10-18 (Asia/Bangkok) · Status: **Draft, awaiting owner approval** · Project level: product
Owner of this plan: Claude (UX/UI + development roles, park-sdlc-kit) · Craft method: Impeccable (`shape` → `critique` → build → finish review)

## 1. Purpose and inputs

Turn the 22 Codex round-2 concepts into a buildable, page-by-page change list for the existing app, fixing the gaps found in the 2026-10-18 Claude review (mean 8.2/10). This plan says **what changes, where in the code, and why**. It contains no code.

Inputs read for this plan (Evidence):

- Concepts and handoffs: `docs/codex-ux-ui-migate/` (README, index `CODEX_ALL_PAGES_REDESIGN_V2.md`, 22 selected PNGs, 22 versioned handoffs, motion contract, Codex review 8.6/10).
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/surfaces/frontend-src.md` (direction contract "Collection Index").
- Current app screenshots: `docs/ux-redesign/full-app-evidence/after/` (1440/820/390, th/en, light/dark).
- Source: `frontend/src/app/router.tsx`, `features/*`, `components/*`, `styles.css`.
- Team taste profile (park-sdlc-kit `ux-ui-design/references/taste-profile.md`).

Precedence when sources disagree: **actual source/API contract > PRODUCT.md/DESIGN.md > current-round handoff > PNG raster**. A PNG detail never justifies a new field, endpoint or claim.

## 2. What stays unchanged (taste rule 1)

- Stack and architecture: React, Vite, TypeScript, Tailwind, Radix, feature folders. No backend, API, dependency or lockfile change.
- Every route in `router.tsx`, deep links, URL state (search `mode`, filters, pagination, tabs).
- All capabilities listed in `PRODUCT.md` § Capabilities: project isolation, immutable CV/job/document revisions, session revision pairing, approval flow, SSE run status, document history/trash/restore, manual submission semantics, OAuth/MCP/A2A boundaries.
- Design tokens in `DESIGN.md` (indigo/neutral, light + dark), shared primitives in `components/ui/*`, 44px control height, focus ring, reduced-motion behaviour.
- Fit score denominator **1–5** (`components/FitScore.tsx`) and its band labels; rule-based keyword coverage stays a separate, labelled measure.
- Existing i18n resources; Thai and English remain first-class.
- Uncommitted work already in this worktree (`feat/ux-core-workspaces`). This plan edits on top of it; nothing is reset.

## 3. Review findings this plan fixes

| ID | Finding | Pages | Severity (1–4) |
|---|---|---|---|
| F-01 | Jargon a first-time user cannot parse: `Job rev 3`, `Fixed sources`, `Rule-based coverage`, `Evaluation014`, `Agent access`, `Connect`, `This installation` | 03, 04, 06, 08, 10, 11, 14, 20 | 3 |
| F-02 | Concept shows `78%` AI estimate; the real Smart match data is a 1–5 band plus `ATS n%` keyword coverage | 02 | 3 |
| F-03 | Too many competing blocks / repeated entry points to the same action | 04, 06 | 3 |
| F-04 | Stage change hidden in `…`; contact e-mails clutter rows; Open icon reads as "external site" | 05 | 3 |
| F-05 | Consent page long with no decision summary next to Allow | 21 | 3 |
| F-06 | Project cards carry no project-specific information; duplicated getting-started block | 12 | 2 |
| F-07 | Concept h1 ≈ 48px vs DESIGN.md 24/28px; hero pushes work down | all app pages | 2 |
| F-08 | Theme + Language selects permanently occupy the rail and duplicate Settings | all rail pages | 2 |
| F-09 | Concepts are English/desktop/light only; Thai, 390/820, dark, loading/error/empty not pictured | all | 3 (risk) |
| F-10 | Concept drops the app logo mark; taste rule 10 requires visible identity | all | 2 |
| F-11 | Preferences + notifications mixed into the CV page | 07 | 2 |
| F-12 | Landing demo card uses internal vocabulary; little visual pull | 14 | 2 |
| F-13 | Status shown twice (dot + tinted badge) | 03, 08 | 1 |

## 4. Global changes (apply once, every page benefits)

Do these first; most per-page issues shrink once they land.

| G | Change | Where | Fixes |
|---|---|---|---|
| G-01 | **Plain-language glossary for UI copy.** One term per concept in both locales. Proposed: `Job rev 3` → "Job posting · version 3" / "ประกาศงาน ฉบับที่ 3"; `Fixed sources` → "Compared using" / "ใช้เปรียบเทียบ"; `Rule-based coverage` → "Skills found in your CV" / "ทักษะที่พบใน CV"; `AI-assisted estimate` → "AI fit (1–5)" / "ความเหมาะสมโดย AI (1–5)"; `Evaluation014` → job title + company (ID only in tooltip/URL); `Agent access` → "Connected assistants" / "ผู้ช่วยที่เชื่อมต่อ"; `Connect` → "Connect an assistant"; `This installation` → "Whole app (admin)". Create `docs/glossary.md` rows; code identifiers unchanged. | `frontend/src/locales/*.json`, new `docs/glossary.md` | F-01 |
| G-02 | **Heading scale stays DESIGN.md**: page h1 24/28px semibold, subtitle 16px muted, one line each. No display-size heroes inside the app; display serif only on Landing. | `styles.css` (already correct), remove any page-level size overrides | F-07 |
| G-03 | **Rail footer = compact controls**: keep the existing icon segmented theme control and `ไทย/EN` toggle (current `AppearanceControl`), not two full selects. Settings › Appearance remains the full version. | `components/AppearanceControl.tsx`, `ProjectSidebar.tsx` | F-08 |
| G-04 | **Identity**: keep the current logo mark + "Job Search" wordmark top-left on rail, public header and mobile bar. | `ProjectSidebar.tsx`, `Header.tsx`, `MobileDrawer.tsx` | F-10 |
| G-05 | **Rail grouping as in concepts**: Work (Overview, Job search, Evaluations, Applications) · Materials (CV & experience, Documents) · Activity (Agent activity) · bottom: Account, Settings. Group labels visible (current app already has them). Global rail (Projects, Account, Settings) for pages 11–13, 20–21. | `ProjectSidebar.tsx`, `AppShell.tsx` | IA |
| G-06 | **One status badge pattern**: written label inside a tinted badge; no extra dot. Map: waiting-for-you = warning, running = primary, done = success, failed = destructive, saved/neutral = muted. | `components/StatusBadge.tsx` | F-13 |
| G-07 | **Sample/demo marker**: the concepts' "Design concept · Sample data" line is NOT shipped. Real synthetic/sample data keeps the existing sample labelling only where the app already shows sample results. | per page | honesty |
| G-08 | **State kit per page**: every page gets loading (skeleton matching final layout), empty (one sentence + one action + small illustration where taste rule 8 asks), error (what happened, why, what to do + Retry), no-permission. Reuse `EmptyState.tsx`, `PageStates.tsx`, `ui/skeleton.tsx`. | per page | F-09 |
| G-09 | **Responsive pattern**: <1024px rail → existing drawer; two-column pages stack primary column first; tables become stacked rows at 390px (no horizontal page scroll). | per page | F-09 |
| G-10 | **Motion (from `CODEX_PIXEL_MOTION_V2.md`)**: only state feedback 150–240ms (saved, stage moved, run step completed); 32px pixel compass allowed on Overview empty guide and Agent activity header only; all off under `prefers-reduced-motion`; nothing animates on approval/security screens. | `styles.css` + page components | delight within limits |

## 5. Per-page changes

Format per page: **Keep** (what already works) · **Change** (what and where) · **States** (beyond happy path) · **Done when** (visible check). SCR ids are new and become the screen inventory (`docs/design/screens.md`, to be created with the first slice).

### SCR-01 Overview — `features/overview/OverviewPage.tsx` · priority P2 · my score 8.5

- **Keep**: 3-step "Getting started" with one primary action; "You submit applications yourself" line; no KPI tiles.
- **Change**
  1. Two modes driven by real data: *first-run* (no CV or no saved job) shows the concept layout; *returning* replaces the steps with "Needs you" (pending approvals, evaluations waiting for review) then "Recent evaluations" and "Applications in progress" lists from existing resources (`latestEvaluations.ts`).
  2. Step rows reflect real progress: a completed step shows a check + what was done ("Data Analyst CV · version 4"), the next step gets the primary button. Never show a step "Not started" if it is impossible yet — say what it waits for ("Needs a CV and a saved job").
  3. "Need a hand?" panel collapses to a single dismissible card after the first CV exists (local preference only).
  4. Remove the bottom count strip seen on current mobile (`บันทึกไว้ 1 · สมัครแล้ว 0 …`) — bare counts (taste rule 9).
- **States**: loading skeleton of steps; resource error per section with Retry; project with no permission.
- **Done when**: new user sees exactly one primary button; returning user sees the item needing them first.

### SCR-02 Job search — `features/search/SearchPage.tsx`, `AdvancedFilters.tsx`, `SavedSearches.tsx` · **P1** · 7.5

- **Keep**: Search / Smart match modes and URL state; filters; saved searches; list + inspector layout; "Changing CV affects new estimates only".
- **Change**
  1. Explain the modes in one line under the toggle: Search = "by keyword"; Smart match = "rank jobs against your CV (uses AI)". Smart match disabled with reason when no CV/provider (existing `needsCv` / `gateBlocked`).
  2. Inspector "Match evidence": show the **real** fields — AI fit band `4 / 5 · Good fit` (existing `bands`) and `Skills found in your CV 8 of 11` (rule-based). Remove the `78%` card (F-02). If AI is missing/partial show "AI ranking unavailable — keyword ranking shown" (existing status).
  3. Match-context bar only in Smart match mode (it is meaningless in plain Search).
  4. Result card: title, company, location · work mode, posted age, source; one secondary action "Save". Remove "View details" button — the whole card selects into the inspector (keyboard: Enter/Space, `aria-selected`).
  5. Inspector primary: "Evaluate with Data Analyst CV · v4"; secondary "Save job", tertiary "Original posting ↗".
  6. Move the "open-source job data (MIT)" credit into a quiet footer line (already present; keep).
- **States**: idle (no query) shows saved searches + example query chips; 0 results with "clear filters"; AI ranking progress `Ranking with AI… n/t` (exists); source unavailable; 390px: list → tap → full-screen detail with back.
- **Done when**: no number on the page lacks its scale or source; first-time user can tell the two modes apart without clicking.

### SCR-03 Evaluations list — `features/sessions/SessionsPage.tsx`, `NewSessionDialog.tsx` · P3 · 8.0

- **Keep**: table with Opportunity · Compared using · Latest activity · Next action; filter tabs with counts; "New evaluation".
- **Change**
  1. Copy per G-01 ("Compared using: Data Analyst CV · v4 / Job posting · version 3").
  2. Status via single badge (G-06); drop the dot.
  3. Next action button text must match the real run state: waiting approval → "Review changes", running → "View progress", completed → "Open result", failed → "See what failed".
  4. Replace the info banner "Sources stay fixed…" with a one-line subtitle (it repeats the subtitle).
- **States**: empty ("No evaluations yet — pick a saved job and a CV" + New evaluation); failed row shows retry from inside the session; 390px stacked rows.
- **Done when**: each row's button names what happens next.

### SCR-04 Evaluation workspace — `features/chat/SessionPage.tsx`, `TailorCard.tsx`, `ApprovalCard.tsx`, `RunTimeline.tsx`, `RunResults.tsx`, `ApplyCard.tsx` · **P1** · 7.5

- **Keep**: header with job title/company and CV↔job pair; 4 tabs (Evaluation, Documents, Answers, History); output-language select; agent workflow steps.
- **Change**
  1. **One** place to act: the right "Agent workflow" panel owns the single primary action for the current step (e.g. "Review proposed CV changes"). Remove the duplicate "Run activity" card at the bottom and the duplicate review link in the header (F-03). "Open activity" stays as a quiet link.
  2. Evaluation result: AI fit `4.2 / 5` + band + "not a hiring prediction" in one row; Skills found `8 / 11` with expandable evidence (exists). Strengths / top gap below.
  3. "Related documents" lists only persisted `DocumentView`s. A pending tailor proposal stays in TailorCard/approval flow and is never rendered as an openable document (handoff guardrail).
  4. Output-language select labelled "Language of generated documents" with helper "Separate from the app language".
  5. Current session page is mostly empty in the no-result state (see evidence screenshot): add an explanatory empty state with what evaluating will do, cost/time hint only if the API provides it, and one "Evaluate this job" button.
- **States**: not evaluated; running (SSE steps, cancel); waiting for approval; partial result; failed with retry/resume; reconnecting SSE; source unavailable.
- **Done when**: at any state there is exactly one primary button on screen.

### SCR-05 Applications — `features/jobs/JobsPage.tsx`, `features/applications/ApplicationBoard.tsx`, `ApplicationPanel.tsx` · **P1** · 7.5

- **Keep**: List/Board toggle; search; stage filter; sort; tracking-only notice; Add posting.
- **Change**
  1. Stage column becomes a **visible stage dropdown** per row (labelled, keyboard/touch accessible) — not hidden in `…` (F-04). Change is optimistic with Undo toast; announce via status region.
  2. Row content: title, company, location · work mode. **Remove recruiter name/e-mail from the row** (it lives in Job Detail).
  3. "Open" = whole row is a link to Job Detail with a chevron `›`, not the external-link icon.
  4. Next step column: a suggestion text derived from stage only (e.g. Saved → "Evaluate", Applied → "Log a reply"); no invented deadlines.
  5. Summary "4 tracked · 3 active · 1 closed" stays as text (it answers "how many are active").
  6. Escape untrusted text (evidence shows a raw `<img onerror>` title rendering as text — correct, keep it escaped; add a test).
- **States**: empty project ("Save a job from Job search or add a posting"); filtered-empty; board drag + keyboard move; 390px cards.
- **Done when**: user can change a stage in one click without opening a menu.

### SCR-06 Job detail — `features/jobs/JobsPage.tsx` (JobDetailPage) · **P1** · 8.0

- **Keep**: header with View source + primary; latest evaluation; related documents; application tracking with stage, recruiter, notes, e-mail log; job description.
- **Change**
  1. Two columns with clear priority: **left = decision** (latest evaluation → documents → description), **right = tracking** (stage → recruiter → activity log). Max 4 surfaces visible above the fold.
  2. Primary button label by real destination (guardrail): "Continue preparation" when a session exists, "Prepare documents" (creates session) when not.
  3. Score always `x / 5` with band; "Skills found 8 / 11".
  4. Activity log: Add note / Log email buttons stay; entries show date + who ("You").
  5. Job description collapsible after the first 8 lines.
- **States**: never evaluated (evaluation card becomes "Evaluate with <primary CV>"); no documents; posting removed at source; 390px single column with tracking after evaluation.
- **Done when**: the top of the page answers "is it a good fit, what is ready, what stage am I at".

### SCR-07 CV & experience — `features/profile/ProfilePage.tsx`, `ExperienceBank.tsx` · P2 · 8.0

- **Keep**: CV library table (Primary badge, latest version, View file, Upload version, Extract facts), Experience bank tab, info line on primary CV.
- **Change**
  1. **Move Preferences + Notifications out** of this page into Settings › Project (F-11), leaving a link "Document language & notifications are in Settings". **[Q-03]** — confirm; if owner prefers to keep them here, collapse to one row at the bottom.
  2. "Make primary" visible in the row menu with explanation that existing evaluations keep their CV.
  3. Version history per CV expands inline (v4, v3 …) with upload date and View file.
  4. Experience bank summary shows count + "Needs review: n" only if the API reports unreviewed facts; otherwise just count.
- **States**: no CV (big drop zone + PDF/DOCX/TXT + size limit from API); upload progress; extraction running/failed; unsupported file.
- **Done when**: page only answers "which CVs and facts do I have".

### SCR-08 Documents — `features/documents/DocumentsPage.tsx`, `TrashView.tsx`, `DocumentDeleteMenu.tsx` · P3 · 8.5

- **Keep**: type filter pills incl. Trash (n); table with job & evaluation, version, status, Open; Undo toast after trash.
- **Change**
  1. "Job & evaluation" column shows job title · company only (no `Evaluation014`).
  2. Status single badge (G-06); "Partial" becomes the badge text "Partly generated".
  3. Header action: replace "Open evaluations" with nothing, or "New document" only if the API supports creating one outside a session **[Q-04]**.
- **States**: empty ("Documents appear here after you prepare them in an evaluation"); trash empty; restore success.
- **Done when**: every row reads in plain words.

### SCR-09 Document detail — `features/documents/DocumentsPage.tsx` (DocumentDetailPage) · P3 · 8.5

- **Keep** almost all: version select, historical banner, source panel, revision history with Restore as new version, Download selected version, Edit current version.
- **Change**: source panel uses G-01 terms; "Evaluation 014" → "Evaluation for Senior Data Analyst · Northstar"; on 390px the revision history moves into a "Versions" sheet.
- **States**: current version (no banner); editing with unsaved-changes guard; partial document; export failure.
- **Done when**: historical vs current is clear in Thai and English.

### SCR-10 Agent activity — `features/console/*` · P2 · 8.5

- **Keep**: grouping Needs your decision / Running / Finished; one button per run named by its real destination; footer line on statuses.
- **Change**
  1. Rename tabs (G-01): Timeline → "Activity", Approvals (n) → "Waiting for you (n)", Agent access → "Connected assistants", Connect → "Connect an assistant".
  2. Running rows show live step text from SSE and elapsed time from real timestamps.
  3. Failed rows: one-line reason from the event payload + "Retry" when the API allows.
- **States**: nothing running (calm empty with pixel compass); SSE disconnected banner with reconnect; approval expired.
- **Done when**: a new user knows which tab to open without guessing.

### SCR-11 Settings — `features/settings/*` · P2 · 8.0

- **Keep**: left section list with scope labels; Appearance with theme cards and language radios.
- **Change**
  1. Scope labels in plain words: "This browser", "Whole app (admin)", "This project".
  2. Group sections: **You** (Appearance, Notifications) · **This project** (Tools, Sharing, Webhooks, Document language — see Q-03) · **Admin** (AI gateway, only for owners).
  3. Remove the "Need AI features?" promo card; show AI status inline in the AI gateway section instead.
  4. "Account security" row links to Account (no duplicate settings).
- **States**: non-admin sees Admin section hidden or read-only with reason; save success toast; validation errors inline.
- **Done when**: user can predict who is affected by each setting.

### SCR-12 Projects — `features/projects/ProjectsPage.tsx` · **P1** · 7.5

- **Keep**: list of projects, New project, project isolation message.
- **Change**
  1. Each project = one compact row/card with **real facts from existing resources**: CV count, saved jobs, applications active, last activity date. No three generic shortcut tiles repeated per card (F-06). **[Q-05]** confirm which counts are available without new endpoints; otherwise show name + last opened only.
  2. Row actions: Open (primary), Rename, Delete (confirm with project name).
  3. Remove the "Getting started guide" here (it lives in SCR-01/13). Show it only when there are zero projects, as the empty state.
- **States**: zero projects (empty state with illustration + New project); long project names; shared project marker if sharing exists.
- **Done when**: user can tell projects apart without opening them.

### SCR-13 New project — `features/projects/NewProjectPage.tsx` · P3 · 8.5

- **Keep**: single field, limit hint, Create/Cancel, "What happens next".
- **Change**: after create, land on SCR-01 first-run; inline validation (empty, >200 chars, duplicate name if API rejects); Enter submits.
- **Done when**: no dead end after creating.

### SCR-14 Landing — `features/landing/*` · P2 · 8.0

- **Keep**: honest headline/subcopy, Create account + See how it works, illustrative demo label, "No automatic submission" line, display serif for headline only.
- **Change**
  1. Demo card copy in user words: "Compared: Data Analyst CV (v4) with this job", "AI fit 4.2 / 5", "Skills found 8 of 11", "Waiting for you to review the CV changes".
  2. "How it works" section answers real prerequisites: you need a CV file; AI features need a configured provider; your CV stays in your project.
  3. Add visual pull within rules: one product screenshot strip (real app, synthetic data) instead of only the card; motion = subtle reveal (existing `Reveal.tsx`), off under reduced motion.
  4. Thai first-viewport check: headline must not wrap into 4+ lines at 390px.
- **Done when**: a visitor understands what they must bring and what the app will not do.

### SCR-15 Login · SCR-16 Sign up · SCR-17 Forgot password · SCR-18 Reset password · SCR-19 Verify email — `features/auth/AuthPages.tsx`, `components/PasswordInput.tsx` · P3 · 8.5–9.0

- **Keep**: public header with theme/language, split layout for login/sign-up, single card for recovery; neutral "if an account exists" copy; 10–128 char rule.
- **Change**
  1. One shared `AuthLayout` (inside the same file or a small component) so all five pages use identical header, widths and spacing.
  2. Login: error copy for wrong credentials, unverified e-mail (with "Resend verification"), rate limit.
  3. Sign up: live password rule check (length) next to the hint; after submit show "Check your e-mail" screen with resend + change e-mail.
  4. Reset: expired/invalid token state with "Request a new link"; success → login with message.
  5. Verify: replace "sign in if prompted" with state-specific copy: signed in → "Continue to your projects"; signed out → "Log in to continue". Also expired/used token state.
- **Done when**: every token/credential failure has its own message and next step.

### SCR-20 Account — `features/account/AccountPage.tsx` · P2 · 8.0

- **Keep**: e-mail + Verified; table of agent grants with revoke; deletion with two-step confirmation; Log out.
- **Change**
  1. Section "Agent access" → "Connected assistants" with one sentence: "Apps you allowed to use one project on your behalf."
  2. Expired grants collapse under "Show expired (n)".
  3. Revoke uses a confirm dialog naming app + project.
  4. Add "Change password" link if the auth flow supports it **[Q-04]**.
- **Done when**: user can see and stop every outside app in one place.

### SCR-21 OAuth consent — `features/oauth/ConsentPage.tsx` · **P1** · 7.5

- **Keep**: who is asking (client, origin, return URL), one project selector, permissions with plain explanation, write scopes opt-in, duration, Deny/Allow.
- **Change**
  1. Group permissions into **Read** (Read results, Search jobs) and **Act for you** (Evaluate, Draft documents, Tailor CV, Prepare answers, Move stages) — the second group collapsed and visually marked "can change your data".
  2. Sticky **decision summary** above the buttons: "<Client> can read results and search jobs in <Project> for 30 days" — updated live (F-05, guardrail).
  3. Buttons: "Deny" secondary, "Allow" primary; disabled until at least one permission selected.
  4. Use existing capability strings/defaults only.
  5. Consent page uses the public header (no project rail) — the user is mid-flow from another app.
- **States**: invalid client/redirect; no projects (link to create); session expired → login then return.
- **Done when**: on 390px the summary and both buttons are visible together.

### SCR-22 Digest unsubscribe — `features/digest/UnsubscribePage.tsx` · P3 · 8.5

- **Keep**: works without login; scope sentence; manage digests link.
- **Change**: name the saved search being stopped if the token provides it; success state "Stopped. You won't get e-mails for <search>." with "Undo" while the token is valid; invalid/used token state.
- **Done when**: one click, clear result, no login.

## 6. Delivery order (thin slices)

Each slice ends with build/type check, relevant Playwright tests, and screenshots 1440 + 390 (th/en, light/dark) inspected before calling it done.

| Slice | Content | Pages |
|---|---|---|
| S0 | Glossary + locale copy (G-01), status badge (G-06), rail/identity/appearance (G-03/04/05) | all |
| S1 | P1 core loop: Search, Evaluation workspace, Applications, Job detail | 02, 04, 05, 06 |
| S2 | P1 trust/structure: Consent, Projects | 21, 12 |
| S3 | Overview modes, Evaluations list, CV & experience, Settings regrouping | 01, 03, 07, 11 |
| S4 | Documents, Document detail, Agent activity, Account | 08, 09, 10, 20 |
| S5 | Public: Landing, auth set, unsubscribe | 13–19, 22 |
| S6 | Motion/pixel accents (G-10), finish review (impeccable), DESIGN.md update | all |

## 7. Verification (per slice)

- `npm run build` / type check; existing Playwright specs in `tests/e2e/` stay green; new tests for: stage dropdown (05), consent summary (21), single primary action per state (04), no `%` AI score (02), escaped untrusted titles (05).
- Screenshots at 1440, 820, 390 × th/en × light/dark into `docs/ux-redesign/` evidence; compared side by side with the selected concept.
- Keyboard-only pass and visible focus; reduced-motion pass; contrast AA on new text/badge pairs.
- Impeccable `critique` + detector after each slice; finish review at S6.
- What will not be proven: real-user usability (no study planned) — see Q-02.

## 8. Open questions (owner = you)

**Answered 2026-10-18 by owner: all five accepted as recommended; implementation of S0–S6 approved.**

| Q | Question | Why it matters | Recommended answer |
|---|---|---|---|
| Q-01 | Approve the plain-language terms in G-01 (EN + TH)? | They change copy on 8+ pages and tests | Approve; adjust Thai wording during S0 review |
| Q-02 | Run a small usability test (5 people, 5 tasks) after S1? | Only real evidence that a first-time user succeeds | Yes, after S1, informal is fine |
| Q-03 | Move Document language + notifications from CV page to Settings › This project? | Changes where users find a setting | Move, leave a link on CV page |
| Q-04 | Does the API support "change password" and creating documents outside a session? | Decides whether buttons appear (never invent endpoints) | I check the API contract in S0 and hide if absent |
| Q-05 | Which project facts may Projects cards show without a new endpoint? | Avoid inventing counts or adding backend work | Name + last activity only unless counts already exist |

## 9. Self-check

- [Gap] No SPEC/FR/AC/TC exists for this redesign; each slice's "Done when" acts as provisional AC until `docs/specs/` is created. On product level a SPEC per slice is required before merge (park-sdlc-kit Definition of Ready).
- [Conflict] Concept text-only wordmark vs taste rule 10 → resolved toward keeping the logo (G-04).
- [Conflict] Concept 48px headings vs DESIGN.md 24/28px → DESIGN.md wins (G-02).
- [Conflict] Concept `78%` vs real 1–5 band + ATS% → source wins (SCR-02).
- [Assumption] Counts on Projects and "needs review" on Experience bank only if existing APIs return them (Q-05).
- Not verified: no code built, no browser run, no user test in this plan.

## 10. Implementation status (2026-10-18)

- Done in worktree, uncommitted: S0 (rail, glossary, copy), S1–S5 (all 22 pages per SCR sections above), Settings › Documents & notifications (Q-03).
- Verified: `npm run build` passes; full Playwright suite 187 passed / 1 skipped, run twice; full screenshot matrix (32 surfaces × th/en × light/dark × 1440/820/390) with no horizontal overflow and no page errors.
- Deviations: board view keeps the `…` move menu (list view has the visible stage select); application rows show no location/work mode (field not in API); consent still renders inside the app shell; unsubscribe cannot name the search or offer Undo (API returns 204 only); no change-password link (no API).
- Not done yet: S6 (motion/pixel accents, impeccable finish review, DESIGN.md update), real-backend run, usability test (Q-02).
