# OAuth 2.1 for MCP with per-client consent (TOR FR-P03) — design

Status: owner-approved decisions, 2026-10-14. Branch `feat/mcp-oauth` from `origin/develop` (a7a2c1a).

## Goal

MCP clients (Claude Desktop, Claude Code, MCP Inspector) connect to the platform through the standard MCP authorization flow (MCP spec 2025-11-25, OAuth 2.1), instead of the owner pasting a `jspg_` token.

Success looks like this:
- A client that knows only the MCP URL discovers the authorization server, registers (Client ID Metadata Document or Dynamic Client Registration), sends the user's browser to a consent page, and receives tokens.
- The consent page shows who is asking and lets the signed-in user choose the project, the capabilities and the expiry.
- Each consent creates one `Grant`. It appears in Connected agents with the client name, and revoking it stops every token from that consent on the next request.
- Existing `jspg_` grant tokens keep working on MCP and A2A unchanged.

## Constraints

- **Shared listener stays owner-free.** No owner page, cookie or owner REST is mounted on the shared listener. The consent page and its API live on the owner app.
- **One authorization path.** OAuth consents become ordinary `Grant` rows. `authorize()` and every MCP tool handler stay unchanged; they keep rechecking the grant from PostgreSQL on each request.
- **HTTPS issuer.** The SDK and RFC 8414 require an HTTPS issuer, except for loopback. OAuth is enabled only when the shared listener's public origin is HTTPS or loopback. Otherwise only `jspg_` tokens work, as today.
- **SSRF.** Fetching a Client ID Metadata Document reuses `webhooks.check_url`. It also uses `httpx` with `trust_env=False`, no redirects, a 5-second deadline and a 5 KB body cap.
- **No new dependencies.** Use the `mcp==2.3.0` auth module (`create_auth_routes`, `OAuthAuthorizationServerProvider`, `create_protected_resource_routes`) and `httpx`.
- **Secrets at rest.** Codes, access tokens and refresh tokens are stored only as `token_hash()` digests, the same helper grants use.

## Decisions (grill round 1, all as recommended)

| # | Topic | Decision |
|---|---|---|
| Q1 | Where the AS lives | The SDK auth routes (metadata, `/authorize`, `/token`, `/register`, `/revoke`) are on the shared listener, at the issuer origin. `/authorize` validates and then redirects the browser to the owner app's `/oauth/consent` page. |
| Q2 | Client registration | Both. CIMD (an `https` URL `client_id`) is fetched and cached. DCR goes through the SDK `/register`. No manual pre-registration. |
| Q3 | Consent model | Each approval creates a new `Grant` bound to the client. Scopes equal the existing capability names. There is no remembered consent; every authorization shows the page. |
| Q4 | Tokens | Access tokens are opaque (`jspo_`) and last 1 hour. Refresh tokens (`jspr_`) rotate on every use and never outlive the grant. PKCE S256 is mandatory. `resource` must name the MCP URL. |
| Q5 | Scope of change | OAuth access tokens are accepted only by `/mcp`, because they are audience-bound to it (RFC 8707). A2A keeps accepting only `jspg_`. `tools/list` is not filtered per caller. |
| Q6 | UI | A consent page that follows the shared UI rules. Connected agents shows the client name for OAuth grants. |

## Configuration

- `SHARE_PUBLIC_ORIGIN`: the externally visible origin of the shared listener, for example `https://agents.example.com` behind a TLS proxy. Default: `http://{share_host}:{share_port}`.
- `issuer = SHARE_PUBLIC_ORIGIN`, `resource = SHARE_PUBLIC_ORIGIN + "/mcp"`.
- `APP_PUBLIC_ORIGIN` (already exists) is the origin of the consent page.
- OAuth is on when `validate_issuer_url(issuer)` passes. Otherwise the shared app logs `oauth_disabled_insecure_issuer` once and mounts no auth routes.

## Data model — migration `0026_oauth`

### `oauth_clients`

| Column | Type | Notes |
|---|---|---|
| `client_id` | text PK | A random `jspc_…` value for DCR, or the document URL for CIMD |
| `kind` | text | `dcr` or `cimd` (check constraint) |
| `metadata` | JSON | `OAuthClientInformationFull` as validated: `client_name`, `redirect_uris`, `token_endpoint_auth_method` (always `none`) |
| `fetched_at` | timestamptz | CIMD only; the document is refetched when older than 24 hours |
| `created_at` | timestamptz | |

