# Thai job-board crawler for JobTopGun and JobBKK (TOR WP5) — design

Status: owner-approved decisions, 2026-10-14 and 2026-10-15. Written spec approved by the owner on 2026-10-15.
Branch: `feat/thai-board-crawler` from `origin/develop`. This is part 3 of WP5. Part 1 (`2026-10-14-thai-job-sources-design.md`) built the job store, the dictionary, dedup and the hourly `ingest run`. Part 2 (`2026-10-14-job-search-index-design.md`) serves every job search from Meilisearch.

## Goal

The owner ordered an hourly crawl of the Thai job boards. The client accepts the Terms of Service risk (ADR-016). JobsDB is deferred by the owner. This part adds JobTopGun and JobBKK as two more sources of the part-1 store, so their postings:
- pass through the same dictionary, dedup and retention;
- are searchable through the part-2 index;
- work with every existing job feature (smart match, digests, the agent `jobs_search` skill, saving to a project).

Done means:
- the hourly `ingest run` crawls both sites within strict robots.txt rules;
- only postings from the last 90 days are stored;
- a posting the site removed or expired is deleted from the store and the index.

## Decisions

| # | Decision |
|---|---|
| C1 | Sources are JobTopGun (`www.jobtopgun.com`) and JobBKK (`www.jobbkk.com`). JobsDB is not crawled now. This supersedes part-1 D1 for these two sites only; ADR-016 records why. |
| C2 | stdlib HTTP plus **Protego** (BSD-3, pure Python) for robots.txt. No browser, no crawl4AI: both sites render the data server-side. stdlib `urllib.robotparser` is rejected because it ignores `*` and `$` wildcards (verified: it wrongly allows JobsDB `*/job/` and `*?`). |
| C3 | Strict robots.txt compliance, listed under "Politeness rules". |
| C4 | Sites run one after the other, after the ATS boards, each with its own budget: 15 minutes and 300 requests. The whole run now has a 50-minute deadline (the ATS phase keeps its own 20-minute limit). |
| C5 | Kill switch: the `"crawl"` list in `data/job_boards.json`. A site not in the list is never contacted. A missing key means no crawling. The committed file lists `["jobtopgun", "jobbkk"]`. |
| C6 | Only postings from the last 90 days are fetched and stored (part-1 `MAX_AGE`). |
| C7 | Delete rules for both sites: the detail page has no JobPosting (a soft-404 with HTTP 200), the posting is gone from two complete discovery passes, `validThrough` has passed, or it is older than 90 days. |
| C8 | Contact details that appear in a posting (phone, email) are kept as written. Nothing is fetched from outside the posting, such as a company profile page. |
| C9 | Stored postings are not re-fetched to refresh their content. A posting keeps the content of its first fetch until it is deleted. |

## Politeness rules

All crawler requests go through one client, `integrations/crawler.py::PoliteClient`, one instance per site per run:
- **robots.txt** is fetched at the start of every run. Anything but HTTP 200 skips the site for the run with error `robots_unavailable`. Rules are parsed with Protego and kept for this run only.
- **Every URL** is checked with `can_fetch(url, "job-search-platform")` before the request. A disallowed URL is never requested; it is counted as `blocked` and skipped.
- **Redirects** are followed by hand, at most 3 hops. Each target must be on the same host and pass the robots check, otherwise the request fails as `redirect_blocked`.
- **Delay:** at least 3 s between requests to the host, or the robots `Crawl-delay` when larger. The delay starts after the previous response finishes.
- **Caps:** at most 300 requests per site per run, counting robots.txt and every redirect hop, and the site's 15-minute budget. A cap reached ends the site's run normally, with the work done so far kept.
- **HTTP 429 or 503** stops the site for the run at once (error `http_429` or `http_503`).
- **User-Agent:** the existing `job_boards.USER_AGENT` (`job-search-platform/0.1 (+repository URL)`).
- **Transport** follows the part-1 rules: HTTPS only, a fixed host allowlist (`www.jobtopgun.com`, `www.jobbkk.com`), `ProxyHandler({})`, 8 s timeout, a 4 MiB body cap, and no `Accept-Encoding` header (plain bodies).

## JobTopGun

Facts from the 2026-10-14 probe:
- `/sitemap.xml` is a sitemap index. 167 of its children are job sitemaps at `/sitemaps/jobs-snapshot/sitemap/{N}.xml`, holding about 137,000 jobs in total, with no per-URL `lastmod`.
- Each job appears as `/th/jobs/{id}` and `/en/jobs/{id}`. The id is `j{companyId}-{n}`; within one company, a larger `n` is a newer posting.
- A detail page carries one `JobPosting` JSON-LD block. A missing or expired id returns 200 without it.

