"""Gold-dataset benchmark: time, quality and cost of models on the app's AI tasks, through LiteLLM.

Run with the backend interpreter so the app's real prompt builders and evidence helpers are used:
  backend/.venv/bin/python evals/gold/run_bench.py run --models qwen/qwen3.8-flash z-ai/glm-5.3-flash --tag 2026-10-21
  backend/.venv/bin/python evals/gold/run_bench.py report evals/gold/results/2026-10-21.json
Needs LiteLLM reachable (LITELLM_BASE_URL, default http://127.0.0.1:54000) and its master key file
(LITELLM_MASTER_KEY_FILE, default <CORE02_PRIVATE_DIR>/litellm-master-key). The key is never printed.
Temporary aliases `gold-<slug>` are created in LiteLLM and removed at the end.
Scoring is deterministic (no judge model): see the scorer for each task. Quality is 0-100.
"""
import argparse
import json
import os
import re
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, os.environ.get("BENCH_BACKEND_SRC") or str(ROOT / "backend" / "src"))  # BENCH_BACKEND_SRC: measure an older checkout
from job_search_platform.services import applications, experience, practice, tailoring  # noqa: E402
from job_search_platform.services.evidence import claims  # noqa: E402
from job_search_platform.workers.executor import RunExecutor  # noqa: E402

DATA = Path(__file__).parent / "data" / "gold.v1.json"
HOLDOUT = Path(__file__).parent / "data" / "gold.holdout.v1.json"
CURRENT_MODE = "low"
SAVE_TEXT = False  # set by --save-text: keep the raw model reply in the results file
MODES = {"default": None, "low": {"effort": "low"}, "off": {"enabled": False}, "none": {"effort": "none"}, "minimal": {"effort": "minimal"}}
TASKS = ["evaluate", "draft", "extract", "tailor", "apply", "practice"]
BASE = (os.environ.get("LITELLM_BASE_URL") or "http://127.0.0.1:54000").rstrip("/")
PRIVATE = Path(os.environ.get("CORE02_PRIVATE_DIR") or Path.home() / ".cache/job-search-platform/core02-runtime-20261003")
KEYFILE = Path(os.environ.get("LITELLM_MASTER_KEY_FILE") or PRIVATE / "litellm-master-key")


