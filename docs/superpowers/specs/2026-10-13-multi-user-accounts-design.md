# Multi-user accounts — design

Status: the owner approved this in chat on 2026-10-13. They answered "as recommended" to Q1–Q20 and approved sections 1–5. This written spec still needs owner review.
Covers TOR FR-U01 (signup and login), FR-U02 (email verification gate), FR-U03 (connected agents page) and FR-U04 (account deletion). It replaces the single-owner loopback launch model.

## Goal

Anyone can sign up with an email and password. Each user sees only their own projects, and through them only their own CVs, sessions, documents, runs, approvals and grants.
A user must verify their email before creating an agent grant or starting an LLM run.
A user can see every agent grant they have issued and revoke it.
Deleting an account removes all of that user's data within 24 hours; TOR allows up to 30 days.

## Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Target | Design for an internet-facing server (Secure cookies, rate limits, no macOS Keychain dependency for auth). Test locally only; deployment is WP1. |
| Q2 | Auth build | Build it in FastAPI. Choose between our own Authorization Server and an IdP later, in FR-P03; `users` is designed to support either. |
| Q3 | Existing data and login | A CLI creates the first user and claims all existing projects. The loopback one-use launch link is removed. |
| Q4 | Isolation and LLM cost | Add `projects.user_id`, so everything under a project follows its owner. One shared LiteLLM gateway with a per-user daily run quota. BYOK (TOR §7 gateway feature) is not exposed to users; LiteLLM virtual keys can add it later. |
| Q5 | Unverified users | They can log in and use the web app. They cannot create grants (API keys or agent consent) or start LLM runs. |
| Q6 | Deletion | Disable at once and revoke everything. A worker then hard-deletes the Postgres rows (cascade) and the MinIO objects, targeting 24 h. No grace period. |
| Q7 | Abuse | Open signup. Postgres-backed rate limits per IP and per email. No CAPTCHA. |
| Q8 | Connected agents | An account-level page lists grants across all the user's projects, with scope, created and expiry dates, and revoke. OAuth clients join it in FR-P03. |
| Q9 | Password reset | An email link, one-use, valid 30 minutes. A reset revokes all sessions. |
| Q10 | Email transport | stdlib `smtplib` configured by env. Mailpit in the dev compose stack. The production provider is chosen in WP1. |
| Q11 | Password hashing | stdlib `hashlib.scrypt`, self-describing hash string. |
| Q12 | Password policy | 10–128 characters, no composition rules, no breach-list check. |
| Q13 | Sessions | Expire after 7 days idle, 30 days at most. Password reset and account deletion revoke all sessions. |
| Q14 | Quota | 30 runs per user per day (Asia/Bangkok day, same as `budget_day_start`), configurable by env. |
| Q15 | Out of scope | Email change, MFA, social login, admin UI (CLI instead), in-app password change (use forgot password). |
| Q16 | Web | New auth pages plus `/app/account`; `/app/*` requires login; the landing start button goes to `/login`. |
| Q17 | Tests | Cross-user isolation over REST, MCP and A2A is the headline test. Fake mailer in tests; Mailpit for manual smoke. |
| Q18 | Queue fairness | Keep the global cap of 2 active projects and add a cap of 1 running run per user. |
| Q19 | Langfuse | Delete nothing there. Spans must carry no email and no user id, enforced by a test. What remains is anonymous, which satisfies U04's "anonymize". |
| Q20 | Not in this phase | Single-origin `/mcp` and `/a2a` (FR-P02/P04) and deployment config. This phase only reads `APP_PUBLIC_ORIGIN` and sets `Secure` cookies under https. |

## Data model

Migration `0022_users`.

### New table `users`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | varchar(254), unique | Stored lower-cased and stripped. A CHECK requires a single `@`, and the service validates the format. |
| `password_hash` | varchar(255) | `scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>` |
| `locale` | varchar(2), CHECK in `th, en` | Language for emails, taken from the UI locale at signup |
| `email_verified_at` | timestamptz, nullable | |
| `disabled_at` | timestamptz, nullable | Set on deletion request or by the CLI |
| `deletion_requested_at` | timestamptz, nullable | Purge worker input |
| `created_at` | timestamptz default now() | |

### New table `user_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK `users.id` ON DELETE CASCADE | |
| `purpose` | varchar, CHECK in `verify_email, reset_password` | |
| `token_hash` | bytea(32), unique | sha256 of the random token; the raw token appears only in the emailed link |
| `expires_at` | timestamptz | verify: 24 h, reset: 30 min |
| `used_at` | timestamptz, nullable | One-use |

Issuing a token of a given purpose marks the user's earlier unused tokens of that purpose as used.

### New table `rate_limit_events`

Columns: `bucket` varchar(40), `key_hash` bytea(32) (sha256 of IP or email), `created_at` timestamptz, with an index on `(bucket, key_hash, created_at)`.
A check counts the rows inside the window and inserts one row if the request is allowed. The purge worker deletes rows older than 24 h.
`ponytail:` this is Postgres counting; move it to Redis once a single instance cannot keep up (ADR-015).

