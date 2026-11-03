# UX simplify plan: fewer buttons, fewer clicks, one next step

Status: audit and plan only. No app source changed in this step.
Branch: `feat/ux-simplify` from `develop` 345b12a.
Evidence: synthetic fixture (`tests/fixtures/application.ts`) on the Vite dev server (`127.0.0.1:5174`), 15 routes at 1440x900 and 390x844, Thai UI.
Screenshots and raw counts are in the session scratchpad at `ux-audit/shots/*.png` and `ux-audit/counts.json`. They are not committed because they come from a local run.

Customer feedback from the trial, paraphrased from Thai: the web UI is confusing, there are too many buttons everywhere, it takes too many clicks, and it is hard to use. They want an orderly layout that is easy to understand and asks for fewer clicks. It should feel more interactive and more distinctive, so it does not look AI-made, and more inviting to use.

Trial evidence from production (read-only): the tester uploaded a CV as PDF (v1) and then as DOCX (v2). Both uploads succeeded and extraction produced 33 facts, yet the tester reported "the system cannot read my PDF".

Fixed constraints: keep the teal palette and the existing tokens, keep backend behavior and API contracts, keep th/en, light/dark, a11y, no fake stats, no black UI colors, and no MUI install. The fit score is the selling point and must stay visible.

---

## 1. Audit findings

Method: Assessment A (design review) was done inline by the lead from screenshots and source. Assessment B (`impeccable detect --json frontend/src`) ran in an isolated sub-agent. The impeccable critique protocol asks for both in sub-agents, so this is a partial deviation and is stated here. The detector returned **0 findings**. The problem is information architecture and duplication, not mechanical anti-patterns, so the scores below come from Assessment A.

### 1.1 Measured control counts (visible interactive elements, 1440 wide)

| Screen | Whole page | Sidebar | Main region | Notes |
|---|---|---|---|---|
| Sidebar (any project page) | | **20** | | 9 nav items, back link, switcher, account, settings, 3 theme buttons, 2 language buttons, collapse toggle |
| Overview | 33 | 20 | 12 | 2 CTAs in checklist, 4 count tiles that are links, help panel |
| Job search (error state) | 40 | 20 | **19** | mode toggle, 3 fields, filter button, 6 chips, disabled save, 3 example chips, retry, sample |
| Applications | 37 | 20 | 16 | 7 stage chips, view toggle, search, stage select, sort select, add, row stage select |
| Job detail | 34 | 20 | 13 | evaluate, prepare docs, more menu, 3 contact fields, save contact, note, email |
| Session (evaluation) | 33 | 20 | 12 | 5 tabs, output language select, CV link, job link, evaluate, agent panel link |
| CV & experience (empty) | 32 | 20 | 11 | **4 buttons for 2 actions** (header add/build plus empty-state upload/build) |
| Documents | 30 | 20 | 9 | banner CTA to evaluations, 5 filter chips |

Static count of `<Button`/`<button` per file (Assessment B): BuilderPage 21, SearchPage 20, DocumentsPage 19, ProfilePage 12, PracticeSetPage 12, SessionPage 11.

The sidebar takes 20 of the 30 to 40 controls on every project page. The customer's "too many buttons everywhere" is literally true: the same 20 controls appear on every screen before the page adds its own.

### 1.2 Click budget of six core jobs (before)

A click is one pointer activation inside the app. The OS file picker counts as one. Typing does not count. A screen is a distinct route or modal.

| # | Job | Path today | Clicks | Screens |
|---|---|---|---|---|
| 1 | New project with first CV, and see what the AI read | Projects > New project > type name > Create > Overview "Add CV" > pick file > (no feedback on extraction) > sidebar CV > tab Experience bank > "Extract facts" > wait > (preview of DOCX says "cannot be previewed") | **7** | 4 |
| 2 | Find a job and get its fit score | sidebar Job search > type > result card > "Evaluate with CV X" > dialog "Start" > session page "Evaluate this job" > wait | **5** | 3 |
| 3 | Score a job that is already saved | sidebar Applications > row > "Evaluate this job" > dialog "Start" > session "Evaluate this job" | **5** | 4 |
| 4 | Draft a cover letter after the score | session tab "Prepare documents" > "Cover letter" > (confirm if one exists) > sidebar Documents > card "Open" | **4 to 5** | 3 |
| 5 | Record "Applied" after submitting on the employer site | sidebar Applications > row stage select > choose stage | **3** | 1 |
| 6 | Practise the interview for that job | sidebar Interview practice > pick job > generate, or session tab Practice > generate | **3** | 2 |