# ---- shared helpers -------------------------------------------------------------------------------------------
def norm(text):
    return " ".join(re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", str(text or ""), flags=re.M).lower().split())


def present(skill, text):
    return re.search(r"(?<![a-z0-9])" + re.escape(skill.lower()) + r"(?![a-z0-9])", str(text).lower()) is not None


def parse_json(raw):
    text = (raw or "").strip()
    fence = re.fullmatch(r"```(?:json)?\s*\n(.*)\n\s*```", text, re.S)
    text = fence.group(1) if fence else text
    for candidate in (text, text[text.find("{"): text.rfind("}") + 1]):
        try:
            return json.loads(candidate)
        except ValueError:
            continue
    return None


def lang_name(persona):
    return "Thai"  # the app's default output language; CVs are Thai or English


# ---- prompt builders (the app's own code) ---------------------------------------------------------------------
def build_prompt(task, case, data):
    persona = next(p for p in data["personas"] if p["id"] == case["persona"])
    job = next((j for j in data["jobs"] if j["id"] == case.get("job")), None)
    if task == "extract":
        return experience.extraction_prompt(persona["cv"])
    snap = {"job": {"title": job["title"], "company": job["company"], "description": job["description"]}} if job else {}
    if task == "evaluate":
        run = SimpleNamespace(operation="evaluate_job", output_language="th", input_snapshot=snap)
        return RunExecutor._prompt(run, persona["cv"], [])
    if task == "draft":
        run = SimpleNamespace(operation="draft_documents", output_language="th", input_snapshot=dict(snap, draft_kind=case["kind"]))
        lines = [f["text"] + f" ({f['context']})" for f in persona["facts"]]
        prompt, instructions = RunExecutor._prompt(run, persona["cv"], lines)
        # Benchmark variant: the app has the agent write a file; here the model returns the document text itself.
        prompt += "\n\nDo not write files. Reply with the full document text in Markdown only, no JSON."
        return prompt, instructions
    if task == "tailor":
        return tailoring.round_prompt(persona["cv"], job["title"], job["description"], case["missing"], persona["facts"], lang_name(persona))
    if task == "apply":
        return applications.pack_prompt(persona["cv"], job["title"], job["description"], case["questions"], persona["facts"],
                                        lang_name(persona), f"Years of experience: {case['profile_years']:g}")
    if task == "practice":
        return practice.prompt(level=case["level"], sections=case["sections"], job=job, cv_text=persona["cv"],
                               facts=persona["facts"], report=None, output_language=lang_name(persona))
    raise ValueError(task)


# ---- scorers: each returns (score 0-100, details dict) --------------------------------------------------------
def score_extract(raw, case, persona, job):
    payload = parse_json(raw)
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        return 0.0, {"valid": False}
    cv, gold = norm(persona["cv"]), persona["gold_facts"]
    texts = [(norm(i.get("text")), i) for i in items if isinstance(i, dict) and i.get("text")]

    def same(a, b):
        return a == b or (a in b and len(a) / len(b) >= 0.8) or (b in a and len(b) / len(a) >= 0.8)

    hit, org_ok, org_n, date_ok, date_n = 0, 0, 0, 0, 0
    for g in gold:
        match = next((i for t, i in texts if same(t, norm(g["text"]))), None)
        if match is None:
            continue
        hit += 1
        if g["org"]:
            org_n += 1
            org_ok += norm(match.get("organization")) == norm(g["org"])
            date_n += 1
            date_ok += str(match.get("start_date") or "") == g["start"]
    recall = hit / len(gold)
    precision = sum(t in cv for t, _ in texts) / max(len(texts), 1)
    f1 = 2 * recall * precision / (recall + precision) if recall + precision else 0
    org, date = org_ok / max(org_n, 1), date_ok / max(date_n, 1)
    return 100 * (0.5 * f1 + 0.25 * org + 0.25 * date), {"recall": round(recall, 2), "precision": round(precision, 2),
                                                           "org": round(org, 2), "start": round(date, 2)}


def score_evaluate(raw, case, persona, job):
    payload = parse_json(raw)
    if not isinstance(payload, dict):
        return 0.0, {"valid": False}
    report = payload.get("report") if isinstance(payload.get("report"), dict) else {}
    score = payload.get("score")
    lo, hi = case["score_band"][0], case["score_band"][-1]
    band = 0.0
    if isinstance(score, (int, float)):
        band = 1.0 if lo <= score <= hi else 0.5 if lo - 1 <= score <= hi + 1 else 0.0
    rows = [r for r in report.get("requirements") or [] if isinstance(r, dict)]
    correct = 0
    for skill, has in case["requirements_present"].items():
        row = next((r for r in rows if present(skill, r.get("requirement", ""))), None)
        if row:
            got = row.get("match") in ("strong", "partial")
            correct += (got == has) and (has or row.get("match") == "missing")
    acc = correct / len(case["requirements_present"])
    schema = 1.0 if report.get("verdict") and report.get("summary") and rows else 0.0
    return 100 * (0.4 * band + 0.4 * acc + 0.2 * schema), {"score": score, "band": case["score_band"], "req_acc": round(acc, 2)}


LEARN = ("เรียนรู้", "ศึกษา", "พัฒนา", "ยินดี", "กระตือรือร้น", "ตั้งใจ", "พร้อม", "ยังไม่", "ไม่มีประสบการณ์", "eager", "learn", "keen", "yet", "not yet")


def claims_skill(skill, text):
    """True when the text names the skill without saying the candidate wants to learn it or lacks it (±110 characters)."""
    low = text.lower()
    for m in re.finditer(r"(?<![a-z0-9])" + re.escape(skill.lower()) + r"(?![a-z0-9])", low):
        window = low[max(0, m.start() - 110): m.end() + 110]
        if not any(w in window for w in LEARN):
            return True
    return False


def score_draft(raw, case, persona, job):
    text = re.sub(r"^```(?:markdown|md)?\s*\n|\n```\s*$", "", (raw or "").strip())
    if not text:
        return 0.0, {"valid": False}
    long_enough = len(text) >= (300 if case["kind"] != "application_message" else 120) and len(text) <= 6000
    mentions = float(norm(job["company"]) in norm(text)) * 0.5 + float(norm(job["title"]) in norm(text)) * 0.5
    thai = sum("฀" <= c <= "๿" for c in text) / max(len(text), 1)
    language = 1.0 if thai >= 0.3 else 0.0
    allowed = experience.numbers(persona["cv"] + " " + " ".join(f["text"] for f in persona["facts"]) + " " + job["description"])
    trap = claims_skill(persona["trap"], text)
    bad_numbers = not experience.numbers(text) <= allowed
    honest = 1.0 - 0.5 * trap - 0.5 * bad_numbers
    placeholder = re.search(r"\[[^\]\n]{2,40}\]", text) is not None
    return 100 * (0.15 * long_enough + 0.15 * mentions + 0.1 * language + 0.45 * honest + 0.15 * (not placeholder)), {
        "len": len(text), "thai": round(thai, 2), "trap_claimed": trap, "invented_numbers": bad_numbers, "placeholder": placeholder}


def score_tailor(raw, case, persona, job):
    payload = parse_json(raw)
    edits = payload.get("edits") if isinstance(payload, dict) else None
    if not isinstance(edits, list):
        return 0.0, {"valid": False}
    edits = [e for e in edits if isinstance(e, dict)][:8]
    if not edits:
        return 100 * (0.4 * 0.5), {"edits": 0}
    fact_ids = {f["id"]: f for f in persona["facts"]}
    cv = persona["cv"]
    find_ok = sum(isinstance(e.get("find"), str) and (e["find"] == "" or e["find"] in cv) for e in edits) / len(edits)
    ids_ok = sum(isinstance(e.get("evidence_ids"), list) and bool(e["evidence_ids"]) and all(i in fact_ids for i in e["evidence_ids"])
                 for e in edits) / len(edits)
    extra_id = persona["facts"][-1]["id"]
    supported = any(present(case["supportable"], str(e.get("text"))) and extra_id in (e.get("evidence_ids") or []) for e in edits)
    base_numbers = experience.numbers(cv)
    trap = any(present(case["trap"], str(e.get("text"))) for e in edits)
    bad = False
    for e in edits:
        cited = " ".join(fact_ids[i]["text"] for i in e.get("evidence_ids") or [] if i in fact_ids)
        bad |= not experience.numbers(str(e.get("text"))) <= experience.numbers(cited) | base_numbers
    honest = float(not trap and not bad)
    schema = (1 + find_ok + ids_ok) / 3
    return 100 * (0.3 * schema + 0.3 * supported + 0.4 * honest), {
        "edits": len(edits), "supportable_added": supported, "trap_claimed": trap, "invented_numbers": bad,
        "find_ok": round(find_ok, 2), "ids_ok": round(ids_ok, 2)}


def score_apply(raw, case, persona, job):
    payload = parse_json(raw)
    answers = payload.get("answers") if isinstance(payload, dict) else None
    if not isinstance(answers, list):
        return 0.0, {"valid": False}
    by_id = {a.get("question_id"): a for a in answers if isinstance(a, dict)}
    fact_ids = {f["id"] for f in persona["facts"]}
    points, evidence, null_wrong = [], [], 0
    for q in case["questions"]:
        a = by_id.get(q["id"]) or {}
        value, gold = a.get("answer"), q["gold"]
        if gold["type"] == "null":
            ok = 1.0 if value is None else 0.5 if value is False else 0.0
            null_wrong += value not in (None, False)
        elif gold["type"] == "exact":
            ok = float(norm(value) == norm(gold["value"]))
        elif gold["type"] == "keywords":
            found = sum(present(k, value) for k in gold["any"]) if isinstance(value, str) else 0
            ok = min(1.0, found / gold["min"])
        else:  # profile_years
            nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", experience.normalize(str(value)))] if value is not None else []
            ok = float(any(abs(n - case["profile_years"]) <= 1 for n in nums))
        points.append(ok)
        if value is not None and gold["type"] != "profile_years":
            ids = a.get("evidence_ids")
            evidence.append(float(isinstance(ids, list) and bool(ids) and all(i in fact_ids for i in ids)))
    ev = statistics.mean(evidence) if evidence else 0.0
    return 100 * (0.8 * statistics.mean(points) + 0.2 * ev), {"answers_ok": round(statistics.mean(points), 2),
                                                                "evidence_ok": round(ev, 2), "invented_answers": null_wrong}


def score_practice(raw, case, persona, job, rewrite=None):
    """v2: answers are judged only where an honest first-person answer can exist (not gaps/logistics) and
    relevance ignores logistics. Weights: coverage .30, answered .25, key points .10, reverse questions .05, relevance .30."""
    from uuid import UUID
    voc = {norm(v) for v in persona["orgs"] + persona["titles"]}
    fc = {UUID(f["id"]): claims(f["text"] + " . " + f["context"], voc, True) for f in persona["facts"]}
    labels = practice.aliases(persona["facts"])
    dropped = {}
    known = claims(persona["cv"], voc)
    rejected = []
    try:
        questions, reverse = practice.parse_reply(raw or "", case["sections"], fc, voc, known, dropped, labels, rejected)
    except TypeError:  # an older checkout (BENCH_BACKEND_SRC) without the rewrite step
        questions, reverse = practice.parse_reply(raw or "", case["sections"], fc, voc, known, dropped, labels)
    if not questions:
        return 0.0, {"valid": False}
    rewritten = 0
    if rewrite and rejected:  # the app's single rewrite step, through the same gate
        for index, text in practice.parse_rewrite(rewrite, rejected, fc, voc, known).items():
            questions[index]["model_answer"] = practice.clean(text, 3000)
            rewritten += 1
    wanted = sum(s["count"] for s in case["sections"])
    coverage = min(1.0, len(questions) / wanted)
    answerable = [q for q in questions if q["section"] not in ("gaps", "logistics")]
    kept = sum(q["model_answer"] is not None for q in answerable) / max(len(answerable), 1)
    points = sum(bool(q["key_points"]) for q in questions) / len(questions)
    terms = job["required"] + persona["skills_listed"] + persona["orgs"] + persona["titles"] + [job["title"], job["company"]]
    judged = [q for q in questions if q["section"] != "logistics"]
    related = sum(any(present(t, q["prompt"] + " " + q["why"] + " " + " ".join(q["key_points"])) for t in terms) for q in judged) / max(len(judged), 1)
    rev = min(1.0, len(reverse) / 3)
    return 100 * (0.30 * coverage + 0.25 * kept + 0.10 * points + 0.05 * rev + 0.30 * related), {
        "questions": len(questions), "answers_kept": round(kept, 2), "related": round(related, 2), "dropped": dropped,
        "rewritten": rewritten, "rewritable": len(rejected)}


SCORERS = {"extract": score_extract, "evaluate": score_evaluate, "draft": score_draft, "tailor": score_tailor,
           "apply": score_apply, "practice": score_practice}


# ---- LiteLLM client -------------------------------------------------------------------------------------------
def api(method, path, body=None, key=None, timeout=30):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def call(alias, system, prompt, key, max_tokens, reasoning=None):
    """One streamed chat completion. Returns timing, text and token usage."""
    body = {"model": alias, "stream": True, "stream_options": {"include_usage": True}, "max_tokens": max_tokens,
            "temperature": 0, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}
    if reasoning:
        body["reasoning"] = reasoning  # OpenRouter field, passed through LiteLLM
    t0 = time.perf_counter()
    first_any = first_text = None
    text, usage, finish = [], None, None
    req = urllib.request.Request(BASE + "/v1/chat/completions", method="POST", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        for line in r:
            line = line.decode("utf-8", "replace").strip()
            if not line.startswith("data:") or "[DONE]" in line:
                continue
            try:
                j = json.loads(line[5:])
            except ValueError:
                continue
            for ch in j.get("choices") or []:
                d = ch.get("delta") or {}
                if first_any is None and (d.get("content") or d.get("reasoning") or d.get("reasoning_content")):
                    first_any = time.perf_counter() - t0
                if d.get("content"):
                    first_text = first_text or time.perf_counter() - t0
                    text.append(d["content"])
                finish = ch.get("finish_reason") or finish
            usage = j.get("usage") or usage
    return {"total_s": time.perf_counter() - t0, "first_token_s": first_any, "first_text_s": first_text, "text": "".join(text),
            "prompt_tokens": (usage or {}).get("prompt_tokens"), "completion_tokens": (usage or {}).get("completion_tokens"),
            "reasoning_tokens": ((usage or {}).get("completion_tokens_details") or {}).get("reasoning_tokens"),
            "cached_tokens": ((usage or {}).get("prompt_tokens_details") or {}).get("cached_tokens"), "finish": finish}


def prices(models):
    with urllib.request.urlopen("https://openrouter.ai/api/v1/models", timeout=30) as r:
        listed = {m["id"]: m for m in json.loads(r.read())["data"]}
    return {m: {"in": float(listed[m]["pricing"]["prompt"]) * 1e6, "out": float(listed[m]["pricing"]["completion"]) * 1e6,
                "cache": float(listed[m]["pricing"].get("input_cache_read") or listed[m]["pricing"]["prompt"]) * 1e6} for m in models}


def rewrite_step(alias, out, case, persona, key, price):
    """What the app does after a practice reply: one rewrite call for answers the gate dropped. {} when none."""
    from uuid import UUID
    voc = {norm(v) for v in persona["orgs"] + persona["titles"]}
    fc = {UUID(f["id"]): claims(f["text"] + " . " + f["context"], voc, True) for f in persona["facts"]}
    rejected = []
    if not hasattr(practice, "rewrite_prompt"):
        return {}
    practice.parse_reply(out["text"] or "", case["sections"], fc, voc, claims(persona["cv"], voc), {}, practice.aliases(persona["facts"]), rejected)
    if not rejected:
        return {}
    prompt, system = practice.rewrite_prompt(rejected, persona["facts"])
    try:
        return call(alias, system, prompt, key, 8000, MODES[CURRENT_MODE])
    except (urllib.error.URLError, OSError, ValueError):
        return {}


def worker(model, alias, jobs, data, key, price, max_tokens, sink, lock, log, mode):
    for task, case in jobs:
        prompt, system = build_prompt(task, case, data)
        persona = next(p for p in data["personas"] if p["id"] == case["persona"])
        job = next((j for j in data["jobs"] if j["id"] == case.get("job")), None)
        result = {"model": model, "task": task, "case": case["id"]}
        global CURRENT_MODE
        CURRENT_MODE = mode
        for attempt in (1, 2):
            try:
                out = call(alias, system, prompt, key, max_tokens, MODES[mode])
                break
            except (urllib.error.URLError, OSError, ValueError) as exc:
                out = {"error": type(exc).__name__ + ": " + str(exc)[:120], "total_s": None}
                time.sleep(3)
        result.update({k: v for k, v in out.items() if k != "text"})
        if SAVE_TEXT:
            result["text"] = out.get("text")
        if "error" not in out:
            if task == "practice":
                rw = rewrite_step(alias, out, case, persona, key, price)
                out["total_s"] += rw.get("total_s", 0)
                out["completion_tokens"] = (out.get("completion_tokens") or 0) + (rw.get("completion_tokens") or 0)
                out["prompt_tokens"] = (out.get("prompt_tokens") or 0) + (rw.get("prompt_tokens") or 0)
                result["total_s"] = out["total_s"]
                result["completion_tokens"] = out["completion_tokens"]
                result["prompt_tokens"] = out["prompt_tokens"]
                if SAVE_TEXT:
                    result["rewrite_text"] = rw.get("text")
                score, details = SCORERS[task](out["text"], case, persona, job, rw.get("text"))
            else:
                score, details = SCORERS[task](out["text"], case, persona, job)
            result.update({"quality": round(score, 1), "details": details,
                           "cost_usd": (((out["prompt_tokens"] or 0) - (out.get("cached_tokens") or 0)) * price["in"] + (out.get("cached_tokens") or 0) * price["cache"]
                                        + (out["completion_tokens"] or 0) * price["out"]) / 1e6})
            if out["finish"] == "length":
                result["truncated"] = True
        else:
            result["quality"] = 0.0
        with lock:
            sink.append(result)
            log(f"{model:24s} {task:9s} {case['id']:5s} q={result['quality']:5.1f} t={result.get('total_s') or 0:5.1f}s")


def run(args):
    data = json.loads((HOLDOUT if args.dataset == "holdout" else DATA).read_text())
    models, tasks = args.models, args.tasks
    key = KEYFILE.read_text().strip()
    price = prices(models)
    jobs = [(t, c) for t in tasks for c in data["cases"][t][: args.samples]]
    aliases, ids = {}, {}
    for m in models:
        alias = "gold-" + re.sub(r"[^a-z0-9]+", "-", m.lower())
        api("POST", "/model/new", {"model_name": alias, "litellm_params": {"model": "openrouter/" + m, "api_key": "os.environ/OPENROUTER_API_KEY"}}, key)
        aliases[m] = alias
    info = api("GET", "/model/info", key=key)["data"]
    ids = {a: next(x["model_info"]["id"] for x in info if x["model_name"] == a) for a in aliases.values()}
    sink, lock = [], threading.Lock()
    logfile = open(Path(args.out_dir) / f"{args.tag}.log", "w", buffering=1)

    def log(line):
        print(line, flush=True)
        logfile.write(line + "\n")

    try:
        for m in models:  # warm-up, not counted
            try:
                call(aliases[m], "Reply OK", "OK", key, 200)
            except Exception:
                pass
        threads = [threading.Thread(target=worker, args=(m, aliases[m], jobs, data, key, price[m], args.max_tokens, sink, lock, log, args.reasoning)) for m in models]
        [t.start() for t in threads]
        [t.join() for t in threads]
    finally:
        for a, i in ids.items():
            try:
                api("POST", "/model/delete", {"id": i}, key)
            except Exception as exc:
                print("cleanup failed for", a, type(exc).__name__)
    out = Path(args.out_dir) / f"{args.tag}.json"
    out.write_text(json.dumps({"tag": args.tag, "models": models, "prices_per_mtok": price, "max_tokens": args.max_tokens, "reasoning": args.reasoning,
                               "dataset": "gold.holdout.v1" if args.dataset == "holdout" else "gold.v1", "results": sink}, ensure_ascii=False, indent=1))
    print("wrote", out)
    report(out)


def pct(values, p):
    s = sorted(values)
    return s[min(len(s) - 1, int(p * len(s)))] if s else float("nan")


def report(path):
    d = json.loads(Path(path).read_text())
    rows = d["results"]
    models = d["models"]
    lines = [f"# Gold benchmark {d['tag']} (dataset {d['dataset']}, max_tokens {d['max_tokens']})", "",
             "Quality 0-100 (deterministic scorers), time = total seconds per call (p50 / p90), cost = list-price USD per call.", ""]
    for task in sorted({r["task"] for r in rows}, key=TASKS.index):
        lines += [f"## {task}", "", "| model | quality | time p50 | time p90 | cost/call | think tok | cache hit | errors | truncated |", "|---|---|---|---|---|---|---|---|---|"]
        for m in models:
            rs = [r for r in rows if r["task"] == task and r["model"] == m]
            if not rs:
                continue
            q = statistics.mean(r["quality"] for r in rs)
            ts = [r["total_s"] for r in rs if r.get("total_s")]
            cost = statistics.mean(r.get("cost_usd", 0) for r in rs)
            lines.append(f"| {m} | {q:.1f} | {pct(ts, .5):.1f}s | {pct(ts, .9):.1f}s | ${cost:.5f} | "
                         f"{statistics.mean((r.get('reasoning_tokens') or 0) for r in rs):.0f} | "
                         f"{sum((r.get('cached_tokens') or 0) for r in rs) / max(sum((r.get('prompt_tokens') or 0) for r in rs), 1):.0%} | "
                         f"{sum('error' in r for r in rs)} | {sum(bool(r.get('truncated')) for r in rs)} |")
        lines.append("")
    lines += ["## Overall (mean over tasks)", "", "| model | quality | time p50 | cost/call |", "|---|---|---|---|"]
    for m in models:
        per = [[r for r in rows if r["model"] == m and r["task"] == t] for t in {r["task"] for r in rows}]
        per = [p for p in per if p]
        lines.append(f"| {m} | {statistics.mean(statistics.mean(r['quality'] for r in p) for p in per):.1f} | "
                     f"{statistics.mean(pct([r['total_s'] for r in p if r.get('total_s')], .5) for p in per):.1f}s | "
                     f"${statistics.mean(statistics.mean(r.get('cost_usd', 0) for r in p) for p in per):.5f} |")
    text = "\n".join(lines) + "\n"
    Path(path).with_suffix(".md").write_text(text)
    print(text)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--models", nargs="+", required=True)
    r.add_argument("--tasks", nargs="+", default=TASKS, choices=TASKS)
    r.add_argument("--samples", type=int, default=10)
    r.add_argument("--max-tokens", type=int, default=16000)
    r.add_argument("--save-text", action="store_true")
    r.add_argument("--dataset", choices=["dev", "holdout"], default="dev")
    r.add_argument("--reasoning", choices=list(MODES), default="low")
    r.add_argument("--tag", default=time.strftime("%Y-%m-%d"))
    r.add_argument("--out-dir", default=str(Path(__file__).parent / "results"))
    rs = sub.add_parser("rescore", help="recompute quality of a results file (saved with --save-text) with the current scorers")
    rs.add_argument("file")
    rs.add_argument("--dataset", choices=["dev", "holdout"], default="dev")
    rp = sub.add_parser("report")
    rp.add_argument("file")
    args = ap.parse_args()
    global SAVE_TEXT
    SAVE_TEXT = getattr(args, "save_text", False)
    if args.cmd == "rescore":
        data = json.loads((HOLDOUT if args.dataset == "holdout" else DATA).read_text())
        d = json.loads(Path(args.file).read_text())
        for r in d["results"]:
            if "text" not in r:
                continue
            case = next(c for c in data["cases"][r["task"]] if c["id"] == r["case"])
            persona = next(p for p in data["personas"] if p["id"] == case["persona"])
            job = next((j for j in data["jobs"] if j["id"] == case.get("job")), None)
            extra = (r.get("rewrite_text"),) if r["task"] == "practice" else ()
            score, details = SCORERS[r["task"]](r["text"], case, persona, job, *extra)
            r["quality"], r["details"] = round(score, 1), details
        out = Path(args.file).with_name(Path(args.file).stem + ".rescored.json")
        out.write_text(json.dumps(d, ensure_ascii=False, indent=1))
        report(out)
    elif args.cmd == "run":
        Path(args.out_dir).mkdir(parents=True, exist_ok=True)
        run(args)
    else:
        report(args.file)


if __name__ == "__main__":
    main()
