# Job search on Meilisearch over the job store (TOR FR-J01) — design

Status: owner-approved decisions, 2026-10-14. The written spec awaits owner review.
Branch: `feat/job-search-index` from `origin/develop`, after part 1 (`2026-10-14-thai-job-sources-design.md`) merges.

## Goal

TOR FR-J01 requires keyword plus facet search (region, work_mode, seniority, skills, salary, company) through Meilisearch, without Postgres serving the result payload. The owner requires:
- every ingested job is searchable in Job Search;
- every existing job feature works over the new jobs as it does today.

Done means:
- Job Search, smart match, saved-search digests, the agent `jobs_search` skill (`/agent/jobs/search`, MCP and A2A), the executor's match pool and the landing job stats all read from one Meilisearch index;
- the index is fed from the part-1 store after every ingest;
- the store no longer calls freehire at query time.

## Decisions

| # | Decision |
|---|---|
| E1 | Build Meilisearch together with WP5. There is no interim Postgres search. |
| E2 | Meilisearch community edition v1.55.0 (MIT), pinned by digest in `infra/compose.yaml`. |
| E3 | `services/job_sources.search_jobs` and `job_facets` keep their signatures and return shapes (apart from the new optional `company` filter), and switch their backend to Meilisearch. No caller changes. |
| E4 | When Meilisearch is down, search fails with the existing `job_source_unavailable` (retryable). There is no silent fallback to Postgres, which FR-J01 forbids. |
| E5 | The HTTP client is stdlib, following the `fetch_json` pattern, not the `meilisearch` PyPI client. It is a handful of REST calls, and a new dependency would need CVE scanning for no gain. |

## Infrastructure

- **Compose service** `meilisearch` with image `getmeili/meilisearch:v1.55.0@sha256:<digest recorded at implementation>`:
  - port `127.0.0.1:57700:7700`;
  - volume `meili-data`;
  - `MEILI_ENV=production`, `MEILI_NO_ANALYTICS=true`;
  - `MEILI_MASTER_KEY` read from the private dir file `meili-master-key`, which `scripts/local_infra.py` generates once with mode 0600, like the existing Postgres and MinIO credentials.
- **Backend settings:** `MEILI_URL` (default `http://127.0.0.1:57700`) and the key, read from the same private file. The key never enters the repo, logs or test fixtures.
- **Security gate:** Trivy scans the image, and the result is recorded in `docs/engineering/dependencies.md` before merge (DELIVERY.md). A Critical/High finding blocks delivery unless the owner accepts it.

## Index

Index `jobs`, primary key `id` (the posting uuid; slugs can hold characters Meilisearch ids reject).

Documents hold only the open canonical postings (`closed_at IS NULL AND canonical_id IS NULL`). Fields:
- the existing item shape `map_item` returns: `slug`, `title`, `company`, `location`, `cities`, `work_mode`, `skills`, `category`, `posted_at`, `source_url`, `description_markdown`;
- `seniority`, `employment_type`, `company_type`, `posting_language`, `salary_thb_month_min`;
- `posted_ts` (Unix seconds of `posted_at`, else `first_seen_at`);
- `reality_stale`;
- `sources` (list of member sources, for attribution).

Settings, applied idempotently by `scripts/ingest_jobs.py index-settings` and at the start of every sync:
- `searchableAttributes`: `title`, `company`, `skills`, `category`, `location`, `description_markdown`.
- `filterableAttributes`: `company`, `cities`, `work_mode`, `category`, `seniority`, `employment_type`, `company_type`, `skills`, `posting_language`, `salary_thb_month_min`, `posted_ts`.
- `sortableAttributes`: `posted_ts`.
- `localizedAttributes`: `[{attributePatterns: ["title", "description_markdown", "company", "location"], locales: ["tha", "eng"]}]`. Thai segmentation works in every 1.x release. Known caveat: charabia drops some trailing combining vowels (ุ ู ์), so Thai matching is slightly loose.
- `pagination.maxTotalHits`: 10000. `faceting.maxValuesPerFacet`: 100.
- Ranking: defaults, with `posted_ts:desc` used as sort when `q` is empty. That gives newest-first browsing; relevance ranks results when there is a query.

## Sync

This is the last step of `ingest run` (part 1), after dedup:
1. Collect postings with `index_dirty = true` (part 1 sets it on every change that affects search).
2. Upsert documents for open canonical postings in batches of 1,000.
3. Delete ids that are closed or no longer canonical.
4. Wait for each Meilisearch task to finish, with a 120 s deadline, and clear `index_dirty` only for batches that succeeded. A failed task marks the run `partial` with `index_failed`. The rows stay dirty, so the next run re-sends them.