### 1.3 Root causes (ordered by impact)

**P0. One job lives in four places.** A job appears in search, in Applications (`/applications`, `/jobs/:id`), in Evaluations (`/sessions`, `/sessions/:id`) and in Practice (`/practice`). The user has to know that "evaluation" is a session, that a session pairs one CV revision with one job revision, and that documents come from a session tab. Nav labels name the system's objects, not the person's goal (Nielsen 6, recognition over recall).

**P0. Every action has a confirm step that adds nothing.** "Evaluate with CV X" opens `NewSessionDialog`, which preselects the same CV and the same job, and its only job is a "Start" button. Then the session page asks again ("Evaluate this job"). That is three buttons for one decision. (`features/search/SearchPage.tsx` JobDetail, `features/sessions/NewSessionDialog.tsx`, `features/chat/SessionPage.tsx:211`.)

**P0. The CV upload ends in silence, and preview looks like a read failure.** After upload, `ProfilePage.upload()` reloads the list and stops (`features/profile/ProfilePage.tsx:127-139`). Extraction is a separate manual button. Two places on the profile page start it (`ProfilePage.tsx:217`, `ExperienceBank.tsx:148`), and neither one says this is the next step. For DOCX, `components/CvPreview.tsx:21` sets `status: 'none'`, and the copy reads "This file type cannot be previewed in the browser, download it to view". A person who has just uploaded a file reads that as "the system cannot read my file", which is exactly the trial report. The backend parsed the file fine (33 facts).

**P1. The user's own background work is invisible.** `GET /projects/{id}/runs` excludes `profile_cv`, `match_jobs` and `extract_experience` (`backend/src/job_search_platform/api/rest.py:1229`). So Agent activity said "no agent runs yet" while 33 facts existed. That breaks Nielsen 1 (visibility of system status) on the one screen whose purpose is system status.

**P1. Duplicated controls on the same screen.**
- CV page, empty state: header "Add CV" and "Build CV" plus empty-state "Upload first CV" and "Build CV". Four buttons, two actions.
- CV page: the "Experience bank" tab plus an "Experience bank" card that links to the same tab.
- Applications: seven stage chips that filter the list, plus an "All stages" select that does the same thing.
- Session: five tabs plus an "Agent steps" side panel that lists the same four steps with status.
- Top-level pages (Search, Applications, CV, Documents) all show "< Overview" back links, although they are sidebar destinations.
- Sidebar: an "All projects" back link plus a project switcher whose dialog also has "All projects".

**P1. Search shows every tool at once.** It shows the mode toggle ("General search" / "Smart match", English inside Thai UI), filter button, six category chips, three example chips, and a disabled "Save this search" button with a paragraph explaining why it is disabled. That makes 19 controls before the first result.

**P2. Mobile buries the primary action.** On the session page at 390 wide, the breadcrumb wraps, the "Compared with" block takes three lines, the tabs wrap to two rows, and the "Evaluate this job" CTA sits below the first viewport (`shots/session-390.png`). Mobile navigation is a bare hamburger drawer that repeats the 20-control sidebar.

**P2. AI-look tells.** `components/AiMark.tsx` uses the lucide `Sparkles` glyph (antislop R-04). The logo tile reads as a sparkle. One em dash sits in `locales/search-workspace.{th,en}.json` key `aiUnavailable` (R-02). The overview shows four count tiles under the checklist, which is the default dashboard shell (antislop-ui). The counts are real, but they repeat the nav and nobody acts on them.

### 1.4 Heuristic scores (Assessment A)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Extraction runs hidden from Agent activity, and no progress shown after upload |
| 2 | Match with the real world | 2 | "Session", "Evaluations" and "Smart match" are system words. The user thinks "this job" |
| 3 | User control and freedom | 3 | Undo exists for trash and hide. Back links are fine |
| 4 | Consistency and standards | 2 | Same job, two detail pages (job detail and session) with different actions |
| 5 | Error prevention | 3 | DOC rejected early, pair-exists handled |
| 6 | Recognition over recall | 2 | The user must remember that documents come from a session tab |
| 7 | Flexibility and efficiency | 2 | No smart defaults (primary CV is known but asked again), no keyboard path in results |
| 8 | Aesthetic and minimalist design | 1 | 20-control sidebar, duplicated CTAs, disabled buttons with explanations |
| 9 | Error recovery | 3 | Retry and sample data on failures |
| 10 | Help and documentation | 2 | Preview dead end, help panel parked on the overview |
| | **Total** | **22/40** | Usable but heavy. Fixable without new features |

