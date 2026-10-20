import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from smart_match_eval import judge  # noqa: E402

PAIRS = json.loads((Path(judge.__file__).parent / "data" / "pairs.json").read_text())
CVS = {c["id"]: c["text"] for c in json.loads((Path(judge.__file__).parent / "data" / "cvs.json").read_text())}
SENTINEL = "sk-sentinel-KEY-123"


class _FakeJev:
    def decide(self, state, questions):
        answers = {"role_fit": {"score": 2, "confidence": 0.9}, "hard_blocker": {"noul": 0.0},
                   "seniority_fit": {"probabilities": {"0": 0, "1": 0, "2": 1.0, "3": 0}}}
        return answers | {q: {"noul": 0.0} for q in questions if q.startswith(("skill_", "must_"))}


def reply(text):
    return {"choices": [{"message": {"content": text}}]}


class Post:
    def __init__(self, *texts):
        self.texts, self.calls, self.payloads = list(texts), 0, []

    def __call__(self, payload):
        self.calls += 1
        self.payloads.append(payload)
        return reply(self.texts.pop(0) if len(self.texts) > 1 else self.texts[0])


def test_parse_success_and_prompt_hides_construction(tmp_path):
    post = Post('{"label": "good", "reason": "fits"}')
    out = judge.judge_pairs(PAIRS[:1], CVS, post, tmp_path)
    assert out[0]["judge"] == "good" and out[0]["judge_reason"] == "fits"
    sent = json.dumps(post.payloads[0])
    assert PAIRS[0]["reason"] not in sent and post.payloads[0]["temperature"] == 0
    assert post.payloads[0]["model"] == judge.MODEL


def test_malformed_then_retry(tmp_path):
    post = Post("not json", '{"label": "maybe", "reason": "x"}')
    assert judge.judge_pairs(PAIRS[:1], CVS, post, tmp_path)[0]["judge"] == "maybe"
    assert post.calls == 2


@pytest.mark.parametrize("bad", ['{"label": "great", "reason": "x"}', "[]", '{"label": "good"}', ""])
def test_two_failures_give_null(tmp_path, bad):
    post = Post(bad)
    assert judge.judge_pairs(PAIRS[:1], CVS, post, tmp_path)[0]["judge"] is None
    assert post.calls == 2


def test_cache_prevents_second_post(tmp_path):
    post = Post('{"label": "no", "reason": "x"}')
    judge.judge_pairs(PAIRS[:2], CVS, post, tmp_path)
    again = judge.judge_pairs(PAIRS[:2], CVS, post, tmp_path)
    assert post.calls == 2 and again[1]["judge"] == "no"


def row(i, label, judged):
    return {"cv_id": "c", "slug": f"s{i}", "label": label, "judge": judged}


def test_kappa_values():
    judged = [row(0, "good", "good"), row(1, "good", "good"), row(2, "no", "no"), row(3, "no", "good"),
              row(4, "maybe", None)]
    # excludes the null: po=3/4, pe=(2*3+2*1)/16=0.5 -> 0.5
    owner = {"s0+c": "good", "s3+c": "good"}
    rep = judge.kappa_report(judged, owner)
    assert rep["vs_construction"] == pytest.approx(0.5)
    assert rep["vs_owner"] == pytest.approx(1.0) and rep["owner_n"] == 2
    assert judge.kappa_report(judged, {})["vs_owner"] is None


def test_disagreements_cap_and_content():
    judged = [row(i, "good", "good") for i in range(40)] + [row(99, "good", "good")]
    scored = [{"cv_id": "c", "slug": f"s{i}", "fit_percent": 10} for i in range(40)] + \
             [{"cv_id": "c", "slug": "s99", "fit_percent": 100}]
    out = judge.disagreements(judged, scored)
    assert len(out) == 25 and all(d["slug"] != "s99" for d in out)
    assert out[0] == {"cv_id": "c", "slug": "s0", "judge": "good", "construction": "good", "band": 1, "band_label": "no"}


def test_owner_sheet_fifteen_deterministic_blind():
    sheet = judge.owner_sheet(PAIRS)
    assert sheet == judge.owner_sheet(PAIRS)
    assert sheet.count("Your label: ___") == 15
    assert all(p["reason"] not in sheet for p in PAIRS)
    for word in ("good", "ambiguous", "clear", "construction"):
        assert f"label: {word}" not in sheet.lower() and f"kind: {word}" not in sheet.lower()
    shown = [p for p in PAIRS if p["job"]["slug"] in sheet and CVS[p["cv_id"]][:60] in sheet]
    chosen = judge.pick_for_owner(PAIRS)
    assert len(chosen) == 15 and len(shown) >= 15
    for lab in ("good", "maybe", "no"):
        assert sum(p["label"] == lab for p in chosen) == 5
    assert sum(p["kind"] == "ambiguous" for p in chosen) >= 3


def test_default_post_refuses_redirects_and_proxies(monkeypatch):
    assert any(type(h).__name__ == "_NoRedirect" for h in judge._OPENER.handlers)
    monkeypatch.setenv("http_proxy", "http://proxy.invalid:1")
    monkeypatch.setenv("https_proxy", "http://proxy.invalid:1")
    import importlib
    reloaded = importlib.reload(judge)  # opener is built at import; env proxies must not be picked up
    assert not any(type(h).__name__ == "ProxyHandler" and h.proxies for h in reloaded._OPENER.handlers)


def test_main_requires_live_flag(monkeypatch):
    monkeypatch.delenv("SMART_MATCH_EVAL_LIVE", raising=False)
    monkeypatch.setattr(sys, "argv", ["judge"])
    with pytest.raises(SystemExit) as e:
        judge.main()
    assert "SMART_MATCH_EVAL_LIVE" in str(e.value)


def test_sheet_subcommand_offline_and_key_not_leaked(monkeypatch, capsys):
    monkeypatch.setenv("OPENROUTER_API_KEY", SENTINEL)
    monkeypatch.delenv("SMART_MATCH_EVAL_LIVE", raising=False)
    monkeypatch.setattr(sys, "argv", ["judge", "sheet"])
    judge.main()
    captured = capsys.readouterr()
    assert "Your label: ___" in captured.out and SENTINEL not in captured.out + captured.err


def test_live_main_never_leaks_key(monkeypatch, capsys, tmp_path):
    seen = {}

    def fake_make_post(key):
        seen["key"] = key
        return Post('{"label": "good", "reason": "ok"}')

    monkeypatch.setenv("SMART_MATCH_EVAL_LIVE", "1")
    monkeypatch.setenv("OPENROUTER_API_KEY", SENTINEL)
    monkeypatch.setattr(judge, "make_post", fake_make_post)
    monkeypatch.setattr(judge, "make_jev", lambda key: _FakeJev())
    monkeypatch.setattr(judge, "PAIRS_LIMIT", 3)
    monkeypatch.setattr(judge, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(sys, "argv", ["judge"])
    judge.main()
    out = capsys.readouterr()
    assert seen["key"] == SENTINEL and "kappa" in out.out
    assert SENTINEL not in out.out + out.err
    assert all(SENTINEL not in p.read_text() for p in tmp_path.iterdir())
