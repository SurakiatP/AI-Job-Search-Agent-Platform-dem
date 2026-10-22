# AI Job Search Agent Platform

A personal job-search workspace for people in Thailand. Keep your CVs and job postings in one project, see how well each job fits, tailor a CV with AI, practise the interview, and track every application. It works with Thai and English CVs and postings.

> The app never submits an application for you. AI drafts; you review and send.

## What you can do

| Step | Feature |
|---|---|
| **CV** | Upload a CV or build one from a template. Keep several named CVs with a revision history. |
| **Search** | Find jobs and set up job alerts (email, webhook or Telegram digest). |
| **Evaluate** | **Smart match** scores each job against your CV (role fit, seniority, must-have skills) and quotes the evidence it used. |
| **Documents** | Tailor a CV to one job with AI, edit it, and export it as PDF. |
| **Interview practice** | Generate a question set (Thai or English), answer it, and get AI feedback and a report. |
| **Track** | Record what you applied for and where each application stands. |

Sharing with other tools is optional: a project can expose an MCP/A2A endpoint with per-project grants.

## How it is built

- **Frontend:** React, Vite, TypeScript, Tailwind (Thai and English UI).
- **Backend:** Python 3.12, FastAPI, SQLAlchemy.
- **Storage:** PostgreSQL (data), MinIO (files), Meilisearch (job search).
- **AI:** requests go through a LiteLLM gateway to OpenRouter. CV text needed for a request is sent to that provider.
- **Agent runtime:** a sandboxed Hermes/Career Ops container does the document work.

## Choose how to run it

| I want to... | Go to |
|---|---|
| Try it on my own Mac or Linux machine | [Run locally](#run-locally) |
| Deploy on the customer GitLab platform | [Deploy on GitLab](#deploy-on-gitlab) |
| Deploy on one VM with HTTPS | [infra/deploy/README.md](infra/deploy/README.md) |

## Run locally

**You need:** Git, Docker with Compose, Python 3.12, [`uv`](https://docs.astral.sh/uv/) 0.12.2, Node 24.18.0. macOS is the best-supported system (provider keys can use the Keychain).

```sh
git clone git@gitlab.nectec.or.th:10service/jobsearch.git
cd jobsearch

# 1. Fetch the pinned upstream sources and build the agent tool image (needs network and Docker; takes a while).
#    The one-time clone of MinIO, gosu and Prometheus is listed in docs/engineering/local-operation.md.
python3 infra/hermes/setup.py --acquire --build

# 2. Start PostgreSQL and MinIO. This creates fresh passwords in the private directory (not printed).
export CORE02_PRIVATE_DIR="$HOME/.local/share/job-search-platform/core02-runtime"
uv run --locked --project backend python scripts/local_infra.py start --private-dir "$CORE02_PRIVATE_DIR" --source-dir "$MINIO_SOURCE_DIR"

# 3. Build the frontend and start the app.
npm ci --prefix frontend
uv sync --locked --project backend --all-groups
uv run --locked --project backend python scripts/run_local.py --build-frontend --open-browser
```

The app opens at <http://127.0.0.1:8000/login>. It only listens on your own machine unless you enable sharing.

**Create your first user:**

```sh
uv run --locked --project backend python scripts/accounts.py create-user --help
```

**Turn on AI.** Copy `.env.example` to `.env`, set `OPENROUTER_API_KEY`, and start the services with `uv run --env-file .env ...`. Never paste a key into a command, the browser, or a committed file. `.env` is git-ignored.

Full, pinned instructions (storage, sharing, backups, recovery): [docs/engineering/local-operation.md](docs/engineering/local-operation.md).

## Deploy on GitLab

The deploy follows the customer's `websearch` template: one published port, data in a host folder, secrets in GitLab variables.

| Setting | Value |
|---|---|
| Data folder (`DATA_PATH`) | `/home/search/Thoughtmind/jobsearch/data` |
| Published port (`PORT`) | `10360` |
| Domain | `https://jobsearch.aiforthai.in.th` |
| Image tag | `1.0.0-<pipeline number>`, for example `1.0.0-1` |

**Steps**

1. In GitLab go to **Settings → CI/CD → Variables** and add these as *protected* and *masked*:
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (at least 8 characters), `MEILI_MASTER_KEY`, `LITELLM_MASTER_KEY` (starts with `sk-`), `LITELLM_SALT_KEY`, `LITELLM_DB_PASSWORD`, `OPENROUTER_API_KEY`.
   Optional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS`, `TELEGRAM_BOT_TOKEN`.
2. Make sure the code is on `main` (merge `develop` into `main`).
3. Open the pipeline and run the manual **deploy** job. It builds `jobsearch-app:1.0.0-<n>` and starts everything with `docker compose`.
4. The first start takes several minutes: the app prepares its agent tools once. Watch it with `docker logs -f jobsearch-web`.
5. Open the domain and sign in. To stop the stack, run the manual **down** job.

**Good to know**

- The app container mounts `/var/run/docker.sock` so the agent runtime can start its tool containers. The platform team must allow this on the runner.
- Data lives under `DATA_PATH` (`postgres`, `minio`, `meili`, `litellm-db`, `private`, `home`). Back up that folder.
- The deploy has not yet been run end to end on the customer platform. Report any problem from the first run.

## Settings

`.env.example` lists the local settings (service addresses and optional paths). Secrets are never stored in the repository: locally they live in the private directory or your shell, on GitLab in CI/CD variables.

## Test

```sh
uv run --locked --project backend pytest backend/tests/unit -q   # fast unit tests (what GitLab CI runs)
npm run build --prefix frontend                                  # type-check and build the UI
npm test --prefix tests                                          # browser tests (Playwright)
```

Integration tests need PostgreSQL and MinIO from `local_infra.py`.

## Repository map

| Path | What is inside |
|---|---|
| `frontend/` | React web app |
| `backend/` | FastAPI service, database migrations, tests |
| `infra/` | Docker Compose for local services, single-VM deploy files, agent image |
| `scripts/` | Launcher, accounts, backup/restore, job ingest, smoke tests |
| `Dockerfile`, `docker-compose.yml`, `.gitlab-ci.yml` | GitLab deploy |
| `docs/` | Specifications, plans, ADRs, engineering and security notes |

## More documentation

- [Local operation](docs/engineering/local-operation.md)
- [Security verification](docs/engineering/security-verification.md) and [dependency evidence](docs/engineering/dependencies.md)
- [Architecture decisions](docs/adr/) (for example [ADR-017](docs/adr/ADR-017-systemd-single-vm.md), single-VM deployment)
- [Product](PRODUCT.md) and [design rules](DESIGN.md)