What already works and must survive: the teal "stage tile" motif in the sidebar (`data-stage`), the inline stage select and drag board in Applications (already one click), the undo snackbars, the honest sample-data banner, and the fit score component (`components/FitScore.tsx`).

---

## 2. Information architecture: from 9 nav items to 5

### 2.1 New project navigation

| Today (9 + extras) | New (5) | Route | What happens to the old item |
|---|---|---|---|
| Overview / ภาพรวม | **Today / วันนี้** | `/overview` (unchanged) | Becomes the next-step hub (section 3.2) |
| Job search / ค้นหางาน | **Find jobs / หางาน** | `/search` | Same page, slimmed (section 4) |
| Applications / ใบสมัคร + Evaluations / การประเมิน | **My jobs / งานของฉัน** | `/applications` | One list of every job the person cares about, with fit score, stage and next action per row. `/sessions` stays routable for deep links and the session trash, but leaves the nav |
| CV & experience / CV และประสบการณ์ | **CV / CV และประสบการณ์** | `/profile` | Same, without duplicates |
| Documents / เอกสาร | **Documents / เอกสาร** | `/documents` | Same |
| Interview practice / ซ้อมสัมภาษณ์ | (session tab) | `/practice` kept | Reached from the job (session tab "Practice") and from a Today card when a job reaches the Interview stage |
| Agent activity / กิจกรรมเอเจนต์ | (run indicator + account menu) | `/console` kept | A header chip "AI working (1)" / "Needs you (1)" shows only while something runs or waits. It links to `/console` |
| Trash / ถังขยะ | (account menu) | `/trash` kept | Menu item with its count |
| All projects back link | removed | | The switcher dialog already lists every project and links "All projects" |
| Account, Settings, 3 theme buttons, 2 language buttons | **one avatar menu + one TH/EN toggle** | | The menu holds Account, Settings, Agent activity, Trash, Help (`/docs`) and theme radio items. The language toggle stays visible because Thai and English users switch often |

Sidebar controls: **20 to 9** (collapse toggle, switcher, 5 items, avatar menu, TH/EN as one 2-state toggle).

Mobile (<1024): a **bottom tab bar with the same 5 items** (icon plus label, 44 px or taller, safe-area padding). The top bar keeps the project switcher, the run chip and the avatar menu. The hamburger drawer goes away. ui-ux-pro-max `bottom-nav-limit` (5 or fewer) and `adaptive-navigation` (sidebar at 1024 and up) both point here, and it removes the antislop-layoutmobile "bare hamburger" tell.

### 2.2 Why no command palette

A command palette serves people who live in the app all day and remember command names. Our users are job seekers who come back a few times a week. Fewer nav items and a visible next step cut more clicks for them than a hidden ⌘K. It would also need a new component with a11y and th/en search for little gain. Skip it. Revisit if analytics show repeat power users. The one keyboard addition is in section 3.3.

### 2.3 Route and deep-link migration

- No route is deleted. `/sessions`, `/practice`, `/console` and `/trash` keep working. Only their nav entries move.
- `/jobs` already redirects to `/applications`. Keep it.
- `?start=evaluate` on `/sessions/:id` is the only new URL contract (section 3.1).

---

## 3. Interactive patterns that remove clicks

Only three. Each one removes a step the data already makes unnecessary.

### 3.1 One-click evaluate with smart defaults (removes 3 clicks from jobs 2 and 3)

- **Button:** `EvaluateButton` replaces `NewSessionButton` wherever the job is already known: the search result card and detail, the My jobs row, job detail, and the Today next-step card.
- **Click behavior:**
  1. Pick the CV: the primary CV, or the only usable CV. If there is no usable CV, fall back to the existing dialog (it already handles "no CV").
  2. `POST /projects/{id}/sessions` with `cv_revision_id` and the job. This is the same request the dialog sends today.
  3. If the API answers `session_pair_exists`, go to the existing session.
  4. Navigate to `/sessions/:id?start=evaluate`.
- **Session page:** `SessionPage` sees `start=evaluate` once. It calls its existing `startRun('evaluate_job', '')` and then `navigate(..., { replace: true })` without the param, so reload or back does not start a second run. The idempotency key stays as it is.
- **Changing CV:** a small "Change CV" link sits next to the button (and in the session header). It opens the old dialog. The dialog becomes the exception path.
- **Label:** with a CV: "ดูคะแนนความเหมาะสม (CV: Data CV v2)" / "Get fit score (CV: Data CV v2)". With no CV: "เพิ่ม CV เพื่อดูคะแนน" / "Add a CV to see the score".
- **After:** job 2 takes **2 clicks and 2 screens** (Find jobs, card "Get fit score"). Job 3 takes **2 clicks** (My jobs row "Get fit score").

