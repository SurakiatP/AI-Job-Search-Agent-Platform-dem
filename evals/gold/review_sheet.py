"""Writes a Markdown sheet for a person to rate practice-question sets (what automatic scorers cannot judge).
  backend/.venv/bin/python evals/gold/review_sheet.py <results.json> [--dataset holdout] [--n 20] > sheet.md
Each set is shown the way the owner would see it (after the evidence gate and the one rewrite)."""
import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).parent))
import run_bench as rb
from job_search_platform.services import practice

path = sys.argv[1]
holdout = "--dataset" in sys.argv and "holdout" in sys.argv
n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 20
data = json.loads((rb.HOLDOUT if holdout else rb.DATA).read_text())
P = {p["id"]: p for p in data["personas"]}
J = {j["id"]: j for j in data["jobs"]}
print("# Practice-question review sheet\n")
print("Rate each set 1-5 on: **A** questions fit the job and the CV, **B** model answers sound like this candidate and are useful, "
      "**C** key points are correct and specific, **D** would you let a real user see this? (5 = yes without edits). "
      "Mark any sentence that states something about the candidate that the CV does not support.\n")
for r in [r for r in json.load(open(path))["results"] if r["task"] == "practice" and r.get("text")][:n]:
    case = next(c for c in data["cases"]["practice"] if c["id"] == r["case"])
    p, job = P[case["persona"]], J[case["job"]]
    voc = {rb.norm(v) for v in p["orgs"] + p["titles"]}
    fc = {UUID(f["id"]): rb.claims(f["text"] + " . " + f["context"], voc, True) for f in p["facts"]}
    known = rb.claims(p["cv"], voc)
    rejected = []
    qs, rev = practice.parse_reply(r["text"], case["sections"], fc, voc, known, {}, practice.aliases(p["facts"]), rejected)
    if r.get("rewrite_text") and rejected:
        for i, t in practice.parse_rewrite(r["rewrite_text"], rejected, fc, voc, known).items():
            qs[i]["model_answer"] = practice.clean(t, 3000)
    print(f"\n---\n## {r['case']} - {job['title']} at {job['company']}  (score {r['quality']})\nCandidate CV (excerpt): {p['cv'][:380]!r}\n")
    for k, q in enumerate(qs, 1):
        print(f"**{k}. [{q['section']}] {q['prompt']}**\n- why: {q['why']}\n- key points: {'; '.join(q['key_points'])}\n- model answer: {q['model_answer'] or '(none)'}\n")
    print(f"Reverse questions: {'; '.join(rev)}\n\nRatings  A: _  B: _  C: _  D: _   Notes: \n")