### Changed tables

- **`projects.user_id`:** uuid FK `users.id` ON DELETE CASCADE, nullable, indexed. Every project-scoped table already cascades from `projects`, so deleting a user deletes their data.
  - `ponytail:` the column stays nullable so the migration needs no user. Unclaimed projects match no user and are invisible. Add a `NOT NULL` migration once claiming is done everywhere.
- **`owner_sessions`:** becomes the user session table. Add `user_id` uuid FK `users.id` ON DELETE CASCADE (rows without one are deleted by the migration) and `last_seen_at` timestamptz. The cookie, hash and CSRF scheme stay as they are.
- **`owner_launch_nonces`:** dropped.

### Quota

There is no new table. The service counts `runs` joined to `projects` where `user_id = ?` and `created_at >= budget_day_start(now)`, and refuses if the count is ≥ `USER_DAILY_RUN_QUOTA` (default 30).
The check runs in the same transaction that inserts the run, after locking the user row (`SELECT … FOR UPDATE` on `users`), so concurrent submits cannot both pass.

## Service and API

### `services/accounts.py`

The `Accounts` service owns:
- `signup`, `verify_email`, `resend_verification`, `login`, `logout`
- `forgot_password`, `reset_password`
- `request_deletion` and `purge_due`

Password hashing:
- `hashlib.scrypt` with n=2**17, r=8, p=1, a 16-byte random salt and a 64-byte key.
- `maxmem` is set to allow those parameters.
- Verification uses `hmac.compare_digest`.
- Login against an unknown email still runs one scrypt against a fixed dummy hash, so response time does not reveal which emails exist.

### REST (`/api/v1`)

| Method and path | Auth | Behaviour |
|---|---|---|
| `POST /auth/signup` `{email, password, locale}` | none | Always `202 {"status":"check_email"}`. A new email creates the user and sends a verification mail. An existing email sends a "you already have an account" mail. |
| `POST /auth/verify-email` `{token}` | none | Sets `email_verified_at`. Errors: `400 invalid_token` (unknown, used or expired). |
| `POST /auth/resend-verification` | session | `202`. No-op if already verified. |
| `POST /auth/login` `{email, password}` | none | Sets the session cookie and returns `{user, csrf_token}`. Errors: `401 invalid_credentials` (same for unknown email, wrong password or a disabled user). |
| `POST /auth/logout` | session + CSRF | Revokes the session. |
| `POST /auth/password/forgot` `{email}` | none | Always `202`. Sends a reset mail if the user exists and is not disabled. |
| `POST /auth/password/reset` `{token, password}` | none | Sets the password and revokes all sessions. It does not log the user in. Errors: `400 invalid_token`, `422 weak_password`. |
| `GET /account` | session | `{id, email, locale, email_verified, created_at}` |
| `DELETE /account` `{password, confirm_email}` | session + CSRF | `confirm_email` must equal the account email. Runs `request_deletion` and clears the cookie. Errors: `401 invalid_credentials`, `422 confirmation_mismatch`. |
| `GET /account/agents` | session | Every grant on the user's projects: id, project id and name, label, capabilities, created, expires, revoked. Revoking uses the existing project grant DELETE route. |

The existing `/owner/launch` exchange route is removed.

### Session cookie

- Same name, `HttpOnly`, `SameSite=Strict`.
- `Secure` when `APP_PUBLIC_ORIGIN` is https.
- Expiry is the earlier of `last_seen_at + 7 days` and `created_at + 30 days`.
- Authentication refreshes `last_seen_at` at most once per hour.
- The CSRF scheme does not change.
- The origin and host checks use `APP_PUBLIC_ORIGIN` instead of the loopback check. The default is `http://127.0.0.1:8000`.

### Actor and authorization

- `Actor.kind` becomes `"user" | "grant"`, and `Actor` gains `user_id`. For grants, `user_id` is the project owner.
- `authorize()`:
  - For a user actor, it loads the session (revoked, expired or disabled → `unauthorized`).
  - It then requires `projects.user_id == actor.user_id` for the target project; anything else is `not_found`, so a project's existence is never revealed.
  - Grant handling does not change, since grants are already bound to one project.
- Every list query that does not pass through `authorize()` filters on `Project.user_id`. This covers project lists, job-search caches keyed by project, and any route listing across projects. The implementation plan inventories these from `api/rest.py` and the services.

### Gates

| Gate | Where | Error |
|---|---|---|
| Email verified | Grant creation; run submission by a user actor; run submission by a grant whose owner is unverified | `403 email_unverified` |
| Daily quota | Every run submission (user or grant) | `429 quota_exceeded` with `reset_at` |
| Disabled user | Session auth; grant auth, where the grant owner is disabled | `401 unauthorized` |
| Rate limits | signup: 5 per hour per IP. login: 10 per 15 min per IP and 10 per 15 min per email. resend and forgot: 3 per hour per email. | `429 rate_limited` with `retry_after` |

