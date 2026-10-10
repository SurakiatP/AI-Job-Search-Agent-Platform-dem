# Local operation

This application is intended to run on the owner's machine. It uses PostgreSQL and MinIO for local persistence, a macOS Keychain adapter for provider credentials, and a separate sandboxed Hermes/Career Ops runtime for native document work. Keep infrastructure credentials, provider keys, CVs, backup archives, and raw scanner output outside the repository.

## Requirements and pinned inputs

Command examples use the installed `rtk` wrapper. It is an operator tool, not an application runtime dependency. If it is unavailable, remove the leading `rtk` from setup/launch commands. The ordinary Playwright configuration uses it internally; the CI workflow demonstrates running a separate Vite server and setting `JSP_E2E_BASE_URL` to run browser tests without RTK.

Use macOS for the supported owner Keychain path. Install Git, Docker with Compose, `uv` 0.12.2, Python 3.12, Node 24.18.0 with npm 11.16.0, Trivy 0.75.0 for reproducing the recorded scan, and the Go toolchains declared by the pinned container builds. The Hermes environment uses its own locked Python 3.14.7 runtime. PostgreSQL is 17.11; backend dependencies are in `backend/uv.lock`, and frontend and browser-test dependencies are in their package locks. `scripts/check_dependencies.py` checks lock drift and runtime versions.

Before starting storage, acquire clean detached upstream checkouts outside this repository. The MinIO, gosu, Hermes, and Career Ops revisions are recorded in `backend/pyproject.toml`; the source-built MinIO and PostgreSQL dependency overlays are hash-checked by the setup scripts. For example, create the MinIO and gosu source directories under a private cache and check out the exact commits declared by the repository:

```sh
export UPSTREAM_ROOT="$HOME/.cache/job-search-platform/upstream"
mkdir -p "$UPSTREAM_ROOT"
rtk git clone --no-checkout https://github.com/minio/minio.git "$UPSTREAM_ROOT/minio"
rtk git -C "$UPSTREAM_ROOT/minio" fetch --depth 1 origin 7aac2a2c5b7c882e68c1ce017d8256be2feea27f
rtk git -C "$UPSTREAM_ROOT/minio" checkout --detach 7aac2a2c5b7c882e68c1ce017d8256be2feea27f
rtk git clone --no-checkout https://github.com/tianon/gosu.git "$UPSTREAM_ROOT/gosu"
rtk git -C "$UPSTREAM_ROOT/gosu" fetch --depth 1 origin 6456aaa0f3c854d199d0f037f068eb97515b7513
rtk git -C "$UPSTREAM_ROOT/gosu" checkout --detach 6456aaa0f3c854d199d0f037f068eb97515b7513
export MINIO_SOURCE_DIR="$UPSTREAM_ROOT/minio"
export GOSU_SOURCE_DIR="$UPSTREAM_ROOT/gosu"
```

The source paths must be clean. Do not place a checkout inside this repository. Prepare Hermes and its complete Career Ops integrations with the repository's pinned acquisition/build script; it uses an external cache and writes no credentials:

```sh
rtk python3 infra/hermes/setup.py --acquire --build
```

That operation needs network access, Docker, and the pinned build toolchains. Keep the emitted manifest in the private cache. For full dependency scans, set `HERMES_SOURCE_DIR` and `CAREER_OPS_SOURCE_DIR` to the corresponding acquired checkout paths and `HERMES_ENV_DIR` to the prepared Hermes environment path. Also set `MINIO_SOURCE_DIR` and `GOSU_SOURCE_DIR` as above. No credential values are needed for these checks.

## Start the local services and app

Create a private infrastructure directory and start the project-scoped PostgreSQL and MinIO Compose services. The command creates fresh infrastructure credentials in that directory; it reports status, not credential values. Normal stop preserves the data volumes.

```sh
export CORE02_PRIVATE_DIR="$HOME/.local/share/job-search-platform/core02-runtime"
mkdir -p "$(dirname "$CORE02_PRIVATE_DIR")"
chmod 700 "$(dirname "$CORE02_PRIVATE_DIR")"
rtk uv run --locked --project backend python scripts/local_infra.py start \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
rtk uv run --locked --project backend python scripts/local_infra.py status \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
```

Build the frontend and launch the owner app. The default listener is loopback-only at `http://127.0.0.1:8000`. The launcher prints a one-use owner bootstrap URL; treat it as a login credential. `--open-browser` opens the URL directly and keeps its nonce out of terminal output. Do not share terminal logs while bootstrapping.

```sh
rtk npm ci --prefix frontend
rtk uv sync --locked --project backend --all-groups
rtk uv run --locked --project backend python scripts/run_local.py --build-frontend --open-browser
```

If you need to enter the nonce yourself, use the one-use URL printed by the launcher in the local browser. It creates the owner session cookie; the app then enforces same-origin CSRF protections. Keep the owner listener on loopback.

In Settings, select OpenAI, Anthropic, or OpenRouter, choose a model, enter the key in the provider field, and save it. The browser sends the key to the local backend for Keychain storage; it is not retained in local browser storage or the database. Use the Settings connection check before submitting a run. The selected provider receives the CV and job details needed to perform the request. Do not configure a key in a grant or share workflow.

Create a project, add a CV and a job posting you supplied, and start the evaluation/draft workflow. Review the evaluation and every generated document yourself. Application submission remains manual. In Saved jobs, the owner can mark a posting as applied or return it to saved. This persisted status is separate from an agent Run status; the button only records the owner’s action and does not send an application.

## LiteLLM gateway

