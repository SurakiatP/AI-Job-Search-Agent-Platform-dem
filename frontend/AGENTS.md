# frontend

React 19 + TypeScript + Vite + Tailwind 4 single-page app (react-router, Radix UI, i18next Thai/English). Talks to the backend REST/SSE API.
Not here: backend code, API contract definitions (`docs/contracts/`), browser tests (`tests/e2e/`).

## Layout

- `src/main.tsx` - entry; `src/styles.css` - Tailwind and tokens.
- `src/app/` - `router.tsx`, `providers.tsx` (i18next setup), `theme.ts`, `drafts.tsx`, `routes.css`.
- `src/features/` - one folder per area: `account`, `applications`, `auth`, `chat`, `console`, `digest`, `documents`, `jobs`, `landing`, `oauth`, `overview`, `profile`, `projects`, `search`, `sessions`, `settings`. Keep a feature's code inside its folder.
- `src/components/` - shared UI; `src/components/ui/` - primitives.
- `src/lib/` - `api.ts` (API client), `api-types.ts` (API types), `run-events.ts`, `applicationStages.ts`, `accountGate.ts`, `utils.ts`.
- `src/locales/` - `common.{th,en}.json`, `settings.{th,en}.json`.
- `tests/shell.html`, `tests/shell.tsx` - synthetic shell served by Vite for Playwright.

## Commands (run from repo root)

- Install: `npm ci --prefix frontend` (Node 24.18.0, npm 11.16.0)
- Dev server: `npm run dev --prefix frontend` (Vite)
- Build + typecheck: `npm run build --prefix frontend` (`tsc -b && vite build`)
- Audit: `npm audit --prefix frontend --audit-level=high`
- No unit-test runner is configured; behavior is covered by the Playwright suite in `tests/e2e/` (`npm test --prefix tests`).
- Production serving: `scripts/run_local.py --build-frontend` builds `frontend/dist` and the backend serves it.

## Rules

- All user-visible strings go through i18next locale files with both `th` and `en` keys; no hard-coded UI text. Fallback language is `th`.
- API types live in `src/lib/api-types.ts`; JSON API calls go through `src/lib/api.ts`; direct `fetch` is used only for streams and file bodies (`lib/run-events.ts`, `components/CvPreview.tsx`, `features/chat/RunResults.tsx`) and the unauthenticated `features/landing/SearchTeaser.tsx`.
- Keep types in sync with `docs/contracts/application-api.yaml`; if the API shape changes, change the contract and backend first.
- Provider keys are sent to the backend for Keychain storage and are not kept in browser storage (docs/engineering/local-operation.md).
- Pinned versions: `package.json` has exact versions; update `package-lock.json` with it and re-run the audit.
- UI work follows the shared UI rules in `DESIGN.md` (repo root, when present); see also `docs/superpowers/specs/2026-10-07-ui-redesign-design.md`.
- Build must pass (`tsc -b`) before any change is considered done; add or update a spec in `tests/e2e/` for changed user journeys.

## Docs

- `docs/engineering/frontend-verification.md`, `docs/engineering/DELIVERY.md`, `docs/contracts/application-api.yaml`.