Each run:
1. **Sitemap snapshot.** Fetch the index, then every job sitemap. Collect ids from `/th/jobs/{id}` URLs; ids that do not match `^j\d+-\d+$` are ignored. The snapshot is complete only when every job sitemap was fetched and parsed.
2. **Misses.** When the snapshot is complete:
   - stored JobTopGun postings in it get `missed_runs = 0` and `last_seen_at = now`;
   - stored postings not in it get `missed_runs += 1`, and are deleted at 2 (no tombstone);
   - tombstones whose id is in it get `last_seen_at = now`.
   
   The part-1 `suspicious_shrink` guard applies: if the snapshot holds fewer than 50% of 20 or more stored postings, no misses are counted and the site is recorded failed. An incomplete snapshot counts no misses.
3. **Candidates** are snapshot ids that are not stored, not tombstoned, and whose `n` is above their company's floor (step 4). Order: each company's highest `n` first, then each company's next `n`, and so on (round-robin by rank). Within one rank, larger company ids go first.
4. **Details**, at most 130 per run within the request and time caps. For each candidate fetch `/th/jobs/{id}` and read its JobPosting:
   - no JobPosting: tombstone the id (removed);
   - `datePosted` older than 90 days: tombstone the id and raise the company floor to `n`. Ids at or below the floor are never fetched;
   - `validThrough` already passed: tombstone the id;
   - otherwise map and upsert it.

Limitation: a company whose `n` does not grow with time can lose a posting below its floor. This is accepted.

## JobBKK

Facts from the 2026-10-14 probe:
- There is no sitemap.
- The listing `/jobs/lists/{page}/หางาน,ทั้งหมด,ทุกจังหวัด,ทั้งหมด.html` (path percent-encoded) embeds a `"jobpost_list":[...]` array of 25 items in its Next.js RSC payload. The listing holds about 32,839 jobs, roughly 1,314 pages.
- Items carry `jobpost_id`, `company_id`, `created_at` and `updated_at` as `YYYY-MM-DD HH:MM:SS`, read as Bangkok time (+07:00). The list is sorted by `updated_at`, newest first. The order is not fully stable, and some timestamps are about 7 hours off.
- A detail page `/jobs/detail/{company_id}/{jobpost_id}` carries one JobPosting JSON-LD block. An expired page returns 200 without it.

A **sweep** reads listing pages until a page whose items all have `updated_at` older than 91 days (90 days plus 1 day of clock skew), or a page with no items. A posting created within 90 days was updated no earlier than it was created, so a finished sweep has seen every live posting. A sweep can span several runs.

Each run:
1. Read the **head pages** 1–3, so new postings are picked up every hour.
2. Continue the **sweep** from `cursor`, which is stored, starting at page 4.
3. On each page, handle each item:
   - stored: set `last_seen_at = now` and `missed_runs = 0`;
   - tombstoned: set the tombstone's `last_seen_at = now`;
   - `created_at` within 91 days: fetch the detail page (same outcomes as JobTopGun step 4, without the floor);
   - otherwise: skip.
4. When a cap is reached, store `cursor` as the current page, which is read again next run.
5. When the sweep finishes:
   - count a miss for every stored JobBKK posting whose `last_seen_at` is before `sweep_started_at`, and delete at 2 misses;
   - apply the `suspicious_shrink` guard to the number of postings the sweep saw;
   - reset `cursor` to 4 and `sweep_started_at` to now.

The first sweep is slow, because nearly every item needs its detail page (about 25 details per page). Later sweeps mostly only touch stored postings, so they finish in a few runs.

## Mapping

`job_mapping._fields` gets one branch for both crawled sources, reading the schema.org JobPosting object:

| Field | JobTopGun | JobBKK |
|---|---|---|
| `external_id` | `identifier.value` when it equals the URL id, else the URL id (`j12-254`) | `jobpost_id` |
| `slug` | `jtg-{external_id}` | `bkk-{external_id}` |
| `url` | `https://www.jobtopgun.com/th/jobs/{id}` | `https://www.jobbkk.com/jobs/detail/{company_id}/{jobpost_id}` |

The common fields are read the same way for both sites:
- `title`;
- `company` from `hiringOrganization.name`;
- `location` from `addressLocality, addressRegion`;
- `description`: the HTML of `description`, plus `responsibilities`, `qualifications` and `jobBenefits` when present, converted with the existing `html_to_markdown`;
- `posted_at` from `datePosted`;
- `employment_type` from `employmentType` (`FULL_TIME`, `PART_TIME`, `CONTRACTOR`, `TEMPORARY`, `INTERN`), mapped to the existing choices;
- salary from `baseSalary` (`currency`, `value.minValue`, `value.maxValue`, `value.unitText`). Free-text values are dropped.

Values the JobPosting lacks (seniority, category, skills, province, work mode, language) come from the part-1 dictionary as for every source.

A date-only `validThrough` (`2026-10-22`) means the end of that day, Bangkok time. It is stored in the new column `job_postings.valid_through`.

## Store changes

