# All22 pages — review-led redesign, round2

Date: 2026-10-17 (Asia/Bangkok). User requested all22 images rebuilt toward a10/10 quality bar, with useful motion and selective pixel art, and no application code. **These new concepts await owner approval. Independent scoring is complete; no perfect score is claimed.**

## Current references

- [Checklist with the latest selected handoff for each page](CODEX_PAGE_DESIGN_CHECKLIST.md)
- [Round2 image/hash/state snapshot](codex_gen_page/review-snapshot-round2-2026-10-17.json)
- [Prior independent review and per-page improvement criteria](../CODEX_22_PAGE_DESIGN_REVIEW.md)
- [Motion and pixel art contract](CODEX_PIXEL_MOTION_V2.md)

Selected versions are listed below and pinned by image hashes in the snapshot. Focused corrections usev3/v4 where needed; earlier images and all round1 approvals/scores remain historical. New handoffs are separate versioned files, preserving the old functional source contract.

## Selected page index

| # | Page | Version | Handoff | Image |
|---|---|---|---|---|
|01|Overview / Dashboard|v2|[Specification](01_OVERVIEW_DESIGN_V2.md)|[PNG](codex_gen_page/01-overview-desktop-light-v2.png)|
|02|Job Search Workspace|v4|[Specification](02_JOB_SEARCH_DESIGN_V4.md)|[PNG](codex_gen_page/02-job-search-desktop-light-v4.png)|
|03|Evaluation Sessions index|v3|[Specification](03_EVALUATION_SESSIONS_DESIGN_V3.md)|[PNG](codex_gen_page/03-evaluation-sessions-desktop-light-v3.png)|
|04|Evaluation Session Workspace|v4|[Specification](04_EVALUATION_WORKSPACE_DESIGN_V4.md)|[PNG](codex_gen_page/04-evaluation-workspace-desktop-light-v4.png)|
|05|Applications|v2|[Specification](05_APPLICATIONS_DESIGN_V2.md)|[PNG](codex_gen_page/05-applications-list-desktop-light-v2.png)|
|06|Job Detail|v4|[Specification](06_JOB_DETAIL_DESIGN_V4.md)|[PNG](codex_gen_page/06-job-detail-desktop-light-v4.png)|
|07|CV & Experience|v3|[Specification](07_CV_EXPERIENCE_DESIGN_V3.md)|[PNG](codex_gen_page/07-cv-experience-desktop-light-v3.png)|
|08|Documents library|v2|[Specification](08_DOCUMENTS_DESIGN_V2.md)|[PNG](codex_gen_page/08-documents-desktop-light-v2.png)|
|09|Document Detail|v4|[Specification](09_DOCUMENT_DETAIL_DESIGN_V4.md)|[PNG](codex_gen_page/09-document-detail-desktop-light-v4.png)|
|10|Agent Activity / Console|v3|[Specification](10_AGENT_ACTIVITY_DESIGN_V3.md)|[PNG](codex_gen_page/10-agent-activity-desktop-light-v3.png)|
|11|Settings|v2|[Specification](11_SETTINGS_DESIGN_V2.md)|[PNG](codex_gen_page/11-settings-desktop-light-v2.png)|
|12|Projects|v3|[Specification](12_PROJECTS_DESIGN_V3.md)|[PNG](codex_gen_page/12-projects-desktop-light-v3.png)|
|13|New Project|v2|[Specification](13_NEW_PROJECT_DESIGN_V2.md)|[PNG](codex_gen_page/13-new-project-desktop-light-v2.png)|
|14|Public Landing|v3|[Specification](14_LANDING_DESIGN_V3.md)|[PNG](codex_gen_page/14-landing-desktop-light-v3.png)|
|15|Login|v2|[Specification](15_LOGIN_DESIGN_V2.md)|[PNG](codex_gen_page/15-login-desktop-light-v2.png)|
|16|Sign Up|v3|[Specification](16_SIGNUP_DESIGN_V3.md)|[PNG](codex_gen_page/16-signup-desktop-light-v3.png)|
|17|Forgot Password|v2|[Specification](17_FORGOT_PASSWORD_DESIGN_V2.md)|[PNG](codex_gen_page/17-forgot-password-desktop-light-v2.png)|
|18|Reset Password|v2|[Specification](18_RESET_PASSWORD_DESIGN_V2.md)|[PNG](codex_gen_page/18-reset-password-desktop-light-v2.png)|
|19|Verify Email|v2|[Specification](19_VERIFY_EMAIL_DESIGN_V2.md)|[PNG](codex_gen_page/19-verify-email-desktop-light-v2.png)|
|20|Account|v2|[Specification](20_ACCOUNT_DESIGN_V2.md)|[PNG](codex_gen_page/20-account-desktop-light-v2.png)|
|21|OAuth Consent|v4|[Specification](21_OAUTH_CONSENT_DESIGN_V4.md)|[PNG](codex_gen_page/21-oauth-consent-desktop-light-v4.png)|
|22|Digest Unsubscribe|v2|[Specification](22_DIGEST_UNSUBSCRIBE_DESIGN_V2.md)|[PNG](codex_gen_page/22-digest-unsubscribe-desktop-light-v2.png)|

