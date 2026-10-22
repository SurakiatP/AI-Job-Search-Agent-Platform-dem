# Saved-search digests (TOR FR-J05) — design

Status: the design was owner-approved on 2026-10-14. The work is on branch `feat/saved-search-digests`, cut from `origin/develop` (62d3462).

## Goal

TOR FR-J05: "Saved search + digest notifications via email/Telegram/push (existing)". A job seeker saves the current job-search filters and gets a scheduled email listing only the matching jobs they have not been sent before. They can manage saved searches in the Search page and unsubscribe from a digest with one click. All of this can be tested locally through Mailpit.

**Scope note (owner-acknowledged):** this delivers the email channel only, so FR-J05 stays partly open.
- Push will reuse the FR-P06 webhook mechanism (HMAC signing, retry, dead-letter).
- Telegram needs an owner-created bot token and is a separate follow-up.

The design keeps the channel step isolated, so adding a channel later does not change the scheduler.

## Constraints

- No outbound channel except email to the account's own verified address. TOR §1 forbids email out of the platform on the user's behalf; a digest goes to the user, never to a third party.
- Isolation: every owner route authorizes through `authorize()`. The OpenAPI-wide cross-user test covers new routes.
- Saved searches are owner-only. Agents (grants) cannot list, create or trigger them, because a saved search causes email to arrive in the user's inbox.
- Job data comes live from the freehire public API (`services/job_sources.py`), as today. Job payloads are not stored. Only seen slugs are stored.
- No new dependencies.

## Decisions (grill round 1, all as recommended)

1. **Channel:** email only for now (see the scope note above).
2. **Ownership:** a saved search belongs to a project. Mail goes to the project owner's account email, in the account locale.
3. **Filters:** the same filter set as Search and Smart Match, validated by the same rules as `MatchRunRequest`:
   - `q`, `cities`, `work_mode`, `category`
   - `seniority`, `employment_type`, `company_type`, `skills`
   - `posting_language`, `salary_min`

   Each saved search has a name, unique per project. A project can have at most 10.
4. **Frequency:** `daily` or `weekly`, chosen per saved search. Delivery is at 08:00 Asia/Bangkok; weekly digests go out on Monday.
5. **New jobs:** each digest searches postings from the last 7 days. It drops slugs already sent for that saved search and lists up to 20. Seen slugs older than 90 days are pruned.
6. **Email content:** plain text.
   - Each job shows title, company, cities, posting age, a stale flag and the source link.
   - The footer links to the app's Search page with the filters applied, plus a one-click unsubscribe link.
   - If there are no new jobs, no email is sent.
7. **Unsubscribe:** the email carries a random per-saved-search token.
   - Opening `/digest/unsubscribe?token=…` and confirming disables that one digest without logging in.
   - The token can do nothing else.
   - The app also has an on/off switch.
8. **Delivery gates:** a digest is sent only when all of these hold:
   - the user's email is verified
   - the account is not disabled
   - the project's `notifications_enabled` is on
   - the saved search's `digest_enabled` is on
9. **Agents:** no access.
10. **UI:**
    - Search gets a "Save this search" button (name and frequency) and a "Saved searches" panel.
    - The panel can apply a saved search's filters, toggle email, change frequency, delete, and "Send a preview now".
    - A preview sends the email immediately and does not record seen slugs.

Approach A was chosen: two tables, with the existing supervisor housekeeping loop sending due digests. Two alternatives were rejected:
- B, an in-process scheduler library: a new dependency, and it loses state on restart.
- C, an external cron: needs per-host setup and is hard to test.

## Data model — migration `0024_saved_searches`

### `saved_searches`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid not null | FK → `projects.id` `ON DELETE CASCADE` |
| `name` | varchar(80) not null | trimmed, 1–80; `UNIQUE (project_id, name)` |
| `filters` | jsonb not null | a `SavedSearchFilters` dump (below) |
| `frequency` | varchar(8) not null | CHECK in (`daily`, `weekly`) |
| `digest_enabled` | boolean not null default true | |
| `unsubscribe_token_hash` | bytea not null unique | sha256 of a random 32-byte urlsafe token |
| `next_run_at` | timestamptz not null | next 08:00 Bangkok slot |
| `last_sent_at` | timestamptz | |
| `created_at` | timestamptz not null default now() | |

- Index on `(next_run_at)` where `digest_enabled`.
- The 10-per-project cap is enforced in the service under a project row lock (`SELECT … FOR UPDATE` on `projects`).

### `saved_search_seen`

| column | type | notes |
|---|---|---|
| `saved_search_id` | uuid | FK → `saved_searches.id` `ON DELETE CASCADE`; PK part |
| `slug` | varchar(200) | PK part |
| `seen_at` | timestamptz not null default now() | |

### Unsubscribe token

