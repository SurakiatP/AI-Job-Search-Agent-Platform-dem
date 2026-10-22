"""Scorers must give ~100 to a known-good answer and clearly less to bad ones (run: backend/.venv/bin/python -m pytest evals/gold -q)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import run_bench as rb  # noqa: E402

D = json.loads(rb.DATA.read_text())
P = {p["id"]: p for p in D["personas"]}
J = {j["id"]: j for j in D["jobs"]}


def sc(task, raw, case):
    return rb.SCORERS[task](raw, case, P[case["persona"]], J.get(case.get("job")))[0]


def test_extract():
    case = D["cases"]["extract"][0]
    p = P["p0"]
    items = [{"text": g["text"], "organization": g["org"], "start_date": g["start"]} for g in p["gold_facts"]]
    good = json.dumps({"items": items})
    assert sc("extract", good, case) > 95
    assert sc("extract", json.dumps({"items": [{"text": "Led a team of 40 engineers"}]}), case) < 10
    assert sc("extract", "not json", case) == 0
    wrong_org = json.dumps({"items": [dict(i, organization="Other Co") for i in items]})
    assert sc("extract", wrong_org, case) < sc("extract", good, case) - 20


def test_evaluate():
    case = D["cases"]["evaluate"][3]  # same-family, band [3, 4]
    reqs = [{"requirement": s, "match": "strong" if has else "missing"} for s, has in case["requirements_present"].items()]
    good = json.dumps({"score": 3, "report": {"verdict": "v", "summary": "s", "requirements": reqs}})
    assert sc("evaluate", good, case) > 95
    assert sc("evaluate", good.replace('"score": 3', '"score": 5'), case) < 90  # off by one
    flipped = [dict(r, match="missing" if r["match"] == "strong" else "strong") for r in reqs]
    assert sc("evaluate", json.dumps({"score": 3, "report": {"verdict": "v", "summary": "s", "requirements": flipped}}), case) < 61


def test_tailor():
    case = D["cases"]["tailor"][1]
    p = P["p1"]
    cited = p["facts"][-1]
    base = {"find": "", "text": f"Hands-on {case['supportable']} work", "evidence_ids": [cited["id"]]}
    assert sc("tailor", json.dumps({"edits": [base]}), case) > 95
    trap = dict(base, text=f"Expert in {case['trap']}")
    assert sc("tailor", json.dumps({"edits": [base, trap]}), case) < 70  # claims the unsupported skill
    assert sc("tailor", json.dumps({"edits": [dict(base, text="Hands-on %s for 99 years" % case["supportable"])]}), case) < 70
    assert sc("tailor", json.dumps({"edits": []}), case) < 30


def test_apply():
    case = D["cases"]["apply"][2]
    p = P["p2"]
    fid = [p["facts"][0]["id"]]
    ans = {"q1": ", ".join(p["skills_listed"][:3]), "q2": True, "q3": None, "q4": p["education_level"], "q5": None,
           "q6": f"{case['profile_years']:g} years", "q7": None}
    mk = lambda a: json.dumps({"answers": [{"question_id": k, "answer": v, "evidence_ids": fid if v is not None else []} for k, v in a.items()]})
    assert sc("apply", mk(ans), case) > 95
    assert sc("apply", mk(dict(ans, q7="80,000", q5="1 month", q3=True)), case) < 85  # invents answers
    assert sc("apply", "x", case) == 0


def test_draft():
    case = D["cases"]["draft"][0]
    p, j = P["p0"], J["j0"]
    letter = f"เรียน ฝ่ายบุคคล {j['company']}\nดิฉันสนใจตำแหน่ง {j['title']} มีประสบการณ์ด้าน {p['skills_listed'][0]} " + "และการทำงานเป็นทีม " * 20
    assert sc("draft", letter, case) > 90
    assert sc("draft", letter + f" ชำนาญ {p['trap']} และดูแลทีม 77 คน", case) < 60
    assert sc("draft", "", case) == 0


def test_practice_rejects_garbage():
    case = D["cases"]["practice"][0]
    assert sc("practice", "no", case) == 0


def test_draft_saying_eager_to_learn_a_missing_skill_is_not_a_claim():
    case = D["cases"]["draft"][0]
    p, j = P["p0"], J["j0"]
    base = f"เรียน ฝ่ายบุคคล {j['company']}\nดิฉันสนใจตำแหน่ง {j['title']} มีประสบการณ์ด้าน {p['skills_listed'][0]} " + "และการทำงานเป็นทีม " * 20
    honest = base + f" ส่วนด้าน {p['trap']} ดิฉันยินดีและกระตือรือร้นที่จะเรียนรู้เพิ่มเติม"
    claim = base + f" ดิฉันมีความเชี่ยวชาญด้าน {p['trap']} มานาน"
    assert sc("draft", honest, case) > 90
    assert sc("draft", claim, case) < 80  # one claimed skill costs 22.5 points
    assert sc("draft", base + f" I am eager to learn {p['trap']}.", case) > 90


def test_practice_v2_does_not_punish_gaps_or_logistics():
    """An ideal reply (answers only where an honest answer exists, gaps/logistics null) must score ~100."""
    case = D["cases"]["practice"][0]
    p, j = P["p0"], J["j0"]
    fid = p["facts"][0]
    fact_text = fid["text"]
    qs = [{"section": "intro", "prompt": f"Why {j['title']} at the company?", "why": j["title"], "key_points": ["a"],
           "model_answer": fact_text, "evidence_ids": ["F1"]}]
    qs += [{"section": "behavioral", "prompt": f"Tell me about {p['skills_listed'][0]}", "why": "w", "key_points": ["a"],
            "model_answer": fact_text, "evidence_ids": ["F1"]} for _ in range(2)]
    qs += [{"section": "technical", "prompt": f"Explain {p['skills_listed'][1]}", "why": "w", "key_points": ["a"],
            "model_answer": fact_text, "evidence_ids": ["F1"]} for _ in range(3)]
    qs += [{"section": "gaps", "prompt": f"How would you learn {j['required'][-1]}?", "why": j["required"][-1], "key_points": ["a"], "model_answer": None, "evidence_ids": []},
           {"section": "logistics", "prompt": "When can you start?", "why": "w", "key_points": ["a"], "model_answer": None, "evidence_ids": []}]
    raw = json.dumps({"questions": qs, "reverse_questions": ["a", "b", "c"]})
    assert sc("practice", raw, case) > 95
