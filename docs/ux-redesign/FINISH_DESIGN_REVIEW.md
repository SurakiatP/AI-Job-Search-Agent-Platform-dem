# Finish design review — Assessment A

Date: 2026-10-16. Reviewer: independent `/root/finish_design_a`. Method: source and visual review, completed before current detector results entered this review or the parent synthesis. No current detector output was run or read. This is the design half of the dual-agent Impeccable critique; Assessment B and final synthesis remain separate.

Scope: shared shell/navigation, Overview, Job Search, and Evaluation Session on `feat/ux-core-workspaces`. Authority: `PRODUCT.md`, `docs/ux-redesign/REDESIGN_PLAN.md`, `.impeccable/surfaces/frontend-src.md`, approved scope recorded in the Hub. `DESIGN.md` did not exist at review time. The surface brief and approved plan supply the visual contract; this report does not authorize changes to other surfaces or backend behavior.

## Verdict

**28/40 — Good, with one material status-label correction and four bounded usability improvements.** The Collection Index direction is recognizable through the indigo rail, readable bilingual work area, provenance blocks, and task-oriented grouping. It fits a person preparing applications after work. The strongest specificity is the immutable CV/job context in Session and honest distinction between preparation and manual submission. The weakest specificity is the generic run vocabulary: several very different operations still appear as document drafting.

There is no observed P0 task blocker in the reviewed evidence. This is a design verdict, not a claim of release readiness, provider quality, complete accessibility conformance, or backend correctness.

## Evidence and confidence

- **Visually verified:** 17 supplied screenshots across desktop/tablet/mobile, Thai/English, and light/dark: six Search, six Session, and five Overview captures. All three device classes and both languages/themes were represented. Exact paths are listed below. Thai text wraps naturally without visible clipping in these captures; dark mode preserves surface hierarchy and textual status cues.
- **Source verified:** the scoped pages, shell/header/sidebar, shared tabs, `RunTimeline`, `RunResults`, `ApplyCard`, `FitScore`, semantic tokens, and relevant contracts. Source findings below identify the exact responsible lines and distinguish predicted consequences from exercised behavior.
- **Live shell inspection:** opened a fresh native in-app-browser tab at `http://127.0.0.1:4177/tests/shell.html`, opened its project switcher, inspected its dialog structure, and dismissed it with Escape. The dialog closed. The tab was closed afterward. Full focus-return timing was not established.
- **Not exercised in this assessment:** API-intercepted live Search/Session/Overview states, a real provider run, account gates, approval effects/expiry, upload/preview/download, full keyboard task journeys, screen-reader speech, 200% zoom, slow network, or large collections. No automated tests or builds were run by this reviewer. Existing test source was consulted only to understand fixture content; test presence is not reported as a passing result.
- The original Session screenshots show `72.0 / 5`. `tests/e2e/session-workspace.spec.ts:26` supplied `score: 72`, whereas `docs/contracts/application-api.yaml:1895` defines native evaluation scores as 1–5. This is an invalid synthetic fixture, not evidence that real API scores are incorrectly converted. The parent assigned a fixture correction/recapture during this review; refreshed evidence must replace these score examples before delivery.

## Nielsen scores

All ten heuristics apply to this Operate surface. Scores are 0–4; none warrants 4 given the evidence gaps.

| Heuristic | Score | Rationale |
| --- | ---: | --- |
| 1. Visibility of system status | 3 | Textual status, current-run region, persistent attention, loading/error regions, and cancellation confirmation exist. Incorrect operation names weaken otherwise clear feedback (A1). |
| 2. Match with the real world | 3 | Job/company/CV names and revisions are familiar and submission semantics are honest. Generic run labels and provider setup copy expose avoidable technical vocabulary. |
| 3. User control and freedom | 3 | Clear filters/chips, hide undo, Back to results, cancel/retry, and dismissible dialogs support recovery. Entry into mobile detail lacks deliberate focus transfer (A5). |
| 4. Consistency and standards | 3 | Shared tokens, navigation grouping, standard controls, and four task tabs create a cohesive interface. Output-language placement is inconsistent between document and answer tasks (A2). |
| 5. Error prevention | 3 | Pair identity, newer-CV warning, redraft confirmation, revision language, and manual-submission guidance reduce costly mistakes. The hidden answer-language dependency can still generate the wrong material (A2). |
| 6. Recognition rather than recall | 3 | Named pair sources, labeled navigation, active chips, and task tabs make most choices visible. Answer language requires knowledge of a different tab; mobile CV context is delayed (A2/A4). |
| 7. Flexibility and efficiency | 3 | Saved searches, persistent filters, desktop comparison, keyboard-capable controls, and a sidebar shortcut support returning users. Small-screen results are unnecessarily distant (A3); full keyboard journeys remain untested. |
| 8. Aesthetic and minimalist design | 3 | Calm palette, readable type, restrained status colors, and broad alignment are coherent. Search setup and the completed-run block consume too much vertical space on mobile. |
| 9. Recognize, diagnose, recover from errors | 2 | Retry and sample-mode paths preserve a useful route forward. Provider errors still instruct end users to set an environment variable, and some resource errors offer only generic recovery. No live failure recovery was exercised. |
| 10. Help and documentation | 2 | Local guidance explains preparation, keyword coverage, revision effects, and manual submission. There is no equally clear contextual explanation of answer output language or less common run labels. |
| **Total** | **28/40** | **Good — address the specific weaknesses below.** |