[Open the full image gallery](CODEX_REDESIGN_V2_GALLERY.md) · [New independent review](CODEX_22_PAGE_DESIGN_REVIEW_V2.md)

## Shared visual decisions

Keep shipped `DESIGN.md` semantic indigo/neutral light/dark colors and existing primitives. Standardize text-only Job Search wordmark, thin outline icons, project rail240px, global rail and public Header. Place Theme and Language in consistent labeled controls. Product headings28px, body14–16px, readable Thai line height, flat surfaces and12px corners. Main action is clear within each decision context; avoid duplicate approval actions, decorative KPI tiles, nested cards, gradients and oversized empty illustrations.

Project rail01–10: project context and work/materials/activity navigation; global rail11–13/20–21: All projects, Account, Settings; public Header14–19/22: wordmark and theme/language, with actual public navigation only on Landing. These are presentation groupings, not new route/permission boundaries.

## Changes motivated by the review

Give first-use Overview a real Add CV start; make search CV/estimate context explicit; retain immutable evaluation source pairing; collapse duplicate review entry points into one clear action; give CVs a visible existing file-open/download path; label document sources with real roles rather than opaque session IDs; choose agent destinations by actual run type; label Settings scopes; keep public demo truthful; standardize auth layouts; remove verification navigation promises; make expiry fixtures coherent and destructive consequences source-authoritative; keep consent informed and write scopes explicit; keep unsubscribe possible without login.

Some new screenshots deliberately picture different states than round1 (Overview first-run, Document Detail historical version). Scores must describe those states rather than imply coverage of all variants. Earlier populated images may serve as historical context, never runtime proof.

## Shared implementation boundaries

### Reading order for Claude Code

1. Read this index and the selected versioned handoff for the page; use its selected PNG, not a superseded candidate.
2. Read PRODUCT.md, DESIGN.md, applicable AGENTS/delivery instructions and the actual feature/API source.
3. Use the previous handoff for retained functional detail, but resolve conflicts in favor of actual source contracts and the current corrected handoff. Earlier prototype guesses are not API authority. In particular04 has no new generic chat composer;07 has no extraction-file daily limit;02 adds no comparison tray;21 grants only existing project capabilities.
4. Read the motion contract and the page's motion section. Implement responsive/i18n/theme/state behavior with the existing components and APIs; preserve functionality and security.
5. Run implementation quality gates and show real screenshots/results. Static concepts and expert ratings are not runtime or user-test evidence.