`scripts/ingest_jobs.py reindex` builds `jobs_tmp` from all open canonical postings, applies settings, and swaps it with `jobs` (`/swap-indexes`). Use it for recovery or after changing settings.

## Query mapping (`search_jobs`)

The parameters are unchanged and already validated by callers:

| Parameter | Meilisearch |
|---|---|
| `q` | `q` (trimmed; empty means browse) |
| `cities` | `cities IN [...]` |
| `work_mode` | `work_mode = X` |
| `posted_within_days` | `posted_ts >= now − days·86400` |
| `category` | `category = X` |
| `seniority`, `employment_type`, `company_type`, `skills` | `field IN [...]` each (OR within a field, AND across fields, as today) |
| `posting_language` | `posting_language = th` |
| `salary_min` | `salary_thb_month_min >= N` |
| `company` (new, optional) | `company = X`. FR-J01 lists company as a facet. It is added to `search_jobs`, to REST `GET /projects/{id}/job-search` and `/match` (`Query(max_length=300)`), and to the contract. The frontend is unchanged in this part. |
| `limit`, `offset` | `limit`, `offset` (callers cap at 20 and 1000) |

Result handling:
- `total` = `estimatedTotalHits`, which is exhaustive under `maxTotalHits`.
- Each hit maps to the current item shape.
- `age_days` is computed at query time from `posted_at`.
- `stale` (FR-J04) is true when `reality_stale` (freehire's evidence) is set, or when `age_days > 60` (the age evidence every source has). The 60-day threshold is a named constant.
- `description_markdown` comes from the document, so the result payload never touches Postgres (FR-J01).

`job_facets` is one search with `limit=0` and `facets=[category, cities, seniority, employment_type, company_type, skills, posting_language]`. It returns the same keys as today: `total`, top-N lists and `thai_postings`. A second `limit=0` query with the `posted_within_days=7` filter gives `new_7d`. Results keep the existing 300 s in-process cache, so the public landing endpoint stays cheap.

The freehire query-time code in `job_sources.py` is removed. freehire is reached only by the part-1 adapter.

## Compatibility with existing features

- **Slugs.** Slugs are unchanged for freehire-origin jobs (part 1 keeps `public_slug`). Hidden-job rows, `JobMatchScore` caches and `SavedSearchSeen` rows stay valid. A cluster's slug is stable across runs by the part-1 canonical rule.
- **Smart match** (`services/smart_match.build_pool`). Calls `search_jobs` as today. Per-CV category pools keep working because category values share freehire's vocabulary (part 1).
- **Saved-search digests.** Call `search_jobs` with the stored filters. New ATS jobs appear in digests once indexed.
- **Agent `jobs_search`** (REST, MCP, A2A) and **executor match pool.** Unchanged callers.
- **Saving a job to a project** copies the item into a `JobRevision`, as today. Saved copies never depend on the index.
- **Frontend.** No change. Response shapes are identical. Search results show the source host through the existing `source_url` link.

## Testing

Unit tests, no network:
- the filter-string builder for every parameter combination;
- quoting of values with quotes or spaces;
- the hit-to-item mapping;
- the `stale` rule at the threshold;
- the facet mapping;
- `job_source_unavailable` on connection error, timeout and non-200.

Integration tests, marked `integration`, against the compose Meilisearch with a throwaway index name:
- sync adds, updates and deletes the right documents across a two-run fixture;
- closed and non-canonical postings are never searchable;
- each FR-J01 facet filters correctly: region (`cities`), work_mode, seniority, skills, salary and company;
- a Thai query (`โปรแกรมเมอร์`, `กรุงเทพ`) finds Thai postings;
- `reindex` swap leaves search working throughout;
- a contract check that `search_jobs` and `job_facets` return exactly the current keys and types.

Existing tests:
- Suites for smart match, saved searches, agent jobs and REST job search keep passing. Their fake `fetch` injection moves to a fake index client with the same items.
- The Playwright suite is unchanged, because the frontend contract is unchanged.

CI is unchanged. Unit tests use a fake index client. The Meilisearch integration tests run on the operator machine, like the other `integration` tests.

## Out of scope

- Typo-tolerance tuning and synonyms beyond the part-1 dictionaries.
- Semantic or vector search (pgvector; ADR-015 trigger).
- Search analytics.
- Multi-instance Meilisearch.

## Docs to update

- `docs/contracts/application-api.yaml`: describe the job-search endpoints as backed by the local index, and add the optional `company` parameter.
- ADR-015: the Search row becomes "Meilisearch 1.55, complies".
- `backend/AGENTS.md`, `infra/AGENTS.md`, `docs/engineering/local-operation.md`: Meilisearch service, key file, `reindex`.
- `docs/engineering/dependencies.md`: the image scan.
