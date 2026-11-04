"""USD to THB reference rate fetched live from a free API (no key); cached in process for one hour."""
from __future__ import annotations

import json
import threading
import time
import urllib.request
from datetime import datetime, timezone

from job_search_platform.services.errors import ServiceError

TTL = 3600
_lock = threading.Lock()
_cache: dict = {}  # last good value; ponytail: per-process, one extra fetch per worker per hour


def _get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "job-search-platform"})
    with urllib.request.urlopen(request, timeout=5) as response:  # noqa: S310 - fixed https URLs
        return json.load(response)


def _frankfurter() -> dict:
    data = _get_json("https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB")
    return {"rate": float(data["rates"]["THB"]), "as_of": str(data["date"]),
            "source": "Frankfurter (European Central Bank reference rates)", "source_url": "https://frankfurter.dev"}


def _er_api() -> dict:
    data = _get_json("https://open.er-api.com/v6/latest/USD")
    as_of = datetime.fromtimestamp(int(data["time_last_update_unix"]), timezone.utc).date().isoformat()
    return {"rate": float(data["rates"]["THB"]), "as_of": as_of,
            "source": "ExchangeRate-API open access", "source_url": "https://www.exchangerate-api.com"}


def usd_thb() -> dict:
    with _lock:
        now = time.time()
        if _cache and now - _cache["at"] < TTL:
            return {**_cache["value"], "stale": False}
        for provider in (_frankfurter, _er_api):
            try:
                value = provider()
                if value["rate"] <= 0:
                    continue
            except Exception:  # noqa: BLE001 - any provider failure falls through to the next one
                continue
            value["fetched_at"] = datetime.fromtimestamp(now, timezone.utc).isoformat()
            _cache.update(at=now, value=value)
            return {**value, "stale": False}
        if _cache:
            return {**_cache["value"], "stale": True}
    raise ServiceError("fx_unavailable", retryable=True)