The client IP is the socket peer address. Trusting proxy headers is part of WP1 deployment.

### Email

`integrations/mailer.py`:
- `Mailer.send(to, subject, text)` uses `smtplib.SMTP` with STARTTLS when `SMTP_STARTTLS=true`.
- Env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`.
- Messages are plain text, Thai or English by `users.locale`.
- Links are built from `APP_PUBLIC_ORIGIN`: `/verify-email?token=…` and `/reset-password?token=…`.
- A send failure is logged without the token and does not fail the request. The user can use resend.
- Tests inject an in-memory fake.
- The dev compose stack adds Mailpit with its SMTP and UI ports bound to loopback only.

### Run queue

`workers/queue.py` claim: besides `MAX_ACTIVE_PROJECTS = 2`, it skips a queued run if its project's user already has a run in `running` state. Queued runs wait their turn.

### Launcher and CLI

- `scripts/run_local.py` no longer issues a launch link. It prints the app URL.
- `scripts/accounts.py`:
  - `create-user --email E [--claim-existing]` prompts for a password, marks the user verified, and optionally sets `user_id` on every project where it is NULL.
  - `disable-user --email E` sets `disabled_at` and revokes the user's sessions and grants.

## Account deletion

`request_deletion`, in one transaction:
1. Set `deletion_requested_at` and `disabled_at`.
2. Revoke all sessions and all grants on the user's projects.
3. Cancel the user's queued and running runs through the existing cancel path.

The purge worker:
- Runs as a step in the existing supervisor loop, every 5 minutes.
- For each user with `deletion_requested_at` set:
  1. Delete every MinIO object listed in `stored_files.storage_key` for the user's projects. A missing object counts as deleted.
  2. Delete the `users` row. Postgres cascades to sessions, tokens, projects and everything under them.
- If any step fails, the user stays pending and is retried next cycle. The step after it never runs early.
- Target: purged within 24 h. An overdue user (older than 24 h) is logged at warning level with no email in the log.

The same email can sign up again after the purge.

Langfuse keeps run spans with only metadata (ids, model, tokens, latency, cost). A test asserts that no span attribute contains the user's email or `user_id`.

## Frontend

Routes:
- `/signup`, `/login`, `/verify-email` (reads `token`, posts it, shows the result), `/forgot-password`, `/reset-password` (reads `token`).
- `/app/account`, with these sections:
  - Email and verification status, plus a resend button.
  - Connected agents: a table with a revoke action and an empty state.
  - Danger zone: delete account, with a dialog that asks for the password and the typed email.

Rules:
- Every `/app/*` route checks `GET /account` on load. On `401` it redirects to `/login?next=…`.
- The landing start button goes to `/login`, which links to `/signup`.
- An unverified user sees a persistent banner with a resend action. Run and grant actions are disabled, with a tooltip explaining why.
- An API `email_unverified` or `quota_exceeded` error shows a localized message.
- All copy is in Thai and English, and the UI follows DESIGN.md.
- The new pages reuse the existing form, card and dialog components.

## Testing

Unit:
- scrypt hash round-trip and parameter parsing.
- Token expiry, one-use, and the rule that a new token supersedes older ones.
- Rate-limit windows.
- Quota day boundary.
- Password length policy.

Integration (real Postgres):
- **Cross-user isolation (headline):**
  - User B's session gets `not_found` on every A-project REST route the plan inventories.
  - B's project list never shows A's projects.
  - A grant on A's project cannot reach B's project through REST, MCP or A2A.
  - `GET /account/agents` shows only the caller's grants.
- Signup → verify → login → logout. Duplicate signup gives the same response, and the fake mailer records the "already have an account" mail. Forgot → reset revokes sessions.
- Gates:
  - `email_unverified` on grant creation and run submission.
  - `quota_exceeded` at run 31.
  - The concurrent-submit quota race (two submits at count 29 → exactly one succeeds).
  - Disabled user rejected on session and grant.
- Queue: a user's second run waits while their first is running, and another user's run proceeds.
- Deletion: sessions and grants are revoked at once, runs are cancelled, and after `purge_due` there are no rows for the user's projects. With MinIO (integration marker), the objects are gone.
- Langfuse: no email or user id in span attributes.

Playwright: signup → verify (fake mail link via the test mock) → login → create project → delete account. Plus the unverified banner and disabled actions.

Existing tests: fixtures that build an owner actor or launch session switch to creating a verified user and session. This is expected to be the largest mechanical part of the work.

## Out of scope

- Email change, MFA, social login, an admin UI, and in-app password change.
- BYOK, breach-list password checks, and CAPTCHA.
- OAuth 2.1 and Client ID Metadata Documents (FR-P03).
- Single-origin `/mcp` and `/a2a` (FR-P02/P04).
- Trusted proxy headers and production SMTP or deployment (WP1).
