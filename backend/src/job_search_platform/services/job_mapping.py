"""WP5: one raw upstream posting -> job_postings column values (dictionary enrichment, spec D7)."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone

from job_search_platform.services import job_dictionary as jd
from job_search_platform.services.applications import _same_job_url
from job_search_platform.services.job_sources import CHOICES
from job_search_platform.services.job_text import html_to_markdown

DESCRIPTION_MAX = 50000
SLUG_MAX = 200
_LEGAL = re.compile(r"\b(co\.?,?\s*ltd\.?|company limited|public company limited|pcl|inc\.?|ltd\.?|corp\.?)|"
                    r"บริษัท|จำกัด|\(มหาชน\)|มหาชน", re.I)
_EMPLOYMENT = {"full-time": "full_time", "full_time": "full_time", "permanent": "full_time",
               "part-time": "part_time", "part_time": "part_time", "contract": "contract", "temporary": "contract",
               "internship": "internship", "intern": "internship"}
_PERIOD = {"month": "month", "monthly": "month", "per-month-salary": "month",
           "year": "year", "yearly": "year", "annual": "year", "per-year-salary": "year"}


def _text(value, limit=300):
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def _int(value):
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < 10**9 else None


def company_key(company: str | None) -> str:
    return re.sub(r"[^\w]+", " ", _LEGAL.sub(" ", (company or "").casefold())).strip()


def _thb_month(amount, currency, period):
    if amount is None or (currency or "").upper() != "THB":
        return None
    return amount if period == "month" else amount // 12 if period == "year" else None


def _fields(source, board, raw):
    if source == "freehire":
        enrichment = raw.get("enrichment") if isinstance(raw.get("enrichment"), dict) else {}
        slug = _text(raw.get("public_slug"), SLUG_MAX)
        return dict(
            external_id=slug, slug=slug, title=raw.get("title"), company=raw.get("company"),
            location=raw.get("location"), url=raw.get("url"), description=raw.get("description"), html=False,
            posted_at=raw.get("posted_at"), work_mode=raw.get("work_mode"),
            seniority=enrichment.get("seniority") or raw.get("seniority"),
            employment_type=enrichment.get("employment_type") or raw.get("employment_type"),
            company_type=enrichment.get("company_type") or raw.get("company_type"),
            category=enrichment.get("category"), skills=raw.get("skills"),
            posting_language=enrichment.get("posting_language"),
            salary=(enrichment.get("salary_min"), enrichment.get("salary_max"), enrichment.get("salary_currency"),
                    enrichment.get("salary_period")),
            reality_stale=isinstance((raw.get("reality") or {}).get("class"), str) and raw["reality"]["class"] != "fresh",
            cities=raw.get("cities"))
    if source == "greenhouse":
        ext = str(raw.get("id") or "")
        return dict(external_id=ext or None, slug=f"gh-{board}-{ext}"[:SLUG_MAX], title=raw.get("title"),
                    company=raw.get("company_name") or board, location=(raw.get("location") or {}).get("name"),
                    url=raw.get("absolute_url"), description=raw.get("content"), html=True,
                    posted_at=raw.get("first_published") or raw.get("updated_at"))
    if source == "lever":
        categories = raw.get("categories") if isinstance(raw.get("categories"), dict) else {}
        salary = raw.get("salaryRange") if isinstance(raw.get("salaryRange"), dict) else {}
        created = raw.get("createdAt")
        return dict(external_id=_text(raw.get("id"), 200), slug=f"lv-{board}-{raw.get('id')}"[:SLUG_MAX],
                    title=raw.get("text"), company=raw.get("company") or board, location=categories.get("location"),
                    url=raw.get("hostedUrl"), description=raw.get("descriptionPlain") or raw.get("description"),
                    html=not raw.get("descriptionPlain"),
                    posted_at=(None if not isinstance(created, int) else
                               datetime.fromtimestamp(created / 1000, timezone.utc).isoformat()),
                    work_mode={"remote": "remote", "hybrid": "hybrid", "on-site": "onsite"}.get(raw.get("workplaceType")),
                    employment_type=categories.get("commitment"),
                    salary=(salary.get("min"), salary.get("max"), salary.get("currency"), salary.get("interval")))
    detail = raw.get("detail") if isinstance(raw.get("detail"), dict) else {}
    location = raw.get("location") if isinstance(raw.get("location"), dict) else {}
    sections = ((detail.get("jobAd") or {}).get("sections") or {})
    description = "\n".join(str((sections.get(k) or {}).get("text") or "")
                            for k in ("companyDescription", "jobDescription", "qualifications", "additionalInformation"))
    return dict(external_id=_text(raw.get("id"), 200), slug=f"sr-{board}-{raw.get('id')}"[:SLUG_MAX],
                title=raw.get("name"), company=(raw.get("company") or {}).get("name") or board,
                location=", ".join(str(v) for v in (location.get("city"), location.get("region"), "Thailand") if v),
                url=detail.get("postingUrl") or raw.get("ref"), description=description, html=True,
                posted_at=raw.get("releasedDate"),
                work_mode="remote" if location.get("remote") else "hybrid" if location.get("hybrid") else None,
                employment_type=(raw.get("typeOfEmployment") or {}).get("label"))


def map_posting(source: str, board: str | None, raw: dict) -> dict | None:
    f = _fields(source, board, raw)
    title, url, external_id = _text(f.get("title")), _text(f.get("url"), 2048), f.get("external_id")
    if not (title and url and external_id):
        return None
    description = f.get("description") if isinstance(f.get("description"), str) else ""
    description = (html_to_markdown(description) if f.get("html") else description)[:DESCRIPTION_MAX]
    location = _text(f.get("location"))
    province = jd.province_of(location)
    role = jd.role_of(title)
    seniority = f.get("seniority") if f.get("seniority") in CHOICES["seniority"] else jd.seniority_of(title)
    employment = f.get("employment_type")
    employment = employment if employment in CHOICES["employment_type"] else _EMPLOYMENT.get(str(employment or "").lower())
    category = f.get("category") if f.get("category") in jd.CATEGORIES else (role[1] if role else "other")
    skills = f.get("skills") if isinstance(f.get("skills"), list) and f["skills"] else jd.skills_of(f"{title}\n{description}")
    cities = f.get("cities") if isinstance(f.get("cities"), list) and f["cities"] else ([province[1]] if province else [])
    smin, smax, currency, period = f.get("salary") or (None, None, None, None)
    smin, smax = _int(smin), _int(smax)
    period = _PERIOD.get(str(period or "").lower())
    language = f.get("posting_language") if f.get("posting_language") in ("th", "en") else jd.posting_language_of(f"{title}\n{description}")
    ckey = company_key(f.get("company"))
    row = dict(
        source=source, board=board, external_id=str(external_id)[:200], slug=f["slug"],
        title=title, company=_text(f.get("company")), location=location,
        cities=[c for c in cities if isinstance(c, str)][:5], province=province[0] if province else None,
        work_mode=f.get("work_mode") if f.get("work_mode") in ("remote", "hybrid", "onsite") else jd.work_mode_of(f"{title} {location or ''}"),
        seniority=seniority, employment_type=employment,
        company_type=f.get("company_type") if f.get("company_type") in CHOICES["company_type"] else None,
        category=category, skills=[s for s in skills if isinstance(s, str) and jd.SKILL_SLUG.match(s)][:jd.MAX_SKILLS],
        salary_min=smin, salary_max=smax, salary_currency=(currency or "").upper()[:3] or None,
        salary_period=period, salary_thb_month_min=_thb_month(smin, currency, period),
        posting_language=language, description_markdown=description, source_url=url,
        url_key=_same_job_url(url),
        match_key=f"{ckey}|{(role[0] if role else title).casefold()}|{province[0]}" if province and ckey else None,
        posted_at=f.get("posted_at") if isinstance(f.get("posted_at"), str) else None,
        reality_stale=bool(f.get("reality_stale")),
    )
    row["content_hash"] = hashlib.sha256(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest()
    return row
