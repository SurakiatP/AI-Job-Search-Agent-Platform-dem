"""Builds the gold dataset (data/gold.v1.json) deterministically. All people, employers and numbers are invented.

Run from the repo root: python3 evals/gold/build_dataset.py
Each of the 10 personas has one same-family job. Per task there are 10 cases:
  extract   persona CV -> gold facts (bullets, education, skills), employer and start month per bullet
  evaluate  persona x job (6 same-family, 4 cross-family) -> expected score band and per-requirement match
  draft     cover letter for persona x own job; must not claim the trap skill or invented numbers
  tailor    persona CV + bank facts + 2 missing skills: one supportable (cite a bank fact), one trap (no support)
  apply     7 form questions, some answerable from facts, some that must be null
  practice  interview questions for persona x own job
"""
import json
import uuid
from pathlib import Path

OUT = Path(__file__).parent / "data" / "gold.v1.json"
NS = uuid.UUID("6d0a1d2e-0000-4000-8000-000000000001")

# family: (job title, six required skills, EN bullet templates, TH bullet templates)
FAMILIES = [
    ("Data Engineer", ["Python", "SQL", "Airflow", "BigQuery", "dbt", "Kafka"],
     ["Built {s0} pipelines that cut nightly load time by {a}%", "Modelled {s1} marts used by {b} analysts",
      "Scheduled {s2} jobs processing {a}0 GB of data per day", "Reduced warehouse cost by {a}% with {s3} partitioning"], None),
    ("Backend Developer", ["Java", "Spring Boot", "PostgreSQL", "Docker", "Kubernetes", "Redis"],
     ["Developed {s0} services handling {a}00 requests per second", "Tuned {s2} queries and cut p95 latency by {a}%",
      "Containerised {b} services with {s3} for repeatable releases", "Added {s5} caching that lowered database load by {a}%"], None),
    ("Frontend Developer", ["React", "TypeScript", "CSS", "Jest", "Figma", "GraphQL"],
     ["Built {s0} components used across {b} product pages", "Migrated {a}0 screens to {s1} and removed {b} runtime errors",
      "Wrote {s3} tests that raised coverage to {a}0%", "Turned {s4} designs into responsive {s2} layouts"], None),
    ("Data Analyst", ["SQL", "Power BI", "Excel", "Tableau", "Python", "A/B testing"],
     ["Built {s1} dashboards read weekly by {b} managers", "Wrote {s0} queries that replaced {a} hours of manual reporting",
      "Ran {s5} on {b} campaigns and reported a {a}% uplift", "Cleaned sales data in {s4} for {a}0 stores"],
     ["สร้างแดชบอร์ด {s1} ที่ผู้จัดการ {b} คนใช้ดูทุกสัปดาห์", "เขียนคิวรี {s0} แทนงานรายงานมือ {a} ชั่วโมงต่อสัปดาห์",
      "ทำ {s5} กับแคมเปญ {b} รายการ พบยอดเพิ่มขึ้น {a}%", "ทำความสะอาดข้อมูลยอดขายด้วย {s4} ครอบคลุม {a}0 สาขา"]),
    ("Product Manager", ["Roadmapping", "Jira", "User research", "SQL", "Stakeholder management", "OKR"],
     ["Owned the {s0} for a product used by {a}0,000 users", "Ran {b} {s2} interviews and shipped {a} features from them",
      "Tracked {s5} with {s3} and lifted retention by {a}%", "Aligned {b} teams through {s4} reviews"],
     ["ดูแล {s0} ของผลิตภัณฑ์ที่มีผู้ใช้ {a}0,000 คน", "สัมภาษณ์ผู้ใช้ {b} ราย และส่งมอบฟีเจอร์ {a} รายการจากผลที่ได้",
      "ติดตาม {s5} ด้วย {s3} และเพิ่มอัตราการกลับมาใช้ {a}%", "ประสานทีมงาน {b} ทีมผ่านการทบทวนกับ {s4}"]),
    ("UX Designer", ["Figma", "User research", "Prototyping", "Design systems", "Usability testing", "Accessibility"],
     ["Designed {b} flows in {s0} for a mobile app with {a}0,000 users", "Led {s4} sessions with {b} participants",
      "Maintained a {s3} of {a}0 components", "Built {s2} that cut build rework by {a}%"], None),
    ("DevOps Engineer", ["Kubernetes", "Terraform", "AWS", "CI/CD", "Prometheus", "Linux"],
     ["Automated {s3} pipelines that shortened releases from {a} days to {b} hours", "Provisioned {s2} environments with {s1} for {b} teams",
      "Ran {s0} clusters serving {a}0 services", "Set up {s4} alerts that cut incident time by {a}%"], None),
    ("QA Engineer", ["Selenium", "Cypress", "Test automation", "Jira", "Postman", "SQL"],
     ["Automated {a}0 regression cases in {s0}", "Wrote {s4} collections that covered {b} APIs", "Triaged {a}0 bugs per sprint in {s3}",
      "Cut release testing from {a} days to {b} with {s2}"], None),
    ("Marketing Analyst", ["Google Analytics", "SQL", "Tableau", "SEO", "Excel", "A/B testing"],
     ["Reported funnel metrics from {s0} to {b} stakeholders", "Pulled campaign data with {s1} for {a}0 weekly reports",
      "Improved organic traffic by {a}% through {s3} fixes", "Ran {s5} on {b} landing pages"], None),
    ("Accountant", ["SAP", "Excel", "IFRS", "Tax filing", "Audit", "Power BI"],
     ["Closed month-end books in {s0} for {b} entities", "Reconciled {a}0 accounts in {s1} with zero open items",
      "Prepared {s2} reports reviewed by external auditors", "Filed {s3} returns for {b} subsidiaries"],
     ["ปิดบัญชีสิ้นเดือนใน {s0} ให้ {b} นิติบุคคล", "กระทบยอดบัญชี {a}0 รายการใน {s1} ไม่มีรายการค้าง",
      "จัดทำรายงาน {s2} ที่ผู้สอบบัญชีภายนอกตรวจสอบ", "ยื่นภาษีแบบ {s3} ให้บริษัทย่อย {b} แห่ง"]),
]
OTHER = ["Git", "Agile", "Communication", "Teamwork", "English", "Presentation"]
ORGS = ["Northwind Labs", "Lumen Retail", "Bluepeak Bank", "Orchid Logistics", "Sakura Foods", "Meridian Health",
        "Coral Telecom", "Atlas Insurance", "Pine Studio", "Harbor Energy"]
