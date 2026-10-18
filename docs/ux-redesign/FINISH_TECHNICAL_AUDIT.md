# Independent finish technical audit — Assessment B

Date: 2026-10-16. Target: `frontend/src` (slug `frontend-src`). Scope: shared foundation/shell, Overview, Search and Evaluation Session on `feat/ux-core-workspaces`.

Provenance: independent Assessment B, isolated from Assessment A. No Assessment A report was read. Detector results and findings were withheld until the parent's `A_COMPLETE` message. Application source was read only. Context was already loaded by the parent and was not rerun. The parent owns all fixes and final aggregate acceptance.

## Integrity verdict

**PASS with corrections and explicit verification limits.** The scoped workspaces express the Collection Index direction through project identity, grouped task navigation, named CV/job revisions, separate AI and keyword methods, and explicit manual-submission language. No verified P0/P1 product defect was found in this review. Keyboard recovery requires a small correction. This is a scoped audit, not a complete WCAG, provider, security or release certification.

| Dimension | Score / 4 | Evidence / limit |
| --- | ---: | --- |
| Accessibility | 3 | Semantic navigation, labelled controls, Radix tabs/dialogs and visible focus; switcher loses focus on Escape |
| Performance | 2 | Mostly simple transforms/colour transitions and bounded requests, but every feature remains eagerly imported |
| Theming | 4 | Coherent semantic light/dark tokens; sampled text/button contrasts pass AA |
| Responsive design | 3 | Reviewed desktop/mobile captures reflow; some 36–40px secondary targets and no physical touch/zoom certification |
| Implementation integrity | 3 | API/hooks/contracts retained; a screenshot-matrix assertion is locale-specific and current aggregate report was incomplete |
| **Total** | **15/20 — Good** | Address keyboard recovery; complete aggregate evidence |

## Verified findings

### [P2] Project-switch dialog does not return keyboard focus

Location: `frontend/src/components/ProjectSidebar.tsx:37` and `:40` (dialog ends at `:43`). Category: Accessibility.

The opener is a standalone Button outside the Radix Dialog root. It is neither a DialogTrigger nor connected through an explicit focus-return reference. In a fresh native in-app browser tab at the synthetic shell, opening with Enter and closing with Escape returned `document.activeElement.tagName === 'BODY'` and a null accessible label. This was reproduced twice, including a keyboard opener. A keyboard user loses their place after cancelling project selection and must traverse the page again. Relevant pattern: WAI-ARIA dialog focus return / WCAG 2.4.3 logical focus order.

Recommendation: wrap the opener with Radix Trigger inside the root, or retain its ref and restore it through `onCloseAutoFocus` when closing without navigation. Preserve the existing project management/recovery content. Suggested command: `$impeccable harden`, followed by `$impeccable polish`.

### [P2] Initial route bundle still includes the entire application

Location: `frontend/src/app/router.tsx:6` through the feature imports at `:25`. Category: Performance. **Retained debt**, not introduced by the redesigned composition.

Overview, Session, document editor, console, profile, settings, landing and account routes remain static imports. The current built `frontend/dist/assets/index-FV06JwU1.js` is 1,077,108 bytes. Users opening one simple workspace also download/parse unrelated screens; this matters on mobile connections. No new package was added by this change, and this review did not measure real-device LCP/INP or repeat the parent's build.

Recommendation: follow the already-proposed later performance phase with route-level lazy/Suspense boundaries and accessible loading/focus behavior. Do not broaden this milestone into a dependency rewrite. Suggested command: `$impeccable optimize`, followed by `$impeccable polish`.

### [P2] Session screenshot matrix asserts an English accessible name for Thai

Location at inspection: `tests/e2e/session-workspace.spec.ts:84`. Category: Implementation integrity / acceptance evidence.

The matrix loops over `en` and `th`, but asserts `getByRole('img', { name: 'Fit score: 3.6 / 5' })` unconditionally. `frontend/src/components/FitScore.tsx:13` deliberately supplies Thai text when `locale === 'th'`. The assertion therefore cannot establish Thai capture success. This is a test-evidence defect, not a defect in score localization. The parent had a fresh aggregate run in progress; `/tmp/jsp-ux-reviewed-results.json` was incomplete JSON at both reads in this audit, so no aggregate pass is claimed here.

Recommendation: use the locale's actual accessible label and preserve the score assertion, then include the resulting fresh matrix in the final existing suite run. Suggested command: `$impeccable harden`, followed by `$impeccable polish`.

## Detector — one fresh run only

Exact invocation, from the worktree:

