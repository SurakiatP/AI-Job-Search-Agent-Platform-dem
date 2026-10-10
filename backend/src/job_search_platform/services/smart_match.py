"""Smart match with Jev: per-job questions, score combination, highlights, hiding and the shared pool.

Pure functions except build_pool (job-board HTTP through job_sources, cached there).
"""
from __future__ import annotations

import hashlib

from job_search_platform.services import job_sources
from job_search_platform.services.skill_coverage import extract_skills, skill_mentions

MAX_SKILLS = 12
JOB_CHARS = 6000
BANDS = (70, 55, 40, 25)
SENIORITY = ("far_below", "below", "meets", "above")
SENIORITY_VALUE = (0.0, 0.5, 1.0, 0.8)
CATEGORY_MIN_PROBABILITY = 0.25
MAX_CATEGORIES = 2


def job_text(job: dict) -> str:
    return f"{job['title']}\n{job['description_markdown']}\n" + ", ".join(job["skills"])


def job_skills(job: dict) -> list[str]:
    """Dictionary skills in posting order, then upstream tags not already named; at most MAX_SKILLS."""
    names = [name for _, name, _ in skill_mentions(f"{job['title']}\n{job['description_markdown']}")]
    for tag in job["skills"]:
        canonical = (extract_skills(tag) or [tag.strip()])[0]
        if canonical and canonical.casefold() not in {n.casefold() for n in names}:
            names.append(canonical)
    return names[:MAX_SKILLS]


def job_state(cv_text: str, job: dict) -> dict:
    posting = f"{job['title']} — {job.get('company') or ''}\n{job['description_markdown']}"
    return {"cv": cv_text, "job_posting": posting[:JOB_CHARS]}


def job_questions(skills: list[str]) -> dict:
    questions = {
        "role_fit": {"type": "score", "instructions": "How closely the candidate's past roles match the work this job posting describes.",
                     "criteria": ["The candidate has worked in an unrelated field or role family.",
                                  "The candidate has adjacent experience: same broad field but a different specialty.",
                                  "The candidate has done similar work, but not the core of this role.",
                                  "The candidate has repeatedly done the core work this job describes."]},
        "seniority_fit": {"type": "score", "instructions": "How the candidate's years and level of experience compare with what the job asks for.",
                          "criteria": ["The candidate is far below the experience the job requires.",
                                       "The candidate is somewhat below the required experience.",
                                       "The candidate meets the required experience.",
                                       "The candidate is well above the level this job asks for."]},
        "hard_blocker": {"type": "noul", "instructions": "Does the job state a mandatory requirement (licence, degree field, language, citizenship, specific certification) that the CV clearly does not satisfy?",
                         "criteria": {"true": "A stated must-have requirement is clearly missing from the CV.",
                                      "false": "No stated must-have requirement is clearly missing from the CV."}},
    }
    for i, skill in enumerate(skills[:MAX_SKILLS]):
        questions[f"skill_{i}"] = {"type": "noul", "instructions": f"Does the CV show evidence that the candidate has used {skill}?",
                                   "criteria": {"true": f"The CV names {skill} or clearly describes work done with it.",
                                                "false": f"The CV does not mention {skill} or work done with it."}}
        questions[f"must_{i}"] = {"type": "noul", "instructions": f"Does the job posting state {skill} as a required qualification rather than a preferred one?",
                                  "criteria": {"true": f"The posting lists {skill} as required or must-have.",
                                               "false": f"The posting lists {skill} as preferred, a plus, or only mentions it."}}
    return questions


def band(fit: int) -> int:
    return 5 - next((i for i, edge in enumerate(BANDS) if fit >= edge), 4)


def _probability(probabilities: dict, index: int) -> float:
    return float(probabilities.get(str(index), probabilities.get(index, 0.0)))