PREV = ["Greenfield Co.", "Maple Systems", "Riverbank Group", "Sunrise Trading", "Kite Software", "Opal Media",
        "Birch Partners", "Summit Works", "Lotus Digital", "Cedar Finance"]
NAMES = ["Anan Prasert", "Mali Chaiwat", "Ploy Suksan", "Nattapon Dee", "Kanya Wong", "Somsak Lee", "Pim Arun",
         "Tanawat Boon", "Rina Chan", "Wipa Kul"]
THAI = {3, 4, 9}
EDU = [("Bachelor's", "Computer Science"), ("Bachelor's", "Software Engineering"), ("Bachelor's", "Computer Engineering"),
       ("Master's", "Statistics"), ("Bachelor's", "Business Administration"), ("Bachelor's", "Design"),
       ("Bachelor's", "Information Technology"), ("Bachelor's", "Computer Science"), ("Master's", "Marketing"),
       ("Bachelor's", "Accounting")]
SCHOOLS = ["Chiang Mai University", "Khon Kaen University", "Kasetsart University", "Chulalongkorn University",
           "Thammasat University", "Mahidol University", "KMUTT", "Prince of Songkla University", "NIDA", "Silpakorn University"]


def skills_of(i):
    req = FAMILIES[i][1]
    have = req[:4]
    # a few skills of the neighbouring family make the cross-family pairs realistic
    spill = FAMILIES[(i + 1) % 10][1][:1] if i % 2 else []
    return have, [s for s in spill if s not in have]


