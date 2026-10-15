# ADR-016 — Crawl JobTopGun and JobBKK under the client's Terms of Service acceptance

Date: 2026-10-15
Status: Proposed. It becomes Accepted when the owner approves the part-3 spec (`docs/superpowers/specs/2026-10-15-thai-board-crawler-design.md`).

## Context

TOR WP5 asks for Thai job sources. Part 1 (spec D1) built only sources that explicitly permit automated access. JobTopGun had no grant, and JobBKK's terms forbid reuse or commercial copying without consent, so neither was built.

On 2026-10-14 the owner reported that the client accepts the Terms of Service risk and orders an hourly crawl of the Thai job boards. The owner holds the evidence of that acceptance; it is not stored in this repository. The owner then deferred JobsDB.

## Decision

Crawl JobTopGun (`www.jobtopgun.com`) and JobBKK (`www.jobbkk.com`) hourly as part of `ingest run`, under these rules:
- **robots.txt is binding.** It is re-read every run with Protego. Every URL and every redirect target is checked before the request. If robots.txt cannot be read, the site is skipped for the run.
- **Politeness.** One request at a time per host, at least 3 s apart or the site's `Crawl-delay` if larger. At most 300 requests and 15 minutes per site per run. HTTP 429 or 503 stops the site for the run. The User-Agent names the platform and links to the repository.
- **Data minimisation.** Only postings from the last 90 days are fetched and stored. A posting is deleted when the site removes or expires it, or at 90 days. No browser and no JavaScript execution.
- **Contact details.** Phone numbers and emails that appear in a posting are kept as part of the posting. Nothing is fetched from outside the posting, and they are deleted with it.
- **Kill switch.** The `"crawl"` list in `backend/src/job_search_platform/data/job_boards.json`. Removing a site name stops all requests to it from the next run, with no code change.

This supersedes part-1 spec D1 for these two sites only. JobsDB and LinkedIn stay out. JobThai stays out until written permission is obtained.

## Consequences

- The Terms of Service risk for these two sites is the client's, as accepted on 2026-10-14. Following robots.txt does not remove that risk; it limits the load and keeps within what each site publishes for crawlers.
- If a site objects, or the client withdraws acceptance, the operator removes the site from `"crawl"`. Its stored postings then age out within 90 days, or can be deleted at once.
- Recruiter contact details are personal data. They stay in the store for at most 90 days.
- A change to either site's markup can stop its crawl. The run records the site as failed and continues with the other sources.

## Revisit when

- the client or a site owner withdraws or contests permission;
- a site offers an official feed or API;
- the owner decides on JobsDB.
