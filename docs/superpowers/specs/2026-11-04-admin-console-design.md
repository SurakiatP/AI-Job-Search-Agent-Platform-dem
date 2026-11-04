# Admin console

Status: agreed with the owner on 2026-11-04 (grill session). Approved visual: `docs/design/admin-console-mockup.html` (open it in a browser; the floating switcher at the bottom moves between Overview and AI models, the moon toggles dark mode). All numbers in the mockup are mock data.

## Why

The customer asked for an admin page. Operators of a deployment (the owner's team, NECTEC staff) need to see whether the system works, who uses it, what AI costs, and to change the AI model per task without a redeploy, with a benchmark gate so a cheaper model cannot silently lower quality.

## Decisions

### Accounts and access

- D1. Admin accounts are **admin-only**. After login an admin lands on `/admin` and cannot use the job-search workspace (projects, CVs, sessions). A person who also wants to search jobs uses a second, ordinary account.
- D2. Admin flag lives in the database (`users.is_admin`, new migration). `ADMIN_EMAILS` stays as a fallback so existing deployments keep working. `services/accounts.py::is_admin` = DB flag OR env list; still requires verified and not disabled.
- D3. Admin accounts are created by a GitLab file variable `ADMIN_USERS` ("<email> <password>" per line, same shape as `TEST_USERS`) and a manual job `create-admin-users` that runs `scripts/accounts.py create-user --email ... --admin` inside `jobsearch-web`. Created verified, so no email is sent; the email can be any address (it need not be the Gmail sender used for notifications). Passwords are never printed.
- D4. Admins cannot be created or promoted from the UI. The admin list is read-only in the console.
- D5. Admins see **metadata only** (PDPA): email, created, verified, last seen (max `owner_sessions.last_seen_at`), disabled, counts (projects, CVs, runs), run status/operation/timings/model/tokens/cost and failure messages. Never CV text, job text, chats, documents, `input_snapshot`, `result_payload`, application answers, interview content, avatars. No impersonation. Users are shown by email in the Users page only; elsewhere by short id (`u_8f3a…c21`).
- D6. Admin actions on a user: suspend / enable (`disabled_at`), send password-reset link (the existing reset flow emails the user; the admin never sees or sets a password), delete account (existing deletion flow; the admin must type the user's email to confirm). Admins cannot act on admin accounts.
- D7. Every admin action is written to a new append-only `admin_audit_log` (actor, action, target, detail JSON without personal content, created_at). Audit log page lists it with filters.

### Pages (sidebar in this order; same theme, tokens and components as the app; "Admin" badge beside the brand)

1. **Overview** (`/admin`) — interactive dashboard, see mockup.
2. **Users** (`/admin/users`) — table (email, status, verified, created, last seen, runs in range), search, filter by status; row opens a right sheet with metadata and actions (D6).
3. **AI runs** (`/admin/runs`) — table of runs (operation, status, model, user short id, started, duration, tokens, cost); filter by status/operation/model/time; row sheet shows timeline of public run events and the safe failure message; actions: cancel a stuck run, retry a failed run (re-queue as the existing retry path does).
4. **Usage & cost** (`/admin/usage`) — requests, tokens (input/output/cached), cost per request; group by task, model, day, user (short id); USD with a THB rate the admin sets; "≈" whenever a manual price is involved.
5. **AI models** (`/admin/models`) — mockup page (tabs: tasks and models, model library and prices, test history; change sheet with steps choose → test → decide).
6. **System** (`/admin/system`) — health of postgres, object store, LLM gateway, sandbox (24 h history from periodic probes), job ingest history per board, webhook deliveries (pending/dead, resend), the gateway settings moved here from user Settings.
7. **Audit log** (`/admin/audit`).

### Overview (mockup v3)

- Header: range menu, "Customize", "Export CSV" (aggregates only, no personal data).
- Range options: 1 minute, 5, 10, 15, 30 minutes, 1 hour, 4 hours, 10 hours, 7 days, 30 days, 90 days, since start. Buckets: 1m→5 s, 5m→15 s, 10m→30 s, 15m→1 min, 30m→1 min, 1h→2 min, 4h→10 min, 10h→30 min, 7d/30d/90d→1 day, since start→1 week (or 1 month after 2 years). Comparison = the previous window of equal length; "since start" has no comparison (chips hidden). Auto refresh every 30 s, every 10 s for ranges ≤ 15 minutes.
- Red issue strip when any health component is down.
- 4 KPI cards (AI runs, active users, failure rate, AI cost), each with a change chip versus the previous window (owner approved deltas for admin pages only, 2026-11-04). Clicking a card switches the trend chart.
- Widgets: trend (area line + previous window dashed + crosshair tooltip + click a bucket → sheet with breakdown; breakdown strip under the chart), needs attention (failed runs, health down, ingest partial/failed, dead webhooks; inline actions), busiest weekday (last 90 days), share of runs finished within 30 s with a 90% target gauge, top tasks table; optional widgets: admin activity, cost by model. Customize sheet shows/hides widgets; choice saved per admin account (server side, small JSON on the admin user).

### AI models, prices, benchmark

- M1. Model list is always fetched live from OpenRouter (`/api/v1/models`, cached ≤ 10 min). Adding a model registers `openrouter/<id>` in LiteLLM (model API, `store_model_in_db`); the app keeps calling LiteLLM.
- M2. Price per 1M tokens: input, output, cache. Source order: OpenRouter → LiteLLM model info → manual. Manual entry shows the yellow warning; 0 needs the "free" tick; empty cache = input price. Daily refresh updates OpenRouter prices but never overwrites manual ones; when an official price appears for a manual model, show "official price available, use it?".
- M3. Per-task model and effort (tasks = `NATIVE_OPERATIONS` plus `document_ocr`; efforts none/minimal/low/medium/high/default). Stored in the database; the executor reads the active setting at run start (falls back to `AI_MODEL_<TASK>` / `AI_REASONING_<TASK>` env). Takes effect for new runs without redeploy; running runs keep their snapshot.
- M4. Benchmark gate: a model+effort can be applied to a task only after a passing or acknowledged test of that exact pair on that task. Test = `evals/gold` holdout v1, the task's 20 cases, deterministic scorers, run in the background (≈ 3 min), results streamed per case. Compare with the current pair (quality 0–100, p50/p95 latency, cost per call, errors/truncations). Quality drop > 2 points or any error → red verdict, apply needs typed confirmation "ใช้โมเดลนี้". All tests kept in history. Tests use synthetic data only.
- M5. Cost is recorded per LLM call at call time: model, tokens, price used, price source, cost USD. Historic costs never change when prices change. Calls before this feature show "—".

### Out of scope (this round)

AI assistant widget from the reference video, impersonation, promoting admins from the UI, editing user content, mail delivery status, Prometheus integration.

## Acceptance (summary; TC ids live in `docs/contracts` tests)

- Admin login lands on `/admin`; admin hitting a project URL is redirected; a normal user hitting `/admin` or any `/v1/admin/*` gets 403/redirect.
- No admin endpoint returns CV/job/chat/document content (contract test greps response schemas).
- Suspend/enable/reset/delete work, refuse admin targets, and write audit rows.
- Changing a task's model applies to the next run without restart; a failing benchmark blocks apply until typed confirmation.
- Per-call cost rows appear for new LLM calls; manual prices are flagged and shown with "≈".
- Overview range menu has all 12 options and every widget handles empty data.
- Thai and English strings, light and dark, 1440 and 390 px, keyboard reachable, reduced motion respected.