### 3.2 Next-step card (one primary action per job and per project)

`features/overview/nextStep.ts` is a pure function. It takes data the screens already load (CVs, extraction status, sessions with latest run, application stage) and returns one `{ key, labelKey, action }`. The cases run in this order:

| State | Next step (th / en) | Action |
|---|---|---|
| No CV | อัปโหลด CV / Upload your CV | file picker |
| CV, extraction running | กำลังอ่าน CV ของคุณ / Reading your CV | progress, no button |
| CV ready, no job | หางานแรก / Find a job to score | `/search` |
| Job, no score | ดูคะแนนความเหมาะสม / Get the fit score | 3.1 |
| Score, no draft | ร่างจดหมายสมัครงาน / Draft the cover letter | starts `draft_documents` |
| Draft, stage Saved | ฉันสมัครแล้ว / I applied | sets stage `applied` |
| Stage Interview | ซ้อมสัมภาษณ์งานนี้ / Practise for this interview | session Practice tab |
| Needs input or approval | ตอบคำถามของ AI / Answer the AI's question | opens the run |

The card is used in three places:
- **Today:** the top card for the project, plus a "Needs you" list for runs in `needs_input` or `waiting_approval`.
- **Session header and job detail header:** the same function per job. It replaces the multi-CTA header.
- **My jobs rows:** a compact text button in the "Next step" column, which exists today as plain text.

Semantics are kept. "I applied" only records the stage. The copy below the button reads "บันทึกสถานะเท่านั้น ระบบไม่ได้ส่งใบสมัครให้" / "Records the stage only. We do not submit anything." This matches PRODUCT.md (manual submission).

Results: job 4 takes **1 click** (Draft) plus 1 to open the result inline, so **2**. Job 5 takes **1** (I applied). Job 6 takes **1** from the session.

### 3.3 Upload then auto-read, with "what the AI read" (removes 4 clicks from job 1 and fixes the trial bug)

- **New project:** `NewProjectPage` gets an optional CV drop zone under the name field. Create runs `POST /projects`, then `POST /projects/{id}/cvs` with the file, then navigates. These are the existing endpoints in sequence.
- **Auto extraction:** after any successful CV upload (`ProfilePage.upload`, the new project form, a new version), the client calls `POST /async/projects/{id}/cvs/{cv_id}/experience-extractions` right away when `provider_configured`. This is the same call the manual button makes. The manual button stays as "Read again" for retries.
- **Visible progress:** the CV row shows inline status from `bank.data.extraction`: "กำลังอ่าน CV..." / "Reading your CV..." while queued or running. When done it reads "อ่านแล้ว: พบ 33 ข้อเท็จจริง ตรวจดู" / "Read: 33 facts found. Review". On failure it shows "อ่านไม่สำเร็จ ลองอีกครั้ง" / "Could not read it. Try again" with the retry button.
- **Preview fix (`components/CvPreview.tsx`):** for non-PDF and non-text files, and as a tab next to the PDF, show "สิ่งที่ AI อ่านได้" / "What the AI read". This is the extracted facts from `GET .../experience`, filtered by `source_cv_id`, grouped by kind. Replace the dead-end copy with "เบราว์เซอร์แสดงไฟล์ DOCX ไม่ได้ แต่ระบบอ่านไฟล์นี้แล้ว" / "Your browser cannot display DOCX, but we have read this file". Download stays as a secondary link.
  - There is no endpoint that returns the raw extracted text. Facts are the honest stand-in. A raw-text endpoint would be a contract change and is listed in section 6.
- **Keyboard:** in Find jobs, the results list becomes a `listbox`. Up and down arrows move the selection and update the detail pane, and Enter triggers "Get fit score". `/` focuses the search field. This is the only shortcut work. It helps the person who scans 20 postings in a row.
- **After:** job 1 takes **3 clicks and 2 screens** (New project, pick file in the form, Create). The status appears without asking.

### 3.4 Inline rename (small, high frequency)

CV rename uses `RenameDialog` (`ProfilePage.tsx:41`): menu, Rename, type, Save, so 3 clicks and a modal. Replace it with an inline editable title (pencil or double-click, Enter saves, Escape cancels), using the same PATCH. The project name in the switcher header gets the same treatment. That is **3 clicks to 1**. Delete keeps its confirm dialog. Trash keeps undo.

