# Whole-app UX implementation

Date: 2026-10-16. Branch: `feat/ux-core-workspaces`. Changes remain uncommitted for visual review.

## Scope and visual direction

The owner approved the initial core workspaces, then explicitly extended the task to the whole application. This report covers that expansion; `IMPLEMENTATION_REPORT.md` and its evidence remain the historical core milestone.

The Collection Index system now extends across public entry, authentication, account/consent, projects, materials, applications, activity and settings. The restrained indigo project rail, neutral work surfaces, shared controls and Noto Sans Thai support the same task hierarchy in light and dark themes. Existing core Overview, Search and Evaluation workspaces remain part of the final verification.

Public reference study covered Linear, Teal, Huntr, Godly and shadcn public pages. Mobbin's public navigation/landing was accessible; its authenticated pattern library was not studied. These informed hierarchy and task organization rather than copied assets or product claims.

## Improvements delivered

- **Entry and onboarding:** a labelled product preview, a compact five-tab keyboard-accessible tour, working search/CTA routes, consistent access forms and safe expired-consent recovery. Projects have a direct title link to their Overview; new-project creation retains draft and uncertain-result recovery.
- **CVs and documents:** named CV/primary/version hierarchy, clear first-upload action, experience evidence and document preferences, a compact document library, revision selection and viewed-revision CV/job provenance. Restore, promotion guards, trash and permanent deletion remain distinct.
- **Applications:** a scanable default List and retained URL-backed Board. Add-posting validation/drafts, stage changes, recruiter contact, correspondence, notes and event history remain functional. Job detail prioritizes source, evaluation, related documents and tracking. Document revisions have their own label.
- **Result identity:** Job Detail resolves the evaluation's immutable session through the existing SessionView endpoint and checks the matching job before naming its CV/version. RunView does not expose a CV revision field; no new field was assumed or added. Failed source lookup preserves the report, explicitly reports unavailable identity and offers retry. It never substitutes the project's newest CV.
- **Activity and configuration:** existing timeline/approval/agent/connect capabilities retained; settings distinguish account and project scope. Narrow deep links reveal the active settings section. One-time project tokens use a focus-managed dialog, ignore accidental outside clicks, and clear on deliberate dismissal/Escape or unmount, with an explicit bilingual warning.
- **Shared foundation:** semantic tokens, readable Thai/English typography, consistent controls, responsive navigation, controlled-dialog focus return and persistent shell navigation during lazy page loading. Route splitting reduces the largest JavaScript chunk from the prior milestone's 1,078 kB to about 456 kB; this is bundle evidence, not a Core Web Vitals claim.

## Modified areas

Application code is confined to the existing frontend: `app/router.tsx`, `app/providers.tsx`, shared shell/UI components/styles; feature folders for landing, auth, projects, profile, documents, jobs/applications, settings and the previously implemented core workspaces. Existing controls are reused; no second component system was introduced. Common/settings translations and feature-scoped Thai/English resources carry UI copy.

Tests add synthetic access/material/application/utility fixtures and journey/capture coverage, alongside compatibility updates to existing regressions. Existing assertions were retained for the changed List/Board interaction and dialog keyboard behavior. No test was disabled to obtain a pass.

## Readiness evidence

Final TypeScript/Vite build: PASS. Full Chromium regression: **165 passed, 1 actual-backend skipped, 0 failed, 0 flaky** (94.3 s). Frontend/test npm audits: zero known vulnerabilities. Final command results, counts and screenshot hashes are recorded in `all-pages-verification.json` and `full-app-evidence/manifest.json`.

