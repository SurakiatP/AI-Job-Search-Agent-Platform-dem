# Page-by-page visual design handoff

Updated: 2026-10-17 (Asia/Bangkok).

## Current progress

**Round2: 22 / 22 refreshed images and handoffs ready; 0 remaining. Refreshed images await approval. Round1 approvals01–06 remain historical and do not approve the new versions.**

This is a new design-proposal round, separate from the already implemented frontend redesign. Nothing in this checklist claims the existing application is unfinished. No application code is being changed in this round.

Initial workflow (later expanded by the owner to whole batches on2026-10-17): generate a draft → review with the owner → revise if requested → record approval → hand the approved image and specification to Claude Code. A generated image is not automatically approved or implemented.

## Pages

| # | Page | Route | Image + specification | Owner approval | Claude Code implementation |
|---|---|---|---|---|---|
| 01 | Overview / Dashboard | `/app/projects/:projectId/overview` | **v2 ready** — [handoff](01_OVERVIEW_DESIGN_V2.md) | Awaiting review; prior approval retained in history | No code implementation in this round |
| 02 | Job Search Workspace | `/app/projects/:projectId/search` | **v4 ready** — [handoff](02_JOB_SEARCH_DESIGN_V4.md) | Awaiting review; prior approval retained in history | No code implementation in this round |
| 03 | Evaluation Sessions index | `/app/projects/:projectId/sessions` | **v3 ready** — [handoff](03_EVALUATION_SESSIONS_DESIGN_V3.md) | Awaiting review; prior approval retained in history | No code implementation in this round |
| 04 | Evaluation Session Workspace | `/app/projects/:projectId/sessions/:sessionId` | **v4 ready** — [handoff](04_EVALUATION_WORKSPACE_DESIGN_V4.md) | Awaiting review; prior approval retained in history | No code implementation in this round |
| 05 | Applications | `/app/projects/:projectId/applications` | **v2 ready** — [handoff](05_APPLICATIONS_DESIGN_V2.md) | Awaiting review; prior approval retained in history | No code implementation in this round |
| 06 | Job Detail | `/app/projects/:projectId/jobs/:jobId` | **v4 ready** — [handoff](06_JOB_DETAIL_DESIGN_V4.md) | Awaiting review; prior approval retained in history | No code implementation in this round |
| 07 | CV & Experience | `/app/projects/:projectId/profile` | **v3 ready** — [handoff](07_CV_EXPERIENCE_DESIGN_V3.md) | Awaiting review | No code implementation in this round |
| 08 | Documents library | `/app/projects/:projectId/documents` | **v2 ready** — [handoff](08_DOCUMENTS_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 09 | Document Detail | `/app/projects/:projectId/documents/:documentId` | **v4 ready** — [handoff](09_DOCUMENT_DETAIL_DESIGN_V4.md) | Awaiting review | No code implementation in this round |
| 10 | Agent Activity / Console | `/app/projects/:projectId/console` | **v3 ready** — [handoff](10_AGENT_ACTIVITY_DESIGN_V3.md) | Awaiting review | No code implementation in this round |
| 11 | Settings | `/app/settings` | **v2 ready** — [handoff](11_SETTINGS_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 12 | Projects | `/app/projects` | **v3 ready** — [handoff](12_PROJECTS_DESIGN_V3.md) | Awaiting review | No code implementation in this round |
| 13 | New Project | `/app/projects/new` | **v2 ready** — [handoff](13_NEW_PROJECT_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 14 | Public Landing | `/` | **v3 ready** — [handoff](14_LANDING_DESIGN_V3.md) | Awaiting review | No code implementation in this round |
| 15 | Login | `/login` | **v2 ready** — [handoff](15_LOGIN_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 16 | Sign Up | `/signup` | **v3 ready** — [handoff](16_SIGNUP_DESIGN_V3.md) | Awaiting review | No code implementation in this round |
| 17 | Forgot Password | `/forgot-password` | **v2 ready** — [handoff](17_FORGOT_PASSWORD_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 18 | Reset Password | `/reset-password` | **v2 ready** — [handoff](18_RESET_PASSWORD_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 19 | Verify Email | `/verify-email` | **v2 ready** — [handoff](19_VERIFY_EMAIL_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 20 | Account | `/app/account` | **v2 ready** — [handoff](20_ACCOUNT_DESIGN_V2.md) | Awaiting review | No code implementation in this round |
| 21 | OAuth Consent | `/app/oauth/consent` | **v4 ready** — [handoff](21_OAUTH_CONSENT_DESIGN_V4.md) | Awaiting review | No code implementation in this round |
| 22 | Digest Unsubscribe | `/digest/unsubscribe` | **v2 ready** — [handoff](22_DIGEST_UNSUBSCRIBE_DESIGN_V2.md) | Awaiting review | No code implementation in this round |

## Subviews to cover with their parent page

- Applications: List, Board, closed stages, add-posting form and recovery states.
- Documents: library filters, Trash, restore and permanent-delete distinctions.
- Document Detail: viewed revisions, editor, provenance and promotion safeguards.
- Agent Activity: timeline, approvals, agents and connect views.
- Settings: appearance, gateway, tools, sharing and webhooks; preserve Telegram and project/account scope.
- Session Workspace: its existing task tabs, run history, missing input, approvals and partial results.
- Shared supporting states: 404, auth/project gates, loading, empty, error and success. Redirects are not additional product pages.

The existing verification inventory counts **32 route/tab states**. The main checklist counts **22 content pages**; it does not inflate the total by counting each tab as a page.

## File conventions

- Page handoffs: `docs/01_OVERVIEW_DESIGN.md`, then one numbered Markdown file per page.
- Images: `docs/codex_gen_page/01-overview-desktop-light-v1.png` and versioned siblings.
- Markdown embeds images with repository-relative links so the handoff remains portable.
- Keep earlier image revisions; do not overwrite an approved version.
- Desktop/mobile, language and theme coverage are recorded separately. A written mobile specification does not count as a generated mobile image or browser validation.

## Current page gates

- [x] Overview desktop/light image generated and saved in the project.
- [x] Overview component inventory, behavior, data sources and responsive/state requirements documented.
- [x] Image limitations and canonical copy documented.
- [x] Owner reviews Overview v1.
- [ ] Apply the owner's requested visual changes, if any.
- [ ] Generate additional Overview variants the owner wants (mobile, Thai or dark).
- [x] Owner explicitly approves Overview v1 (2026-10-16).
- [ ] Claude Code implements the approved reference and verifies actual UI behavior.
- [x] Begin Job Search after the owner's direction.
- [x] Job Search desktop/light image and handoff ready.
- [x] Owner reviews and approves Job Search v1 (2026-10-16).
- [x] Evaluation Sessions index v1 image and handoff ready.
- [x] Owner reviews and approves Evaluation Sessions index v1 (2026-10-16).
- [x] Evaluation Session Workspace v1 image and handoff ready.
- [x] Apply owner's source-pair and Agent workflow refinements in Workspace v2.
- [x] Document event-driven motion and reduced-motion behavior.
- [x] Owner reviews and approves Evaluation Session Workspace v2 (2026-10-16).
- [x] Applications List v1 image and List/Board handoff ready.
- [ ] Owner reviews and approves Applications List v1.

## Shared instruction for Claude Code

Read the relevant page handoff and its approval status first. Treat the image as the visual reference, the Markdown as the component/behavior/copy specification, `PRODUCT.md` as product truth and the versioned API contract/source as authority for supported behavior. Do not turn the whole screenshot into an image-based webpage. Build real semantic components using the existing React + Vite stack and preserve all existing capabilities.

The current source is in the attached `feat/ux-core-workspaces` worktree, with uncommitted prior work. The handoff must not be applied blindly to a clean or different checkout. See the page handoff's workspace section before implementation.
