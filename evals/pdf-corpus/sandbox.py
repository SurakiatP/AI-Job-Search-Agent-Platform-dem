"""Run parse_document.py from the working tree inside the sandbox image on every corpus PDF (no backend, no OCR call).
Usage: python sandbox.py <image> [corpus=out] [names...]"""
import json, subprocess, sys, tempfile, shutil, os
from pathlib import Path
image = sys.argv[1]; corpus = Path(sys.argv[2] if len(sys.argv) > 2 else "out").resolve(); only = sys.argv[3:]
script = Path(__file__).resolve().parents[2] / "infra/hermes/parse_document.py"
for f in sorted(corpus.glob("*.pdf")):
    if only and f.name not in only: continue
    with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as w:
        (Path(w) / "inputs").mkdir(); shutil.copy(f, Path(w) / "inputs/x.pdf"); os.chmod(w, 0o777); os.chmod(Path(w) / "inputs", 0o777)
        p = subprocess.run(["docker", "run", "--rm", "--network", "none", "-v", f"{w}:/workspace", "-v", f"{script}:/opt/runtime/parse_document.py:ro",
                            "--entrypoint", "python", image, "/opt/runtime/parse_document.py", "/workspace/inputs/x.pdf"], capture_output=True, text=True)
    try: r = json.loads(p.stdout)
    except Exception: r = {"error": "NO_JSON " + p.stderr[-80:]}
    print(f"{f.name:30} {r.get('error') or '%d pages: %s' % (len(r['pages']), ', '.join(r['pages']))}")
