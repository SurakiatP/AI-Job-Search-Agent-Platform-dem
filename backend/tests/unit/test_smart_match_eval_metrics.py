import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from smart_match_eval.metrics import cohen_kappa, ndcg_at_k, precision_at_k, spearman  # noqa: E402


def test_spearman_perfect_and_reversed():
    assert spearman([1, 2, 3], [1, 2, 3]) == pytest.approx(1.0)
    assert spearman([1, 2, 3], [3, 2, 1]) == pytest.approx(-1.0)


def test_spearman_ties_use_average_ranks():
    # xs ranks [1, 2.5, 2.5, 4]; ys ranks [1, 2, 3, 4]
    # dx=[-1.5,0,0,1.5] dy=[-1.5,0.5,-0.5,0]... use means 2.5:
    # x dev [-1.5,0,0,1.5], y dev [-1.5,-.5,.5,1.5]; cov=2.25+2.25=4.5
    # var_x=4.5, var_y=5 -> 4.5/sqrt(22.5)
    assert spearman([1, 2, 2, 3], [1, 2, 3, 4]) == pytest.approx(4.5 / math.sqrt(22.5))


def test_spearman_constant_is_zero():
    assert spearman([1, 1, 1], [1, 2, 3]) == 0.0
    assert spearman([1, 2, 3], [5, 5, 5]) == 0.0


def test_ndcg_perfect_is_one():
    assert ndcg_at_k([3, 2, 1, 0]) == pytest.approx(1.0)


def test_ndcg_imperfect_hand_computed():
    # rels [1,3]: DCG = (2^1-1)/log2(2) + (2^3-1)/log2(3) = 1 + 7/log2(3)
    # ideal [3,1]: 7/1 + 1/log2(3)
    expected = (1 + 7 / math.log2(3)) / (7 + 1 / math.log2(3))
    assert ndcg_at_k([1, 3]) == pytest.approx(expected)


def test_ndcg_zero_ideal_and_k_cutoff():
    assert ndcg_at_k([0, 0, 0]) == 0.0
    # k=1: DCG=0 (first item rel 0), ideal=7 -> 0
    assert ndcg_at_k([0, 3], k=1) == 0.0


def test_precision_at_k():
    assert precision_at_k([3, 1, 2, 0], k=4) == 0.5  # 3 and 2 >= 2
    assert precision_at_k([3, 1, 2, 0], k=2) == 0.5  # only 3 of top two
    assert precision_at_k([3, 2], k=10) == 1.0  # divides by 2 items, not 10
    assert precision_at_k([]) == 0.0


def test_cohen_kappa():
    # a=[1,1,0,0], b=[1,0,0,0]: po=3/4; pe=(2/4*1/4)+(2/4*3/4)=0.5; k=(.75-.5)/.5=.5
    assert cohen_kappa([1, 1, 0, 0], [1, 0, 0, 0]) == pytest.approx(0.5)
    assert cohen_kappa([1, 0, 1], [1, 0, 1]) == 1.0
    assert cohen_kappa([2, 2], [2, 2]) == 1.0
