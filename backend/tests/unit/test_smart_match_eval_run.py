import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from smart_match_eval import run_eval  # noqa: E402
from smart_match_eval.metrics import ndcg_at_k, precision_at_k, spearman  # noqa: E402

SCORE = {"A1": 3, "A2": 2, "A3": 1, "B1": 1, "B2": 2}  # role_fit score by job title -> fit 100/73/47/47/73


class FakeJev:
    """Canned Jev-shaped answers; counts calls. No network."""

    def __init__(self):
        self.calls = 0

    def decide(self, state, questions):
        self.calls += 1
        title = state["job_posting"].split(" — ")[0]
        answers = {"role_fit": {"score": SCORE[title], "confidence": 0.9},
                   "seniority_fit": {"probabilities": {"0": 0, "1": 0, "2": 1.0, "3": 0}},
                   "hard_blocker": {"noul": 0.0}}
        for q in questions:
            if q.startswith(("skill_", "must_")):
                answers[q] = {"noul": 0.0}
        return answers


def job(title):
    return {"slug": title.lower(), "title": title, "company": "Co", "description_markdown": "Plain work.", "skills": []}


PAIRS = [{"cv_id": "a" if t[0] == "A" else "b", "job": job(t), "label": lab, "kind": "clear"}
         for t, lab in [("A1", "good"), ("A2", "no"), ("A3", "maybe"), ("B1", "maybe"), ("B2", "good")]]
CVS = {"a": "cv a text", "b": "cv b text"}


def test_score_and_evaluate(tmp_path):
    client = FakeJev()
    scored = run_eval.score_pairs(PAIRS, CVS, client, tmp_path)
    assert [s["fit_percent"] for s in scored] == [100, 73, 47, 47, 73]
    assert {"cv_id", "slug", "fit_percent", "label", "kind"} <= set(scored[0])
    m = run_eval.evaluate(scored)
    assert m["ndcg_at_10"] == pytest.approx((ndcg_at_k([2, 0, 1]) + ndcg_at_k([2, 1])) / 2)
    assert m["ndcg_at_10"] < 0.99
    assert m["precision_at_10"] == pytest.approx((precision_at_k([2, 0, 1]) + precision_at_k([2, 1])) / 2)
    assert m["spearman"] == pytest.approx(spearman([100, 73, 47, 47, 73], [2, 0, 1, 1, 2]))
    assert m["confusion"][5] == {"good": 2, "no": 1}
    assert m["confusion"][3] == {"maybe": 2}


def test_evaluate_ranks_descending_ties_by_slug():
    rows = [{"cv_id": "a", "slug": s, "fit_percent": f, "label": lab, "kind": "clear"}
            for s, f, lab in [("z", 50, "good"), ("y", 50, "no"), ("x", 10, "good")]]
    # order y,z,x -> rels [0,2,2]; ascending sort would give [2,2,0]
    assert run_eval.evaluate(rows)["ndcg_at_10"] == pytest.approx(ndcg_at_k([0, 2, 2]))


def test_cache_hit_makes_no_second_run_calls(tmp_path):
    client = FakeJev()
    run_eval.score_pairs(PAIRS, CVS, client, tmp_path)
    assert client.calls == 5
    again = run_eval.score_pairs(PAIRS, CVS, client, tmp_path)
    assert client.calls == 5 and len(again) == 5


def test_main_refuses_without_live_flag(monkeypatch):
    monkeypatch.delenv("SMART_MATCH_EVAL_LIVE", raising=False)
    with pytest.raises(SystemExit) as e:
        run_eval.main()
    assert e.value.code != 0


def test_main_requires_api_key(monkeypatch):
    monkeypatch.setenv("SMART_MATCH_EVAL_LIVE", "1")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(SystemExit) as e:
        run_eval.main()
    assert e.value.code != 0


def test_fake_is_used_not_real_client():
    assert not isinstance(FakeJev(), run_eval.JevClient)