| Owner checklist | Evidence and scope |
|---|---|
| 1. New users understand the next action | Project continuation, first-CV upload, empty/recovery guidance, public compact-tour tests; independent visual review. No first-time-user study was conducted. |
| 2. Search, filter, save and start evaluation | Existing search/saved-search/full-journey regressions plus core workspace tests exercise frontend REST request bodies with synthetic responses. |
| 3. CV version and job identity are explicit | Session/document provenance regressions and new Job Detail exact-pair/unavailable-source tests. |
| 4. Agent/loading/error/approval states are understandable | Agent-tools, durable-runs, gateway, workflow, session and utility regressions cover running, waiting, retry, partial and approval behavior. Matrix images are selected populated states, not an exhaustive image of every asynchronous state. |
| 5. Mobile has no page overflow or unusable primary actions | 384 capture assertions at 390/820/1440 px, plus existing 320 px reflow, long-content and keyboard journeys. Board overflow is contained intentionally. Physical devices and virtual keyboards were not tested. |
| 6. Thai/English and Light/Dark | Every one of 32 route/tab states captured in all 12 language/theme/viewport combinations; locale, theme and bundled-font assertions. User-authored content retains its original language. |
| 7. Keyboard and focus | Existing accessibility suite, compact-tour arrows, mobile drawer, evaluation dialog return focus, token trap/Tab/Shift+Tab/Escape and active mobile settings tests. Not a full screen-reader or WCAG certification. |
| 8. Build and regressions | Final TypeScript/Vite build and full Chromium synthetic regression results in verification JSON. The actual-backend test remains skipped without its configured backend session fixture. |
| 9. Actual screenshots inspected | Independent design and technical assessors inspected rendered captures; shipped Impeccable finish review is recorded separately. Gallery contains 58 before and 384 final after captures. |
| 10. Contracts and functionality preserved | No backend, infrastructure, API contract, package manifest or lockfile diff. Regression checks cover existing client behavior; no live provider/backend integration acceptance is claimed. |

## Verification and review history

- Initial aggregate build/typecheck passed. First expanded suite found a mobile drawer race caused by replacing the shell during lazy-route loading; the shell now remains mounted. The focused keyboard test passed five repeated runs.
- The expanded pre-correction suite passed **161 tests**, with **1 actual-backend skip**, zero failures and zero flaky results.
- Independent Impeccable assessments: **29/40 design** and **16/20 technical** for the inspected pre-correction snapshot. These scores were not silently increased after fixes. The detector ran once: one warning for an unused legacy side-accent CSS rule, zero errors. The unused rule was removed; the detector was not rerun.
- A bounded correction batch addressed source identity/document labels, tracking-only auto-approval wording, Thai stage-menu names, one-time token outside dismissal and active mobile settings visibility. New regressions first failed on the old behavior. The relevant correction suites passed, and all 108 affected language/theme/viewport screenshots were recaptured into the final 384-image set.
- During verification an added outside-click assertion was initially placed before the existing initial-focus checks, changing the scenario being tested. It was moved after the unchanged initial/Tab/Shift+Tab checks; the original keyboard assertions remain. Failed intermediate runs are not reported as final acceptance.
- The shipped finish reviewer then found two material issues: obsolete landing claims about Keychain/provider counts and a redundant Document kicker above the title. Both were corrected with regressions and 24 fresh captures. The historical direction seed was independently corroborated from this conversation’s original recorded tool output, without rerolling or inventing evidence.
- The finish reviewer scored all three listed material corrections resolved and returned **ship**, limited to those corrections. Final whole-app regression and documentation handoff are recorded in the accompanying verification JSON and finish review.

## Screenshots

Open `full-app-evidence/index.html` through the local gallery server, or open the PNGs directly. The gallery selects surface, viewport, language and theme and compares available before evidence with the final result.

The 58 before images describe the state immediately before this expansion, which already included the approved core redesign. They are not a fabricated clean-develop baseline. Before captures exist only for desktop English/light and mobile Thai/dark, and not for every newly introduced view. The gallery explicitly identifies missing baselines.

## Known limits and handoff

Synthetic fixtures verify real frontend routes, interactions, rendering and request contracts without provider credentials. They do not prove live job-source availability, real email/webhook/Telegram delivery, OAuth client integration, backend authorization, AI output quality or provider latency. Those require a separately configured integration environment. npm audits cover the frontend/test dependency trees at the recorded time; no backend/image scan was warranted by this frontend-only change.

The shipped Impeccable documenter updated DESIGN.md and .impeccable/design.json from the final source. DESIGN.md remains a saved, pre-existing Git-ignored local design authority; it was not force-added. No deployment, commit, push or merge was performed. The next step is the owner's visual review of the whole-app gallery; feature expansion is outside this handoff.