The token is stored only as a hash and the plaintext is never logged. It is created with the saved search. Each email carries a link rebuilt from a fresh token.

Ruling: we use a random token with a stored hash instead of an HMAC secret. There is no server secret to provision or rotate. If the row is deleted, the token is dead.

To keep tokens out of plaintext storage while still putting a link in every email, the token rotates whenever an email is sent:
- each digest or preview sends a new token
- the stored hash is updated in the same transaction

Clicking an older email's link after a rotation therefore shows "link expired; manage digests in the app". This is acceptable because the in-app switch always works.

## Core service — `services/saved_searches.py`

- **DTOs** (in `services/contracts.py`):
  - `SavedSearchFilters`: the filter fields of `MatchRunRequest` without `cv_revision_id`, `pool`, `offset` or `posted_within_days`.
  - `SavedSearchCreate {name, filters, frequency}`
  - `SavedSearchUpdate {name?, frequency?, digest_enabled?}`
  - `SavedSearchView {id, name, filters, frequency, digest_enabled, next_run_at, last_sent_at, created_at}`
  - `DigestStatusView {email_verified, notifications_enabled}`, embedded in the list response as `{items, status}`.
  - Factor the shared filter fields so `MatchRunRequest` and `SavedSearchFilters` do not duplicate the field rules. `MatchRunRequest` subclasses or composes `SavedSearchFilters`.
- **`next_slot(now, frequency) -> datetime`**: the next 08:00 Asia/Bangkok strictly after `now`. For weekly, the next Monday 08:00. Returned in UTC.
- **Owner CRUD:** `list`, `create`, `update` and `delete`.
  - `create` checks the 10 cap under the project lock and sets `next_run_at = next_slot(now)`.
  - Changing `frequency` recomputes `next_run_at`.
- **`collect(db, saved_search, *, search=job_sources.search_jobs) -> list[dict]`**:
  - Calls the search with the stored filters plus `posted_within_days=7`, `limit=20`, `offset=0`.
  - Drops items whose slug is in `saved_search_seen` for this saved search.
  - Returns up to 20 items in source order.
- **`run_due(now) -> int`** (async; the blocking parts run in `asyncio.to_thread`):
  1. Select up to 20 due rows. The query is `next_run_at <= now AND digest_enabled`, ordered by `next_run_at`, `FOR UPDATE SKIP LOCKED`, and joined to `projects` and `users`.
  2. Check the gates. If any gate fails, set `next_run_at` to the next slot and send nothing.
  3. Run `collect`. If it raises `ServiceError` (source down), leave `next_run_at` unchanged so the next loop tick retries, and log `digest_source_failed`.
  4. If there are items, rotate the token, render and send the mail. If the mailer raises, roll back that row (no seen rows, no `last_sent_at`) and log `digest_send_failed`. On success, insert the seen slugs, set `last_sent_at = now`, and set `next_run_at` to the next slot.
  5. If there are no items, set `next_run_at` to the next slot.

  Each saved search is processed in its own transaction, so one failure does not block the others.
- **`preview(actor, project_id, saved_search_id)`**:
  - Owner only, with a rate limit of bucket `digest_preview`, 5 per hour per user.
  - Collects without excluding seen slugs and sends the mail.
  - Records no seen slugs and does not touch `next_run_at`.
  - With zero items it still sends a short "no new jobs right now" mail, so the preview always shows something.
- **`unsubscribe(token) -> bool`**: hash lookup, then set `digest_enabled = false`. Returns false for an unknown token. Rate-limited per IP with bucket `digest_unsubscribe_ip`, 30 per hour.
- **`prune_seen(now)`**: deletes rows with `seen_at < now - 90 days`.

**Mail.** Templates live next to the account mail templates and are keyed by locale (`th`/`en`).
- Subject: `งานใหม่ {n} ตำแหน่ง: {name}` / `{n} new jobs: {name}`.
- The body lists the items, then the app link `{public_origin}/app/projects/{project_id}/search?{filters as query}`, then the unsubscribe link `{public_origin}/digest/unsubscribe?token={token}`.
- The mail goes through the existing `Accounts`-style mailer (`SmtpMailer | MemoryMailer | None`). With no mailer, `run_due` logs `mail_disabled` and treats the run like a send failure, so nothing is recorded.

**Scheduling.** The `WorkerSupervisor` housekeeping step (every `purge_interval`, 300 s) calls `saved_searches.run_due(now)` and `prune_seen(now)`. They run after the account purge, with the same "housekeeping never stops dispatch" error guard. `main.py` wires them in.

## REST

All routes are under `/api/v1` and listed in `docs/contracts/application-api.yaml`.

