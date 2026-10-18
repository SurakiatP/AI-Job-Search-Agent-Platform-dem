# Assessment A — whole application design critique

Method: independent Assessment A by `/root/whole_app_design_a`. No Assessment B or detector output was read. This is a fresh assessment of the expanded whole-app scope.

Target: `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem/frontend/src`.

Evidence: all 32 destinations/tab states in `/tmp/jsp-ux-all/access/smoke`, at EN/light/1440 and TH/dark/390 (64 rendered fixture screenshots). I inspected the two complete contact sheets and opened dense Profile, Job Detail, Document Detail, Application Board, Agent access, Timeline, Project Sharing, Webhooks, and public Landing images at larger size. Source inspection supports the findings below. Contact sheets are `/tmp/jsp-ux-all/contact-desktop.jpg` and `/tmp/jsp-ux-all/contact-mobile.jpg`. These are synthetic API fixtures; this assessment does not verify real backend, provider, permission, or delivery behavior. Native browser interaction was not repeated because the supplied rendered fixture states are the available populated evidence. No application edits, tests, detector, overlay injection, or server startup were performed by this assessor.

## Design specificity verdict

The result feels authored for a traceable personal job-search workspace. Its recurring index structure, restrained indigo project rail, named CVs, revision history, job inspection, application stages, and approval handling give the visual language a clear purpose. The flat row-based structure is consistent without forcing every task into equal-sized promotional cards. The narrow layouts preserve written states and readable Thai rather than shrinking a desktop dashboard.

The colors and rounded controls alone are category-interchangeable, but the information structure is considerably more specific: immutable source pairs, keyword coverage explicitly distinguished from AI evaluation, reviewable document revisions, and manual submission language express this product's operating model. The remaining opportunity is to carry that source clarity through the Job Detail summary and remove contradictory automation terminology.

## Nielsen scores

All ten heuristics apply to the whole working application; the landing page does not determine applicability for the set.

| # | Heuristic | Score / 4 | Reason |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Named application/run states, approval attention, document current/history states, and explicit busy/error infrastructure are present. Static evidence cannot establish every asynchronous transition. |
| 2 | Match between system and real world | 3 | Job-search language and manual submission explanations are mostly clear. “Auto-approve submissions” conflicts with the narrower recording behavior explained underneath. |
| 3 | User control and freedom | 3 | List/board alternatives, back links, revision selection, document history, destructive confirmation and undo affordances support recovery. |
| 4 | Consistency and standards | 3 | Shared typography, controls, status treatment and workspace composition hold across the expanded pages. Related-document revision wording and hardcoded English action names are exceptions. |
| 5 | Error prevention | 3 | Disabled invalid actions, constrained forms, access scopes and destructive confirmation are visible in source. Ambiguous automatic-submission wording weakens informed configuration. |
| 6 | Recognition rather than recall | 3 | Grouped navigation and source/history labels support recognition. Job Detail still requires opening a separate evaluation session to identify the CV used for the score. |
| 7 | Flexibility and efficiency | 3 | Application list/board, CV versions, document revisions, task filters, and advanced configuration preserve useful alternative paths. |
| 8 | Aesthetic and minimalist design | 3 | Calm hierarchy, restrained color, readable density and responsive reflow are strong. Profile's expanded preferences and add-fact form make its secondary task unnecessarily long on mobile. |
| 9 | Error recognition and recovery | 3 | Source provides retry actions, preserved posting drafts, contextual source validation, and document recovery copy. Full failure behavior is outside the supplied screenshot state set. |
| 10 | Help and documentation | 2 | Inline explanations help with sources, access, manual submission and webhook setup; help is distributed across long screens and not consistently available at the exact decision. |
| | **Total** | **29 / 40** | **Good: a coherent foundation with bounded material corrections.** |

## What is working

1. **The navigation expresses the actual job-search lifecycle.** Work, Materials, and Utilities keep search/evaluation/application work distinct from CV/document resources and agent configuration. The current project remains prominent. Desktop and mobile share the same task vocabulary.
2. **Document history makes provenance tangible.** The document reader shows current revision, selected revision, source CV revision, dates, downloads and history in a useful two-column desktop composition and readable mobile stack. This supports review before reuse rather than presenting generated text as an unquestionable final result.
3. **The interface handles trust with concrete statements.** Keyword-based skill coverage is labelled; application tracking explicitly says stage changes do not send an application; the landing page labels sample previews; account/project scope is explained in utility screens. Written state badges remain legible in the dark mobile images.

## Priority issues

### 1. [P2] Job Detail loses or misnames the source of its evidence

**Evidence:** `/tmp/jsp-ux-all/access/smoke/job-detail-1440-en-light.png` shows “Job revision 1” in the page header, then “Job revision 2” beside a related cover letter. The second value is actually `doc.latest_revision.revision`. `frontend/src/features/jobs/JobsPage.tsx:141` uses the job-specific `t('revision')` key; `frontend/src/locales/applications-workspace.en.json:33` defines it as “Job revision {{revision}}” and the Thai key also names the job posting. This is a concrete false provenance label.

The same page presents “Latest evaluation report” and a 3.7/5 score without naming its CV or CV revision (`JobsPage.tsx:119`–132). The run is selected from `latestEvaluations` by job revision; the corresponding CV identity is absent from the summary. A job seeker with Senior Data Analyst and Product Analytics CVs cannot tell which one produced that score without leaving for the session.

**Why it matters:** The product's central assurance is that results belong to an exact CV/job pair. The page people use to decide whether to prepare documents currently mislabels one revision and hides half of that pair.