## Strengths

1. **The main journey is legible.** Work, Materials, and Utilities give the rail a clear hierarchy with only four Work siblings. Overview places attention before ordinary work and keeps actual tracking totals secondary. This avoids an emotionally unhelpful wall of zero metrics.
2. **Source identity earns its space.** Session places named CV and job revisions together, retains prior results, warns about outdated pairs, and gives report and Markdown access. It communicates that the assessment belongs to a particular pair.
3. **Bilingual and evening use feel considered.** Thai line height and control wrapping remain readable; light/dark screenshots preserve the same information and state cues. Text accompanies semantic colors, and generated English content remains English when the UI is Thai, consistent with the product contract.

## Ordered material issues

### A1 — P1: Current-run headings misidentify most operations as document drafting

**Source verified; affected operation states were not exercised live.** `frontend/src/features/chat/RunTimeline.tsx:20` handles only `evaluate_job` and `export_document`; every other operation becomes “Drafting documents” / “ร่างเอกสาร”. Session renders that component globally at `frontend/src/features/chat/SessionPage.tsx:139` and in History at line 184. `apply_prepare`, `apply_submit`, `tailor_cv`, and `draft_follow_up` therefore receive the same heading even when the surrounding task is answering questions, updating an application record, or tailoring a CV.

This is material at the point where a person decides whether to wait, stop, supply information, or review an approval. It also contradicts the approved operation-specific status contract and the Overview's more precise operation labels. Use the existing translated operation map for every supported operation, with neutral fallback wording for unknown values. Keep server status separate from operation name. For `run_resumed` at line 38, explain a restart of the round and carried limits rather than implying checkpoint continuation; ADR-013 explicitly defines that distinction.

### A2 — P2: Application-answer language is a hidden dependency on the Documents tab

**Source verified; no live generation performed.** `frontend/src/features/chat/SessionPage.tsx:82` initializes `outputLanguage` from UI language. The only visible selector is inside the Documents tab at line 178. The Answers tab passes that state to `ApplyCard` at line 182; `frontend/src/features/chat/ApplyCard.tsx:62` sends it as `output_language`. The answer form at lines 115–127 offers no language context or selector.

A Thai-speaking person preparing English employer answers can reasonably enter English questions and receive Thai output. Discovering that the language control lives under another task requires recall and can require another provider run. Put one shared output-language control beside the task tabs or repeat the synchronized selector beside Prepare application. Display the current output language before either task starts. Preserve its independence from UI language.

### A3 — P2: Search hides the first opportunity below a full mobile viewport

**Visually and source verified.** In `/tmp/jsp-ux-search/evidence/search-after-fontloaded-mobile-en-light.png`, the first result begins around y=990; the Thai dark counterpart starts around y=970. At 390×844 there is no opportunity or result count in the first viewport. Tablet has the same issue to a lesser degree. `frontend/src/features/search/SearchPage.tsx:585` stacks four primary fields, line 616 adds More filters, line 626 adds a separate active-filter block, and line 638 inserts a full Saved searches panel before the result count at line 653.

The controls are individually clear, but the mobile first impression is setup work rather than available opportunities. Keep query, location, and work mode visible as approved; move posting age into More filters, reduce the separate filter-summary spacing, and make Saved searches a compact action instead of an otherwise empty bordered panel. A compact result-count/jump-to-results affordance is another small improvement. Preserve all saved-search settings and active-filter removal.

### A4 — P2: Mobile Overview places CV readiness after documents

**Visually and source verified.** `/tmp/jsp-ux-final-regression/core-workspaces-populated--dad1b--material-and-named-sources/overview-populated-mobile.png` shows Attention → Work → Documents → CV. The approved mobile order is Attention → Work → CV → Documents → Activity/counts. In `frontend/src/features/overview/OverviewPage.tsx:79`, the grid places Work and Documents in the first wrapper (Documents starts at line 105), then CV in the second wrapper at line 113; stacking preserves that wrapper order below `xl`.

This makes the chosen CV's identity/readiness harder to check before starting a new evaluation, particularly after six work rows or four documents. Restructure the grid or set responsive ordering so CV follows current work on narrow screens while retaining the useful desktop side column. Keep the named primary CV and its revision intact.

