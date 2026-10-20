"""LLM judge, agreement stats and blind owner sheet for the smart-match evaluation. See README.md."""
import hashlib
import json
import os
import random
import sys
import urllib.request
from pathlib import Path

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parents[1] / "src"))
sys.path.insert(0, str(_HERE.parent))

from job_search_platform.services import smart_match  # noqa: E402
from smart_match_eval.metrics import cohen_kappa  # noqa: E402

URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "deepseek/deepseek-v4.1-flash-1017"
LABELS = ("good", "maybe", "no")
CACHE_DIR = _HERE / ".cache"
PAIRS_LIMIT = None  # tests shrink the live run
PROMPT = ("You judge how well a job fits a candidate CV. Answer with one JSON object only: "
          '{"label": "good|maybe|no", "reason": "<one line>"}. good = strong fit, maybe = partial or uncertain, no = poor fit.')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect, urllib.request.ProxyHandler({}))  # env proxies must never see the key


def make_post(key):
    def post(payload):
        request = urllib.request.Request(URL, data=json.dumps(payload).encode(), method="POST", headers={
            "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        with _OPENER.open(request, timeout=60) as response:
            return json.loads(response.read(2_000_000))
    return post


def make_jev(key):
    from job_search_platform.integrations.jev import JevClient
    return JevClient(key)


def _payload(pair, cv_text):
    job = pair["job"]
    user = f"CV:\n{cv_text}\n\nJob: {job['title']} at {job['company']}\n{job['description_markdown']}"
    return {"model": MODEL, "temperature": 0,
            "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": user}]}


def _parse(response):
    try:
        data = json.loads(response["choices"][0]["message"]["content"])
        if data["label"] in LABELS and isinstance(data["reason"], str):
            return data["label"], data["reason"]
    except (KeyError, IndexError, TypeError, ValueError):
        pass
    return None


def judge_pairs(pairs, cvs, post, cache_dir):
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = []
    for pair in pairs:
        payload = _payload(pair, cvs[pair["cv_id"]])
        path = cache_dir / ("judge-" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest() + ".json")
        if path.exists():
            parsed = json.loads(path.read_text())
            parsed = tuple(parsed) if parsed else None
        else:
            parsed = _parse(post(payload)) or _parse(post(payload))
            path.write_text(json.dumps(parsed))
        out.append({"cv_id": pair["cv_id"], "slug": pair["job"]["slug"], "label": pair["label"],
                    "kind": pair["kind"], "judge": parsed[0] if parsed else None,
                    "judge_reason": parsed[1] if parsed else None})
    return out


def _kappa(a, b):
    return cohen_kappa(a, b) if a else None


def kappa_report(judged, owner_labels):
    rows = [r for r in judged if r["judge"]]
    owned = [(r["judge"], owner_labels[f"{r['slug']}+{r['cv_id']}"]) for r in rows if f"{r['slug']}+{r['cv_id']}" in owner_labels]
    return {"vs_construction": _kappa([r["judge"] for r in rows], [r["label"] for r in rows]),
            "vs_owner": _kappa([a for a, _ in owned], [b for _, b in owned]), "owner_n": len(owned)}


def disagreements(judged, scored):
    fit = {(s["cv_id"], s["slug"]): s["fit_percent"] for s in scored}
    out = []
    for r in judged:
        b = smart_match.band(fit[(r["cv_id"], r["slug"])])
        band_label = "good" if b >= 4 else "maybe" if b == 3 else "no"
        if len({r["judge"], r["label"], band_label}) > 1:
            out.append({"cv_id": r["cv_id"], "slug": r["slug"], "judge": r["judge"], "construction": r["label"],
                        "band": b, "band_label": band_label})
    return out[:25]


def pick_for_owner(pairs, count=15):
    rng, per = random.Random(20261021), count // 3
    chosen = []
    for label in LABELS:
        pool = [p for p in pairs if p["label"] == label]
        amb = [p for p in pool if p["kind"] == "ambiguous"]
        picked = rng.sample(amb, min(3, len(amb), per))
        rest = [p for p in pool if p not in picked]
        chosen += picked + rng.sample(rest, per - len(picked))
    rng.shuffle(chosen)
    return chosen


def owner_sheet(pairs, count=15):
    cvs = {c["id"]: c["text"] for c in json.loads((_HERE / "data" / "cvs.json").read_text())}
    parts = ["# Owner label sheet", "Label each pair good, maybe or no."]
    for i, p in enumerate(pick_for_owner(pairs, count), 1):
        job = p["job"]
        parts.append(f"## Pair {i}  (id: {job['slug']}+{p['cv_id']})\n\n### CV\n\n{cvs[p['cv_id']]}\n\n"
                     f"### Job: {job['title']} at {job['company']}\n\n{job['description_markdown']}\n\nYour label: ___")
    return "\n\n".join(parts) + "\n"


def main():
    pairs = json.loads((_HERE / "data" / "pairs.json").read_text())
    if sys.argv[1:] == ["sheet"]:
        print(owner_sheet(pairs))
        return
    if os.environ.get("SMART_MATCH_EVAL_LIVE") != "1":
        sys.exit("Refusing to run: set SMART_MATCH_EVAL_LIVE=1 (this makes paid live calls). Use `sheet` for the offline owner sheet.")
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY is not set in the environment.")
    from smart_match_eval import run_eval
    pairs = pairs[:PAIRS_LIMIT]
    cvs = {c["id"]: c["text"] for c in json.loads((_HERE / "data" / "cvs.json").read_text())}
    judged = judge_pairs(pairs, cvs, make_post(key), CACHE_DIR)
    owner_file = _HERE / "data" / "owner_labels.json"
    owner = json.loads(owner_file.read_text()) if owner_file.exists() else {}
    report = kappa_report(judged, owner)
    print("kappa judge vs construction:", report["vs_construction"])
    print(f"kappa judge vs owner (n={report['owner_n']}):", report["vs_owner"])
    print("judge failures (null):", sum(r["judge"] is None for r in judged))
    for d in disagreements(judged, run_eval.score_pairs(pairs, cvs, make_jev(key), CACHE_DIR)):
        print(json.dumps(d))


if __name__ == "__main__":
    main()