def combine(answers: dict, skills: list[str]) -> dict:
    role = answers["role_fit"]["score"] / 3
    seniority_p = [_probability(answers["seniority_fit"]["probabilities"], i) for i in range(4)]
    seniority = sum(w * p for w, p in zip(SENIORITY_VALUE, seniority_p))
    evidenced, must_missing, nice_missing, weighted, weights = [], [], [], 0.0, 0.0
    for i, skill in enumerate(skills[:MAX_SKILLS]):
        have = answers[f"skill_{i}"]["noul"]
        must = answers[f"must_{i}"]["noul"] >= 0.5
        weight = 2.0 if must else 1.0
        weighted, weights = weighted + weight * have, weights + weight
        (evidenced if have >= 0.5 else must_missing if must else nice_missing).append(skill)
    skill_part = weighted / weights if weights else role
    blocker = answers["hard_blocker"]["noul"]
    fit = max(0, min(100, round(100 * (0.5 * role + 0.3 * skill_part + 0.2 * seniority) * (1 - 0.5 * blocker))))
    return {"fit_percent": fit, "band": band(fit), "uncertain": answers["role_fit"]["confidence"] < 0.5,
            "seniority": SENIORITY[max(range(4), key=seniority_p.__getitem__)], "hard_blocker": blocker >= 0.5,
            "skills_evidenced": evidenced, "must_missing": must_missing, "nice_missing": nice_missing}


def category_question(options: list[str]) -> dict:
    return {"category": {"type": "choice",
                         "instructions": "Which job category best fits the work this candidate has done and is qualified to do next?",
                         "criteria": {c: f"Jobs in the '{c.replace('-', ' ').replace('_', ' ')}' category." for c in options}}}


def pick_categories(answer: dict) -> list[str]:
    ranked = sorted(answer["probabilities"].items(), key=lambda kv: -float(kv[1]))
    chosen = [c for c, p in ranked if float(p) >= CATEGORY_MIN_PROBABILITY][:MAX_CATEGORIES]
    return chosen or [ranked[0][0]]


def highlight_terms(text: str, matched: list[str], missing: list[str]) -> dict:
    surfaces = {name: surface for _, name, surface in skill_mentions(text)}
    return {"matched": {n: surfaces.get(n, n) for n in matched}, "missing": {n: surfaces.get(n, n) for n in missing}}


def content_hash(job: dict) -> str:
    return hashlib.sha256(f"{job['title']}\n{job['description_markdown']}".encode()).hexdigest()


def company_key(name: str | None) -> str:
    return " ".join((name or "").split()).casefold()


def is_hidden(job: dict, hidden: set[tuple[str, str]]) -> bool:
    if ("job", job["slug"]) in hidden:
        return True
    key = company_key(job.get("company"))
    return bool(key) and ("company", key) in hidden


def build_pool(*, q: str, cities, work_mode, posted_within_days, category, pool: int, offset: int,
               cv_categories: list[str] | None, filters: dict | None = None, fetch=None) -> dict:
    """One job pool for GET and the worker: the typed query, or CV-derived categories when none is typed."""
    common = {"cities": cities, "work_mode": work_mode, "posted_within_days": posted_within_days, "fetch": fetch,
              **{k: v for k, v in (filters or {}).items() if k in job_sources.FILTER_KEYS}}
    if (q or "").strip() or category or not cv_categories:
        page = job_sources.search_jobs(q=q, category=category, limit=pool, offset=offset, **common)
        return {"items": page["items"], "total": page["total"]}
    share, items, seen, total = max(1, pool // len(cv_categories)), [], set(), 0
    for name in cv_categories:
        page = job_sources.search_jobs(q=None, category=name, limit=share, offset=offset // len(cv_categories), **common)
        total += page["total"]
        for item in page["items"]:
            if item["slug"] not in seen:
                seen.add(item["slug"])
                items.append(item)
    items.sort(key=lambda item: item["age_days"] if item["age_days"] is not None else 10**6)
    return {"items": items, "total": total}
