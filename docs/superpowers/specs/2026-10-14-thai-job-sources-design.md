# Thai job sources, job store and hourly ingest (TOR WP5) — design

Status: owner-approved decisions, 2026-10-14. The written spec awaits owner review.
Branch: `feat/thai-job-sources` from `origin/develop`. This is part 1 of 2. Part 2 (`2026-10-14-job-search-index-design.md`, FR-J01) moves every job search onto the store this part builds.

## Goal

TOR WP5 asks for:
- adapters for at least three Thai job sources;
- a Thai dictionary of skills, roles and locations;
- tests that prove dedup across sources.

The owner added three requirements:
- every ingested job must be searchable in Job Search (delivered by part 2);
- posting status must refresh at least hourly;
- ingested jobs must work with every existing job feature.

Done means the following, with real data at demo scale:
- the store fills hourly from all sources;
- closed postings get marked;
- cross-source duplicates collapse into one job;
- the dictionary enriches every posting.

Production hardening (monitoring, a server scheduler) belongs to WP1.

## Decisions

| # | Decision |
|---|---|
| D1 | Only sources that explicitly permit automated access. JobsDB and LinkedIn forbid it. JobThai and JobBKK forbid reuse or commercial copying without consent. JobTopGun has no grant. None of these is built. JobThai and JobTopGun get adapters later, once the owner has written permission. Amended 2026-10-15: JobTopGun and JobBKK are crawled under ADR-016 (client accepts the ToS risk); see 2026-10-15-thai-board-crawler-design.md. |
| D2 | The three WP5 sources are the public ATS job-board APIs Greenhouse, Lever and SmartRecruiters, filtered to Thailand. Lever's API README says postings "may be scraped by third parties". Greenhouse documents its job-board GETs as public. Whether employer ATS boards count as "Thai job sources" is a client question (below). |
| D3 | freehire is ingested as an extra source, outside the three. Its terms allow access through the documented API, within 600 requests/min, or 300/min for `/agent/jobs/search`. Every posting keeps its `source` and original URL. The owner emails hello@freehire.me to confirm re-serving. |
| D4 | Postgres is the system of record (TOR §7). Part 2 indexes the open, canonical postings into Meilisearch. |
| D5 | A run-once `ingest` command runs hourly. It is idempotent, follows the TOR appendix ก.3 run-once worker model, and is launched by launchd on the owner machine (systemd timer in WP1). No loop inside the backend process. |
| D6 | A posting absent from two consecutive successful fetches of its board is deleted (amended 2026-10-14: delete, not close). A failed fetch never counts as an absence. |
| D7 | Enrichment uses dictionaries only, with no LLM. Unknown values become `other` or null. |
| D8 | Dedup has two tiers: normalized URL, then normalized (company, title, province) within 30 days. Each cluster keeps one canonical posting. |
| D9 | Retention (amended 2026-10-14, owner order, so the store cannot grow without bound): a posting whose age (`posted_at`, else `first_seen_at`) passes 90 days is deleted, and an incoming posting already older than that is never stored. Aged-out postings leave a tombstone `(source, external_id)` so they are not re-ingested; a tombstone is dropped when the source stops listing it for 7 days, or after 180 days. Deletes are queued in `job_index_deletes` for the search index (part 2). `ingest_runs` older than 90 days are dropped. Saved project jobs are separate `JobRevision` copies and are unaffected. |
| D10 | Board lists for the three ATSs are seeded from freehire's Thai postings and kept in an editable file. A re-runnable `discover` command adds new boards. |

## Sources and adapters

`integrations/job_boards.py` has one function per source. Each yields raw postings for one board, or for freehire one page:

