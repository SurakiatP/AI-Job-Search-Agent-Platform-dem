"""Read-only proxy for Freehire's public job API (official API only, Thailand listings)."""
from __future__ import annotations

import json
import re
import threading
import time
from collections import OrderedDict
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from job_search_platform.services.errors import ServiceError

BASE = "https://freehire.me/api/v1"
USER_AGENT = "job-search-platform/0.1 (local owner app; official public API)"
TIMEOUT_SECONDS = 8
MAX_BYTES = 2 * 1024 * 1024
CACHE_TTL_SECONDS = 300
CACHE_MAX_ENTRIES = 128
DESCRIPTION_MAX = 50000
# Upstream reality.class values seen: "fresh", "stale". Anything but "fresh" counts as stale.
FRESH_CLASS = "fresh"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_json(url: str) -> dict:
    """Blocking GET; every failure becomes a safe, retryable ServiceError (upstream bodies never leak)."""
    try:
        request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, method="GET")
        with build_opener(NoRedirect(), ProxyHandler({})).open(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise ValueError
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError
        return data
    except Exception:
        raise ServiceError("job_source_unavailable", retryable=True) from None


_cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()
_lock = threading.Lock()


def _cached(url: str, fetch) -> dict:
    now = time.monotonic()
    with _lock:
        hit = _cache.get(url)
        if hit and now - hit[0] < CACHE_TTL_SECONDS:
            _cache.move_to_end(url)
            return hit[1]
    data = fetch(url)
    with _lock:
        _cache[url] = (now, data)
        _cache.move_to_end(url)
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


def map_item(raw: dict) -> dict:
    enrichment = raw.get("enrichment") if isinstance(raw.get("enrichment"), dict) else {}
    reality = raw.get("reality") if isinstance(raw.get("reality"), dict) else {}
    age = reality.get("age_days")
    description = raw.get("description")
    return {
        "slug": str(raw.get("public_slug") or ""),
        "title": str(raw.get("title") or ""),
        "company": _text(raw.get("company")),
        "location": _text(raw.get("location")),
        "cities": _strings(raw.get("cities")),
        "work_mode": _text(raw.get("work_mode")),
        "skills": _strings(raw.get("skills"), 8),
        "category": _text(enrichment.get("category")),
        "posted_at": _text(raw.get("posted_at")),
        "age_days": age if isinstance(age, int) and not isinstance(age, bool) else None,
        "stale": isinstance(reality.get("class"), str) and reality["class"] != FRESH_CLASS,
        "source_url": _strip_utm(raw.get("url")),
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


def search_jobs(*, q=None, cities=(), work_mode=None, posted_within_days=None, category=None,
                seniority=(), employment_type=(), company_type=(), skills=(), posting_language=None,
                salary_min=None, limit=20, offset=0, fetch=None) -> dict:
    """Params must already be validated by the caller (see rest.py)."""
    params = [("countries", "TH"), ("description_format", "markdown"), ("limit", limit), ("offset", offset)]
    if q and q.strip():
        params.append(("q", q.strip()))
    if cities:
        params.append(("cities", ",".join(cities)))
    for name, value in (("work_mode", work_mode), ("posted_within_days", posted_within_days),
                        ("category", category)):
        if value:
            params.append((name, value))
    for name, values in (("seniority", seniority), ("employment_type", employment_type),
                         ("company_type", company_type), ("skills", skills)):
        if values:
            params.append((name, ",".join(values)))
    if posting_language:
        params.append(("posting_language", posting_language))
    if salary_min:
        params += [("salary_min", salary_min), ("salary_currency", "thb"), ("salary_period", "month")]
    data = _cached(f"{BASE}/agent/jobs/search?{urlencode(sorted(params))}", fetch or fetch_json)
    rows, meta = data.get("data"), data.get("meta")
    if not isinstance(rows, list) or not isinstance(meta, dict):
        raise ServiceError("job_source_unavailable", retryable=True)
    total = meta.get("total")
    return {"items": [map_item(r) for r in rows if isinstance(r, dict)],
            "total": total if isinstance(total, int) else len(rows), "limit": limit, "offset": offset}


def _top(counts, n) -> list[dict]:
    if not isinstance(counts, dict):
        return []
    pairs = [(k, v) for k, v in counts.items() if isinstance(v, int) and not isinstance(v, bool)]
    pairs.sort(key=lambda kv: (-kv[1], kv[0]))
    return [{"value": k, "count": v} for k, v in pairs[:n]]


def job_facets(*, fetch=None) -> dict:
    data = _cached(f"{BASE}/jobs/facets?countries=TH", fetch or fetch_json).get("data")
    facets = data.get("facets") if isinstance(data, dict) else None
    if not isinstance(facets, dict) or not isinstance(data.get("total"), int):
        raise ServiceError("job_source_unavailable", retryable=True)
    thai = facets.get("posting_language")
    thai = thai.get("th") if isinstance(thai, dict) else None
    try:  # decorative number: a failed second call must not take the facets down
        new_7d = search_jobs(posted_within_days=7, limit=1, fetch=fetch)["total"]
    except ServiceError:
        new_7d = None
    return {"total": data["total"], "categories": _top(facets.get("category"), 12),
            "cities": _top(facets.get("cities"), 10), "seniority": _top(facets.get("seniority"), 12),
            "employment_type": _top(facets.get("employment_type"), 12),
            "company_type": _top(facets.get("company_type"), 12), "skills": _top(facets.get("skills"), 20),
            "thai_postings": thai if isinstance(thai, int) and not isinstance(thai, bool) else 0,
            "new_7d": new_7d}
