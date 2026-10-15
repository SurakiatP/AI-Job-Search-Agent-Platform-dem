# Telegram channel for saved-search digests (TOR FR-J05) — design

Status: design approved in chat by the owner on 2026-10-15 ("ตามที่คุณแนะนำ"); written spec awaiting owner review.
Branch: `feat/telegram-digest` from `origin/develop` (d6d6ad7).

## Goal

FR-J05 asks for digests by email/Telegram/push. Email and push are done. A user links their Telegram account once; each saved search then has a "Telegram" switch that sends the same digest to that chat. Without a bot token the feature is off.

## Decisions

| # | Decision |
|---|---|
| T1 | Linking: Settings → "Connect Telegram" returns `https://t.me/<bot>?start=<code>`. The code is single-use, 10 minutes, stored hashed. When the bot receives `/start <code>` from a private chat, that `chat_id` is bound to the account. |
| T2 | The bot token is the private-dir file `telegram-bot-token` (read like other secrets, honouring `CORE02_SECRETS_GROUP_READ`). No file → feature disabled; routes return 404 `telegram_disabled`, UI hides it. The token is never logged or returned. |
| T3 | Receiving: Bot API `getUpdates` with `timeout=0`, once per housekeeping tick in the existing worker supervisor. No webhook, no public endpoint, no new dependency (httpx with `trust_env=False`, fixed host `api.telegram.org`, total deadline, bounded body). The offset is kept in memory; Telegram redelivers after a restart and code redemption is idempotent because a code works once. |
| T4 | One link per account (`telegram_links`, `user_id` unique, cascade delete — covers FR-U04 account deletion). `saved_searches.telegram_enabled` (bool, default false). Enabling needs a link, else 409 `telegram_not_linked`. |
| T5 | Delivery reuses the saved-search run: same items, same text as the email body (no unsubscribe link, includes app link), sent with `sendMessage` (plain text, link previews off). Items are marked seen when at least one enabled channel delivered; a failed send keeps the existing retry/backoff. HTTP 403 or 400 "chat not found" from Telegram unlinks the account and clears `telegram_enabled` on its searches. |
| T6 | Only `/start <code>` is handled. Messages from unlinked chats, groups, other commands and malformed codes get no reply and no state change (a valid `/start` gets one confirmation message). |
| T7 | Owner-only, like saved searches: agents (grants) cannot see or change links. |

## API (also in `docs/contracts/application-api.yaml`)

- `GET /account/telegram` → `{enabled, linked, bot_username}` (`linked_at` when linked).
- `POST /account/telegram/link` → `{url, expires_at}`; replaces any pending code. Rate-limited like other account actions.
- `DELETE /account/telegram` → 204; unlinks and clears `telegram_enabled` everywhere.
- Saved search create/update/view gain `telegram_enabled`.

## Data

Migration `0030_telegram`: `telegram_links(user_id PK FK users CASCADE, chat_id BIGINT NULL unique, code_hash BYTEA NULL unique, code_expires_at TIMESTAMPTZ NULL, linked_at TIMESTAMPTZ NULL)`; `saved_searches.telegram_enabled BOOLEAN NOT NULL DEFAULT false`.

## Code layout

- `integrations/telegram.py`: token loading, `getMe` (cached bot username), `get_updates`, `send_message`, error classification. Transport injectable for tests.
- `services/telegram.py`: link/unlink/status, code issue and redeem, `poll()` (called from housekeeping), `deliver(...)` used by `saved_searches._run_one`.
- `saved_searches.py`: add the channel next to email/push; `api/accounts.py` routes; models, schemas, contract.
- Frontend: Settings card (connect, status, disconnect) and a Telegram switch on saved searches; th/en strings; follow DESIGN rules already used by the push switch.

## Testing

Fake transport, no network. Cover: code single use and expiry; foreign chat ignored; link replaced; cross-user isolation (OpenAPI-wide test stays green); disabled without token; delivery success marks seen; transient failure retries; 403 unlinks and clears switches; account deletion removes the link; token never appears in logs. Frontend: component tests for connect/disconnect and the switch.

## Out of scope

Group chats, commands other than `/start`, inline buttons, webhook mode, per-search chats, two-way chat with the agent.

## Execution (token-saving)

Two tasks, no separate plan file: T-A backend (everything above except UI), T-B frontend. Sonnet implements and one Sonnet reviewer checks each; one final review of the branch.
