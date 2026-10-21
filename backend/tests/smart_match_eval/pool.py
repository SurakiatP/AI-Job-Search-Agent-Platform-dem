"""Pooled evaluation: every CV scored against all 60 jobs (600 pairs). See README.md."""
import json
import sys
from collections import defaultdict
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parents[1] / "src"))
sys.path.insert(0, str(_HERE.parent))

from job_search_platform.services import smart_match  # noqa: E402
from smart_match_eval.metrics import precision_at_k  # noqa: E402

VALUE = {"no": 0, "maybe": 1, "good": 2}
FAMILIES = [("cv-01", "cv-02"), ("cv-03", "cv-04"), ("cv-05", "cv-06"), ("cv-07", "cv-08"), ("cv-09", "cv-10")]
FAMILY = {cv: i for i, fam in enumerate(FAMILIES) for cv in fam}
POOL_LABELS = _HERE / "data" / "pool_labels.json"


def _key(slug, cv_id):
    return f"{slug}+{cv_id}"


def _sibling(cv_id):
    return next(c for c in FAMILIES[FAMILY[cv_id]] if c != cv_id)


def same_family_pairs(pairs):
    """(slug, sibling cv_id) for each job and the sibling CV of the CV it was written for: needs a blind label."""
    return [(p["job"]["slug"], _sibling(p["cv_id"])) for p in pairs]


def pool_pairs(pairs, pool_labels):
    """All CV x job pairs. Original labels kept; other families are `no`; same-family siblings come from pool_labels."""
    jobs = {p["job"]["slug"]: p for p in pairs}
    original = {(p["cv_id"], p["job"]["slug"]): p for p in pairs}
    out = []
    for cv_id in sorted(FAMILY):
        for slug, home in jobs.items():
            if (cv_id, slug) in original:
                out.append(original[(cv_id, slug)])
            elif FAMILY[cv_id] != FAMILY[home["cv_id"]]:
                out.append({"cv_id": cv_id, "job": home["job"], "label": "no", "kind": "cross-family",
                            "reason": "job belongs to a different role family"})
            else:
                out.append({"cv_id": cv_id, "job": home["job"], "label": pool_labels[_key(slug, cv_id)]["label"],
                            "kind": "same-family", "reason": pool_labels[_key(slug, cv_id)]["reason"]})
    return out


def owner_style_sheet_for_pool(pairs, cvs):
    """Blind Markdown sheet for the same-family pairs: CV and job text only, no labels or reasons."""
    jobs = {p["job"]["slug"]: p["job"] for p in pairs}
    parts = ["# Pool label sheet", "Label each pair good, maybe or no."]
    for i, (slug, cv_id) in enumerate(same_family_pairs(pairs), 1):
        job = jobs[slug]
        parts.append(f"## Pair {i}  (id: {_key(slug, cv_id)})\n\n### CV\n\n{cvs[cv_id]}\n\n"
                     f"### Job: {job['title']} at {job['company']}\n\n{job['description_markdown']}\n\nYour label: ___")
    return "\n\n".join(parts) + "\n"


def pool_metrics(scored):
    """Extra pooled metrics: precision_at_5 (macro over CVs) and cross_family_leak (share of cross-family pairs in band 4+)."""
    by_cv = defaultdict(list)
    for r in scored:
        by_cv[r["cv_id"]].append(r)
    precs = []
    for rows in by_cv.values():
        rows = sorted(rows, key=lambda r: (-r["fit_percent"], r["cv_id"], r["slug"]))
        precs.append(precision_at_k([VALUE[r["label"]] for r in rows], 5))
    cross = [r for r in scored if r["kind"] == "cross-family"]
    leak = sum(smart_match.band(r["fit_percent"]) >= 4 for r in cross) / len(cross) if cross else 0.0
    return {"precision_at_5": sum(precs) / len(precs), "cross_family_leak": leak}


def format_pool_metrics(m):
    return f"precision_at_5: {m['precision_at_5']:.3f}\ncross_family_leak: {m['cross_family_leak']:.3f}"


def main():
    if sys.argv[1:] != ["sheet"]:
        sys.exit("usage: pool.py sheet  (prints the blind same-family label sheet)")
    pairs = json.loads((_HERE / "data" / "pairs.json").read_text())
    cvs = {c["id"]: c["text"] for c in json.loads((_HERE / "data" / "cvs.json").read_text())}
    print(owner_style_sheet_for_pool(pairs, cvs))


if __name__ == "__main__":
    main()