### A5 — P2: Entering mobile job detail removes the focused result without moving focus

**Source verified; keyboard consequence not exercised live.** The result activation handler at `frontend/src/features/search/SearchPage.tsx:511` changes selection only. At line 674, the list is replaced with a detail section and Back button. Unlike the return handler at lines 675–680, entry has no focus transfer or announcement of the new task region.

For keyboard and screen-reader users, the focused result disappears and there is no deliberate focus destination in the replacement view. Depending on browser behavior, reaching detail may require traversing the unchanged filters again. Move focus to a detail heading or Back button after selection, with a clear region name; retain the existing focus-and-scroll return behavior. The desktop comparison should continue leaving focus on the selected row.

## Cognitive load and emotional journey

- **Navigation:** Work has four siblings, Materials two, Utilities one. This passes the four-option grouping check. Account/appearance controls are separate from the job-search task group.
- **Search:** the first decision has four fields, two modes, More filters, chips/clear, and Save search before any opportunity. Each group is comprehensible, but their accumulated vertical weight fails the mobile progressive-disclosure test (A3). Advanced filters correctly remain collapsed and active filters are named.
- **Session:** four task tabs keep unrelated forms out of the first task, a substantial improvement. Completed run status is written twice inside a roughly 155px panel, and “Evaluation report” repeats above and inside the report. These are minor compression opportunities, not additional material defects. Keep active/attention states prominent; completed state can be compact.
- **Overview:** attention is correctly first and counts are quiet. Attention rows show operation and status but omit job/session names (`OverviewPage.tsx:68`), so two concurrent operations of the same type would be indistinguishable before opening them. Add target identity when available in a future bounded pass; avoid invented names for sessionless work.
- **Emotional fit:** source blocks and the manual-submission message build trust. The emotional valley is a stalled task: a generic “drafting” heading or environment-variable instruction makes the person diagnose implementation details at the moment they need reassurance. Recovery should state what happened and name the next UI action.
- **End of task:** a completed assessment retains its report and distinguishes keyword coverage from AI output. A concise next action leading to Prepare documents would improve continuity; current tabs remain a workable path.

## Persona red flags

- **Thai/English job seeker (product persona):** UI language and employer-document language differ in real use. A2 is the concrete risk; user-authored/generated content retaining its language is correct.
- **Sam, keyboard/screen-reader dependent:** standard controls, visible focus tokens, skip link, Radix dialog/tabs, and source labels are good foundations. A5 needs correction; focus return, announcement timing, and a complete approval journey still need live proof before an accessibility claim.
- **Casey, distracted mobile user:** form controls have readable labels and useful size. A3 delays the reward of seeing opportunities, and A4 delays source readiness after interruptions. Draft persistence across reloads/provider failures was not established here.

## Minor observations and boundaries

- `SessionPage.tsx:31–32`, `ApplyCard.tsx:14–15`, and `TailorCard.tsx:12–13` retain provider copy naming `OPENROUTER_API_KEY`. Replace it with plain setup guidance and an actual settings/recovery destination when these error states are next refined. This is source evidence, not a live observed provider error.
- The visible bare job-revision badge “7” is technically labeled for assistive technology but less clear visually than “r7” or “Revision 7”. The adjacent “Job revision” label prevents a material ambiguity.
- The Overview active status badge stretches across its grid column in the populated screenshot. It remains legible but visually resembles a progress bar despite carrying no percentage. A `justify-self-start` badge would better express a discrete state.
- No visual clipping was observed in sampled Thai/English themes. This does not establish numeric contrast ratios, all zoom levels, all long-content states, or full WCAG conformance.
- Several unapproved supporting pages retain older layouts. Their redesign is outside this assessment and must not be folded into this task.

## Screenshot paths reviewed

Search: `/tmp/jsp-ux-search/evidence/search-after-fontloaded-desktop-en-light.png`, `search-after-fontloaded-desktop-th-dark.png`, `search-after-fontloaded-tablet-th-light.png`, `search-after-fontloaded-tablet-en-dark.png`, `search-after-fontloaded-mobile-th-dark.png`, `search-after-fontloaded-mobile-en-light.png`.

Session: `/tmp/jsp-ux-session/evidence/after-desktop-en-light.png`, `after-desktop-th-dark.png`, `after-tablet-th-light.png`, `after-tablet-en-dark.png`, `after-mobile-th-dark.png`, `after-mobile-en-light.png`.

Overview: `/tmp/jsp-ux-final-regression/core-workspaces-overview-shell-reflows-1440-th-light/overview.png`, `core-workspaces-overview-shell-reflows-768-th-dark/overview.png`, `core-workspaces-overview-shell-reflows-390-en-dark/overview.png`, `core-workspaces-populated--dad1b--material-and-named-sources/overview-populated-mobile.png`, `core-workspaces-populated--dad1b--material-and-named-sources/overview-populated-desktop.png`.