### `oauth_authorizations` (pending request, then code)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `request_hash` | bytea unique | Hash of the opaque `request` handle in the consent URL |
| `client_id` | text FK → `oauth_clients` on delete cascade | |
| `redirect_uri`, `redirect_uri_explicit`, `state`, `code_challenge`, `resource` | | Copied from the validated `AuthorizationParams` |
| `scopes` | JSON | As requested; may be empty |
| `expires_at` | timestamptz | 10 minutes after creation |
| `code_hash` | bytea unique, null | Set on approval |
| `code_expires_at` | timestamptz, null | 60 seconds after approval |
| `grant_id` | UUID FK → `grants` on delete cascade, null | Set on approval |
| `user_id` | UUID FK → `users`, null | The approver |
| `consumed_at` | timestamptz, null | Set on deny or on code exchange; single use |

### `oauth_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `token_hash` | bytea unique | |
| `kind` | text | `access` or `refresh` |
| `grant_id` | UUID FK → `grants` on delete cascade | |
| `client_id` | text FK → `oauth_clients` on delete cascade | |
| `resource` | text | |
| `expires_at` | timestamptz | Access: now + 1 h. Refresh: the grant's `expires_at`. |
| `revoked_at` | timestamptz, null | |

### `grants` changes

- `token_hash` becomes nullable. OAuth grants have no `jspg_` token.
- New `oauth_client_id` text FK → `oauth_clients`, nullable, on delete set null.

## Core service — `services/oauth.py`

`OAuthProvider` implements the SDK's `OAuthAuthorizationServerProvider`. All DB work runs in `asyncio.to_thread`, like `Grants`.

- `get_client(client_id)`
  - DCR: load the row.
  - CIMD (`client_id` is an `https` URL with a path): use the cached row if `fetched_at` is under 24 h. Otherwise fetch it, validate and upsert. The document's `client_id` must equal the URL, `redirect_uris` must be present, and `token_endpoint_auth_method` must be `none`. If the fetch fails or the document is invalid, return `None`; the SDK then answers `invalid_client`.
- `register_client(info)`: stores a DCR client. Only public clients (`token_endpoint_auth_method: none`) are accepted; anything else raises `RegistrationError(invalid_client_metadata)`. MCP clients are public, and this avoids storing client secrets. A per-IP rate limit (`rate_limits.hit`, bucket `oauth_register`) runs in the route wrapper.
- `authorize(client, params)`
  - Rejects a missing or wrong `resource` (`invalid_target`). Both `{resource}` and `{resource}/` are accepted.
  - Rejects scopes outside `GRANT_CAPABILITIES` (`invalid_scope`).
  - Inserts an `oauth_authorizations` row and returns `APP_PUBLIC_ORIGIN/oauth/consent?request=<handle>`.
- `load_authorization_code` / `exchange_authorization_code`
  - The code must be unconsumed, unexpired and belong to the client. Exchange marks it consumed.
  - Exchange issues an access and refresh pair for `grant_id`.
  - A second use of the same code revokes every token of that grant (RFC 6749 §4.1.2).
- `load_refresh_token` / `exchange_refresh_token`
  - Rotation: the old refresh token is revoked and a new pair is issued.
  - Presenting an already revoked refresh token revokes the grant's OAuth tokens (reuse detection).
  - Requested scopes may only narrow the grant's capabilities.
- `load_access_token(token)`
  - Valid only if the token row is valid, its grant is not revoked or expired, and the project owner is not disabled.
  - Returns an `AccessToken` with `subject = str(grant_id)` and `resource`.
- `revoke_token(token)`: revokes that token and its pair. The grant itself stays; the owner revokes grants from Connected agents.

`Grants.authenticate(token, *, resource=None)`:
- `jspg_` tokens: unchanged.
- `jspo_` tokens: accepted only when `resource` equals the configured MCP resource. The result is the same `Actor("grant", …)` built from the linked grant.
- Anything else is `unauthorized`.

