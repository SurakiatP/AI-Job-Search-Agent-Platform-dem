# UI Redesign for Client Demo — Design

Status: settled with owner through grilling on 2026-10-07; awaiting written-spec review.
Branch: `feat/ui-redesign` from `feat/platform-foundation` (exception: `origin/develop` holds only the initial README commit).

## Goal

Replace the current frontend look with a polished, working web app for a client demo on 2026-10-08.
Audience: individual job seekers, Thai first with English toggle. Primary viewport: desktop 1440px; mobile must not break.
Frontend only. No backend changes. Backend follow-ups (real job search, per-skill scoring) are a separate discussion.

## Design system (Hallmark)

- Genre: modern-minimal. Landing macrostructure: Workbench (guided tour of the app in use).
- One accent: indigo. Green / amber / red only for fit score and status. Neutral greys otherwise.
- Appearance: Light / Dark / System, shared across all pages, stored as a local preference.
- Fonts: keep Noto Sans Thai (UI and body), Noto Serif Thai allowed for landing headline only, Manrope for English documents. Headings roman, never italic.
- Components: shadcn/ui on the existing Tailwind v4 + Radix stack (add `components.json`, generate only components used).
- Motion: subtle only — hover/focus, page fade, skeleton loading, agent progress, one-time score ring fill. All disabled under `prefers-reduced-motion`.
- Honest copy: no invented metrics, testimonials, user counts or employer logos. Sample data is labelled as sample.
- Tokens: every colour and font goes through named CSS variables (shadcn variable names). `DESIGN.md` is rewritten to describe this system and replaces the teal / no-animation rules.
- Accessibility: text contrast ≥ 4.5:1 in both themes, visible `:focus-visible`, keyboard reachable controls, no information only on hover.

## Navigation

Sidebar (shadcn Sidebar):
- Top: project switcher.
- Project items: Overview (Dashboard) · Evaluate (sessions / chat) · Saved jobs · Job search `Preview` · Documents · CV & preferences.
- Bottom: Settings, appearance toggle, ไทย / EN.

Existing routes stay valid. New routes: `/app/projects/:projectId/overview` (project home now redirects here) and `/app/projects/:projectId/search`.

## Pages

| Page | Level | Content |
|---|---|---|
| Landing `/` | Full polish | Nav (wordmark, ไทย/EN, theme, Start). Hero: short headline + primary CTA + tabbed preview (Evaluate / Documents / Job search) rendered from real components with sample data, no fake browser chrome. Three steps: add CV → evaluate fit → get tailored CV / cover letter. Privacy block: runs on your machine, keys in Keychain, never submits applications for you. Closing CTA, plain footer. |
| Overview (new) | Full polish | CV card (latest revision filename, revision number, upload date, link to CV page). Saved jobs with fit score and saved/applied status. Latest documents. Active runs and pending approvals. Primary action "Evaluate a new job". Empty states that name the next step. Data: existing `/cv`, `/jobs`, `/documents`, `/runs`, `/approvals`. |
| Evaluate (chat) | Full polish | Keep chat flow and SSE. Results as structured cards: fit score ring, collapsible report, agent timeline, approval card. |
| Job detail | Full polish | Score ring, report markdown, job source, application status toggle, related documents. Shows only fields the API returns (single score + report). |
| Document detail | Full polish | Readable document view, revisions, download, request revision. |
| Job search (new) | Full polish | Left filters (title, province, salary, remote) + job cards. 6–8 fictional sample jobs, banner "Sample data — preview". "Evaluate this job" creates a job via `POST /jobs` and starts the real evaluation flow. |
| Projects, New project, CV & preferences, Saved jobs, Documents, Settings | Theme + shell only | New tokens, shell and shadcn primitives; layout unchanged. |

All pages keep: owner session gate, loading / error / empty states, ไทย/EN strings via existing locale files, unsent draft preservation.

## Demo data

- Fictional persona CV as PDF (Thai and English), e.g. frontend developer, 4 years, Bangkok.
- Three fictional job postings as text to paste into Evaluate.
- Stored outside the repository build output; contains no real personal data.
- Owner enters the OpenRouter key in Settings personally and pre-runs 1–2 evaluations as fallback before the demo.

## Delivery

Waves, each implemented by Sonnet 5.5 (high) subagents with exclusive file ownership, reviewed by root:
1. Tokens, theme, shadcn setup, app shell + sidebar, `DESIGN.md` rewrite.
2. Landing and Overview.
3. Evaluate, Job detail, Document detail.
4. Job search preview and theme pass on remaining pages; demo data files.

## Acceptance

- `npm run build --prefix frontend` passes.
- Running app verified in a real browser: every page in Light and Dark, Thai and English, at 1440px and 375px, no horizontal scroll.
- Hero path works against the real backend: create project → upload CV → evaluate job (with provider key) → view job detail → view document.
- Playwright tests broken by the redesign are recorded in the Integration Hub for post-demo repair; not a demo blocker.

## Out of scope

Backend changes, real job-board search, per-skill scores, accounts/login, mobile-first polish, fixing unrelated tests.