- `GET /projects/{project_id}/saved-searches` (owner) returns `{items: SavedSearchView[], status: DigestStatusView}`.
- `POST /projects/{project_id}/saved-searches` (owner write) returns 201 `SavedSearchView`.
  - 409 `saved_search_limit` when the project already has 10.
  - 409 `saved_search_name_taken` when the name is taken.
- `PATCH /projects/{project_id}/saved-searches/{saved_search_id}` (owner write) returns `SavedSearchView`.
- `DELETE /projects/{project_id}/saved-searches/{saved_search_id}` (owner write) returns 204.
- `POST /projects/{project_id}/saved-searches/{saved_search_id}/preview` (owner write) returns 202 `{status: "sent"}`.
  - 409 `email_not_verified` when unverified.
  - 503 `mail_unavailable` when no mailer is configured or sending fails.
  - 502 `job_source_unavailable` from the existing error when freehire is down.
  - 429 when rate-limited.
- `POST /digest/unsubscribe` (public, no session; body `{token}`) returns 204 on success, or 404 `invalid_token` for an unknown token. It needs a same-origin `Origin` header like other public auth routes and no CSRF token.

Grants hitting any of these get 401/403 through the existing owner dependencies.

## UI

- **Search page, "Save this search" button:**
  - Enabled when any filter or `q` is set.
  - Opens a small dialog with a name field (prefilled from `q`, or the category or city) and frequency radios: daily (default) or weekly.
  - Saving shows a confirmation.
- **Search page, "Saved searches" panel** (collapsible, above the results, hidden when empty). Each row has:
  - the name as a button that applies the filters to the URL
  - frequency, as a select
  - an email on/off switch
  - "Send preview now"
  - delete, with a confirm dialog
  - a note "Next digest: {date 08:00}" when enabled
- **Gate banner** in the panel:
  - When the email is unverified: "Verify your email to receive digests" (reusing the verify flow).
  - When project notifications are off: "Notifications are off for this project", linking to project settings.
- **Public page `/digest/unsubscribe`:**
  - Shows a "Stop this digest?" confirm button.
  - On success: "You will no longer get this digest. You can turn it back on in the app."
  - On an invalid or expired token: "This link has expired. Manage digests in the app." with a link to `/login`.
- All copy is in Thai and English. The design follows the last tracked `DESIGN.md` (`eb9bace^`): indigo accent, shadcn primitives, 40 px targets, and no overflow at 320 px.

## Errors

- `not_found`: wrong project, another user's saved search, or a foreign id.
- `forbidden`: a grant on an owner route.
- `validation_error` (422): bad filters, name length, or frequency.
- `saved_search_limit`, `saved_search_name_taken` (409).
- `email_not_verified` (409, preview only).
- `mail_unavailable` (503), `job_source_unavailable` (existing), `rate_limited` (429).
- `invalid_token` (404, unsubscribe).

## Testing

Backend (Postgres; the job search is faked through the `search=` parameter, mail goes to `MemoryMailer`, and the clock is passed explicitly):
- `next_slot`:
  - daily before and after 08:00 Bangkok
  - weekly from mid-week, from Monday 07:59, and from Monday 08:00
  - UTC conversion
- `run_due` sends only unseen slugs. A second run with the same source items sends nothing and still advances `next_run_at`.
- The gates each prevent the send and still advance `next_run_at`:
  - unverified email
  - disabled account
  - `notifications_enabled` false
  - `digest_enabled` false (this row is not selected at all)
- A source failure means no mail, no seen rows, and `next_run_at` unchanged. A mailer failure means no seen rows, no `last_sent_at`, and `next_run_at` unchanged.
- Two concurrent `run_due` calls send each digest once (`SKIP LOCKED`).
- The 10 cap, a duplicate name, and filters that fail validation.
- Unsubscribe:
  - a valid token disables the digest
  - an unknown token gives 404
  - after a send, the previous token is invalid
- Preview sends mail, records nothing, and is rate-limited at the 6th call within the hour.
- Project deletion and the account purge cascade-delete saved searches and seen rows.
- The cross-user OpenAPI sweep covers the new routes. A grant gets 401/403 on them.
- The supervisor housekeeping step calls `run_due`, and an exception inside it does not stop dispatch.

Playwright (synthetic API fixture):
- Save a search from filters, see it in the panel, apply it (the URL gets its filters), switch frequency, toggle email off and on, send a preview (success message), and delete it.
- The gate banners for an unverified account and for notifications off.
- The unsubscribe page: success, and an invalid token.
- At 320 px in Thai there is no horizontal overflow on Search with the panel open, nor on the unsubscribe page.

Manual: with Mailpit, create a saved search and press "Send preview now"; the email appears at http://127.0.0.1:58025.

## Out of scope

- Telegram, and push (with FR-P06).
- A user-chosen send time.
- HTML email.
- Agent access to saved searches.
- Cross-project saved searches.
