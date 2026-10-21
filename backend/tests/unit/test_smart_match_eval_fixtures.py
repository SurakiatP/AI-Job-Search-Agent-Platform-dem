import json
import re
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "smart_match_eval" / "data"
CVS = json.loads((DATA / "cvs.json").read_text(encoding="utf-8"))
PAIRS = json.loads((DATA / "pairs.json").read_text(encoding="utf-8"))
RAW = (DATA / "cvs.json").read_text(encoding="utf-8") + (DATA / "pairs.json").read_text(encoding="utf-8")


def _size_ok(text, lo, hi, th_chars):
    # English: whitespace words; Thai has no word spaces, so bound characters instead.
    if re.search(r"[฀-๿]", text):
        return th_chars[0] <= len(text) <= th_chars[1]
    return lo <= len(text.split()) <= hi


def test_cvs_schema_and_mix():
    assert [c["id"] for c in CVS] == [f"cv-{i:02d}" for i in range(1, 11)]
    assert Counter(c["language"] for c in CVS) == {"th": 6, "en": 4}
    for c in CVS:
        assert set(c) == {"id", "language", "text"}
        assert _size_ok(c["text"], 150, 300, (600, 2600)), c["id"]


def test_pairs_counts_and_schema():
    assert len(PAIRS) == 60
    assert Counter(p["label"] for p in PAIRS) == {"good": 20, "maybe": 18, "no": 22}  # pairs 32 (cv-06) and 44 (cv-08) relabelled maybe->no after blind review
    assert sum(p["kind"] == "ambiguous" for p in PAIRS) == 10
    assert {p["kind"] for p in PAIRS} == {"clear", "ambiguous"}
    for p in PAIRS:
        assert set(p) == {"cv_id", "job", "label", "reason", "kind"}
        assert p["reason"].strip() and "\n" not in p["reason"]
        j = p["job"]
        assert set(j) == {"slug", "title", "company", "description_markdown", "skills"}
        assert 0 < len(j["slug"]) <= 200
        assert _size_ok(j["description_markdown"], 80, 200, (250, 1500)), j["slug"]
        assert j["skills"] and all(isinstance(s, str) and s for s in j["skills"])


def test_slugs_unique_and_cv_ids_exist():
    slugs = [p["job"]["slug"] for p in PAIRS]
    assert len(set(slugs)) == len(slugs)
    ids = {c["id"] for c in CVS}
    assert all(p["cv_id"] in ids for p in PAIRS)


def test_every_cv_covered():
    for cv in CVS:
        labels = [p["label"] for p in PAIRS if p["cv_id"] == cv["id"]]
        assert len(labels) >= 5
        assert "good" in labels and "no" in labels


def test_no_pii_shapes():
    assert not re.search(r"\d{9,}", RAW)
    for m in re.findall(r"[\w.+-]*@[\w.-]+", RAW):
        assert m.endswith("@example.test")