---

## 4. Per-screen button budget (after)

Targets are checked by the new `ux-budget.spec.ts` (section 7). "Main" counts visible interactive elements inside `<main>` above the fold at 1440x900, with fixture data.

| Screen | Main today | Target | Removed or merged (file) |
|---|---|---|---|
| Sidebar | 20 | **9** | `components/ProjectSidebar.tsx`: groups collapse to one list, theme moves to the avatar menu, the back link goes |
| Today | 12 | **6 or fewer** | `features/overview/OverviewPage.tsx`: drop the 4 count tiles and move the HelpPanel to the avatar menu Help. GettingStarted becomes the next-step card |
| Find jobs | 19 | **10 or fewer** | `features/search/SearchPage.tsx`: the mode toggle becomes a sort select ("เหมาะกับ CV ฉัน / Best fit for my CV", the default when a CV exists, and "ล่าสุด / Newest"). Six category chips move into the filter sheet, which shows a count badge. Example chips appear only when the query is empty and there are no results. "Save this search" appears only once a query or filter is set, never as a disabled button. The "< Overview" back link goes |
| Search result card | 1 to 2 | **2** | Fit score badge (when ranked) plus "Get fit score" or the score itself. Save stays as an icon button |
| My jobs | 16 | **11 or fewer** | `features/jobs/JobsPage.tsx`: drop the "All stages" select (the stage chips already filter). Add a FitScore column and a next-step button per row. The back link goes |
| Job detail | 13 | **8 or fewer** | One next-step primary in the header, and the "Prepare documents" dialog path goes. Contact fields fold behind "Add recruiter contact" until one exists |
| Session | 12 | **8 or fewer** | `features/chat/SessionPage.tsx`: remove the right "Agent steps" panel (`WorkflowPanel`) and move its status dots onto the tab labels. The output-language select moves next to the draft buttons (it only affects generation). "History" goes from a tab to a link at the bottom. Four tabs: ประเมิน / เอกสาร / คำตอบ / ซ้อม (Score / Documents / Answers / Practice) |
| CV (empty) | 11 | **3** | `features/profile/ProfilePage.tsx`: hide the header actions while the empty state shows, and drop the duplicate "Experience bank" card |
| Documents | 9 | **7 or fewer** | `features/documents/DocumentsPage.tsx`: the explainer banner and its "Go to evaluations" button only show when there are no documents. Filter chips hide when there are fewer than 4 documents |

Mobile acceptance: on every project page at 390x844, the page's primary action sits inside the first viewport. Session: the "Compared with" block collapses to one line ("CV v1 · Job v1 · Change"), and the tabs scroll horizontally on one row instead of wrapping.

## 5. Click counts after

| # | Job | Before (clicks / screens) | After (clicks / screens) | Main components |
|---|---|---|---|---|
| 1 | New project + first CV + see what the AI read | 7 / 4 | **3 / 2** | `NewProjectPage.tsx`, `ProfilePage.tsx`, `CvPreview.tsx`, `ExperienceBank.tsx` |
| 2 | Find a job and get the fit score | 5 / 3 | **2 / 2** | `SearchPage.tsx`, new `sessions/EvaluateButton.tsx`, `SessionPage.tsx` |
| 3 | Score a saved job | 5 / 4 | **2 / 2** | `JobsPage.tsx`, `ApplicationBoard.tsx`, `EvaluateButton.tsx` |
| 4 | Draft cover letter after the score | 4 to 5 / 3 | **2 / 1** | `SessionPage.tsx`, `nextStep.ts` |
| 5 | Record Applied | 3 / 1 | **1 / 1** (from session or job), 2 from the list | `nextStep.ts`, `JobsPage.tsx` |
| 6 | Practise for the interview | 3 / 2 | **1 / 1** (from session), 2 from Today | `SessionPage.tsx`, `OverviewPage.tsx` |

Total across the six jobs: **27 to 28 clicks become 11**.

---

## 6. Decisions the owner needs to make (not decided in this plan)