| Source | Request | Thailand filter | Full open set per call |
|---|---|---|---|
| freehire | `GET https://freehire.me/api/v1/agent/jobs/search?countries=TH&limit=100&offset=N` | `countries=TH` | Yes, paged. About 5,800 jobs, 59 pages, under the upstream `offset+limit` bound of 10,000 |
| greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | `location.name` matched against the location dictionary | Yes, one call |
| lever | `GET https://api.lever.co/v0/postings/{site}?mode=json&skip=N&limit=100` | `country == "TH"`, else location text | Yes, paged |
| smartrecruiters | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings?country=th&limit=100&offset=N`, plus `GET .../postings/{postingId}` for the description | `country=th` | Yes, paged |

Request rules (DELIVERY.md, LEARNINGS 2026-10-14):
- Hosts are a fixed allowlist in code.
- Board tokens are validated against `^[A-Za-z0-9_.-]{1,100}$` and URL-quoted, so no config value can redirect a request.
- Requests reuse the existing pattern in `services/job_sources.fetch_json`: no redirects, `ProxyHandler({})`, 8 s timeout, and a 2 MiB body cap. Greenhouse with `content=true` can be large, so the cap is raised to 8 MiB for that call only.
- The User-Agent is `job-search-platform/0.1 (+repository URL)`, as freehire's robots.txt asks.
- There is a 0.5 s pause between requests to the same host.
- Each run has a 20-minute total deadline. Boards left unfetched are recorded as `skipped`, not as absences.
- Each board is isolated: an exception marks that board failed and the run continues.
- SmartRecruiters boards with more than 500 Thailand postings are reported failed (`too_many_postings`) before any detail call.

The board list lives in `backend/src/job_search_platform/data/job_boards.json`:

```json
{"greenhouse": ["agoda"], "lever": ["..."], "smartrecruiters": ["..."]}
```

It is sorted and unique. `discover` reads freehire's Thai postings and parses each source URL for its board token, for example `boards.greenhouse.io/{token}/jobs/...`, `jobs.lever.co/{site}/...` and `jobs.smartrecruiters.com/{id}/...`. It adds new tokens and never removes any.

## Data model (migration 0027)

`job_postings` holds one row per (source, external_id):
- Identity: `id` (uuid pk), `source` (`freehire|greenhouse|lever|smartrecruiters`), `board` (token, or null for freehire), `external_id`, `slug` (unique).
- Display fields: `title`, `company`, `location`, `cities` (JSON list), `province` (dictionary code or null), `work_mode`, `seniority`, `employment_type`, `company_type`, `category`, `skills` (JSON list, max 8), `salary_min`, `salary_max`, `salary_currency`, `salary_period`, `salary_thb_month_min` (for the salary filter), `posting_language`.
- Content: `description_markdown` (nullable after purge, max 50,000 chars), `source_url`.
- Dedup: `url_key`, `match_key`, `canonical_id` (self FK, null = canonical).
- Freshness: `posted_at`, `first_seen_at`, `last_seen_at`, `missed_runs` (int), `closed_at`, `reality_stale` (bool, from freehire `reality.class`).
- `content_hash`, `updated_at`, and `index_dirty` (bool). It is set whenever a change affects search: create, field update, close, reopen, or a change of `canonical_id`. Part 2 clears it after indexing.
- Constraints: unique (`source`, `external_id`). Indexes on `url_key`, `match_key`, and (`closed_at`, `canonical_id`).

Slugs:
- freehire postings keep freehire's `public_slug`, so existing hidden-job rows, match-score caches and digest "seen" rows keyed by slug stay valid.
- Others get `gh-{board}-{id}`, `lv-{board}-{id}` and `sr-{board}-{id}`, truncated to 200 characters (the `JobMatchScore.job_slug` width).

`ingest_runs` holds one row per run:
- `id`, `started_at`, `finished_at`, `status` (`ok|partial|failed`);
- `per_board` (JSON: per source/board, `ok|failed|skipped`, counts, error code);
- totals: fetched, created, updated, closed, merged.

## Ingest run

`scripts/ingest_jobs.py run [--source NAME]` runs these steps:

1. Insert an `ingest_runs` row.
2. For each source and board:
   - Fetch the full open set.
   - Map each item to the posting shape.
   - Enrich it.
   - Upsert by (`source`, `external_id`): new rows get `first_seen_at`; changed `content_hash` updates the fields; every seen row gets `last_seen_at = now` and `missed_runs = 0`. A row seen again after closing reopens (`closed_at = null`).
3. For every board fetched successfully, its open rows not seen this run get `missed_runs += 1`. Rows reaching 2 get `closed_at = now`. Failed or skipped boards are left untouched (D6).
4. Recompute dedup clusters over all open postings (below).
5. Purge: `description_markdown = null` where `closed_at < now − 90 days` (D9).
6. Finish the run row. Exit code is 0 for `ok`/`partial` and 1 for `failed` (every board failed).

Writes happen in one transaction per board, so a crash mid-run loses at most the current board. The run takes `pg_advisory_lock` on `'ingest'`, and a second concurrent run exits at once with "already running".

Other commands:
- `scripts/ingest_jobs.py discover` updates `job_boards.json` (D10).
- `scripts/ingest_jobs.py status` prints the last 5 runs.

`infra/launchd/com.job-search-platform.ingest.plist.example` runs `run` every 3,600 s, with documented install steps. It is a template, not auto-installed.

## Mapping and enrichment

- **HTML to markdown.** Greenhouse and SmartRecruiters return HTML. A stdlib `html.parser` converter in `services/job_text.py` keeps:
  - paragraphs, line breaks and headings;
  - lists;
  - bold and italic;
  - link text, with the URL in parentheses.

  It drops `script`, `style`, `iframe` and every attribute, so the output is plain markdown text and is treated as untrusted content like all job text. No new dependency. freehire already returns markdown.
- **skills.** `skill_coverage` dictionary matches over the title and description. Canonical names are lowercased into the same slugs the skill filter uses (`SKILL_RE`), top 8 by first occurrence.
- **category.** The new role dictionary (below) maps the title to a role, and the role maps to a category. Category values reuse freehire's category vocabulary from `/jobs/facets`, so one filter covers all sources. No match gives `other`.
- **seniority.** Title keywords map onto the existing `CHOICES["seniority"]` values. Examples: intern/ฝึกงาน → `intern`, junior/จูเนียร์ → `junior`, senior/sr/อาวุโส → `senior`, lead/หัวหน้า → `lead`, staff, principal, head/director/chief → `c_level`. No match gives null.
- **employment_type.** Taken from Lever `categories.commitment` and SmartRecruiters `typeOfEmployment`, mapped to `CHOICES["employment_type"]`, else null.
- **company_type.** freehire only, else null.
- **work_mode.** Remote/hybrid/onsite comes from Lever `workplaceType`, SmartRecruiters `location.remote`/`hybrid`, or title/location keywords (remote, hybrid, ทำงานที่บ้าน), else null.
- **salary.** Lever `salaryRange`, SmartRecruiters compensation, and freehire's salary fields when present, else null. `salary_thb_month_min` is set only for THB amounts: monthly as-is, yearly ÷ 12. Other currencies or periods leave it null, so the salary filter never compares across currencies.
- **province and cities.** The location dictionary maps the location text to a province code. `cities` holds the English province name, in the same form freehire uses, so the city filter matches across sources.
- **posting_language.** `th` if Thai characters are at least 30% of the letters in the title and description, else `en`.

## Thai dictionary

Files live in `backend/src/job_search_platform/data/` and use the same `Canonical = alias, alias` format as the existing skill dictionary. One parser is shared by all three.

- **skills.** Extend `skill_coverage._DICTIONARY` with Thai aliases for common skills, such as การตลาดดิจิทัล → Digital Marketing, บัญชี → Accounting, and Excel spellings. Existing canonical names do not change, so FR-J03 coverage scores stay stable.
- **roles.txt.** About 100 roles. Each line has the canonical English role, its category, and Thai and English aliases. Examples: Software Engineer (โปรแกรมเมอร์, นักพัฒนาซอฟต์แวร์), Accountant (นักบัญชี), Sales Executive (พนักงานขาย), Nurse (พยาบาล).
- **locations.txt.** All 77 provinces and Bangkok's 50 districts:
  - Province keys are the ISO 3166-2:TH codes. Names are the official Thai name plus the RTGS English name, with common aliases (กทม., กรุงเทพฯ, BKK, Bangkok Metropolis).
  - Districts map to `TH-10`.
  - Source: the Department of Provincial Administration list on data.go.th, copied in once. The file header records the dataset URL and date.

## Dedup (D8)

Run after every ingest over open postings:

1. `url_key` = `applications._same_job_url(source_url)`, reused from FR-T02 so the two rules cannot drift. Postings sharing a non-null `url_key` belong together.
2. `match_key` = lowercase `company` without legal suffixes (co., ltd., บริษัท, จำกัด, (มหาชน), public company limited, inc.), plus the role-dictionary canonical of the title (or the casefolded title when no role matches), plus `province`. Postings sharing a `match_key` whose `posted_at` (else `first_seen_at`) values are within 30 days of each other belong together. A null province never matches.
3. Groups merge transitively, via union-find over both keys.
4. The canonical posting of a cluster is the member with the earliest `first_seen_at`, ties broken by `id`. Its slug therefore stays stable across runs. The other members get `canonical_id` pointing at it.
5. A cluster counts as closed only when every member is closed. If the canonical posting closes while another member is open, the earliest open member becomes canonical.

`# ponytail: full recompute in Python over all open postings each run (~10k rows); move to incremental when the store passes ~200k.`