Questions skipped: the owner already approved the direction and bounded implementation scope; these findings are concrete improvements within that scope. Final synthesis should combine this independent design assessment with Assessment B only after this report is complete.

## Bounded correction confirmation — 2026-10-16

The original assessment above is retained as the record of the reviewed implementation. Its 28/40 score has not been recalculated. This confirmation checks the correction scope only; no detector was run or read and no exploratory review was repeated.

**Disposition: A1–A5 addressed in the current source. The sole P1 is resolved; no new P0/P1 issue was identified in these corrections.** Source confirmation is distinct from live behavioral proof as recorded below.

| Finding | Disposition | Confirmation evidence |
| --- | --- | --- |
| A1 — operation headings | Resolved, source verified | `RunTimeline.tsx:20` now uses the existing `workspace.operations` map with a neutral unknown-operation fallback. The English and Thai maps include all ten supported operations, including application answers, record-as-applied, CV tailoring, and follow-up drafting. Line 38 describes restarting the round and retaining prior limits. Fresh Session captures show Job evaluation / ประเมินงาน. The other operation states were inspected in source and in the targeted regression definition, not exercised by this reviewer. |
| A2 — answer output language | Resolved, source and visual verified | `SessionPage.tsx:168–171` places one shared Output language control before all task tabs, with explicit label/id association and a statement that it applies to evaluations, documents, and application answers independently of UI language. The same state still reaches `ApplyCard`. The Documents-only selector is removed. Fresh EN/mobile-light and TH/desktop-dark screenshots show the control and helper text without clipping. |
| A3 — mobile Search density | Resolved for the reviewed ordinary-filter state, source and visual verified | Posting age now lives inside More filters, including its active count; the empty saved-search container is reduced to a compact Save this search action. In the refreshed EN/mobile-light screenshot, the first result begins around y=808 rather than y=990, so its title appears in a 390×844 first viewport. More active filters, saved searches, or long text can still legitimately increase page length; no universal above-fold guarantee is made. |
| A4 — Overview reading order | Resolved, source verified | The Overview grid now contains semantic sibling sections in Work → CV → Documents → Activity order, with desktop column/row placement applied separately. This fixes both narrow visual order and DOM reading order. The active status badge is also content-sized rather than bar-shaped. This reviewer did not obtain a new Overview capture during this confirmation. |
| A5 — mobile detail focus | Resolved, source verified | Search now owns a Back-button ref and focuses it in an effect when mobile detail is displayed. Returning still restores the selected result's focus and previous scroll position. Desktop selection does not trigger this effect. No live keyboard run was performed by this reviewer during confirmation. |

Additional correction scope: the parent supplied `tests/e2e/ux-finish.spec.ts`, which directly covers the operation labels, answer-language request payload, mobile result position, Overview order, detail focus, and project-switcher Escape return. The reviewer read these regression definitions. The parent reported **6/6 passing** in `/tmp/jsp-ux-finish-confirm` (3.5 seconds), following **6/6 failures before correction** in `/tmp/jsp-ux-finish-red`. These execution results are explicitly attributed to the parent; this reviewer did not run or independently reproduce them. The broader suite remained in progress when this confirmation was recorded.

`DESIGN.md` and `.impeccable/design.json` now exist and were reviewed in this pass. They describe the implemented indigo/neutral semantic palette, Noto Sans Thai typography, shared primitives, task navigation, responsive workspaces, and source identity rules. The documented light/dark palette agrees with the CSS tokens; the rail width/breakpoint, body/heading typography, focus treatment, task grouping, and revision principles agree with the reviewed source. The sidecar's component examples and narrative preserve that same visual direction. No material source-fidelity discrepancy was identified in this bounded scope. This records extraction review, without treating documentation as visual or accessibility certification.

The refreshed `/tmp/jsp-ux-session/evidence/after-mobile-en-light.png` and `after-desktop-th-dark.png` now use a valid synthetic **3.6 / 5** score. The original 72/5 fixture-evidence issue is resolved in these inspected replacements. `/tmp/jsp-ux-search/evidence/search-after-fontloaded-mobile-en-light.png` is the inspected compact Search replacement.

Residual observations are the original low-severity items: repeated completed-run/report headings, attention rows without target names when multiple operations match, and limited live evidence for provider recovery/accessibility. The shared language control makes the already tall mobile Session header slightly longer, but its explicit scope prevents the wrong-language task and creates no new high-severity usability issue. These observations do not reopen the approved surface scope.

Questions skipped: the correction scope is concrete and already authorized. No additional design decision is required for the dispositions above.
