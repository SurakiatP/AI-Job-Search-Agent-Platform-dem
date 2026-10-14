"""WP5 Thai dictionary (roles, provinces) and dictionary-only enrichment; no model involved (spec D7)."""
from __future__ import annotations

import re
from pathlib import Path

from job_search_platform.services import skill_coverage

DATA = Path(__file__).resolve().parents[1] / "data"
SKILL_SLUG = re.compile(r"^[a-z0-9][a-z0-9.+#-]{0,40}$")  # same as job_sources.SKILL_RE
MAX_SKILLS = 8

# freehire's category vocabulary (GET /jobs/facets?countries=TH, 2026-10-14), shared so one filter covers all sources.
CATEGORIES = frozenset((
    "management", "sales", "marketing", "support", "industrial_engineering", "finance", "project_management",
    "operations", "qa", "software_engineering", "solutions_engineering", "hr", "design", "hospitality", "devops",
    "product", "recruiting", "business_analysis", "occupational_safety", "security", "fullstack", "legal",
    "data_engineering", "architecture", "backend", "data_analytics", "logistics", "customer_success", "mobile",
    "administration", "data_science", "engineering_design", "ai_engineering", "frontend", "creative", "hardware",
    "ml_ai", "technical_writing", "skilled_trades", "personal_services", "network_engineering", "sre", "embedded",
    "retail", "blockchain", "education", "developer_relations", "other",
))


def parse_dictionary(text: str) -> list[tuple[str, list[str]]]:
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, rest = line.partition("=")
        out.append((name.strip(), [a.strip() for a in rest.split(",") if a.strip()]))
    return out


def _matcher(aliases: list[str]) -> re.Pattern[str]:
    """ASCII aliases on alphanumeric boundaries; Thai aliases as substrings (Thai has no word spaces)."""
    ascii_ = sorted((a for a in aliases if a.isascii()), key=len, reverse=True)
    thai = sorted((a for a in aliases if not a.isascii()), key=len, reverse=True)
    parts = []
    if ascii_:
        parts.append(rf"(?<![a-z0-9])(?:{'|'.join(map(re.escape, ascii_))})(?![a-z0-9])")
    if thai:
        parts.append("|".join(map(re.escape, thai)))
    return re.compile("|".join(parts))


def _build_provinces(text: str) -> dict[str, tuple[str, str]]:
    table: dict[str, tuple[str, str]] = {}
    for key, aliases in parse_dictionary(text):
        code, _, name = key.partition("|")
        for alias in (name, *aliases):
            if table.setdefault(alias.lower(), (code, name)) != (code, name):
                raise ValueError(f"location alias {alias!r} maps to two provinces")
    return table


def _load_roles() -> list[tuple[str, re.Pattern[str], str]]:
    roles = []
    for key, aliases in parse_dictionary((DATA / "roles.txt").read_text(encoding="utf-8")):
        name, _, category = key.partition("|")
        roles.append((name, _matcher([a.lower() for a in (name, *aliases)]), category))
    return roles


_PROVINCES = _build_provinces((DATA / "locations.txt").read_text(encoding="utf-8"))
_PROVINCE_RE = _matcher(list(_PROVINCES))
_ROLES = _load_roles()

_SENIORITY = (  # first match wins: most specific first
    ("intern", _matcher(["intern", "internship", "trainee", "ฝึกงาน", "นักศึกษาฝึกงาน"])),
    ("c_level", _matcher(["head of", "director", "chief", "vp", "vice president", "cto", "ceo", "cfo", "ผู้อำนวยการ"])),
    ("principal", _matcher(["principal"])),
    ("staff", _matcher(["staff engineer", "staff software"])),
    ("lead", _matcher(["lead", "team lead", "tech lead", "หัวหน้า", "หัวหน้าทีม"])),
    ("senior", _matcher(["senior", "sr", "sr.", "อาวุโส"])),
    ("junior", _matcher(["junior", "jr", "jr.", "entry level", "จูเนียร์"])),
)
_WORK_MODE = (
    ("hybrid", _matcher(["hybrid", "ไฮบริด"])),
    ("remote", _matcher(["remote", "work from home", "wfh", "ทำงานที่บ้าน", "ทำงานจากที่บ้าน"])),
)
_THAI = re.compile(r"[฀-๿]")
_LETTER = re.compile(r"[A-Za-z฀-๿]")


def province_of(text: str | None) -> tuple[str, str] | None:
    match = _PROVINCE_RE.search(text.lower()) if text else None
    return _PROVINCES[match.group(0)] if match else None


def role_of(title: str) -> tuple[str, str] | None:
    low = title.lower()
    best = None
    for name, pattern, category in _ROLES:  # longest matched alias wins ("backend engineer" over "engineer")
        match = pattern.search(low)
        if match and (best is None or len(match.group(0)) > best[0]):
            best = (len(match.group(0)), name, category)
    return (best[1], best[2]) if best else None


def seniority_of(title: str) -> str | None:
    low = title.lower()
    return next((value for value, pattern in _SENIORITY if pattern.search(low)), None)


def work_mode_of(text: str) -> str | None:
    low = text.lower()
    return next((value for value, pattern in _WORK_MODE if pattern.search(low)), None)


def posting_language_of(text: str) -> str:
    letters = len(_LETTER.findall(text))
    return "th" if letters and len(_THAI.findall(text)) / letters >= 0.3 else "en"


def skills_of(text: str) -> list[str]:
    out: list[str] = []
    for _, name, _ in skill_coverage.skill_mentions(text):
        slug = re.sub(r"\s+", "-", name.lower())
        if SKILL_SLUG.match(slug) and slug not in out:
            out.append(slug)
        if len(out) == MAX_SKILLS:
            break
    return out
