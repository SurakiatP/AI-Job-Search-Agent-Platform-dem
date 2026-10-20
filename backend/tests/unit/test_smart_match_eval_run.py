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
    assert "precision_at_10" not in m
    assert m["precision_at_2"] == pytest.approx((precision_at_k([2, 0, 1], 2) + precision_at_k([2, 1], 2)) / 2)
    assert m["pooled_precision_at_20"] == pytest.approx(2 / 5)
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


def _rows(cv, fits_labels):
    return [{"cv_id": cv, "slug": f"s{i:02d}", "fit_percent": f, "label": lab, "kind": "clear"}
            for i, (f, lab) in enumerate(fits_labels)]


def test_precision_at_2_uses_best_ranked_descending():
    rows = _rows("a", [(90, "good"), (80, "good"), (10, "no")]) + _rows("b", [(90, "no"), (80, "no"), (10, "good")])
    assert run_eval.evaluate(rows)["precision_at_2"] == pytest.approx((1.0 + 0.0) / 2)


def test_pooled_precision_at_20_is_global_descending():
    rows = _rows("a", [(100 - i, "good" if i < 10 else "no") for i in range(25)])
    assert run_eval.evaluate(rows)["pooled_precision_at_20"] == pytest.approx(0.5)  # ascending would give 0.25


def test_pooled_precision_ties_break_by_cv_id_then_slug():
    rows = [{"cv_id": f"c{i:02d}", "slug": "s", "fit_percent": 50, "label": "good" if i == 20 else "no", "kind": "clear"}
            for i in range(21)]
    assert run_eval.evaluate(rows)["pooled_precision_at_20"] == 0.0  # c20 ranks 21st


def test_cache_write_is_atomic_and_corrupt_cache_ignored(tmp_path, monkeypatch):
    target = tmp_path / "x.json"
    target.write_text('{"old": 1}')

    def boom(src, dst):
        raise OSError("replace failed")

    monkeypatch.setattr(run_eval.os, "replace", boom)
    with pytest.raises(OSError):
        run_eval.write_json_atomic(target, {"new": 2})
    assert target.read_text() == '{"old": 1}' and list(tmp_path.iterdir()) == [target]
    monkeypatch.undo()
    run_eval.write_json_atomic(target, {"new": 2})
    assert run_eval.read_json(target) == {"new": 2} and list(tmp_path.iterdir()) == [target]
    target.write_text('{"tru')
    assert run_eval.read_json(target) is None


def test_truncated_cache_file_is_recomputed(tmp_path):
    client = FakeJev()
    run_eval.score_pairs(PAIRS, CVS, client, tmp_path)
    for f in tmp_path.iterdir():
        f.write_text("{")
    run_eval.score_pairs(PAIRS, CVS, client, tmp_path)
    assert client.calls == 10


def test_format_metrics_lists_four_metrics(tmp_path):
    text = run_eval.format_metrics(run_eval.evaluate(run_eval.score_pairs(PAIRS, CVS, FakeJev(), tmp_path)))
    for name in ("ndcg_at_10", "precision_at_2", "pooled_precision_at_20", "spearman"):
        assert name in text
    assert "precision_at_10" not in text