**Fix:** Give document revisions their own localized label. Put the evaluated CV name and version, job revision and evaluation date adjacent to the report/score, resolving existing run/session/CV resources. If a source cannot be resolved, explicitly show it as unavailable. Preserve the existing evaluation-session link.

**Suggested command:** `$impeccable clarify`.

### 2. [P2] The automation setting names a broader action than it performs

**Evidence:** `/tmp/jsp-ux-all/access/smoke/profile-1440-en-light.png`, Document settings. `frontend/src/features/profile/ProfilePage.tsx:25` supplies “Auto-approve up to N submissions per day (empty = off)”; the immediately following paragraph says this only records “applied”, nothing is sent, and the user submits on the company site. The corresponding Thai copy is part of the same local copy object. The visible field is rendered at `ProfilePage.tsx:166`.

**Why it matters:** A high-stakes automation preference should be understood from its name. “Submissions” leads readers to think an application may be sent, while the explanation defines a tracking/approval permission. Making a job seeker read a long corrective paragraph increases uncertainty about what an external agent can do.

**Fix:** Name the specific action in both languages, for example “Automatically approve marking applications as applied — daily limit”, with “Blank means off”. Keep the concise conditions and the explicit “You submit applications yourself” reassurance. This is a copy correction using the existing preference/API field.

**Suggested command:** `$impeccable clarify`.

### 3. [P2] Application stage menus retain English accessible names in Thai mode

**Evidence:** `frontend/src/features/applications/ApplicationBoard.tsx:32` and `:79` both render `label={`Move to: ${card.title}`}` for the icon-only stage menu. The list and board screenshots in TH mode establish that these are ordinary Thai workspace destinations. `frontend/src/locales/applications-workspace.th.json:25` already has the translated “moveTo” key, used for the list's hidden heading but not the actual menu triggers.

**Why it matters:** A Thai screen-reader user encounters an English command at the control that changes the tracked application state. The visible ellipsis supplies no text alternative of its own. The application promises Thai as a first-class interface language, including control names.

**Fix:** Use the existing localized action text for both menu-trigger accessible labels, retaining the specific opportunity title. Check that the list and board receive the same translated wording.

**Suggested command:** `$impeccable harden`.

## Cognitive load

Overall load is low to moderate. Main search, evaluation, application list and document reading each have an identifiable primary task. The most demanding screens are legitimately advanced access configuration and the combined CV/experience page.

Checklist: single focus mostly passes; grouping passes; hierarchy passes; working memory mostly passes apart from Job Detail's missing CV pair; progressive disclosure mostly passes. Chunking, minimal choices and one-decision-at-a-time are weaker on advanced/profile surfaces, yielding **three localized failures: moderate load**.

Decision points exceeding four visible options are explicit: Connected Agents and Project Sharing present seven capability checkboxes; the Timeline presents six state filters; a non-primary CV can expose six immediate actions (Rename, Delete, Preview, Upload new version, Extract experience, Set as primary). Seven independent permissions are necessary distinctions and should remain reviewable, but readable groups such as Read, Prepare and Track would help scanning without changing scope defaults.

Minor profile issue: `/tmp/jsp-ux-all/access/smoke/profile-390-th-dark.png` stacks the CV library, a full document-preference panel and a permanently expanded add-fact form. Experience evidence is well below the first viewport, and the desktop version gives substantial first-screen space to an infrequently changed preference. A compact preferences disclosure and an “Add fact” action would make the CV/experience destination easier to scan. This is a secondary improvement rather than a blocked core journey.

## Emotional journey

The entry experience is calm: a concrete promise, labelled sample outputs, and an explicit review-and-submit model. The working app reduces anxiety by keeping statuses and source/history context visible. The strongest reassurance occurs around document review and manual application tracking. The weakest moments are interpreting a score without knowing its CV and deciding whether “Auto-approve submissions” means sending something; these are precisely the moments when a cautious job seeker needs certainty. Completion is appropriately quiet rather than celebratory: a recorded application stage and a traceable timeline are useful end states.

## Persona red flags

- **Jordan, first-time user:** Grouped navigation and next-action copy provide a reasonable path. The “Auto-approve submissions” field forces Jordan to reconcile a broad label with a narrower explanation and may make them avoid a useful feature through uncertainty.
- **Sam, keyboard/screen-reader user working in Thai:** Text navigation and written states are strengths. The two hardcoded “Move to” menu labels break localized operation at an action with consequences. Static images do not prove focus order, announcements or physical touch behavior; no such claim is made.
- **Nok, Thai analyst maintaining multiple targeted CVs:** The CV library and document history recognize her workflow. On a job detail she cannot identify whether a fit score reflects her analyst CV or product CV, and the related document's “Job revision 2” can be mistaken for an updated posting. She must open additional pages and remember context to validate the recommendation.

## Minor observations and limits

- Agent access screens expose technical permission IDs alongside plain labels. This is defensible in integration setup, but those identifiers should remain visually secondary.
- A horizontally bounded application board and timeline table are appropriate exceptions to full mobile reflow; the default application list is easier to scan on a phone.
- The public landing is more legible and concrete than a decorative tour. Its broad provider/local-execution claims were not verified against runtime by this visual assessment.
- The screenshot evidence supports appearance and state composition. It does not establish complete WCAG conformance, all zoom levels, native touch ergonomics, provider behavior or live error recovery.

Questions for parent synthesis: prioritize source-context/copy corrections; both are bounded and preserve the approved direction and backend contracts. There is no evidence here that warrants reopening the chosen visual world.
