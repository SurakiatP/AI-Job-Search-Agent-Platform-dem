# Whole-application UX implementation

Date: 2026-10-16
Status: User-authorized autonomous implementation; extends the completed core milestone.

## Outcome and boundaries

Review every content destination and its principal states, make the remaining pages consistent and useful, then verify the owner's ten production-readiness checks. The user explicitly delegates layout, component and theme decisions. Continue in the existing attached `feat/ux-core-workspaces` worktree; preserve all earlier uncommitted work. No commit/push/merge/deployment is requested.

Keep React/Vite/TypeScript/Tailwind/Radix, all current capabilities, routes/query/deep links, REST/SSE contracts, permission/account boundaries, project isolation, immutable revisions, provenance, approval semantics and manual external submission. No backend, infrastructure, dependency or API-contract changes.

## Design decision

Extend the existing Collection Index world. Use restrained indigo actions/selection, a quiet neutral canvas and well-separated reading surfaces in both themes. Preserve self-hosted Noto Sans Thai readability. Choose a fixed page-heading scale and explicit responsive composition, with labels and plain text for status. Replace leftover decorative landing gradients/glass and oversized sticky-tour presentation with product-grounded hierarchy. Do not copy competitor claims, illustrations or interaction behaviours the application does not support.

Native-browser public reference study: Linear's precise hierarchy and compact task framing; Teal's legible stage-based tracking and table vocabulary; Huntr's connection between material and tracking; Godly's public catalogue for visual restraint/variety; shadcn's composable accessible primitives. Mobbin exposed only its public landing/navigation during this inspection; no authenticated pattern-library research is claimed. These are design principles, not a claim that competitor application flows were exercised.

Primary modes: Operate for authenticated/account/setup flows; Persuade for the public landing. Product truth remains in PRODUCT.md; durable shared visual rules remain in DESIGN.md.

## Exclusive ownership

All workers use DELIVERY's `gpt-6-luna/high`; planner and independent reviewers use `gpt-6.1-sol/high`. They share the checkout and must preserve each other's changes. No worker edits another owner's files or commits.

| ID | Owner | Exclusive source | Tests/locales |
| --- | --- | --- | --- |
| MAT | Worker A | `features/profile/**`, `features/documents/**` | `materials-workspace.{en,th}.json`; new `materials-workspace.spec.ts`; existing `experience-bank.spec.ts`, `document-provenance.spec.ts`; optional `fixtures/materials.ts` |
| APP | Worker B | `features/jobs/**`, `features/applications/**` | `applications-workspace.{en,th}.json`; new `applications-workspace.spec.ts`; existing `application-board.spec.ts`; optional `fixtures/applications-workspace.ts` |
| UTIL | Worker C | `features/console/**`, `features/settings/**` | `utilities-workspace.{en,th}.json`, existing settings locales; new `utilities-workspace.spec.ts`; existing `settings.spec.ts`, `webhooks.spec.ts`, `telegram.spec.ts`; optional `fixtures/utilities.ts` |
| MAIN | Parent | Shared components/styles/app/router/providers; projects/sessions index and dialog; landing/auth/account/OAuth/digest; prior core surfaces only when a verified defect requires it | Common locales, shared fixture, all-page coverage/capture spec; other existing compatibility tests; documentation/Hub/evidence |

Parent registers the three namespaces before implementation. Canonical primitive and cross-feature public props remain stable: `JobRemoveMenu`, `NewSessionButton`, Settings Field exports, API client and types. Request shared changes from parent. Dedicated worker fixture modules must be importable without registering tests.

## Page and state inventory

The router has22 content destinations: public landing; login, signup, verify-email, forgot-password, reset-password; digest unsubscribe; account; OAuth consent; projects; new project; project Overview, Search, Profile/CV, Evaluations index, Session, Applications, job detail, Documents, document detail, Agent activity and Settings. Review owner-gate/loading/errors, redirects/legacy aliases, missing resources and unknown routes too.