## Client questions (added to `docs/demo/tor-roadmap.md`)

1. Do public ATS boards of employers hiring in Thailand (Greenhouse, Lever, SmartRecruiters) count as WP5's "Thai job sources"? JobThai, JobsDB, JobBKK and JobTopGun either forbid automated reuse or have not granted it. We will add JobThai and JobTopGun once they give written permission.
2. freehire's terms allow its documented API but say nothing on re-serving data. We keep source attribution and links, and have asked freehire to confirm.

## Testing

Unit tests, no network:
- **Adapters.** One recorded synthetic response per source maps to the posting shape. This covers the Thailand filter, pagination stop, the body cap, and rejection of an invalid board token.
- **Enrichment.** Table tests for seniority, category, work_mode, province (Thai and English aliases, districts mapping to `TH-10`) and posting_language.
- **HTML converter.** Strips `script`, `style` and attributes; keeps lists and links.
- **Dictionary parser.** Every alias is unique within a dictionary. The locations file has exactly 77 provinces.

Integration tests (Postgres, fake fetchers):
- **Close rule.** A posting missing from one run stays open. Missing from two runs, it closes. Seen again, it reopens. A failed board never counts.
- **Cross-source dedup** (TOR WP5). Synthetic postings:
  - freehire and greenhouse share a URL that differs only in `utm_*`, host case and trailing slash;
  - lever and smartrecruiters share company/title/province, with Thai versus English title aliases;
  - a match 31 days apart stays separate;
  - two different provinces stay separate;
  - transitivity across three sources;
  - canonical stability across reruns;
  - canonical promotion when it closes.
- **Idempotency.** Running twice with the same input changes nothing but `last_seen_at`.
- **Concurrency.** The advisory lock blocks a second run.
- **Purge** after 90 days.

Live smoke (manual, recorded in the Hub): one real `run` against all four sources, with counts per source, the merged count, and run time.

## Out of scope

- Search, facets and Job Search page changes (part 2).
- JobThai/JobTopGun adapters (pending permission).
- Workable.
- LLM enrichment.
- A source-health UI (Grafana in WP1).
- Server scheduling (WP1).

## Docs to update

- `backend/AGENTS.md`: the new modules and the ingest command.
- `docs/engineering/local-operation.md`: how to install the launchd job and run ingest manually.
- ADR-015: update the "Freehire dependency" consequence.
