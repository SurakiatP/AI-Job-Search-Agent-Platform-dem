"""Three-column comparison of benchmark runs: python compare.py <baseline.json> <candidate.json> [<extra.json> ...] --out results/<name>.
Writes <name>.json (summary numbers) and <name>.md (table per task: quality, latency p50/p95, cost per case, failures)."""
import argparse
import json
import statistics as st
import sys
import time
from pathlib import Path

TASKS = ["extract", "evaluate", "draft", "tailor", "apply", "practice", "ocr"]


def pct(v, p):
    v = sorted(v)
    return v[min(len(v) - 1, int(p * len(v)))] if v else float("nan")


def stats(rows):
    t = [r["total_s"] for r in rows if r.get("total_s")]
    return {"n": len(rows), "quality": round(st.mean(r["quality"] for r in rows), 1), "p50_s": round(pct(t, .5), 1), "p95_s": round(pct(t, .95), 1),
            "cost_usd": round(st.mean(r.get("cost_usd", 0) for r in rows), 5), "think_tok": round(st.mean((r.get("reasoning_tokens") or 0) for r in rows)),
            "errors": sum("error" in r for r in rows), "truncated": sum(bool(r.get("truncated")) for r in rows),
            "invalid": sum(r["quality"] == 0 and "error" not in r for r in rows)}


def live_prices(models):
    """OpenRouter list prices, USD per million tokens, fetched now (never hard-coded)."""
    import urllib.request
    with urllib.request.urlopen("https://openrouter.ai/api/v1/models", timeout=30) as r:
        listed = {m["id"]: m for m in json.loads(r.read())["data"]}
    return {m: {"in": float(listed[m]["pricing"]["prompt"]) * 1e6, "out": float(listed[m]["pricing"]["completion"]) * 1e6,
                "cache": float(listed[m]["pricing"].get("input_cache_read") or listed[m]["pricing"]["prompt"]) * 1e6} for m in models}


def row_cost(r, price):
    """USD from real token usage: uncached prompt + cached prompt + completion (reasoning tokens are inside completion_tokens).
    Repair-round and practice-rewrite calls are already summed into the row by run_bench."""
    cached = r.get("cached_tokens") or 0
    return (((r.get("prompt_tokens") or 0) - cached) * price["in"] + cached * price["cache"] + (r.get("completion_tokens") or 0) * price["out"]) / 1e6


