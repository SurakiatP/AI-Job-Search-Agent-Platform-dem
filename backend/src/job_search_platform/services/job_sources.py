"""Job search served from the local Meilisearch index (FR-J01); the index is filled by services/job_index."""
from __future__ import annotations

import json
import re
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from job_search_platform import config
from job_search_platform.integrations import meili
from job_search_platform.services.errors import ServiceError

CACHE_TTL_SECONDS = 300
CACHE_MAX_ENTRIES = 128
DESCRIPTION_MAX = 50000
STALE_AFTER_DAYS = 60
RETRIEVE = ["slug", "title", "company", "location", "cities", "work_mode", "skills", "category", "posted_at",
            "posted_ts", "source_url", "description_markdown", "reality_stale"]
FACETS = ["category", "cities", "seniority", "employment_type", "company_type", "skills", "posting_language"]


def _search(payload: dict) -> dict:
    """The only Meilisearch call; failures become safe, retryable ServiceErrors."""
    try:
        return meili.client().search(config.meili_index(), payload)
    except (meili.MeiliError, OSError, ValueError):
        raise ServiceError("job_source_unavailable", retryable=True) from None


_cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()
_lock = threading.Lock()


def _cached(payload: dict) -> dict:
    key = json.dumps(payload, sort_keys=True)
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL_SECONDS:
            _cache.move_to_end(key)
            return hit[1]
    data = _search(payload)
    with _lock:
        _cache[key] = (now, data)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)
    return data


def _strip_utm(url) -> str | None:
    if not isinstance(url, str):
        return None
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return None
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                       if not k.lower().startswith("utm_")])
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))


def _text(value) -> str | None:
    return value if isinstance(value, str) and value else None


def _strings(value, limit=None) -> list[str]:
    items = [v for v in value if isinstance(v, str)] if isinstance(value, list) else []
    return items[:limit]