Migration `0029_job_crawl`:
- `ck_job_postings_source` gains `jobtopgun` and `jobbkk`;
- new nullable column `job_postings.valid_through timestamptz`;
- new table `crawl_state (source varchar(20) PRIMARY KEY, state jsonb NOT NULL, updated_at timestamptz NOT NULL)`. JobTopGun stores `{"floors": {companyId: n}}`. JobBKK stores `{"cursor": int, "sweep_started_at": iso}`.

`services/job_store.py`:
- the upsert half of `apply_board` becomes a shared function that both `apply_board` and the crawler call;
- `retire` also deletes postings whose `valid_through` has passed, with a tombstone, for every source;
- `run_ingest` runs the crawl phase after the ATS boards. Each site is one `per_board` entry `crawl:{site}` with `state` and counts (`requests`, `blocked`, `fetched`, `created`, `deleted`). A failed or stopped site makes the run `partial`, like a failed board.

The crawler commits after each listing page (JobBKK), after each 10 details (JobTopGun), and after the miss step, so a crash or SIGKILL keeps the work done. Crawling happens under the existing ingest advisory lock. Part-2 index sync runs after the crawl phase, as today.

Code layout:
- `integrations/crawler.py`: `PoliteClient`, JSON-LD extraction, sitemap and RSC listing parsers. No database.
- `services/job_crawl.py`: the two site routines, crawl state, and the calls into `job_store`.

## Security and privacy

- Crawled HTML is untrusted content (backend invariant). Pages are parsed only with `json.loads` on the JSON-LD and listing blocks, and `html.parser` through the existing `html_to_markdown`. Nothing is executed.
- Hosts are allowlisted and URLs are built from validated ids (`^j\d+-\d+$`, numeric JobBKK ids), so page content cannot steer a request elsewhere.
- Recruiter phone numbers and emails in postings are personal data. They are stored only as part of the posting, are never fetched from elsewhere, and are deleted with the posting (90 days at most). ADR-016 records this.
- Protego is a new dependency. It is pinned in `pyproject.toml` and `uv.lock`, exported to `requirements.txt`, audited with `pip-audit`, and recorded in `docs/engineering/dependencies.md` (DELIVERY.md).

## Testing

Unit tests, no network, with **synthetic** fixture pages that copy only the real structure (no real postings, companies or phone numbers):
- `PoliteClient`:
  - disallowed URL never requested;
  - wildcard rule honoured;
  - redirect to another host or a disallowed path blocked;
  - delay is max(3 s, Crawl-delay), using a fake clock and sleep;
  - the 300-request cap;
  - stop on 429 and 503;
  - robots.txt not 200 → site skipped;
  - body cap.
- Parsers:
  - sitemap index and job sitemap, with th/en duplicates and malformed ids;
  - JobBKK `jobpost_list` from an escaped RSC payload;
  - JSON-LD found in a page with several ld+json blocks;
  - soft-404 page → no posting.
- Mapping:
  - both sources to the store row;
  - date-only `validThrough`;
  - free-text salary;
  - employment types.

Integration tests (Postgres, marked `integration`), each with a fake site transport:
- JobTopGun:
  - the floor stops a company after its first posting older than 90 days;
  - two complete snapshots without a posting delete it;
  - an incomplete snapshot counts no misses;
  - soft-404 and expired `validThrough` tombstone the id, and it is not fetched again;
  - rank order across companies;
  - the 130-detail cap.
- JobBKK:
  - the cursor resumes across runs;
  - head pages are read every run;
  - a sweep ends at an all-old page;
  - a posting missing from two finished sweeps is deleted;
  - the shrink guard.
- Kill switch: a site missing from `"crawl"` makes no request.
- `run_ingest`: one crawled site failing leaves the run `partial` and the other site's results stored.
- Crawled postings reach the index through the existing sync. A cross-source duplicate (same job on JobBKK and JobTopGun) collapses to one search result.

Live smoke, operator machine only: one run against the real sites with a small cap (for example 20 requests per site), on a throwaway database and a throwaway index, never `jobsearch_platform_core02` or `jobs`. Before any request, it confirms that every URL the run will request passes Protego.

## Docs to update

- `docs/adr/ADR-016-thai-board-crawling.md` (new): the client's ToS acceptance, politeness rules, kill switch, privacy note.
- `docs/engineering/local-operation.md`: the crawl phase, the kill switch, the longer run, and the expected first-sweep backlog.
- `backend/AGENTS.md`: the new modules and the migration number.
- `docs/engineering/dependencies.md`: Protego.
- Part-1 spec D1: a pointer to ADR-016 for these two sites.

## Out of scope

- JobsDB (owner deferred). Its robots.txt allows only listing pages without pagination, so a compliant crawl would get teaser-level data.
- JobBKK `/jobs/detailurgent/` pages (no JSON-LD) and the separate urgent list.
- Refreshing the content of stored postings (C9).
- A browser or JavaScript rendering.
- Installing the launchd job (needs an owner order).
