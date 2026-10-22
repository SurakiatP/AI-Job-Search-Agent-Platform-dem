# Frontend verification (UI05)

This record separates browser coverage from backend and provider evidence. All UI05 browser data must stay synthetic. `tests/fixtures/application.ts` supplies deterministic projects, sessions, CV preferences, jobs, documents, and localized error fixtures. `full-journey.spec.ts` explicitly intercepts the run submission and returns a synthetic completed run so the browser can verify submitted operation, job revision, selected output language, status rendering, and document navigation. This is a frontend transport fixture; it does not call Hermes, a model provider, the production backend, or the owner's app.

## UI05 result — 2026-10-04

**Scoped browser acceptance: PASS.** `rtk npm run build --prefix frontend` exited 0. `rtk npm test --prefix tests -- e2e/full-journey.spec.ts e2e/accessibility.spec.ts` passed all 7 UI05 tests. The full ordinary Playwright suite, `rtk npm test --prefix tests -- --reporter=line`, exited 0; `--list` reported 35 tests across 8 files, including the OpenRouter Settings regression. The conditional `actual-backend.spec.ts` test was skipped because `JSP_E2E_SESSION_FILE` was not configured; no live backend browser run was claimed.

The UI05 suite covered 10 routes at 320px, 768px, and 1440px. It found no horizontal overflow or running Web Animations API animations. Visual review of synthetic 320px and desktop screenshots in `/tmp/ui05-*.png` found readable Thai wrapping, visible language controls, vertical narrow-screen content, and usable document detail. Keyboard checks passed for opening and dismissing the mobile navigation and returning focus to its trigger. Interface locale changes preserved an unsent chat draft and the English output-language choice; the generated document remained English after switching the interface to Thai.

The profile form now displays the actionable scanned-PDF/OCR guidance for the backend's `scanned_pdf_unsupported` error. The suite also passed synthetic cases for an unavailable owner session, expired approval, unsafe source URL, and partial document. These are browser fixtures only. Existing `workflow.spec.ts` and `workflow-regressions.spec.js` cover synthetic event deduplication, cancellation, interrupted/partial results, and retry behavior in the same full suite.

## Commands

Run from the repository root after the owned product fixes are reported stable:

```sh
rtk npm run build --prefix frontend
rtk npm test --prefix tests
```

The Playwright config binds its own Vite server to `127.0.0.1:4175`; it must not target port 8000. UI05 screenshots are written to `/tmp/ui05-*.png`, outside the repository, and contain synthetic content only. Review at least the 320px and desktop screenshots for Thai line wrapping, page overflow, top-right locale controls, drawer behavior, card stacking, and typography. The test also checks a tablet width and rejects running Web Animations API animations.

## Browser coverage

`full-journey.spec.ts` covers the landing page, project creation, CV text and preferences, a supplied synthetic job, session evaluation submission, completed status, English document detail, partial-document status, browser back, Settings theme selection, and reopening the session. It changes the interface language while a chat draft exists and checks that the selected output language and saved document language remain English. Its fault case injects a synthetic PDF scan rejection and an unsafe `javascript:` source URL. Those responses are Playwright fixtures, not backend-boundary proof.

`accessibility.spec.ts` checks the approved routes at 320px, 768px, and desktop width for horizontal overflow, a visible locale control, a level-one heading, and running animations. It checks minimum Thai reading size and line spacing, opens/closes the mobile drawer with the keyboard, verifies focus is restored, and checks that partial status and document language are exposed in accessible page content. These checks are focused browser assertions, not a full WCAG audit.

## Evidence kept separate

| Boundary | Evidence source | UI05 claim |
|---|---|---|
| Browser navigation, responsive layout, accessible names/focus, locale/theme state | UI05 Playwright tests with synthetic API fixtures | Browser behavior only |
| Native CV parsing, durable database state, real run/session reload and file publication | `tests/e2e/actual-backend.spec.ts` and `backend/tests/integration/test_application_startup.py` | Backend fixture evidence; report the exact executed commands and counts separately |
| Provider/model execution | Owner-configured live smoke through actual Settings and `scripts/smoke_platform.py` | Pending until a real configured-provider smoke completes; synthetic Playwright runs do not count |
| Interrupted execution, expired approval, SSE replay/deduplication, private upload/download grants | Matching backend or browser fault-injection tests | Report each exercised boundary explicitly; UI fixture coverage alone is not evidence of backend enforcement |

Do not copy real credentials, owner CVs, personal data, or screenshots from the owner's app into Playwright fixtures, test artifacts, traces, or this record. Keep failures and skipped live-provider checks explicit in the final UI05 result.
