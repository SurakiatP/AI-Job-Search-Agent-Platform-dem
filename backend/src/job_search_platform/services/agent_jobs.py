"""Direct (no Task) agent skills: jobs_search and jobs_fit.

Handlers are awaited by REST, MCP and A2A as ``handler(services, actor, request, project_id=None)``;
``project_id`` is only needed for owner actors, grants carry their own Project.
"""
from __future__ import annotations

import asyncio
import re
from uuid import UUID

from sqlalchemy import select

from job_search_platform.db.models import CVRevisionText
from job_search_platform.db.repositories import Repositories
from job_search_platform.services import job_sources
from job_search_platform.services.contracts import (
    Actor, AgentJobFit, AgentJobFitResult, AgentJobItem, AgentJobSearch, AgentJobSearchResult,
)
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.skill_coverage import METHOD, compute_skill_coverage

_FENCE = re.compile(r"^[ \t]*(```|~~~).*$", re.M)
_IMAGE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_HEADING = re.compile(r"^ {0,3}#{1,6}[ \t]+", re.M)
_QUOTE = re.compile(r"^ {0,3}> ?", re.M)
_BULLET = re.compile(r"^[ \t]*[-*+][ \t]+", re.M)
_RULE = re.compile(r"^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$", re.M)
_EMPHASIS = re.compile(r"(?<!\w)(__|_)(?=\S)(.+?)(?<=\S)\1(?!\w)|(\*\*|\*|~~|`)(?=\S)(.+?)(?<=\S)\3")
_BLANKS = re.compile(r"\n{3,}")


def markdown_to_text(md: str) -> str:
    """Deterministic, lossy Markdown to plain text for agents that do not want markup."""
    text = _FENCE.sub("", md)
    text = _IMAGE.sub(r"\1", text)
    text = _LINK.sub(r"\1", text)
    text = _RULE.sub("", text)
    text = _HEADING.sub("", text)
    text = _QUOTE.sub("", text)
    text = _BULLET.sub("- ", text)
    for _ in range(2):  # nested emphasis such as **_x_**
        text = _EMPHASIS.sub(lambda m: m.group(2) or m.group(4), text)
    return _BLANKS.sub("\n\n", text).strip()


def _authorize(db, actor, project, skill_id):
    from job_search_platform.services.authorization import authorize  # authorization imports the registry that imports us
    authorize(db, actor, project, "read", skill_id)


def _project(actor: Actor, project_id: UUID | None) -> UUID:
    value = project_id or actor.project_id  # the REST path wins; authorize turns a grant mismatch into not_found
    if value is None:
        raise ServiceError("not_found")
    return value


async def jobs_search(services, actor: Actor, request: AgentJobSearch, project_id: UUID | None = None) -> dict:
    project = _project(actor, project_id)

    def check() -> None:
        with services.sessions() as db:
            _authorize(db, actor, project, "jobs_search")

    await asyncio.to_thread(check)
    page = await asyncio.to_thread(
        job_sources.search_jobs, q=request.q, cities=request.cities, work_mode=request.work_mode,
        posted_within_days=request.posted_within_days, category=request.category, limit=request.limit)
    as_text = request.description_format == "text"
    jobs = tuple(AgentJobItem(
        source_id=item["slug"], title=item["title"], company=item["company"],
        city=(item["cities"][0] if item["cities"] else item["location"]), work_mode=item["work_mode"],
        posted_at=item["posted_at"], posting_age_days=item["age_days"], stale=item["stale"],
        source_url=item["source_url"],
        description=markdown_to_text(item["description_markdown"]) if as_text else item["description_markdown"],
        description_format=request.description_format,
    ) for item in page["items"])
    return AgentJobSearchResult(jobs=jobs).model_dump(mode="json")


async def jobs_fit(services, actor: Actor, request: AgentJobFit, project_id: UUID | None = None) -> dict:
    project = _project(actor, project_id)

    def run() -> dict:
        with services.sessions.begin() as db:
            _authorize(db, actor, project, "jobs_fit")
            if request.job is not None:
                job_text = f"{request.job.title}\n{request.job.description}"
            else:
                job = Repositories.job_revision(db, project, request.job_revision_id)
                job_text = f"{job.title}\n{job.description}"
            revision = Repositories.latest_cv_revision(db, project, request.cv_id)
            row = db.scalar(select(CVRevisionText).where(
                CVRevisionText.project_id == project, CVRevisionText.cv_revision_id == revision.id))
            if row is None:
                raise ServiceError("cv_text_unavailable")
            return compute_skill_coverage(row.text, job_text)  # CPU-only, no model, no Run row

    coverage = await asyncio.to_thread(run)
    if coverage is None:
        return AgentJobFitResult(method=METHOD, reason="too_few_skills").model_dump(mode="json")
    return AgentJobFitResult(**coverage).model_dump(mode="json")