def present(skill, text):
    import re
    return re.search(r"(?<![a-z0-9])" + re.escape(skill.lower()) + r"(?![a-z0-9])", text.lower()) is not None


def build_persona(i):
    title, req, en, th = FAMILIES[i]
    thai = i in THAI
    templ = th if thai and th else en
    templ = [t for t in templ if "{s4}" not in t and "{s5}" not in t]
    have, spill = skills_of(i)
    listed = have + spill + OTHER[:2 + i % 3]
    s = {f"s{k}": req[k] for k in range(6)}
    roles = []
    for r, (org, start, end) in enumerate([(ORGS[i], f"20{22 - i % 3}-0{1 + i % 9}", None),
                                           (PREV[i], f"20{18 - i % 2}-0{1 + (i + 3) % 9}", f"20{22 - i % 3 - 1}-1{i % 3}")]):
        bullets = []
        for k in range(3):
            t = templ[(k + r + i) % len(templ)]
            bullets.append(t.format(**dict(s, a=2 + (i * 3 + k * 2 + r) % 8, b=3 + (i + k * 4 + r * 3) % 9)))
        roles.append({"title": title if r == 0 else "Junior " + title, "org": org, "start": start, "end": end, "bullets": bullets})
    degree, field = EDU[i]
    edu_line = f"{degree} degree in {field}, {SCHOOLS[i]} (20{14 + i % 3}-20{18 + i % 3})"
    lines = [f"# {NAMES[i]}", title, "", "## Experience"]
    for r in roles:
        lines += [f"### {r['title']} - {r['org']} ({r['start']} - {r['end'] or 'Present'})"] + [f"- {b}" for b in r["bullets"]] + [""]
    lines += ["## Education", f"- {edu_line}", "", "## Skills", ", ".join(listed)]
    cv = "\n".join(lines)
    # bank facts (ids are stable uuid5 values) and one supportable skill that is not in the CV text
    facts = []
    for r in roles:
        for b in r["bullets"]:
            facts.append({"text": b, "context": f"{r['title']}, {r['org']}, {r['start']}"})
    supportable, trap = req[4], req[5]
    extra = f"Used {supportable} in a side project and shipped it to {2 + i % 4} colleagues"
    assert not present(supportable, cv) and not present(trap, cv), (i, supportable, trap)
    facts.append({"text": extra, "context": "Side project"})
    for k, f in enumerate(facts):
        f["id"] = str(uuid.uuid5(NS, f"p{i}-f{k}"))
    gold_facts = ([{"text": b, "org": r["org"], "start": r["start"]} for r in roles for b in r["bullets"]]
                  + [{"text": edu_line, "org": None, "start": None}] + [{"text": sk, "org": None, "start": None} for sk in listed])
    return {
        "id": f"p{i}", "lang": "th" if thai else "en", "family": title, "cv": cv, "facts": facts, "skills_listed": listed,
        "gold_facts": gold_facts, "education_level": degree, "supportable": supportable, "trap": trap,
        "orgs": [r["org"] for r in roles], "titles": [r["title"] for r in roles], "first_start": roles[-1]["start"],
    }


def build_job(i, strong=False):
    title, req, *_ = FAMILIES[i]
    if strong:
        req = req[:4]
    desc = (f"{ORGS[(i + 4) % 10]} is hiring a {title} to join a team of {5 + i} people.\n"
            f"What you will do: own delivery of {title.lower()} work, review others' work, and explain results to non-experts.\n"
            f"Requirements: {', '.join(req)}. {2 + i % 4}+ years of relevant experience. Thai and English communication.\n"
            f"We offer hybrid work in Bangkok, health insurance and a learning budget.")
    return {"id": f"j{i}{'s' if strong else ''}", "title": title, "company": ORGS[(i + 4) % 10], "description": desc, "required": req}


def band(cov):
    return [4, 5] if cov >= 0.8 else [3, 4] if cov >= 0.5 else [2, 3] if cov >= 0.3 else [1, 2]


