"""Live scoring runner for the smart-match evaluation. See README.md. Only runs with SMART_MATCH_EVAL_LIVE=1."""
import hashlib
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parents[1] / "src"))
sys.path.insert(0, str(_HERE.parent))

from job_search_platform.integrations.jev import JEV_MODEL, JevClient  # noqa: E402
from job_search_platform.services import smart_match  # noqa: E402
from smart_match_eval.metrics import ndcg_at_k, precision_at_k, spearman  # noqa: E402

VALUE = {"no": 0, "maybe": 1, "good": 2}
CACHE_DIR = _HERE / ".cache"


def score_pairs(pairs, cvs, client, cache_dir):
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    model = getattr(client, "_model", JEV_MODEL)
    out = []
    for pair in pairs:
        job = pair["job"]
        skills = smart_match.job_skills(job)
        state, questions = smart_match.job_state(cvs[pair["cv_id"]], job), smart_match.job_questions(skills)
        key = hashlib.sha256((model + json.dumps([state, questions], sort_keys=True)).encode()).hexdigest()
        path = cache_dir / f"{key}.json"
        if path.exists():
            answers = json.loads(path.read_text())
        else:
            answers = client.decide(state, questions)
            path.write_text(json.dumps(answers))
        result = smart_match.combine(answers, skills)
        out.append({"cv_id": pair["cv_id"], "slug": job["slug"], "fit_percent": result["fit_percent"],
                    "label": pair["label"], "kind": pair["kind"]})
    return out


def evaluate(scored):
    by_cv = defaultdict(list)
    for row in scored:
        by_cv[row["cv_id"]].append(row)
    ndcgs, precs = [], []
    for rows in by_cv.values():
        rels = [VALUE[r["label"]] for r in sorted(rows, key=lambda r: (-r["fit_percent"], r["slug"]))]
        ndcgs.append(ndcg_at_k(rels, 10))
        precs.append(precision_at_k(rels, 10))
    confusion = defaultdict(lambda: defaultdict(int))
    for row in scored:
        confusion[smart_match.band(row["fit_percent"])][row["label"]] += 1
    return {"ndcg_at_10": sum(ndcgs) / len(ndcgs), "precision_at_10": sum(precs) / len(precs),
            "spearman": spearman([r["fit_percent"] for r in scored], [VALUE[r["label"]] for r in scored]),
            "confusion": {b: dict(c) for b, c in sorted(confusion.items())}}


class _Counting:
    def __init__(self, client):
        self._client, self.calls, self._model = client, 0, getattr(client, "_model", JEV_MODEL)

    def decide(self, state, questions):
        self.calls += 1
        return self._client.decide(state, questions)


def main():
    if os.environ.get("SMART_MATCH_EVAL_LIVE") != "1":
        sys.exit("Refusing to run: set SMART_MATCH_EVAL_LIVE=1 (this makes paid live Jev calls).")
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY is not set in the environment.")
    pairs = json.loads((_HERE / "data" / "pairs.json").read_text())
    cvs = {c["id"]: c["text"] for c in json.loads((_HERE / "data" / "cvs.json").read_text())}
    client = _Counting(JevClient(key))
    began = time.monotonic()
    metrics = evaluate(score_pairs(pairs, cvs, client, CACHE_DIR))
    for name in ("ndcg_at_10", "precision_at_10", "spearman"):
        print(f"{name}: {metrics[name]:.3f}")
    print("band  " + "  ".join(VALUE))
    for band, counts in metrics["confusion"].items():
        print(f"{band:<5} " + "  ".join(f"{counts.get(label, 0):<{len(label)}}" for label in VALUE))
    print(f"live calls: {client.calls}\nelapsed: {time.monotonic() - began:.1f}s")


if __name__ == "__main__":
    main()
