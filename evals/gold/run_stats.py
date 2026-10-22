"""Where does a real run's time go? Splits each completed run into LLM time (LiteLLM spend logs) and everything else
(Hermes start-up, sandbox, parsing). Reads the app database with the app's own credentials; prints no secrets.
  (set -a; . <your .env>; set +a; backend/.venv/bin/python evals/gold/run_stats.py [days])"""
import statistics as st
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import run_bench as rb
from sqlalchemy import text
from sqlalchemy.engine import URL

from job_search_platform import config, main
from job_search_platform.db.session import make_engine

days = int(sys.argv[1]) if len(sys.argv) > 1 else 6
key = rb.KEYFILE.read_text().strip()
start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
end = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
calls = []
for r in rb.api("GET", f"/spend/logs?summarize=false&start_date={start}&end_date={end}", key=key, timeout=120):
    if not r.get("prompt_tokens"):
        continue
    try:
        s = datetime.fromisoformat(r["startTime"].replace("Z", "+00:00"))
        e = datetime.fromisoformat(r["endTime"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        continue
    calls.append((s, e, r.get("prompt_tokens") or 0, r.get("completion_tokens") or 0))
engine = make_engine(URL.create("postgresql+psycopg", username=main._private_text("postgres-user"), password=main._private_text("postgres-password"),
                                host=config.postgres_host(), port=config.postgres_port(), database=config.database_name()))
with engine.connect() as c:
    runs = c.execute(text("select operation, execution_created_at, finished_at from runs where finished_at is not null and "
                          "execution_created_at is not null and status='completed' and created_at > now() - make_interval(days => :d)"),
                     {"d": days}).all()
by = {}
for op, began, finished in runs:
    inside = [x for x in calls if x[0] >= began and x[1] <= finished]
    llm = sum((e - s).total_seconds() for s, e, *_ in inside)
    by.setdefault(op, []).append(((finished - began).total_seconds(), llm, len(inside), sum(x[2] for x in inside), sum(x[3] for x in inside)))
for op, v in sorted(by.items()):
    print(f"{op:19s} n={len(v)} run p50 {st.median(x[0] for x in v):6.1f}s  llm {st.median(x[1] for x in v):6.1f}s  other {st.median(x[0] - x[1] for x in v):5.1f}s  "
          f"calls {st.median(x[2] for x in v):.0f}  in-tok {st.median(x[3] for x in v):.0f}  out-tok {st.median(x[4] for x in v):.0f}")