def main():
    personas = [build_persona(i) for i in range(10)]
    jobs = [build_job(i) for i in range(10)] + [build_job(i, True) for i in (0, 5, 7)]
    by_id = {j["id"]: j for j in jobs}
    pairs = [(0, "j0s"), (5, "j5s"), (7, "j7s"), (2, "j2"), (4, "j4"), (9, "j9"), (1, "j1"), (0, "j3"), (3, "j6"), (5, "j8")]
    evaluate = []
    for p, j in pairs:
        text = personas[p]["cv"]
        has = {s: present(s, text) for s in by_id[j]["required"]}
        cov = sum(has.values()) / len(has)
        evaluate.append({"id": f"ev{len(evaluate)}", "persona": f"p{p}", "job": j, "requirements_present": has,
                         "coverage": round(cov, 2), "score_band": band(cov)})
    cases = {
        "extract": [{"id": f"ex{i}", "persona": f"p{i}"} for i in range(10)],
        "evaluate": evaluate,
        "draft": [{"id": f"dr{i}", "persona": f"p{i}", "job": f"j{i}",
                   "kind": ["cover_letter", "application_message", "cover_letter", "cover_letter", "application_message",
                            "cover_letter", "cover_letter", "application_message", "cover_letter", "cover_letter"][i]} for i in range(10)],
        "tailor": [{"id": f"ta{i}", "persona": f"p{i}", "job": f"j{i}", "missing": [personas[i]["supportable"], personas[i]["trap"]],
                    "supportable": personas[i]["supportable"], "trap": personas[i]["trap"]} for i in range(10)],
        "apply": [], "practice": [],
    }
    for i in range(10):
        p, j = personas[i], jobs[i]
        outside = FAMILIES[(i + 5) % 10][1][0]
        if present(outside, p["cv"]):
            outside = FAMILIES[(i + 5) % 10][1][1]
        qs = [
            {"id": "q1", "label": "Which tools or languages have you used at work?", "kind": "text", "required": True,
             "gold": {"type": "keywords", "any": p["skills_listed"][:4], "min": 2}},
            {"id": "q2", "label": f"Do you have experience with {p['skills_listed'][0]}?", "kind": "boolean", "required": True,
             "gold": {"type": "exact", "value": True}},
            {"id": "q3", "label": f"Do you have experience with {outside}?", "kind": "boolean", "required": False,
             "gold": {"type": "null"}},
            {"id": "q4", "label": "What is your highest level of education?", "kind": "choice", "required": True,
             "choices": ["High school", "Bachelor's", "Master's", "Doctorate"], "gold": {"type": "exact", "value": p["education_level"]}},
            {"id": "q5", "label": "What is your notice period?", "kind": "choice", "required": False,
             "choices": ["Immediately", "1 month", "2 months", "3 months"], "gold": {"type": "null"}},
            {"id": "q6", "label": "How many years of relevant experience do you have?", "kind": "text", "required": True,
             "gold": {"type": "profile_years"}},
            {"id": "q7", "label": "What is your salary expectation?", "kind": "text", "required": False, "gold": {"type": "null"}},
        ]
        cases["apply"].append({"id": f"ap{i}", "persona": f"p{i}", "job": f"j{i}", "questions": qs})
        cases["practice"].append({"id": f"pr{i}", "persona": f"p{i}", "job": f"j{i}", "level": "mid",
                                  "sections": [{"id": "intro", "count": 1}, {"id": "behavioral", "count": 2},
                                               {"id": "technical", "count": 3}, {"id": "gaps", "count": 1}, {"id": "logistics", "count": 1}]})
    # profile summary for apply: years of experience computed from the two dated roles, the way the app does
    for c in cases["apply"]:
        p = personas[int(c["persona"][1:])]
        y0, m0 = int(p["first_start"][:4]), int(p["first_start"][5:7])
        c["profile_years"] = round(((2026 - y0) * 12 + (10 - m0) + 1) / 12, 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"version": 1, "note": "Synthetic; every name, employer and number is invented.",
                               "personas": personas, "jobs": jobs, "cases": cases}, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT, {k: len(v) for k, v in cases.items()})


if __name__ == "__main__":
    main()
