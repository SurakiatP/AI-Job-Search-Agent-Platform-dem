"""Builder resume data: schema, plain text for AI, experience-bank facts and Typst render bundle (spec 2026-10-19)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

TEMPLATES = {"onyx": True, "kakuna": True, "ditgar": False}  # id -> reads in order for ATS
ACCENTS = {"indigo": "#3730A3", "blue": "#1D4ED8", "teal": "#115E59", "green": "#166534", "rose": "#9F1239", "slate": "#334155"}
SECTIONS = ("summary", "experience", "education", "skills", "projects", "certifications", "languages", "awards",
            "publications", "volunteer", "references", "interests")
MAX_BYTES = 200 * 1024
TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "data" / "resume_templates"

Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Date = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^(\d{4}(-(0[1-9]|1[0-2]))?)?$")]


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _url(value: str) -> str:
    value = value.strip()
    if value and not value.lower().startswith(("http://", "https://", "mailto:")):
        raise ValueError("url_scheme")
    if len(value) > 500:
        raise ValueError("url_length")
    return value


class _Item(_M):
    id: str

    @field_validator("id")
    @classmethod
    def check_id(cls, value: str) -> str:
        UUID(value)
        return value


class Profile(_Item):
    network: Short = ""
    url: str = ""
    check_url = field_validator("url")(classmethod(lambda cls, v: _url(v)))


class Basics(_M):
    name: Short = ""
    headline: Short = ""
    email: Short = ""
    phone: Short = ""
    location: Short = ""
    profiles: list[Profile] = Field(default_factory=list, max_length=10)


class Summary(_M):
    content: Text = ""


Highlights = Annotated[list[Text], Field(max_length=20)]


class Experience(_Item):
    company: Short = ""
    position: Short = ""
    location: Short = ""
    start: Date = ""
    end: Date = ""
    current: bool = False
    highlights: Highlights = Field(default_factory=list)


class Education(_Item):
    institution: Short = ""
    degree: Short = ""
    area: Short = ""
    grade: Short = ""
    start: Date = ""
    end: Date = ""


class Skill(_Item):
    name: Short = ""
    level: Annotated[int, Field(ge=1, le=5)] | None = None
    keywords: Annotated[list[Short], Field(max_length=20)] = Field(default_factory=list)


class Project(_Item):
    name: Short = ""
    role: Short = ""
    url: str = ""
    start: Date = ""
    end: Date = ""
    highlights: Highlights = Field(default_factory=list)
    check_url = field_validator("url")(classmethod(lambda cls, v: _url(v)))


class Certification(_Item):
    name: Short = ""
    issuer: Short = ""
    date: Date = ""
    url: str = ""
    check_url = field_validator("url")(classmethod(lambda cls, v: _url(v)))


class Language(_Item):
    name: Short = ""
    level: Short = ""


class Award(_Item):
    title: Short = ""
    awarder: Short = ""
    date: Date = ""
    summary: Text = ""


class Publication(_Item):
    title: Short = ""
    publisher: Short = ""
    date: Date = ""
    url: str = ""
    check_url = field_validator("url")(classmethod(lambda cls, v: _url(v)))


class Volunteer(_Item):
    organization: Short = ""
    role: Short = ""
    start: Date = ""
    end: Date = ""
    highlights: Highlights = Field(default_factory=list)


class Reference(_Item):
    name: Short = ""
    relation: Short = ""
    contact: Short = ""


class Interest(_Item):
    name: Short = ""


T = TypeVar("T")


class Section(_M, Generic[T]):
    hidden: bool = False
    items: Annotated[list[T], Field(max_length=50)] = Field(default_factory=list)


class Sections(_M):
    experience: Section[Experience] = Field(default_factory=Section[Experience])
    education: Section[Education] = Field(default_factory=Section[Education])
    skills: Section[Skill] = Field(default_factory=Section[Skill])
    projects: Section[Project] = Field(default_factory=Section[Project])
    certifications: Section[Certification] = Field(default_factory=Section[Certification])
    languages: Section[Language] = Field(default_factory=Section[Language])
    awards: Section[Award] = Field(default_factory=Section[Award])
    publications: Section[Publication] = Field(default_factory=Section[Publication])
    volunteer: Section[Volunteer] = Field(default_factory=Section[Volunteer])
    references: Section[Reference] = Field(default_factory=Section[Reference])
    interests: Section[Interest] = Field(default_factory=Section[Interest])


class ResumeData(_M):
    basics: Basics = Field(default_factory=Basics)
    summary: Summary = Field(default_factory=Summary)
    summary_hidden: bool = False
    sections: Sections = Field(default_factory=Sections)
    order: list[Literal[SECTIONS]] = Field(default_factory=lambda: list(SECTIONS))  # type: ignore[valid-type]
    references_on_request: bool = False

    @field_validator("order")
    @classmethod
    def check_order(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("order_duplicate")
        return value + [name for name in SECTIONS if name not in value]  # sections left out keep their default place


LABELS = {
    "th": {"summary": "สรุปโปรไฟล์", "experience": "ประสบการณ์ทำงาน", "education": "การศึกษา", "skills": "ทักษะ",
           "projects": "โครงการ", "certifications": "ใบรับรอง", "languages": "ภาษา", "awards": "รางวัล",
           "publications": "ผลงานตีพิมพ์", "volunteer": "งานอาสา", "references": "บุคคลอ้างอิง", "interests": "ความสนใจ",
           "profiles": "ลิงก์", "present": "ปัจจุบัน", "on_request": "มีให้เมื่อร้องขอ", "contact": "ติดต่อ"},
    "en": {"summary": "Summary", "experience": "Experience", "education": "Education", "skills": "Skills",
           "projects": "Projects", "certifications": "Certifications", "languages": "Languages", "awards": "Awards",
           "publications": "Publications", "volunteer": "Volunteering", "references": "References", "interests": "Interests",
           "profiles": "Links", "present": "Present", "on_request": "Available on request", "contact": "Contact"},
}


def _hidden(data: ResumeData, name: str) -> bool:
    return data.summary_hidden if name == "summary" else getattr(data.sections, name).hidden


def _period(start: str, end: str, current: bool, lang: str) -> str:
    end = LABELS[lang]["present"] if current else end
    return " – ".join(part for part in (start, end) if part)


def _join(*parts: str, sep: str = " · ") -> str:
    return sep.join(part for part in parts if part)


def is_empty(data: ResumeData) -> bool:
    return not data.summary.content and not any(getattr(data.sections, name).items for name in SECTIONS if name != "summary")


def plain_text(data: ResumeData, lang: str) -> str:
    """CV text for evaluation and tailoring prompts. References never appear (third-party personal data)."""
    b = data.basics
    lines = [line for line in (b.name, _join(b.headline, b.location, b.email, b.phone)) if line]
    labels = LABELS[lang]
    for name in data.order:
        if name == "references" or _hidden(data, name):
            continue
        if name == "summary":
            if data.summary.content:
                lines += ["", labels["summary"], data.summary.content]
            continue
        items = getattr(data.sections, name).items
        if not items:
            continue
        lines += ["", labels[name]]
        for item in items:
            row = item.model_dump()
            head = _join(*(row.get(k, "") for k in ("position", "role", "title", "name", "degree", "area", "company",
                                                      "organization", "institution", "issuer", "awarder", "publisher")
                           if isinstance(row.get(k), str)))
            when = _period(row.get("start", "") or row.get("date", ""), row.get("end", ""), bool(row.get("current")), lang)
            extra = ", ".join(row.get("keywords") or []) or row.get("level") or row.get("summary") or ""
            lines.append(_join(head, when, str(extra) if extra else ""))
            lines += [f"- {h}" for h in row.get("highlights") or [] if h]
    return "\n".join(line for line in lines).strip()


def bank_facts(data: ResumeData, lang: str) -> list[dict]:
    """Owner facts this CV puts in the experience bank; references and empty entries are never facts."""
    s, facts = data.sections, []

    def add(kind: str, text: str, role: str = "", organization: str = "", period: str = "") -> None:
        if text.strip():
            facts.append({"kind": kind, "text": text.strip()[:1000], "role": role[:200] or None,
                          "organization": organization[:200] or None, "period": period[:60] or None})

    if data.summary.content:
        add("other", data.summary.content)
    for kind, items, org, role in (("experience", s.experience.items, "company", "position"),
                                   ("project", s.projects.items, "name", "role"),
                                   ("volunteer", s.volunteer.items, "organization", "role")):
        for item in items:
            period = _period(item.start, item.end, getattr(item, "current", False), lang)
            for highlight in item.highlights or [""]:
                add(kind, highlight or _join(getattr(item, role), getattr(item, org), sep=" — "),
                    getattr(item, role), getattr(item, org), period)
    for item in s.education.items:
        add("education", _join(item.degree, item.area, item.grade, sep=", "), "", item.institution,
            _period(item.start, item.end, False, lang))
    for item in s.skills.items:
        add("skill", _join(item.name, ", ".join(item.keywords), sep=": "))
    for item in s.certifications.items:
        add("certification", item.name, "", item.issuer, item.date)
    for item in s.languages.items:
        add("language", _join(item.name, item.level, sep=" — "))
    for item in s.awards.items:
        add("award", _join(item.title, item.summary, sep=": "), "", item.awarder, item.date)
    for item in s.publications.items:
        add("publication", item.title, "", item.publisher, item.date)
    for item in s.interests.items:
        add("interest", item.name)
    return facts


def from_bank(rows: list, name: str = "") -> ResumeData:
    """Start a draft from live experience-bank rows (kind, text, role, organization, period)."""
    from uuid import uuid4

    grouped: dict[tuple, list[str]] = {}
    data = ResumeData(basics=Basics(name=name[:200]))
    s = data.sections
    for row in rows:
        kind, text = row.kind, row.text[:1000]
        if kind in ("experience", "project", "volunteer"):
            grouped.setdefault((kind, row.role or "", row.organization or "", row.period or ""), []).append(text)
        elif kind == "education":
            s.education.items.append(Education(id=str(uuid4()), institution=(row.organization or "")[:200], degree=text[:200]))
        elif kind == "skill":
            s.skills.items.append(Skill(id=str(uuid4()), name=text[:200]))
        elif kind == "certification":
            s.certifications.items.append(Certification(id=str(uuid4()), name=text[:200], issuer=(row.organization or "")[:200]))
        elif kind == "language":
            s.languages.items.append(Language(id=str(uuid4()), name=text[:200]))
        elif kind == "award":
            s.awards.items.append(Award(id=str(uuid4()), title=text[:200], awarder=(row.organization or "")[:200]))
        elif kind == "publication":
            s.publications.items.append(Publication(id=str(uuid4()), title=text[:200], publisher=(row.organization or "")[:200]))
        elif kind == "interest":
            s.interests.items.append(Interest(id=str(uuid4()), name=text[:200]))
        elif kind == "other" and not data.summary.content:
            data.summary.content = text
    for (kind, role, org, period), highlights in grouped.items():
        common = {"id": str(uuid4()), "highlights": highlights[:20], "start": "", "end": ""}
        if kind == "experience":
            s.experience.items.append(Experience(position=role[:200], company=org[:200], **common))
        elif kind == "project":
            s.projects.items.append(Project(role=role[:200], name=org[:200], **common))
        else:
            s.volunteer.items.append(Volunteer(role=role[:200], organization=org[:200], **common))
    for section in SECTIONS[1:]:
        items = getattr(s, section).items
        del items[50:]
    return data


def render_bundle(data: ResumeData, template: str, accent: str, lang: str) -> dict[str, bytes]:
    """Files for one Typst compile: user data only as JSON, read by the template with json() and printed as text."""
    if template not in TEMPLATES or accent not in ACCENTS or lang not in LABELS:
        raise ValueError("render_options")
    payload = data.model_dump()
    if data.references_on_request:
        payload["sections"]["references"]["items"] = []
    theme = {"accent": ACCENTS[accent], "lang": lang, "references_on_request": data.references_on_request}
    files = {"resume.json": json.dumps(payload, ensure_ascii=False).encode(),
             "labels.json": json.dumps(LABELS[lang], ensure_ascii=False).encode(),
             "theme.json": json.dumps(theme).encode(),
             "main.typ": (TEMPLATE_DIR / f"{template}.typ").read_bytes(),
             "common.typ": (TEMPLATE_DIR / "common.typ").read_bytes()}
    return files


def apply_text_edits(data: ResumeData, edits: list[dict]) -> tuple[ResumeData, list[dict], list[dict]]:
    """Place gated text edits into the fields tailoring may change: the summary and the highlights of experience,
    projects and volunteering. An empty find adds a highlight to the first experience (else the summary). An edit
    whose find is not inside one of those fields (a name, date, employer, heading...) is returned as unplaced."""
    data = data.model_copy(deep=True)
    placed, unplaced = [], []
    for edit in edits:
        find, text = edit.get("find", ""), edit["text"].strip().removeprefix("- ").strip()
        if not text:
            unplaced.append(edit)
            continue
        if not find:
            if data.sections.experience.items and len(data.sections.experience.items[0].highlights) < 20:
                data.sections.experience.items[0].highlights.append(text[:1000])
            elif len(data.summary.content) + len(text) < 1000:
                data.summary.content = (data.summary.content + " " + text).strip()
            else:
                unplaced.append(edit)
                continue
            placed.append(edit)
            continue
        needle = find.strip().removeprefix("- ").strip()
        done = False
        if needle and needle in data.summary.content:
            data.summary.content = " ".join(data.summary.content.replace(needle, text, 1).split())[:1000]
            done = True
        for section in (data.sections.experience, data.sections.projects, data.sections.volunteer):
            for item in section.items:
                for index, line in enumerate(item.highlights):
                    if not done and needle and needle in line:
                        # A replacement spanning several lines becomes several bullets in the same entry.
                        lines = [part.strip().removeprefix("- ").strip() for part in line.replace(needle, text, 1).splitlines()]
                        item.highlights[index:index + 1] = [part[:1000] for part in lines if part]
                        del item.highlights[20:]
                        done = True
        (placed if done else unplaced).append(edit)
    return data, placed, unplaced
