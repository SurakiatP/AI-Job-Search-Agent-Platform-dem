"""Interview grading and report tasks: synthetic answers / progress built from the gold personas and jobs, no model call.

    python3 evals/gold/build_interview.py     # writes cases["grade"] and cases["report"] into gold.v1.json and gold.holdout.v1.json

grade  (app operation interview_grade): one written answer per case, kind good / weak / offtopic rotating over the practice cases.
       Expected band = the mean of the five 1-5 scores, plus one dimension that must be high (good) or low (weak, offtopic).
report (app operation interview_report): a finished practice set with progress profile strong / mixed / weak. Expected
       readiness per section is a set of allowed levels; `weak_terms` are words a good report names under skills_to_build / plan.
Scoring is deterministic (score_grade / score_report below) and uses the app's own parsers (practice.parse_grade / parse_report).
"""
import json
import re
import statistics
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).parent
KINDS = ("good", "weak", "offtopic")
PROFILES = ("strong", "mixed", "weak")
QUESTION = {  # (section) -> (prompt, why, key_points) in English / Thai
    "intro": {"en": ("Tell me about yourself and why you are applying for the {title} role.", "To hear how you describe your own path.",
                     ["current role", "most relevant experience", "why this job"]),
              "th": ("ช่วยแนะนำตัวและบอกว่าทำไมจึงสมัครตำแหน่ง {title}", "เพื่อฟังว่าคุณเล่าเส้นทางของตัวเองอย่างไร",
                     ["งานปัจจุบัน", "ประสบการณ์ที่เกี่ยวข้องที่สุด", "เหตุผลที่สนใจงานนี้"])},
    "behavioral": {"en": ("Tell me about a time you delivered a result under a tight deadline.", "To see how you act under pressure.",
                          ["the situation", "your task", "what you did", "the measurable result"]),
                   "th": ("เล่าประสบการณ์ที่คุณส่งมอบงานให้สำเร็จภายใต้เวลาที่จำกัด", "เพื่อดูว่าคุณรับมือกับแรงกดดันอย่างไร",
                          ["สถานการณ์", "หน้าที่ของคุณ", "สิ่งที่คุณทำ", "ผลลัพธ์ที่วัดได้"])}}
WEAK = {"en": ["I did some work in the team and it was fine. I helped with things when needed. I do not remember the details.",
               "I think I am a hard worker. We did many tasks and it went okay in the end.",
               "I just did what my manager asked. Nothing special really, it was a normal job."],
        "th": ["ผมทำงานในทีมไปเรื่อย ๆ ก็โอเค ช่วยงานตามที่ต้องการ จำรายละเอียดไม่ค่อยได้",
               "ผมเป็นคนขยันนะ ทำหลายอย่าง สุดท้ายก็ผ่านไปด้วยดี",
               "ผมทำตามที่หัวหน้าสั่ง ไม่มีอะไรพิเศษ เป็นงานธรรมดา"]}
OFFTOPIC = {"en": ["My favourite food is pad thai and I cook it every weekend. I also like football and watching films with friends.",
                   "I love travelling to the beach in the rainy season. Last year I tried scuba diving and it was great.",
                   "I have two cats and a small garden. On Sundays I bake bread and walk in the park."],
            "th": ["อาหารที่ชอบที่สุดคือผัดไทย ทำกินทุกวันเสาร์อาทิตย์ ชอบดูบอลและดูหนังกับเพื่อน",
                   "ผมชอบไปเที่ยวทะเลช่วงหน้าฝน ปีที่แล้วลองดำน้ำลึกสนุกมาก",
                   "ที่บ้านเลี้ยงแมวสองตัวและมีสวนเล็ก ๆ วันอาทิตย์ชอบอบขนมปังแล้วไปเดินสวน"]}


def _facts(persona):  # work facts only (no degree), one per opening words: the generator repeats a sentence with another number
    return list({f["text"][:12]: f for f in reversed(persona["facts"]) if "degree" not in f["text"].lower() and "ปริญญา" not in f["text"]
                     and (persona["lang"] != "th" or re.search("[฀-๿]", f["text"]))}.values())[::-1]


def _answer(kind, persona, i):
    th = persona["lang"] == "th"
    lang = "th" if th else "en"
    if kind == "weak":
        return WEAK[lang][i % 3]
    if kind == "offtopic":
        return OFFTOPIC[lang][i % 3]
    f = _facts(persona)
    org, title = persona["orgs"][0], persona["titles"][0]
    if th:
        return (f"ที่ {org} ในตำแหน่ง {title} ทีมต้องส่งมอบงานตามกำหนดและมีหลายคนรอใช้ผลงาน "
                f"หน้าที่ของผมคือทำให้งานเสร็จอย่างเชื่อถือได้ ผม{f[0]['text']} "
                f"ผลลัพธ์ที่วัดได้คือ {f[1]['text']}")
    low = lambda t: t[0].lower() + t[1:]
    return (f"At {org} as a {title}, my team had a firm deadline and several people depended on the result. "
            f"My task was to deliver it reliably. I {low(f[0]['text'])}. I also {low(f[1]['text'])}. "
            f"The measurable result: {low(f[2]['text'])}.")