`OAuthConsents` (owner REST service):
- `view(actor, handle)`: client name, client id host, redirect URI, requested scopes, and the user's projects.
- `approve(actor, handle, project_id, capabilities, expires_at)`: in one transaction, `Grants`-style checks (`authorize(…, "manage", "grant")`, `require_verified_owner`), create the `Grant` with `oauth_client_id` and `label = client_name`, then set the code. Returns `redirect_uri?code=…&state=…&iss=…`.
- `deny(actor, handle)`: consumes the request and returns `redirect_uri?error=access_denied&state=…&iss=…`.
- An expired or consumed handle returns `not_found`. The consent page then shows "request expired".

## Shared listener (`api/shared.py`, `api/mcp.py`)

- When OAuth is on:
  - Mount `create_auth_routes(provider, issuer, client_registration_options=enabled with valid_scopes, revocation_options=enabled)`.
  - Mount `create_protected_resource_routes(resource, [issuer], scopes_supported)` at `/.well-known/oauth-protected-resource/mcp`.
- The SDK's `build_metadata` hard-codes `client_secret_post`/`client_secret_basic`. The SDK metadata route is replaced by ours, built from `build_metadata` with `token_endpoint_auth_methods_supported = ["none"]` and `client_id_metadata_document_supported = true`.
- `_BearerAuthenticationMiddleware` and `_authenticate` pass `resource=` to `grants.authenticate`.
- A 401 from `/mcp` carries `WWW-Authenticate: Bearer resource_metadata="<PRM URL>"`, plus `error="invalid_token"` when a token was sent.

## Owner app (REST `/api/v1`, cookie + CSRF as today)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/oauth/requests/{handle}` | | `OAuthConsentView` |
| POST | `/oauth/requests/{handle}/approve` | `project_id`, `capabilities`, `expires_at` | `{redirect_url}` |
| POST | `/oauth/requests/{handle}/deny` | | `{redirect_url}` |

`GET /account/agents` adds `client_name` and `client_id_host` for OAuth grants. Revoke uses the existing grant delete.

## UI

- Route `/oauth/consent` sits under `OwnerGate`. An anonymous user goes to `/login?next=…` and comes back.
- The page shows:
  - The client name, with the `client_id` host and the redirect URI host shown plainly, so a spoofed name is visible.
  - A project select.
  - Capability checkboxes, with the requested ones pre-checked and `results:read` always offered.
  - An expiry select: 7, 30 or 90 days; default 30.
  - Approve and Deny buttons.
- Approve or Deny sets `window.location` to the returned `redirect_url`.
- Thai and English copy, following the existing locale files.
- Connected agents (Account and Console Agents tab) shows `client_name · client_id_host` for OAuth grants.

## Errors

- AS endpoints return the SDK's standard OAuth error bodies. Messages never echo tokens, codes or fetched document bodies.
- Owner REST returns the existing `ServiceError` codes: `not_found`, `invalid_grant`, `forbidden`.
- A CIMD fetch failure is logged with its class only (`blocked`, `unresolvable`, `invalid`, `http_<code>`, `too_large`).

## Testing

- Unit:
  - Resource matching.
  - Scope validation.
  - CIMD document validation, including mismatched `client_id`, http URL, missing `redirect_uris` and oversized body.
  - Token prefixes route to the right lookup.
- Integration (PostgreSQL), against the shared app over real HTTP:
  - Full flow: PRM discovery, AS metadata, DCR register, `/authorize` redirect to consent, approve through owner REST, code exchange with PKCE, MCP `tools/list` and one tool call with the access token.
  - The same flow with a CIMD client served by a local test server (`WEBHOOK_ALLOW_PRIVATE=1`).
  - Refresh rotation; reuse of an old refresh token revokes the grant's tokens.
  - Code replay is rejected and revokes the grant's tokens.
  - Revoking the grant in Connected agents makes the next MCP call fail with 401.
  - An access token is rejected by A2A, and a token with a wrong `resource` is rejected at `/authorize`.
  - Deny returns `access_denied`; an expired handle returns 404.
  - A non-HTTPS, non-loopback issuer leaves OAuth off and `jspg_` still works.
- E2E (Playwright): consent page approve and deny, and the login redirect round trip.

## Out of scope

- Remembered consent, and silent re-authorization.
- OAuth for A2A and an Agent Card `securitySchemes` entry.
- Per-caller `tools/list` filtering.
- SEP-990 identity assertion grants.
- Pruning unused DCR clients and expired authorization rows. Revisit if the tables grow.