def hit_to_item(hit: dict, now: datetime) -> dict:
    ts = hit.get("posted_ts")
    age = max(0, int(now.timestamp() - ts) // 86400) if isinstance(ts, int) and not isinstance(ts, bool) else None
    description = hit.get("description_markdown")
    return {
        "slug": str(hit.get("slug") or ""),
        "title": str(hit.get("title") or ""),
        "company": _text(hit.get("company")),
        "location": _text(hit.get("location")),
        "cities": _strings(hit.get("cities")),
        "work_mode": _text(hit.get("work_mode")),
        "skills": _strings(hit.get("skills"), 8),
        "category": _text(hit.get("category")),
        "posted_at": _text(hit.get("posted_at")),
        "age_days": age,
        "stale": hit.get("reality_stale") is True or (age is not None and age > STALE_AFTER_DAYS),
        "source_url": _strip_utm(hit.get("source_url")),
        "description_markdown": description[:DESCRIPTION_MAX] if isinstance(description, str) else "",
    }


def parse_cities(value: str | None) -> list[str] | None:
    """Comma list, at most 5 items of at most 60 chars; None when invalid."""
    if not value:
        return []
    cities = [c.strip() for c in value.split(",") if c.strip()]
    return cities if len(cities) <= 5 and all(len(c) <= 60 for c in cities) else None


CHOICES = {
    "seniority": ("intern", "junior", "middle", "senior", "lead", "staff", "principal", "c_level"),
    "employment_type": ("full_time", "part_time", "contract", "internship", "fellowship"),
    "company_type": ("product", "startup", "agency", "outsource", "outstaff", "inhouse", "government"),
}
SKILL_RE = re.compile(r"^[a-z0-9][a-z0-9.+#-]{0,40}$")
# Names of the advanced filters, shared by rest.py, MatchRunRequest snapshots and the match worker.
FILTER_KEYS = ("seniority", "employment_type", "company_type", "skills", "posting_language", "salary_min")


def parse_choices(value: str | None, name: str) -> list[str] | None:
    """Sorted unique comma list limited to CHOICES[name] (or skill slugs, max 5); None when invalid."""
    items = sorted({c.strip() for c in (value or "").split(",") if c.strip()})
    if name == "skills":
        return items if len(items) <= 5 and all(SKILL_RE.match(c) for c in items) else None
    return items if set(items) <= set(CHOICES[name]) else None


def build_filter(*, cities=(), work_mode=None, posted_within_days=None, category=None, seniority=(),
                 employment_type=(), company_type=(), skills=(), posting_language=None, salary_min=None,
                 company=None, now: datetime) -> list[str]:
    q = meili.quote

    def many(field, values):
        return [f"{field} IN [{', '.join(q(v) for v in values)}]"] if values else []

    def one(field, value):
        return [f"{field} = {q(value)}"] if value else []

    return [*many("cities", cities), *one("work_mode", work_mode),
            *([f"posted_ts >= {int(now.timestamp()) - posted_within_days * 86400}"] if posted_within_days else []),
            *one("category", category), *many("seniority", seniority), *many("employment_type", employment_type),
            *many("company_type", company_type), *many("skills", skills), *one("posting_language", posting_language),
            *([f"salary_thb_month_min >= {int(salary_min)}"] if salary_min else []), *one("company", company)]


def search_jobs(*, q=None, cities=(), work_mode=None, posted_within_days=None, category=None,
                seniority=(), employment_type=(), company_type=(), skills=(), posting_language=None,
                salary_min=None, company=None, limit=20, offset=0, now=None) -> dict:
    """Params must already be validated by the caller (see rest.py)."""
    now = now or datetime.now(timezone.utc).replace(second=0, microsecond=0)  # minute grain keeps the cache useful
    query = (q or "").strip()
    payload = {"q": query, "limit": limit, "offset": offset, "attributesToRetrieve": RETRIEVE,
               "filter": build_filter(cities=cities, work_mode=work_mode, posted_within_days=posted_within_days,
                                      category=category, seniority=seniority, employment_type=employment_type,
                                      company_type=company_type, skills=skills, posting_language=posting_language,
                                      salary_min=salary_min, company=company, now=now)}
    if not query:
        payload["sort"] = ["posted_ts:desc"]
    data = _cached(payload)
    hits, total = data.get("hits"), data.get("estimatedTotalHits")
    if not isinstance(hits, list):
        raise ServiceError("job_source_unavailable", retryable=True)
    return {"items": [hit_to_item(h, now) for h in hits if isinstance(h, dict)],
            "total": total if isinstance(total, int) and not isinstance(total, bool) else len(hits),
            "limit": limit, "offset": offset}


def _top(counts, n) -> list[dict]:
    if not isinstance(counts, dict):
        return []
    pairs = [(k, v) for k, v in counts.items() if isinstance(v, int) and not isinstance(v, bool)]
    pairs.sort(key=lambda kv: (-kv[1], kv[0]))
    return [{"value": k, "count": v} for k, v in pairs[:n]]


def job_facets(*, now=None) -> dict:
    data = _cached({"q": "", "limit": 0, "facets": FACETS})
    facets, total = data.get("facetDistribution"), data.get("estimatedTotalHits")
    if not isinstance(facets, dict) or not isinstance(total, int):
        raise ServiceError("job_source_unavailable", retryable=True)
    thai = facets.get("posting_language")
    thai = thai.get("th") if isinstance(thai, dict) else None
    try:  # decorative number: a failed second call must not take the facets down
        new_7d = search_jobs(posted_within_days=7, limit=1, now=now)["total"]
    except ServiceError:
        new_7d = None
    return {"total": total, "categories": _top(facets.get("category"), 12),
            "cities": _top(facets.get("cities"), 10), "seniority": _top(facets.get("seniority"), 12),
            "employment_type": _top(facets.get("employment_type"), 12),
            "company_type": _top(facets.get("company_type"), 12), "skills": _top(facets.get("skills"), 20),
            "thai_postings": thai if isinstance(thai, int) and not isinstance(thai, bool) else 0,
            "new_7d": new_7d}
