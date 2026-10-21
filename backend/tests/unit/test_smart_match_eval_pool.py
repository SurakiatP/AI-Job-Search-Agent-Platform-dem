import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from smart_match_eval import pool  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "smart_match_eval" / "data"
PAIRS = json.loads((DATA / "pairs.json").read_text(encoding="utf-8"))
CVS = {c["id"]: c["text"] for c in json.loads((DATA / "cvs.json").read_text(encoding="utf-8"))}
LABELS = {f"{s}+{c}": {"label": "maybe", "reason": "SECRET-REASON"} for s, c in pool.same_family_pairs(PAIRS)}


def test_pooled_covers_every_pair_once_with_a_label_kind():
    pooled = pool.pool_pairs(PAIRS, LABELS)
    assert len(pooled) == 600 and len({(p["cv_id"], p["job"]["slug"]) for p in pooled}) == 600
    original = {(p["cv_id"], p["job"]["slug"]): p["label"] for p in PAIRS}
    same = set(pool.same_family_pairs(PAIRS))
    assert len(same) == 60 and not {(s, c) for s, c in same} & {(s, c) for c, s in original}
    for p in pooled:
        k, slug = (p["cv_id"], p["job"]["slug"])
        if (k, slug) in original:
            assert p["label"] == original[(k, slug)]
        elif (slug, k) in same:
            assert (p["kind"], p["label"]) == ("same-family", "maybe")
        else:
            assert (p["kind"], p["label"]) == ("cross-family", "no")


def test_missing_same_family_label_raises():
    with pytest.raises(KeyError):
        pool.pool_pairs(PAIRS, {})


def test_sheet_is_blind():
    sheet = pool.owner_style_sheet_for_pool(PAIRS, CVS)
    assert sheet.count("(id: ") == 60
    assert "SECRET-REASON" not in sheet and "same-family" not in sheet and "cross-family" not in sheet
    slug, cv = pool.same_family_pairs(PAIRS)[0]
    assert f"(id: {slug}+{cv})" in sheet
    for p in PAIRS:  # no construction reason text leaks
        assert p["reason"] not in sheet


def _row(cv, slug, fit, label, kind="clear"):
    return {"cv_id": cv, "slug": slug, "fit_percent": fit, "label": label, "kind": kind}


def test_pool_metrics_hand_computed():
    scored = [_row("a", "s1", 100, "good"), _row("a", "s2", 90, "no", "cross-family"),
              _row("a", "s3", 80, "good"), _row("a", "s4", 70, "good"), _row("a", "s5", 60, "no", "cross-family"),
              _row("a", "s6", 50, "no", "cross-family"),
              _row("b", "s1", 100, "no", "cross-family"), _row("b", "s2", 10, "good")]
    m = pool.pool_metrics(scored)
    # a: top5 = s1,s2,s3,s4,s5 -> good,no,good,good,no = 3/5 ; b: [no,good] -> 1/2
    assert m["precision_at_5"] == pytest.approx((3 / 5 + 1 / 2) / 2)
    assert m["cross_family_leak"] == pytest.approx(3 / 4)  # cross fits 90,60,50,100 -> bands 5,4,3,5


def test_pool_metrics_empty_cross():
    assert pool.pool_metrics([_row("a", "s", 100, "good")])["cross_family_leak"] == 0.0


def test_recall_good_at_10_counts_good_jobs_found_in_top_10():
    # one CV, 12 jobs: 2 good, ranked 1st and 11th by fit -> recall 1/2
    scored = [{"cv_id": "cv-01", "slug": f"j{i:02d}", "fit_percent": 90 - i, "label": "no", "kind": "clear"} for i in range(12)]
    scored[0]["label"] = "good"
    scored[10]["label"] = "good"
    assert pool.pool_metrics(scored)["recall_good_at_10"] == 0.5
