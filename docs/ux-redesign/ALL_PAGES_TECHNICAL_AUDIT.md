# Independent Assessment B — whole application

Assessment date: 2026-10-16, original whole-app finish snapshot before the parent's subsequent correction batch. Reviewer: `/root/whole_app_audit_b`. Read-only independent review; Assessment A and its report were not read. Scope: all 22 content destinations / 32 route-tab states. Existing approved Collection Index direction, Thai/English, light/dark, and preserved API/security/functionality are the acceptance frame.

## Technical quality

| Dimension | Score / 4 | Evidence and remaining limit |
|---|---:|---|
| Accessibility | 3 | Semantic buttons, labels, written statuses, common focus-visible treatment, Radix dialog focus handling, preserved keyboard regression evidence. Thai mobile sharing and dark board remain legible. No independent screen-reader, 200%/400% zoom, or comprehensive computed-contrast audit in this pass. |
| Performance | 3 | Parent-reported current production `tsc` + Vite PASS; route imports are lazy in `frontend/src/app/router.tsx`. Main/largest JS 454.62 kB raw / 137.36 kB gzip, down from historical 1,078.25 / 313.76; 46 JS chunks. Markdown 157.37 / 46.33, Button 84.61 / 28.95, Search 76.92 / 21.63 kB. No field or throttled CWV measurements; cannot certify LCP/INP/CLS. |
| Theming | 4 | Shared semantic light/dark foreground, surface, status, input and focus tokens in `frontend/src/styles.css`, consistent inspected actual captures, and all 384 language/theme/viewport captures completed. Status has text as well as color. No additional palette or theme defect substantiated in this bounded pass. |
| Responsive design | 3 | Manifest independently parsed: 384 entries, 0 reported whole-page overflow, 32 states × 2 languages × 2 themes × 3 widths (1440/820/390). Actual mobile board stacks columns and long Thai grant labels wrap. Selected mobile settings section can remain outside the visible tab strip. Physical touch/keyboard viewport and smaller-than-390 capture behavior remain uncertified here. |
| Implementation integrity | 3 | Combined diff retains feature-based React/Vite structure, owner gate, API client, project scope and document histories; no backend, contract, manifest or lockfile change in the reviewed changed-path inventory. New settings URL preserves explicit project scope and keys project-scoped components on project changes. One-time token dismissal needs a deliberate UX decision below. |
| **Total** | **16 / 20 — Good** | Synthetic rendered and regression evidence supports the result; this is not production/provider acceptance. |

## Prioritized findings

### [P2] Outside interaction can discard a newly issued one-time token

Evidence: `frontend/src/features/settings/ProjectSharing.tsx:79` opens the Radix dialog using `open={issued !== null}` and `onOpenChange={open => { if (!open) dismiss(); }}`. `dismiss()` clears `issued` and `copied`; the token is deliberately shown only once. Unlike the previous inline section, the new modal adds normal Escape and outside-interaction dismissal paths. `DialogContent` adds no local interception for either. The existing copy and explicit dismiss buttons work; the concern is losing the only visible token through a stray backdrop click before copying it.

Recommendation: keep clear-on-dismiss/unmount and ephemeral storage semantics. Require the explicit dismiss action, or confirm dismissing an uncopied token. Scope any outside/Escape handling to this one-time-token dialog, preserving normal modal behavior elsewhere. This is an owner usability/recovery issue, not evidence of privilege escalation or backend leakage. Revoke/reissue remains possible.

### [P3] The active settings section is offscreen on narrow deep links

Evidence: `/tmp/jsp-ux-all/access/after/settings-sharing-390-th-light.png` renders the sharing content while the horizontal navigation shows Appearance, Gateway and only part of Tools. The current Sharing item is offscreen. `frontend/src/features/settings/SettingsPage.tsx` uses an `overflow-x-auto` list; selected buttons have `aria-current`, but selection/deep-link entry has no visible active-item alignment in the reviewed source.

Recommendation: on section entry, scroll the current navigation item into view, or provide a visible selected-section heading/control adjacent to the strip. Keep deliberate horizontal scrolling for the navigation itself. This does not invalidate the 0 whole-page overflow result.

## Deterministic detector

Executed exactly once in the task worktree:

`rtk proxy /Users/parksurakiat/.agents/skills/impeccable/scripts/impeccable detect --json frontend/src > /tmp/jsp-ux-all/detector.json`

Exit code: **2 (findings)**. Raw JSON persisted at `/tmp/jsp-ux-all/detector.json`. Result: **1 warning, 0 errors**.

| Rule | Count | Location | Interpretation |
|---|---:|---|---|
| `side-tab` / Side-tab accent border | 1 | `frontend/src/app/routes.css:14`, `border-inline-start: 3px solid`, imported by `router.tsx` | Low-value visual-style signal on `.landing-review-note`, not an accessibility or functional failure. The stylesheet import does not itself establish that the selector is rendered. Treat potential inactive-legacy-rule false positive as unconfirmed, not a blocking defect. |

No confirmed functional false positive, and no detector-driven source edits. The original raw scan must be reused; subsequent copy/provenance corrections do not justify rerunning it.

## Browser and visual evidence

Created a fresh private CUA in-app browser tab for `http://127.0.0.1:4182/full-app-evidence/index.html`, observed the actual gallery and its before/after landing renders, then closed the temporary tab. The gallery explicitly labels synthetic fixtures. Attempting a native Playwright label selector for the gallery surface control returned no matches; no repeated attempt or application-error screenshot was substituted.

The CUA API documents `playwright.evaluate` as read-only, and provides no supported arbitrary mutable script-injection API in this session. **No live detector script or user-visible overlay was injected, and no browser-console detector findings are claimed.** No temporary detector server was started.

Used native `view_image` for actual previously captured application renders:

- `/tmp/jsp-ux-all/access/after/application-board-390-th-dark.png`
- `/tmp/jsp-ux-all/access/after/document-detail-1440-en-light.png`
- `/tmp/jsp-ux-all/access/after/settings-sharing-390-th-light.png`
- `/tmp/jsp-ux-all/access/after/search-820-th-dark.png`

Independently parsed `/tmp/jsp-ux-all/access/after/manifest.json`: **384 captures / 0 overflow flags**. These are real rendered synthetic fixture screens, not static mockups. The matrix asserts widths and overflow; it does not independently prove every interaction, text contrast, or hidden modal state.

## Preserved scope and supporting evidence

Reviewed the combined changed-path inventory and targeted source/diffs for routes/providers, shared styles/dialog, document/profile presentation, application forms/history, project sharing, and settings scope. The reviewed changes retain application stage/contact/correspondence/note forms, document revision history and download actions, and grant capability/privacy boundaries. The explicit settings project remains in query parameters across section changes; invalid requested scope does not silently resolve to another project.

Parent-provided supporting verification: full synthetic regression **161 PASS / 1 actual-backend SKIP / 0 FAIL / 0 flaky**; full matrix PASS; production build/typecheck PASS; frontend and browser-test dependency audits **0 known vulnerabilities**. These results were supplied by the parent and were not rerun by B. No dependency changes, backend executions, provider credentials, actual CVs, or production writes were used. Backend/provider and deployment acceptance remain outside this evidence.

Read-only review caused no repository edits. Only this report and the detector output were written. No open-ended hunting or repeated detector run was performed.

Questions skipped: the owner already authorized the full-app review and parent synthesis owns any required product decision.