```sh
rtk proxy sh -c '/Users/parksurakiat/.codex/skills/impeccable/scripts/impeccable detect --json frontend/src > /tmp/jsp-ux-finish-b-detector.json 2> /tmp/jsp-ux-finish-b-detector.stderr; result=$?; echo detector_exit=$result; wc -c /tmp/jsp-ux-finish-b-detector.json /tmp/jsp-ux-finish-b-detector.stderr'
```

Result: detector exit **2** (findings), JSON **1,077 bytes**, stderr **0 bytes**. **2 warnings, 0 errors**. No duplicate scan was run.

Saved original: `/tmp/jsp-ux-finish-b-detector.json`. Durable copy: [evidence/finish-b-detector.json](evidence/finish-b-detector.json).

| Rule | Source | Verification / disposition |
| --- | --- | --- |
| `side-tab` | `frontend/src/app/routes.css:14` | `.landing-review-note` legacy selector. Source search found no markup consumer. Inactive finding, not a scoped UI defect |
| `gradient-text` | `frontend/src/features/landing/landing.css:40` | Active `.landing-gradient-text` used in LandingPage headline/metrics and SearchTeaser. Real decorative pattern on public landing, outside the three workspaces; no scoped failure inferred |

Detector warnings are aesthetic heuristics. They do not independently establish accessibility, functionality or security failures.

## Contrast, themes and responsive evidence

The source's sRGB token pairs were calculated with WCAG relative luminance, on card backgrounds. Light foreground 15.67:1, muted foreground 6.18:1, primary 6.29:1, success 7.14:1, warning 6.63:1, destructive 6.63:1. Dark foreground 14.35:1, muted foreground 8.37:1, primary 7.50:1, success 9.21:1, warning 9.70:1, destructive 8.08:1. Primary button foreground/background: light 6.29:1, dark 7.90:1. These are selected opaque pairs, not proof of every composited hover/opacity state.

Representative captures inspected:

- `/tmp/jsp-ux-final-regression/core-workspaces-populated--dad1b--material-and-named-sources/overview-populated-desktop.png`
- `/tmp/jsp-ux-final-regression/core-workspaces-overview-shell-reflows-390-th-dark/overview.png`
- `/tmp/jsp-ux-search/evidence/search-after-fontloaded-desktop-th-light.png`
- `/tmp/jsp-ux-search/evidence/search-after-fontloaded-mobile-en-dark.png`
- `/tmp/jsp-ux-session/evidence/after-desktop-th-light.png`
- `/tmp/jsp-ux-session/evidence/after-mobile-en-dark.png`

They show readable Thai/English, named source context and no clipped essential content in those captures. Mobile tabs reflow; mobile search has a bounded result/detail path. Current source restores result focus/scroll on Back (`SearchPage.tsx:674` onward). Default buttons/inputs and rail destinations use 44px minima; some secondary controls remain 36–40px. This falls short of the skill's preferred 44px target but is not automatically a WCAG AA failure (AA target minimum and spacing exceptions differ).

Freshness limit: the initially inspected Thai Session desktop file displayed **72.0 / 5** from an older invalid synthetic fixture. Current source fixtures use 3.6, and the inspected English dark mobile capture displays **3.6 / 5**. Backend `services/contracts.py:372` constrains the actual score to 1–5. The old capture is stale evidence, not evidence that the backend emits 72 or that current score math is wrong. Refresh/relabel that artifact during the parent's final matrix; do not use it as current approval evidence.

No physical device gesture, 200% browser zoom, manual screen reader, or field Core Web Vitals certification was performed. Reduced motion retains static written states, though the inherited global 1ms clamp remains; no task-blocking motion was observed.

## Behavior, contracts and test integrity

Read the Hub startup records/registry/learnings/protocol, relevant ADR-010 and ADR-013, frontend/e2e instructions, DELIVERY, PRODUCT, REDESIGN_PLAN, the surface contract, current DESIGN.md, changed components and test diffs. DESIGN.md was absent in the recorded startup context; a source-derived DESIGN.md existed and was read by the audit's final source pass. Parent records its review status in the Hub.

The diff for `frontend/src/features/chat/useRun.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/run-events.ts`, `frontend/src/lib/api-types.ts`, backend, versioned contracts and package manifests/locks was empty. No backend/API/dependency change is inferred. Session still creates runs with session identity/idempotency, uses the existing run hook, keeps approval decisions in the existing handler, and renders immutable pair identities. Existing SSE cursor/reconnect/reconciliation logic was not rewritten. This source evidence supports preservation; it does not replace a real backend/provider run.

