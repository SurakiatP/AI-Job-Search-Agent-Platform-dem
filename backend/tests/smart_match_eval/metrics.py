"""Pure-Python ranking/agreement metrics for the smart-match evaluation harness."""
import math
from collections import Counter


def _ranks(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs, ys):
    rx, ry = _ranks(xs), _ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    vx = sum((a - mx) ** 2 for a in rx)
    vy = sum((b - my) ** 2 for b in ry)
    if vx == 0 or vy == 0:
        return 0.0
    return cov / math.sqrt(vx * vy)


def _dcg(rels):
    return sum((2**r - 1) / math.log2(i + 2) for i, r in enumerate(rels))


def ndcg_at_k(relevances_in_ranked_order, k=10):
    rels = list(relevances_in_ranked_order)
    ideal = _dcg(sorted(rels, reverse=True)[:k])
    return _dcg(rels[:k]) / ideal if ideal else 0.0


def precision_at_k(relevances_in_ranked_order, k=10, threshold=2):
    top = list(relevances_in_ranked_order)[:k]
    return sum(r >= threshold for r in top) / len(top) if top else 0.0


def cohen_kappa(a, b):
    n = len(a)
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[l] * cb[l] for l in ca) / n**2
    if pe == 1:
        return 1.0 if po == 1 else 0.0
    return (po - pe) / (1 - pe)
