"""Pooled evaluation: every CV scored against all non-borderline jobs. See README.md."""
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
POOL_LABELS = _HERE / "data" / "pool_labels.json"


def _key(slug, cv_id):
    return f"{slug}+{cv_id}"


_JF = json.loads((_HERE / "data" / "job_families.json").read_text(encoding="utf-8"))
JOB_FAMILY = _JF["families"]  # slug -> family, classified blind from job text only
BORDERLINE = set(_JF["borderline"])  # jobs with no clear family: left out of the pool
CV_FAMILY = {"cv-01": "software_data", "cv-02": "software_data", "cv-03": "marketing", "cv-04": "marketing",
             "cv-05": "finance_accounting", "cv-06": "finance_accounting", "cv-07": "healthcare",
             "cv-08": "healthcare", "cv-09": "operations_logistics", "cv-10": "operations_logistics"}


def _pooled_jobs(pairs):
    return {p["job"]["slug"]: p["job"] for p in pairs if p["job"]["slug"] not in BORDERLINE}


def same_family_pairs(pairs):
    """(slug, cv_id) for each pooled job and same-family CV with no original pair: needs a blind label."""
    original = {(p["cv_id"], p["job"]["slug"]) for p in pairs}
    return [(slug, cv) for slug in _pooled_jobs(pairs) for cv in sorted(CV_FAMILY)
            if CV_FAMILY[cv] == JOB_FAMILY[slug] and (cv, slug) not in original]


def pool_pairs(pairs, pool_labels):
    """All CV x non-borderline job pairs. Original labels kept; other families are `no`; same-family come from pool_labels."""
    jobs = _pooled_jobs(pairs)
    original = {(p["cv_id"], p["job"]["slug"]): p for p in pairs}
    out = []
    for cv_id in sorted(CV_FAMILY):
        for slug, job in jobs.items():
            if (cv_id, slug) in original:
                out.append(original[(cv_id, slug)])
            elif CV_FAMILY[cv_id] != JOB_FAMILY[slug]:
                out.append({"cv_id": cv_id, "job": job, "label": "no", "kind": "cross-family",
                            "reason": "job belongs to a different role family"})
            else:
                lab = pool_labels[_key(slug, cv_id)]
                out.append({"cv_id": cv_id, "job": job, "label": lab["label"], "kind": "same-family", "reason": lab["reason"]})
    return out


def owner_style_sheet_for_pool(pairs, cvs, skip=()):
    """Blind Markdown sheet for the same-family pairs not in `skip`: CV and job text only, no labels or reasons."""
    jobs = _pooled_jobs(pairs)
    parts = ["# Pool label sheet", "Label each pair good, maybe or no."]
    for i, (slug, cv_id) in enumerate([x for x in same_family_pairs(pairs) if _key(*x) not in skip], 1):
        job = jobs[slug]
        parts.append(f"## Pair {i}  (id: {_key(slug, cv_id)})\n\n### CV\n\n{cvs[cv_id]}\n\n"
                     f"### Job: {job['title']} at {job['company']}\n\n{job['description_markdown']}\n\nYour label: ___")
    return "\n\n".join(parts) + "\n"


def pool_metrics(scored):
    """Extra pooled metrics: precision_at_5 (macro over CVs) and cross_family_leak (share of cross-family pairs in band 4+)."""
    by_cv = defaultdict(list)
    for r in scored:
        by_cv[r["cv_id"]].append(r)
    precs, recalls = [], []
    for rows in by_cv.values():
        rows = sorted(rows, key=lambda r: (-r["fit_percent"], r["cv_id"], r["slug"]))
        precs.append(precision_at_k([VALUE[r["label"]] for r in rows], 5))
        goods = sum(r["label"] == "good" for r in rows)
        recalls.append(sum(r["label"] == "good" for r in rows[:10]) / goods if goods else 1.0)
    cross = [r for r in scored if r["kind"] == "cross-family"]
    leak = sum(smart_match.band(r["fit_percent"]) >= 4 for r in cross) / len(cross) if cross else 0.0
    return {"precision_at_5": sum(precs) / len(precs), "recall_good_at_10": sum(recalls) / len(recalls), "cross_family_leak": leak}


def format_pool_metrics(m):
    return f"precision_at_5: {m['precision_at_5']:.3f}\nrecall_good_at_10: {m['recall_good_at_10']:.3f}\ncross_family_leak: {m['cross_family_leak']:.3f}"


def main():
    if sys.argv[1:] != ["sheet"]:
        sys.exit("usage: pool.py sheet  (prints the blind sheet for same-family pairs still unlabelled)")
    pairs = json.loads((_HERE / "data" / "pairs.json").read_text(encoding="utf-8"))
    cvs = {c["id"]: c["text"] for c in json.loads((_HERE / "data" / "cvs.json").read_text(encoding="utf-8"))}
    have = json.loads(POOL_LABELS.read_text(encoding="utf-8")) if POOL_LABELS.exists() else {}
    print(owner_style_sheet_for_pool(pairs, cvs, skip=have))


if __name__ == "__main__":
    main()
