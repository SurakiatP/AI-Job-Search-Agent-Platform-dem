"""WP5 source fetchers: freehire (documented API) and public ATS job boards, Thailand postings only.

Fixed host allowlist; board tokens validated and quoted, so config can never redirect a request.
"""
from __future__ import annotations

import json
import re
import time
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

SOURCES = ("freehire", "greenhouse", "lever", "smartrecruiters")
USER_AGENT = "job-search-platform/0.1 (+https://github.com/SurakiatP/AI-Job-Search-Agent-Platform-dem)"
TIMEOUT_SECONDS = 8
MAX_BYTES = 2 * 1024 * 1024
GREENHOUSE_MAX_BYTES = 8 * 1024 * 1024
PAUSE_SECONDS = 0.5
PAGE = 100
MAX_PAGES = 100  # freehire: ~59 pages today; upstream offset+limit bound is 10,000
_TOKEN = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_THAI_LOCATION = re.compile(r"thailand|bangkok|ประเทศไทย|กรุงเทพ", re.I)


class BoardError(Exception):
    """One board failed: network, status, size, or an unexpected body. Never treated as 'empty'."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_get(url: str, max_bytes: int = MAX_BYTES) -> dict | list:
    try:
        request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, method="GET")
        with build_opener(_NoRedirect(), ProxyHandler({})).open(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise BoardError(f"status_{response.status}")
            raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise BoardError("too_large")
        return json.loads(raw)
    except BoardError:
        raise
    except Exception as exc:
        raise BoardError(type(exc).__name__) from None


def valid_board(token: str) -> bool:
    # "." and ".." match the charset but would be path traversal once placed in a URL
    return bool(_TOKEN.match(token)) and token not in (".", "..")


def fetch_board(source: str, board: str | None, *, get=None, sleep=time.sleep) -> list[dict]:
    get = get or http_get
    if source != "freehire" and (board is None or not valid_board(board)):
        raise BoardError("invalid_board")
    calls = 0

    def call(url, max_bytes=MAX_BYTES):
        nonlocal calls
        if calls:
            sleep(PAUSE_SECONDS)
        calls += 1
        return get(url, max_bytes)

    if source == "freehire":
        return _freehire(call)
    if source == "greenhouse":
        return _greenhouse(call, quote(board, safe=""))
    if source == "lever":
        return _lever(call, quote(board, safe=""))
    if source == "smartrecruiters":
        return _smartrecruiters(call, quote(board, safe=""))
    raise BoardError("unknown_source")


def _freehire(call) -> list[dict]:
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        params = [("countries", "TH"), ("description_format", "markdown"), ("limit", PAGE), ("offset", page * PAGE)]
        data = call(f"https://freehire.me/api/v1/agent/jobs/search?{urlencode(params)}")
        items, meta = (data.get("data"), data.get("meta")) if isinstance(data, dict) else (None, None)
        if not isinstance(items, list) or not isinstance(meta, dict) or not isinstance(meta.get("total"), int):
            raise BoardError("bad_body")
        rows += [r for r in items if isinstance(r, dict)]
        if len(rows) >= meta["total"] or not items:
            return rows
    raise BoardError("too_many_pages")


def _greenhouse(call, board: str) -> list[dict]:
    data = call(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true", GREENHOUSE_MAX_BYTES)
    jobs = data.get("jobs") if isinstance(data, dict) else None
    if not isinstance(jobs, list):
        raise BoardError("bad_body")
    return [j for j in jobs if isinstance(j, dict)
            and _THAI_LOCATION.search(str((j.get("location") or {}).get("name") or ""))]


def _lever(call, board: str) -> list[dict]:
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        data = call(f"https://api.lever.co/v0/postings/{board}?mode=json&skip={page * PAGE}&limit={PAGE}")
        if not isinstance(data, list):
            raise BoardError("bad_body")
        rows += [p for p in data if isinstance(p, dict) and (
            p.get("country") == "TH" or _THAI_LOCATION.search(str((p.get("categories") or {}).get("location") or "")))]
        if len(data) < PAGE:
            return rows
    raise BoardError("too_many_pages")


def _smartrecruiters(call, board: str) -> list[dict]:
    rows: list[dict] = []
    for page in range(MAX_PAGES):
        data = call(f"https://api.smartrecruiters.com/v1/companies/{board}/postings?country=th&limit={PAGE}&offset={page * PAGE}")
        content = data.get("content") if isinstance(data, dict) else None
        if not isinstance(content, list) or not isinstance(data.get("totalFound"), int):
            raise BoardError("bad_body")
        rows += [p for p in content if isinstance(p, dict) and isinstance(p.get("id"), str) and valid_board(p["id"])]
        if len(rows) >= data["totalFound"] or len(content) < PAGE:
            break
    for posting in rows:
        detail = call(f"https://api.smartrecruiters.com/v1/companies/{board}/postings/{quote(posting['id'], safe='')}")
        if not isinstance(detail, dict):
            raise BoardError("bad_body")
        posting["detail"] = detail
    return rows
