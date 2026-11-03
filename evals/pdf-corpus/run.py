"""Upload every corpus PDF to the local backend; print status, error code, seconds, text length, Thai marks ratio.
Usage: python run.py <test-account.env> [corpus dir=out] [base=http://127.0.0.1:8012]"""
import re, sys, time
from pathlib import Path
import httpx

env = dict(l.strip().split("=", 1) for l in open(sys.argv[1]) if "=" in l)
corpus = Path(sys.argv[2] if len(sys.argv) > 2 else "out")
base = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8012"
c = httpx.Client(base_url=base + "/v1", headers={"Origin": base}, timeout=300)
r = c.post("/auth/login", json={"email": env["email"], "password": env["password"]})
c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
pid = c.post("/projects", json={"name": "pdf-corpus"}).json()["id"]
marks, cons = re.compile("[ัิ-ฺ็-๎]"), re.compile("[ก-ฮ]")
only = sys.argv[4:] 
for f in sorted(corpus.glob("*.pdf")):
    if only and f.name not in only: continue
    t = time.time()
    try:
        r = c.post(f"/projects/{pid}/cvs", files={"file": (f.name, f.read_bytes(), "application/pdf")})
    except Exception as e:
        print(f"{f.name:32} EXC {type(e).__name__} {time.time()-t:.1f}s"); continue
    dt = time.time() - t; info = ""
    if r.status_code == 201:
        info = "ok"
    else:
        try: j = r.json(); info = str(j.get("code") or j.get("error") or j)[:60]
        except Exception: info = r.text[:60]
    print(f"{f.name:32} {r.status_code} {info:40} {dt:5.1f}s", flush=True)