1. **Auto extraction on upload spends AI tokens per upload.** The plan auto-starts it, because the trial shows people never find the button. Option: auto-start only for the first CV and for new versions of the primary CV.
2. **Show the user's own background runs in Agent activity.** The root cause is the backend filter at `rest.py:1229`. The frontend-only fallback in this plan: `/console` adds one row built from `GET .../experience` `extraction` (latest status and summary) and labels it "อ่าน CV / Read CV". The proper fix is to drop `extract_experience` from the exclusion list for user actors. That is a backend behavior change with the same response shape, and it needs owner approval because `TimelineTab` links runs to sessions and these runs have no session.
3. **Raw extracted-text endpoint** for a true "what the AI read" preview. This is a contract change and is out of scope here.
4. **Logo glyph.** The tile reads as a sparkle (an AI tell). Antislop R-23 says ask before creating a logo. Proposal: wordmark only ("Job Search" set in the heading face) until the owner supplies a mark.
5. **Retiring "Interview practice" from the nav.** The plan keeps `/practice` and links it from Today when any job is at the Interview stage.

---

## 7. Implementation waves (Sonnet workers, non-overlapping files)

Rules for every worker:
- Read `DESIGN.md`, `frontend/AGENTS.md` and this plan.
- Every string goes in th and en.
- Stay inside your owned files. If you need a key in `common.*.json`, ask the lead.
- `npm run build --prefix frontend` must pass.
- Update the specs listed for your wave and run them with `npm test --prefix tests -- <specs>`.
- No new npm dependency.

### Wave 0 (lead, before workers start)

- Add `frontend/src/features/overview/nextStep.ts` with types and the function from 3.2. Workers import it read-only.
- Add `frontend/src/features/sessions/EvaluateButton.tsx` as a stub with a typed props contract (`projectId`, `job: { savedId } | { inline }`, `cvId?`). W2 implements it.
- Write the `?start=evaluate` contract in a code comment on `SessionPage`.
- Add `tests/e2e/ux-budget.spec.ts`, failing at first. It reuses the counting logic from the audit (visible interactive elements in `nav` and in `main` above the fold). It asserts the targets in section 4 and the click paths in section 5, using the fixture at 1440 and 390 in th and en.
- Fix the em dash in `locales/search-workspace.{th,en}.json` `aiUnavailable`.

### Wave 1 (parallel, 5 workers)

| Worker | Owns (exclusive) | Delivers | Acceptance | Specs to update |
|---|---|---|---|---|
| **W1 Shell and nav** | `components/ProjectSidebar.tsx`, `AppShell.tsx`, `MobileDrawer.tsx`, `Header.tsx`, `SidebarToggle.tsx`, `AppearanceControl.tsx`, `ProjectTree.tsx`; new `components/BottomNav.tsx`, `components/AccountMenu.tsx`, `components/RunIndicator.tsx`; `components/AiMark.tsx`; `app/router.tsx`; `locales/common.{th,en}.json` | 5-item nav, avatar menu (Account, Settings, Agent activity, Trash with count, Help, theme), one TH/EN toggle, bottom tab bar below 1024, run chip (polls the existing `/runs` the way OverviewPage does), AiMark without Sparkles (text "AI" label with the same tooltip) | Sidebar has 9 or fewer controls. Bottom bar shows 5 items with labels, each 44 px or taller, and does not cover the last list item. Every old route still resolves. Keyboard: menu opens with Enter or Space and closes with Esc, and focus returns to the trigger | `navigation.spec.ts`, `shell.spec.ts`, `accessibility.spec.ts`, `control-sizes.spec.ts`, `trash.spec.ts` (nav entry), `utilities-workspace.spec.ts`, `ai-label.spec.ts` |
| **W2 Find jobs + one-click evaluate** | `features/search/*`, `features/sessions/EvaluateButton.tsx`, `features/sessions/NewSessionDialog.tsx`, `locales/search-workspace.{th,en}.json` | 3.1, the search slimming in section 4, and the listbox keyboard (3.3). Remove the PageBack on Search | Find jobs main has 10 or fewer controls above the fold. Card to running evaluation takes 2 clicks. Pair-exists opens the existing session. "Change CV" opens the dialog. Fit score badge shows on ranked cards in both languages | `search-workspace.spec.ts`, `saved-searches.spec.ts`, `skill-advice.spec.ts` |
| **W3 Session workbench** | `features/chat/*` (SessionPage, WorkflowPanel, RunSteps, ApplyCard, TailorCard), `features/practice/PracticeTab.tsx`, `locales/session-workspace.{th,en}.json` | `?start=evaluate` auto-start, 4 tabs with status dots, WorkflowPanel folded into the tabs, language select next to the drafting actions, next-step header, compact "Compared with" line on mobile | Session main has 8 or fewer controls. At 390 the evaluate CTA is in the first viewport. Reload after auto-start does not create a second run (assert one POST) | `session-workspace.spec.ts`, `evaluation-report.spec.ts`, `durable-runs.spec.ts`, `busy-indicators.spec.ts`, `cv-tailoring.spec.ts`, `practice.spec.ts`, `practice-feedback.spec.ts`, `owner-instructions.spec.ts`, `document-provenance.spec.ts` |
| **W4 CV, upload and reading** | `features/profile/*`, `components/CvPreview.tsx`, `features/projects/NewProjectPage.tsx`, `locales/materials-workspace.{th,en}.json` | 3.3 (auto extraction, inline status, "What the AI read" preview, CV in the new-project form) and 3.4 inline CV rename. Remove the duplicate actions and the PageBack | Upload to visible "Reading your CV" status takes 0 extra clicks. DOCX preview shows the facts and the new copy, never the dead-end sentence. The empty CV page shows exactly 2 actions. New project with CV takes 3 clicks | `materials-workspace.spec.ts`, `experience-bank.spec.ts`, `cv-trash-photo.spec.ts`, `cv-builder.spec.ts` (entry links only), `core-workspaces.spec.ts` (CV part) |
| **W5 My jobs** | `features/jobs/*`, `features/applications/*`, `features/sessions/SessionsPage.tsx`, `components/FitScore.tsx`, `locales/applications-workspace.{th,en}.json` | Merged list with FitScore column (score from the runs list, the way SessionsPage does today), next-step button per row, "All stages" select removed, job-detail header with one next-step primary, contact form folded until used. Remove the PageBack on the list | My jobs main has 11 or fewer controls. Row "Get fit score" takes 1 click. "I applied" sets the stage and shows the manual-submission note. Drag board and keyboard stage change still work | `application-board.spec.ts`, `application-drag.spec.ts`, `applications-workspace.spec.ts`, `full-journey.spec.ts` |