def cost_report(a):
    """`cost` command: per-task token/$ comparison of qwen configs against luna from the real usage in the result files."""
    luna_run = json.loads(Path(a.luna).read_text())
    qwens = {}
    for spec in a.qwen:  # label=file
        label, f = spec.split("=", 1)
        qwens[label] = json.loads(Path(f).read_text())
    models = {luna_run["models"][0], *(r["models"][0] for r in qwens.values())}
    prices, fetched = live_prices(sorted(models)), time.strftime("%Y-%m-%d %H:%M")
    mix = {t: 1.0 for t in TASKS}
    for kv in (a.mix or "").split(","):
        if kv:
            mix[kv.split("=")[0]] = float(kv.split("=")[1])
    total = sum(mix.values())
    configs = {"luna": luna_run, **qwens}

    def rows(cfg, t):
        return [x for x in configs[cfg]["results"] if x["task"] == t]

    def agg(cfg, t):
        rs, price = rows(cfg, t), prices[configs[cfg]["models"][0]]
        n, cost = len(rs), [row_cost(x, price) for x in rs]
        lat = sorted(x["total_s"] for x in rs if x.get("total_s"))
        det = [x.get("details") or {} for x in rs]
        return {"n": n, "q": st.mean(x["quality"] for x in rs), "usd": st.mean(cost), "p50": lat[len(lat) // 2] if lat else float("nan"),
                "in": st.mean(x.get("prompt_tokens") or 0 for x in rs), "out": st.mean(x.get("completion_tokens") or 0 for x in rs),
                "think": st.mean(x.get("reasoning_tokens") or 0 for x in rs),
                "bad": sum(bool(d.get("trap_claimed")) + bool(d.get("invented_numbers")) + d.get("invented_answers", 0) for d in det),
                "drift": max((abs(c - x.get("cost_usd", c)) / max(c, 1e-12) for c, x in zip(cost, rs)), default=0)}

    table = {(c, t): agg(c, t) for c in configs for t in TASKS if rows(c, t)}
    lines = [f"## Cost comparison (OpenRouter list prices fetched {fetched})", "",
             "| model | input $/Mtok | cached input $/Mtok | output $/Mtok |", "|---|---|---|---|"]
    lines += [f"| {m} | {p['in']:.4f} | {p['cache']:.4f} | {p['out']:.4f} |" for m, p in prices.items()]
    lines += ["", "Cost = (uncached prompt x in + cached prompt x cache + completion x out) from each call's real usage; completion includes reasoning tokens; "
              "repair-round (evaluate/extract) and practice rewrite calls and every OCR page call are included. "
              "Not app-parity: no LiteLLM markup, real cache hit rate differs. LiteLLM/OpenRouter-reported spend is not stored in the result files.", "",
              "| task | config | n | tok in | tok out | of which reasoning | $/case | $ per 1,000 runs | saving vs luna | $/1k runs per quality point | quality | p50 | bad (trap/invented) |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for t in TASKS:
        for c in configs:
            if (c, t) not in table:
                continue
            x, base = table[(c, t)], table[("luna", t)]
            sav = "-" if c == "luna" else f"{100 * (1 - x['usd'] / base['usd']):.0f}%"
            lines.append(f"| {t} | {c} | {x['n']} | {x['in']:.0f} | {x['out']:.0f} | {x['think']:.0f} | ${x['usd']:.5f} | ${1000 * x['usd']:.2f} | {sav} | "
                         f"${1000 * x['usd'] / max(x['q'], 1):.4f} | {x['q']:.1f} | {x['p50']:.1f}s | {x['bad']} |")
    lines += ["", f"### Blended per-run cost (usage mix: {'equal weight per task' if not a.mix else a.mix}; {a.mix or 'override with --mix task=weight,...'})", "",
              "| config | blended $/run | $ per 1,000 runs | saving vs luna | blended quality |", "|---|---|---|---|---|"]
    blend = lambda pick: (sum(mix[t] * table[pick(t)]["usd"] for t in mix if pick(t) in table) / total,
                          sum(mix[t] * table[pick(t)]["q"] for t in mix if pick(t) in table) / total)
    luna_usd = blend(lambda t: ("luna", t))[0]
    for c in configs:
        if all((c, t) in table for t in TASKS):
            usd, q = blend(lambda t, c=c: (c, t))
            lines.append(f"| all tasks on {c} | ${usd:.5f} | ${1000 * usd:.2f} | {'-' if c == 'luna' else f'{100 * (1 - usd / luna_usd):.0f}%'} | {q:.1f} |")
    chosen = {}
    for t in TASKS:  # cheapest qwen config within the quality tolerance and with no more trap/invented results than luna; else luna
        base = table[("luna", t)]
        ok = [c for c in qwens if (c, t) in table and table[(c, t)]["q"] >= base["q"] - a.tolerance and table[(c, t)]["bad"] <= base["bad"]]
        chosen[t] = min(ok, key=lambda c: table[(c, t)]["usd"]) if ok else "luna"
    usd, q = blend(lambda t: (chosen[t], t))
    lines += [f"| **chosen per task** (qwen only where quality >= luna - {a.tolerance:g} and no extra trap/invented result; else luna) | ${usd:.5f} | ${1000 * usd:.2f} | "
              f"{100 * (1 - usd / luna_usd):.0f}% | {q:.1f} |", "", "Chosen: " + ", ".join(f"{t}={c}" for t, c in chosen.items()), ""]
    drift = max(x["drift"] for x in table.values())
    lines.append(f"Check against the cost recorded at run time (same token usage x the prices stored in each run): largest per-row difference {drift:.1%}"
                 + (" -- FLAG: prices changed since the run, or usage fields differ." if drift > 0.01 else " (consistent)."))
    Path(a.out + "-cost.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "cost":
        ap = argparse.ArgumentParser()
        ap.add_argument("cmd")
        ap.add_argument("--luna", required=True)
        ap.add_argument("--qwen", nargs="+", required=True, help="label=results.json ...")
        ap.add_argument("--mix", help="task=weight,... default equal weight per task")
        ap.add_argument("--tolerance", type=float, default=3.0)
        ap.add_argument("--out", required=True)
        return cost_report(ap.parse_args())
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--labels", nargs="+")
    a = ap.parse_args()
    runs = [json.loads(Path(f).read_text()) for f in a.files]
    labels = a.labels or [r["tag"] for r in runs]
    out = {"runs": [{k: r.get(k) for k in ("tag", "date", "backend_commit", "mode", "scorer_version", "dataset", "dataset_sha256_12", "models")} for r in runs], "tasks": {}}
    for t in TASKS + ["ALL"]:
        out["tasks"][t] = {lab: stats([x for x in r["results"] if t == "ALL" or x["task"] == t]) for lab, r in zip(labels, runs)}
    Path(a.out + ".json").write_text(json.dumps(out, indent=1))
    lines = ["| task | metric | " + " | ".join(labels) + " | gap (" + labels[1] + " - " + labels[0] + ") |", "|---|---|" + "---|" * (len(labels) + 1)]
    for t in TASKS + ["ALL"]:
        s = [out["tasks"][t][lab] for lab in labels]
        for m, f in (("quality", "{:.1f}"), ("p50_s", "{:.1f}s"), ("p95_s", "{:.1f}s"), ("cost_usd", "${:.5f}"), ("failures (error or zero-score)", "{}")):
            v = [(x["errors"] + x["invalid"]) if m.startswith("failures") else x[m] for x in s]
            gap = v[1] - v[0]
            lines.append(f"| {t} | {m} | " + " | ".join(f.format(x) for x in v) + " | " + (f"{gap:+.1f}" if m != "cost_usd" else f"{gap:+.5f}") + " |")
    Path(a.out + ".md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