`scripts/local_infra.py start` also runs the LiteLLM gateway (`litellm`, its own `litellm-db` Postgres and a one-shot `litellm-seed`). It listens on `127.0.0.1:4000` only (override with `CORE02_LITELLM_PORT`); the UI is at `http://127.0.0.1:4000/ui` (user `owner`).

- `OPENROUTER_API_KEY` is read from the environment of the `start` command (for example the owner's `.env`, exported) and reaches only the LiteLLM containers. Without it LiteLLM still starts and the seed logs `openrouter_key_missing` and skips model creation; export the key and run `start` again.
- `start` generates `litellm-master-key`, `litellm-salt-key`, `litellm-db-password` and `litellm-ui-password` in `CORE02_PRIVATE_DIR` (mode 0600, never regenerated). Do not change the salt key after models are stored.
- The seed adds model `ai-analyze` (`openrouter/z-ai/glm-5.3-flash`) if absent and creates the `job-search-app` virtual key (model `ai-analyze`, pass-through `/jev/decisions`), written to `CORE02_PRIVATE_DIR/litellm_app_key` (0600; empty until seeded). Manage models afterwards in the UI.
- `/jev/decisions` forwards to the OpenRouter decisions API with the server-side key. The app uses `AI_DECISION_MODEL` (default `typesafe/jev-1.13`) in the request body.
- `status` lists `litellm`, `litellm-db` and `litellm-seed` with their health.

## Optional LAN project sharing

Sharing is opt-in and starts a second listener on port `8001`. Bind it to a concrete LAN IP on the owner's machine; do not use `0.0.0.0` or `::`. The owner app remains on loopback port `8000`.

```sh
rtk uv run --locked --project backend python scripts/run_local.py \
  --build-frontend --enable-sharing --share-host 192.168.1.20 --share-port 8001
```

Replace the example address with an IP assigned to the owner's machine. In Settings, create a project grant with only the capabilities needed and a short expiry, then deliver the generated token through a private channel. Tokens are bearer credentials. A grant is restricted to its project and capabilities; it cannot read raw CVs, chat history, provider settings, or owner-only controls. Revoke a grant in Settings when access ends. Do not expose the shared listener to the public Internet; this local workflow does not provide public-hosting authentication or HTTPS.

## Verification on the operator machine

After preparing the clean pinned source checkouts described above, set their `*_SOURCE_DIR` variables in this shell and run the lock/runtime/source checks before use. The checker reports missing upstream checkouts as incomplete; a local run with those paths unset is not a pass.

```sh
rtk uv run --locked --project backend python scripts/check_dependencies.py
rtk uv run --locked --project backend pytest backend/tests -q
rtk npm run build --prefix frontend
```

The pinned source commits are listed under `tool.job-search-platform.upstream` in `backend/pyproject.toml`. MinIO OSS is retained under its GNU AGPLv3 license; the upstream repository is archived and unmaintained, so this project owns the patch and maintenance work for its pinned build.

The backend suite needs the local PostgreSQL/MinIO setup and `CORE02_PRIVATE_DIR`. For the browser suite, install the test lock and Chromium, then run the Playwright project:

```sh
rtk npm ci --prefix tests
rtk npm exec --prefix tests -- playwright install --with-deps chromium
rtk npm test --prefix tests
```

The repository Playwright configuration starts a Vite server on `127.0.0.1:4175` for this synthetic browser run. The actual-backend browser check is conditional: the production startup fixture supplies an isolated backend URL and a private synthetic session file (`JSP_E2E_SESSION_FILE`). Run `backend/tests/integration/test_application_startup.py` through pytest to exercise that fixture; do not point it at the owner app or supply real credentials. It is not part of the ordinary synthetic browser run.

To exercise the native runtime without a model provider, run `rtk python3 scripts/prove_hermes.py --offline` after the Hermes setup/build. This proof uses synthetic fixtures and requires Docker. The real provider smoke is separate and requires an owner to configure a provider in Settings first:

```sh
rtk uv run --locked --project backend python scripts/smoke_platform.py --origin http://127.0.0.1:8000
```

It reports `blocked: configure_provider_in_settings` until a provider is configured. A pending provider setup is not a passing live workflow check.

## Stop and recovery

Stop the app with Ctrl-C and wait for it to exit cleanly. Then stop the storage services without removing their volumes:

```sh
rtk uv run --locked --project backend python scripts/local_infra.py stop \
  --private-dir "$CORE02_PRIVATE_DIR" \
  --source-dir "$MINIO_SOURCE_DIR"
```

For backup and restore, follow [recovery-proof.md](recovery-proof.md) exactly. Backup requires the app to be stopped. Restore requires a newly created, empty database and bucket with distinct target names; it validates checksums and leaves a private incomplete marker if interrupted. Never point restore at the active database or bucket. Portable archives do not contain provider credentials, owner authentication, or project grants. After restore, create a new owner session and save the provider key again in that machine's Keychain. Interrupted runs require an explicit owner retry, which creates a new run.

After a successful restore, select its existing database and bucket before launching the app:

```sh
export JSP_DATABASE=jsp_restore_rehearsal
export JSP_PRIVATE_BUCKET=job-search-platform-restore-rehearsal
rtk uv run --locked --project backend python scripts/run_local.py --open-browser
```

Keep `CORE02_PRIVATE_DIR` pointing at the private infrastructure credentials for that target. These are local operator settings, never caller-selected protocol parameters. The same exact database/bucket identity controls maintenance and failed-restore quarantine. Only use targets whose restore completed; restarting does not clear an incomplete-restore marker.