Session task panels use forceMount plus hidden styling, preserving in-page form drafts when switching tabs. Application preparation retains evidence, parked/needs-input and approval semantics. Applied copy now explicitly describes recording an application that the user submits. Overview independently guards resource loading/errors, distinguishes needs_input/waiting_approval and maps sessionless runs to console. Named primary CV selection replaces the unrelated highest-revision shortcut. New project creates one project, removes the unsupported goal/premature unpaired session POST and offers uncertain-write recovery.

Reviewed test changes predominantly adapt selectors to grouped navigation and task tabs, replace obsolete submit wording and remove the unsupported goal input. Original API payload/disabled-state/history assertions remain. `actual-backend.spec.ts` loses only the removed goal fill, not its persistence/reload assertions. Workflow regressions now honor JSP_E2E_BASE_URL and retain behavior checks. Webhook overflow assertion is retained with added diagnostics. Existing test changes were not broadly disabled or replaced with screenshot-only assertions. New workspace specs add explicit source, state, focus/back, locale/theme and responsive checks. Positional tab selectors in some older tests are more brittle than role/name selectors but do not remove their behavior coverage.

No independent full suite or build rerun was started: the parent's aggregate was already running and no duplicate long-lived server was created. Parent-reported earlier results (including Session29/29) are contextual, not independently re-executed acceptance here. Final suite outcome must be supplied by the parent after the capture assertion is corrected.

## Browser run notes / cleanup

- Created a **new** native in-app-browser tab at `http://127.0.0.1:4177/tests/shell.html`; no real backend or private data.
- Browser APIs advertise evaluate as **read only**. Mutable title/script preflight is unsupported; no forbidden mutation was attempted.
- Fallback signal: CLI detector plus source triage, native shell screenshot/keyboard check and existing synthetic route captures.
- No live-server started, no `[Human]` overlay injected, no console overlay findings or user-visible overlay claimed. Browser was kept hidden.
- Audit tab was explicitly closed after keyboard focus evidence. No viewport override was set. Existing Vite server was owned by parent and left alone.
- Ignore list `.impeccable/critique/ignore.md` absent. No source edits, installation, commit, push or merge. JSON retained as evidence; empty stderr retained in `/tmp`.

Questions skipped: this is the authorized independent finish audit handoff; the parent owns the combined critique and review conversation.


## Bounded correction confirmation — 2026-10-16

The parent requested one bounded source confirmation after its fix batch. The exact current `git diff -- frontend/src/components/ProjectSidebar.tsx tests/e2e/session-workspace.spec.ts tests/e2e/ux-finish.spec.ts` was checked first, followed by targeted reads of the two test files (new/untracked files do not appear in ordinary git diff). No detector rerun, application source edit, new browser exploration or test-suite rerun was performed by Assessment B.

- **Switcher focus finding: corrected in source.** `ProjectSidebar.tsx` now retains a `switcherTrigger` button ref and uses DialogContent `onCloseAutoFocus` to prevent the default and restore focus. `ux-finish.spec.ts` explicitly opens the switcher with Enter, closes with Escape and asserts the original trigger is focused. This directly covers the originally reproduced failure. The parent reports the six new finish regressions failed before its batch and now pass 6/6; that execution is parent evidence, while this confirmation independently checks the source and assertion.
- **Session capture assertion: corrected in source.** The matrix now chooses `คะแนนความเหมาะสม: 3.6 / 5` for Thai and `Fit score: 3.6 / 5` for English. Its fixture score remains 3.6 and the capture helper loads/checks Noto Sans Thai before screenshots. The original incorrect fixed-English assertion is resolved. The parent reports focused Session 9/9 plus refreshed matrix evidence; final aggregate outcome is recorded by the parent.
- **Retained performance debt remains open.** No route-splitting change was requested or confirmed. The eager-route finding and its original byte measurement remain valid as recorded.

**The original audit score remains 15/20**, preserving the pre-correction assessment rather than retroactively changing its evidence. The two scoped corrective findings above are closed by source confirmation with parent-owned execution evidence. The initial stale 72/5 screenshot caveat remains historical; refreshed acceptance captures should be used for the milestone. Parent-reported additional finish coverage includes Search focus enter/back, output-language POST, four operation labels, Overview order and first mobile result. These were read as bounded regression assertions; no additional product finding is inferred.

The final whole-suite run at `/tmp/jsp-ux-accepted-results.json` was still parent-owned and running when this confirmation was requested. This addendum makes no aggregate result claim; the parent will record that outcome.