**W6 Today, Documents, Activity** runs in Wave 1 too, because it does not overlap. It owns `features/overview/*` (except `nextStep.ts`, which is read-only), `features/documents/*`, `features/console/*`, `features/trash/*` and `locales/utilities-workspace.{th,en}.json`. Work:
- The Today page from 3.2: next-step hero, "Needs you" list, recent jobs with fit score. Drop the count tiles and the help panel.
- Documents: banner and chips only when useful.
- Console: the extraction row fallback from section 6, item 2.

Acceptance:
- Today main has 6 or fewer controls.
- The hero shows exactly one primary button in every fixture state (empty project, CV without jobs, job without score, scored).
- Activity shows "Read CV" when the experience extraction exists.

Specs: `core-workspaces.spec.ts` (overview and documents parts, coordinated with W4 by test block, not by file: W6 edits only the `test(...)` blocks that name Overview, Documents or Activity), `full-app-surfaces.spec.ts`, `materials-workspace.spec.ts` (documents block only), `agent-tools.spec.ts`.

`core-workspaces.spec.ts` and `full-app-surfaces.spec.ts` are the two files more than one worker touches. To avoid merge pain, the lead splits them in Wave 0 into per-area files (`core-overview.spec.ts`, `core-cv.spec.ts`, and so on), each with one owner.

### Wave 2 (lead plus one reviewer)

- Run the full Playwright suite and `ux-budget.spec.ts`.
- Screenshot pass at 1440 and 390, light and dark, th and en, for the 15 audited routes. Compare against the scratchpad baseline.
- Contrast check on every new token pairing (run `antislop-human/contrast-check.py` on the run chip, bottom bar active state and fit score badge).
- `manual-shots.spec.ts`, `manual-clips.spec.ts` and `manual-docs.spec.ts` capture the user manual. Update their selectors here and flag that the manual screenshots need a re-shoot (park-manual-kit `update` mode).
- impeccable finish review against this plan, then a humanizer pass on every new th/en string.

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| About 25 of 46 e2e files reference nav labels, the session dialog flow or the session tabs. Expect wide red on the first run | High | Split the shared specs in Wave 0. Each worker owns its specs. The lead keeps a label map (old to new) in the PR description |
| Auto-start evaluate runs twice (StrictMode double mount, back button) | Medium | Consume the param in a ref, `replace` the URL before awaiting, keep the per-run idempotency key, and add an e2e assertion of exactly one POST |
| Auto extraction cost or provider missing | Medium | Only when `provider_configured`. Otherwise show the existing "connect a provider" line inline. Owner decision 6.1 |
| Removing Evaluations from the nav hides multi-CV comparisons (same job, two CVs) | Medium | Job detail lists every session for the job with CV name and score. `/sessions` stays routable |
| Bottom bar overlaps sticky footers (builder, practice) | Low | Builder routes hide the bar (they are focused editors). Reserve `padding-bottom` and safe-area on `main` |
| Thai labels are longer than English in a 5-item bottom bar at 320 | Low | Short labels are pinned in this plan (วันนี้, หางาน, งานของฉัน, CV, เอกสาร). Test at 320 |
| Manual and screenshots drift | Low | Wave 2 flags the re-shoot |