No application code in this round. Active implementation checkout remains `/Users/parksurakiat/.codex/worktrees/ux-redesign-plan/AI-Job-Search-Agent-Platform-dem`, branch `feat/ux-core-workspaces`. Preserve all existing uncommitted changes. New numbered versioned handoffs link the prior full functional contracts; all old tabs, forms, URL state, confirmations, draft recovery and backend capabilities stay required.

Never fabricate backend fields, provider readiness, approval progress, source identities or live connection state. Preserve REST/SSE/session/run semantics, safe Markdown/URLs, project isolation, credential/secret rules and account gates. Source files remain authoritative over generated raster details. Backend contracts stay unchanged. Existing authorized file links can implement View file; do not invent a PDF editor or new preview endpoint.

## Later verification

Use synthetic fixtures with a frozen clock. Build/type check and run relevant existing/new Playwright journeys after code changes; capture real desktop/tablet/mobile, Thai/English and light/dark screenshots. Verify keyboard/focus, status announcements, reduced motion, all applicable loading/empty/error/busy/approval/partial/expired states, and source/API boundaries. Do not disable tests or require real provider credentials for UI validation.

The new independent review must inspect every selected PNG, score honestly using the same rubric, show unresolved issues and distinguish static concept evidence from empirical usability. A10/10 goal is not a guarantee or permission to inflate scores. No browser/build/accessibility/user-test success is implied by these images.

## Final independent review and remaining acceptance

[Assessment A, GPT-6.1 Sol High](CODEX_22_PAGE_DESIGN_REVIEW_V2.md) inspected all22selectedimages. Mean **7.8→8.6/10 (+0.8)**; beauty8.5, new-user ease8.7, layout8.6, trust8.8. No visible P1 remains; six P2 pages02/04/05/06/14/21 have implementation acceptance below. These are expert concept scores, not user-test results, and no10/10 claim is made.

[Assessment B](CODEX_22_PAGE_REVIEW_EVIDENCE_V2.md) independently verified22selected identities/hashes/manifests,198handofflinks,22selected and60total embedded prompts,403sourcebaselinefiles unchanged and clean diffcheck. PNG detector attempt failed and directory empty output does not establish raster/accessibility coverage. No browser, build, animation or user-study evidence is claimed.

[Machine-readable scores and exact image hashes](codex_gen_page/review-scores-round2-2026-10-17.json). The score table is frozen to the selected snapshot; superseded candidates are not the implementation target.

### Mandatory source and UX guardrails for Claude Code

- **02Search:** retain actual Search/Smartmatch modes, filter/paginationURL behavior and chosenCV.latest_revision semantics. CV dropdown is not an unsupported historical revision picker. Show AI uncertainty and source availability honestly.
- **04Evaluation workspace:** a TailorPayload proposal is not a downloadable document. Only render document rows/Open when an actual persisted DocumentView exists; otherwise keep proposal review in the supported TailorCard/approval flow. Do not create files/endpoints to reproduce a raster row. Keep all4tabs, output language and run controls.
- **05Applications:** make existing stage-change action discoverable with a visible labeled control/menu; keep keyboard/touch access and tracking-only semantics. Internal Open uses normal navigation/arrow, not an external-site promise. Reduce secondary contact/location clutter where it competes with stage and next action.
- **06Job Detail:** label Prepare documents according to the actual destination: existing preparation workspace versus new session preparation. Keep exact CV/job pairing, always label score out of5, preserve Add note/Log email and all contact/history forms.
- **14Landing:** How it works explains actual prerequisites, provider availability and CV handling. Demo remains explicitly illustrative/read-only and never promises provider setup, a hiring outcome or automatic submission.
- **21Consent:** show a concise decision summary near Allow/Deny naming actual client, selected project, selected permissions and duration, especially on mobile. Reuse existing capability strings/defaults and keep write scopes explicitly opt-in.

These guardrails supplement the static composition; they are mandatory refinements for implementation, not verified working behavior. First-user/mobile/Thai/dark/keyboard/reduced-motion states require actual prototype and app validation before release.
