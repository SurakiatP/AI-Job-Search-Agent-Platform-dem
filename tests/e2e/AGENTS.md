# tests/e2e

Playwright browser user-journey tests for the frontend. Package manifest and lock are in `tests/` (`tests/package.json`, `tests/package-lock.json`, `tests/playwright.config.ts`); specs are in this directory.
Not here: backend unit/integration tests (`backend/tests/`), application code.

## Layout

- `*.spec.ts` - one spec per area (accessibility, accounts, agent-tools, application-board, cv-tailoring, document-provenance, durable-runs, experience-bank, full-journey, gateway, navigation, oauth-consent, owner-instructions, saved-searches, settings, shell, webhooks, workflow); `workflow-regressions.spec.js`.
- `actual-backend.spec.ts` - runs against a real backend; skipped unless `JSP_E2E_SESSION_FILE` is set by the production-startup fixture (`backend/tests/integration/test_application_startup.py`).
- `../fixtures/application.ts` - synthetic test fixture.
- The synthetic suite loads `frontend/tests/shell.html` from the Vite dev server and intercepts API calls with `page.route`.

## Commands (run from repo root)

- Install: `npm ci --prefix tests`
- Browser: `npm exec --prefix tests -- playwright install --with-deps chromium`
- Run: `npm test --prefix tests` (`playwright test`). Without `JSP_E2E_BASE_URL`, the config starts Vite on `127.0.0.1:4175` itself (via `rtk proxy npm run dev`; needs `npm ci --prefix frontend` first and `rtk` installed).
- Without RTK, as CI does: start `npm run dev --prefix frontend -- --host 127.0.0.1 --port 4175 --strictPort`, then `JSP_E2E_BASE_URL=http://127.0.0.1:4175 npm test --prefix tests`.
- Audit: `npm audit --prefix tests --audit-level=high`. Output dir: `PLAYWRIGHT_OUTPUT_DIR` (default `/tmp/job-search-platform-playwright`).

## Rules

- Test data is synthetic: no real CVs, keys, accounts or personal data.
- A changed user journey or API response shape updates the matching spec in the same change; keep mocked responses consistent with `docs/contracts/application-api.yaml`.
- Dependencies are pinned exactly (`@playwright/test`); update the lock with the manifest and re-run the audit.