def grade_case(k, case, persona, job):
    kind = KINDS[k % 3]
    section = ("intro", "behavioral")[(k // 3) % 2]
    lang = "th" if persona["lang"] == "th" else "en"
    prompt, why, key_points = QUESTION[section][lang]
    band, high, low = {"good": ([3.5, 5.0], {"relevance": 4}, {}), "weak": ([1.0, 3.0], {}, {"evidence": 2}),
                       "offtopic": ([1.0, 2.5], {}, {"relevance": 2})}[kind]
    return dict(id=f"{case['id']}-g", persona=case["persona"], job=case["job"], kind=kind,
                question=dict(section=section, prompt=prompt.format(title=job["title"]), why=why, key_points=key_points),
                answer=_answer(kind, persona, k), band=band, min_scores=high, max_scores=low)


def _progress(profile, section, k):
    """-> (scores or None, ready, card_rating, allowed readiness levels)"""
    good, bad = {"structure": 4, "relevance": 5, "evidence": 4, "clarity": 4, "company_fit": 4}, {"structure": 2, "relevance": 3, "evidence": 1, "clarity": 3, "company_fit": 2}
    if section == "technical":
        rating = "know" if profile == "strong" or (profile == "mixed" and k % 2) else "learning"
        return None, False, rating, ("ready", "almost") if rating == "know" else ("almost", "not_yet")
    if profile == "strong" or (profile == "mixed" and section == "intro"):
        return good, True, None, ("ready", "almost")
    return bad, False, None, ("not_yet", "almost")


def report_case(k, case, persona, job):
    profile = PROFILES[k % 3]
    counts = {"intro": 1, "behavioral": 2, "technical": 3}
    questions, expect = [], {}
    for section, n in counts.items():
        scores, ready, rating, allowed = _progress(profile, section, k)
        expect[section] = list(allowed)
        for q in range(n):
            lang = "th" if persona["lang"] == "th" else "en"
            text = (QUESTION[section][lang][0].format(title=job["title"]) if section in QUESTION
                    else (f"อธิบายประสบการณ์ของคุณกับ {job['required'][q]}" if lang == "th" else f"Explain your experience with {job['required'][q]}"))
            questions.append(dict(section=section, prompt=text, ready=ready, card_rating=rating,
                                  scores=scores))  # latest attempt's feedback scores
    gaps = [s for s in job["required"] if s.lower() not in " ".join(persona["skills_listed"]).lower()]
    weak_terms = ([] if profile == "strong" else ["evidence", "structure", "หลักฐาน", "โครงเรื่อง", *gaps])
    return dict(id=f"{case['id']}-r", persona=case["persona"], job=case["job"], profile=profile, level=case["level"],
                sections=[{"id": s} for s in counts], questions=questions, gaps=gaps, expect=expect, weak_terms=weak_terms)


# ---- scoring ---------------------------------------------------------------------------------------------------
def score_grade(raw, case, persona=None, job=None):
    from job_search_platform.services import practice
    try:
        out = practice.parse_grade(raw or "", case["answer"], persona["facts"] if persona else [], False)
    except ValueError:
        return 0.0, {"valid": False}
    s = out["scores"]
    mean = statistics.mean(s.values())
    lo, hi = case["band"]
    band = 1.0 if lo <= mean <= hi else 0.5 if lo - 0.5 <= mean <= hi + 0.5 else 0.0
    dim = [s[k] >= v for k, v in case["min_scores"].items()] + [s[k] <= v for k, v in case["max_scores"].items()]
    dim_ok = sum(dim) / len(dim)
    fields = (1.0 if out["summary"] else 0.0) * 0.5 + (0.5 if case["kind"] == "good" or out["add"] else 0.0)
    star = 1.0 if case["kind"] != "good" or out["star"] else 0.0  # a good answer has STAR parts the grader can quote
    return 100 * (0.2 + 0.4 * band + 0.2 * dim_ok + 0.1 * fields + 0.1 * star), {
        "mean": round(mean, 2), "band": case["band"], "dim_ok": round(dim_ok, 2), "star": len(out["star"])}


def report_set(case):
    """The app's report_prompt inputs for a case (set_row, questions, report)."""
    qs = [{"section": q["section"], "prompt": q["prompt"], "ready": q["ready"], "card_rating": q["card_rating"],
           "attempts": [{"feedback": {"scores": q["scores"]}}] if q["scores"] else []} for q in case["questions"]]
    return (SimpleNamespace(sections=case["sections"], level=case["level"]), qs,
            {"requirements": [{"requirement": g, "match": "missing"} for g in case["gaps"]]})


def score_report(raw, case, persona=None, job=None):
    from job_search_platform.services import practice
    try:
        out = practice.parse_report(raw or "", [s["id"] for s in case["sections"]])
    except ValueError:
        return 0.0, {"valid": False}
    level = {r["section"]: r["level"] for r in out["readiness"]}
    ok = [level[s] in allowed for s, allowed in case["expect"].items() if s in level]
    readiness = sum(ok) / len(case["expect"])  # a section the report skips counts as wrong
    text = " ".join(out["skills_to_build"] + out["plan"]).lower()
    named = 1.0 if not case["weak_terms"] else float(any(t.lower() in text for t in case["weak_terms"]))
    return 100 * (0.2 + 0.4 * readiness + 0.3 * named + 0.1 * bool(out["strengths"] or out["plan"])), {
        "readiness": round(readiness, 2), "weak_named": named, "levels": level}


# ---- dataset ---------------------------------------------------------------------------------------------------
def main():
    for fn in ("gold.v1.json", "gold.holdout.v1.json"):
        path = HERE / "data" / fn
        data = json.loads(path.read_text())
        P = {p["id"]: p for p in data["personas"]}
        J = {j["id"]: j for j in data["jobs"]}
        base = data["cases"]["practice"]
        for task, make in (("grade", grade_case), ("report", report_case)):
            data["cases"][task] = [make(k, c, P[c["persona"]], J[c["job"]]) for k, c in enumerate(base)]
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        print(fn, len(data["cases"]["grade"]), "grade +", len(data["cases"]["report"]), "report cases")


if __name__ == "__main__":
    main()