---

## 8. Which skill drove which decision

| Decision | Skill and rule |
|---|---|
| Nav from 9 to 5, Evaluations merged into My jobs | impeccable `critique` (Nielsen 6 and 8, cognitive load: more than 4 visible options at a decision point) and `distill` |
| One-click evaluate, dialog only as the exception | ui-ux-pro-max `progressive-disclosure` and `redundant-entry` (WCAG 3.3.7: do not re-ask what is known) |
| Next-step card with one primary | ui-ux-pro-max `primary-action` (one primary CTA per screen). antislop-ui "Default Dashboard Shell": name the decision the screen supports |
| Drop the overview count tiles | antislop-ui "Stat cards", C-3 content-driven composition. The numbers are real but nobody acts on them |
| Auto extraction with visible progress and result | antislop R-27 and antislop-ui "Placeholder empty and loading states" (say what is loading and what is next). Nielsen 1 |
| "What the AI read" instead of "cannot be previewed" | antislop-copywriting (name the actor and the true fact). humanizer §11 (passive without actor). antislop C-5 (evidence over claims): show the facts |
| Bottom tab bar on mobile, no bare hamburger | antislop-layoutmobile "Nav That Stays Desktop" and "Bare Hamburger". ui-ux-pro-max `bottom-nav-limit`, `adaptive-navigation` |
| Primary action in the first viewport at 390 | antislop R-03, antislop-layoutmobile "Sticky Nav Steals Screen". ui-ux-pro-max `content-priority` |
| No disabled "Save this search" plus explainer | ui-ux-pro-max `progressive-disclosure`. antislop R-26 (a control that cannot act right now is not shown) |
| Remove the Sparkles glyph, wordmark until the owner gives a logo | antislop R-04 (generic AI icons), R-23 (ask before creating a logo) |
| Remove the em dash, humanize new copy, no "Smart match" in Thai | antislop R-02, humanizer §8, antislop-copywriting "Tone" |
| Keyboard listbox in results, menus that close with Esc and return focus | antislop R-32, antislop-human "Mouse-only patterns". ui-ux-pro-max `keyboard-nav` |
| Inline rename instead of a modal | ui-ux-pro-max `modal-vs-navigation` and `form-autosave`, impeccable `distill` |
| Status dots on tabs carry text, not color alone | antislop-human "Color-only feedback". ui-ux-pro-max `color-not-only` |
| No command palette | antislop C-1 and R-31 (a technique needs a one-line purpose). ponytail YAGNI |

Design read: an Operate surface for Thai and English job seekers, set in the existing teal DESIGN.md language. Dials: ENERGY 2 / RHYTHM 2 / MOTION 1. Motion is limited to state changes: run progress, the fit score settling once when it arrives (off under `prefers-reduced-motion`), and the bottom-bar active indicator.

The identity motif is the stage tile already in the sidebar, carried into the bottom bar and the next-step card. The fit score is the one deliberate accent on every job surface. That makes the product distinct without new colors.

### Conflicts between skills and how they were resolved

1. **ui-ux-pro-max recommends Phosphor or Heroicons. antislop R-04 flags a single Lucide look.** Keep lucide (already installed, no new dependency, ui-ux-pro-max `icon-style-consistent`). Remove only the glyphs that fail the purpose test (Sparkles). Icons stay paired with text labels.
2. **The customer wants "more interactive". impeccable Operate mode puts scanability ahead of expression, and antislop R-19 requires motion to have a purpose.** "Interactive" is delivered as fewer round trips (one-click evaluate, inline status, keyboard list, inline rename), not as animation. MOTION stays at 1.
3. **ui-ux-pro-max `confirmation-dialogs` against the fewer-clicks goal.** Confirm stays only for irreversible actions (permanent delete, re-draft that replaces the live document). Reversible actions use the existing undo snackbar.
4. **The antislop-ui stat-card warning against the PRODUCT.md rule that the fit score is never hidden.** The fit score is a per-job decision value and stays on every job surface as the focal point. The project-level count tiles go.
5. **The impeccable critique protocol (two isolated sub-agents) against the token budget for this step.** Assessment B ran isolated. Assessment A ran inline with screenshots, and section 1 says so.