- **Materials:** first upload/next action, named CVs and immutable revisions, primary selection, preview/upload/parser failure, experience/evidence, preferences; document library/filter/trash/undo and reader/edit/preview/history/export/restore/promotion. Historical provenance follows the viewed revision; CV lookup failure must not block a document. Preserve expected-current-CV guards and polling.
- **Applications:** list-first tracking with Board retained; add-posting drafts/validation, every stage and rollback; job detail with clear selected opportunity, source/evaluation/material and contact/correspondence/notes/history. Stage changes record tracking; they do not submit applications.
- **Utilities:** clear URL-backed activity tabs, runs/approval details, status/expiry, current requester, protocol connections and one-time token lifecycle; grouped settings with visible account versus project scope. Preserve grant capability/expiry defaults. Fix the inline sharing pseudo-dialog using actual focus protection. Do not force-mount agent-token tabs: unmount intentionally clears one-time tokens.
- **Parent surfaces:** useful project continuation and first-use guidance; preserve project-create uncertain recovery; accessible paired-session dialog/index; cohesive auth/account/consent/unsubscribe flows without changing sensitive transitions; honest public landing and clear working CTA/search/tour. Preserve safe `next`, token scrubbing, OAuth redirect protection and unchecked write scopes, destructive confirmations and one-time secret handling.

## Ordered delivery

- [x] Read Hub/AGENTS/DELIVERY, PRODUCT/DESIGN, prior reports, installed Impeccable/new-work/Operate/craft guidance; inspect current Git. Scope extension supersedes the earlier three-surface stop.
- [x] Read-only route/fixture/risk inventory and public reference study. Direction is an explicit implementation call under delegated design authority.
- [x] Register namespaces and freeze ownership/interfaces. Capture representative BEFORE views with synthetic fixtures and loaded fonts before each owned feature changes.
- [x] Implement MAT/APP/UTIL independently while parent handles shared/public/access/setup surfaces. New/changed UI copy uses i18next English/Thai resources. Every touched page needs useful loading/empty/error/pending/success recovery.
- [x] Add journey regressions before changed behaviour, prove the relevant failure then fix. Keep all existing behavioural assertions. Feature-local fixture overrides record actual request method/body and remain within contracts. No provider credentials.
- [x] Build/typecheck each completed bundle and run relevant existing/new regressions. Aggregate integration and full regression after all sources freeze.
- [x] Capture every route and principal tab using meaningful synthetic data: desktop/mobile, Thai/English, light/dark; include tablet and320px reflow checks. Await bundled fonts. Check keyboard/focus, long-content/zoom/reduced motion and key asynchronous states. Record exact evidence and untested limitations.
- [x] One fresh independent design critique and technical audit, fresh detector once for this new whole-app scope; no duplicate scans. Complete unanchored assessment before consuming deterministic findings. Send built screenshots/direction to the shipped finish reviewer. Apply one material correction batch and confirm the findings.
- [x] Shipped Impeccable documenter records approved visual-system changes from final source, updates DESIGN.md and sidecar within its write boundary. Verify source fidelity.
- [x] Re-run final affected checks, archive exact results/screenshot gallery, update local Hub and checklist honestly; stop with full results. No silent production/provider/WCAG certification.

## Acceptance and evidence

The owner's checklist is the acceptance matrix: first-use next action; search/filter/save/evaluate; precise source identity; readable agent/loading/error/approval; mobile action access/no layout overflow; Thai/English+light/dark on all pages; keyboard/focus; passing build and regressions; actual screenshots; backend contracts and functionality preserved. Test-verified behaviour must be distinguished from source review and untested real-service assumptions.

Required command evidence: `npm run build --prefix frontend`; focused and full `npm test --prefix tests` against4177 with synthetic fixtures; frontend/tests `npm audit`; `git diff --check`; zero backend/contracts/manifest/lockfile diff. The pre-existing actual-backend test needs `JSP_E2E_SESSION_FILE`; report its status, never disable tests to pass.

Existing core evidence147PASS/1SKIP is the starting baseline, not verification of this additional work. Before captures describe this uncommitted core implementation, not the original develop build. Preserve previous milestone screenshots and reports as history.

## Final verification — 2026-10-16

TypeScript/Vite build PASS; full Chromium synthetic suite165PASS/1actual-backendSKIP/0FAIL/0FLAKY. 384 final captures across32route/tab states ×TH/EN×light/dark×1440/820/390;58before. Scoped corrections recaptured108,24,12 states. Dual independent A29/40 andB16/20 pre-correction scores; once detector1warning0errors, unusedrule removed. Shipped finish verdict resolvedall3listedfixes; documentation handoff complete. See docs/ux-redesign/ALL_PAGES_IMPLEMENTATION_REPORT.md and all-pages-verification.json. Physical devices, screen-reader/zoom certification, CWV and realbackend/provider acceptance remain untested, not implied by completed evidence tasks. No commit/push/merge.
