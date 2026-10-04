"""Start the same-origin, loopback-only local application."""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from job_search_platform.main import _migrate, build_services, create_app  # noqa: E402


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "::1"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--build-frontend", action="store_true", help="build the frontend before starting")
    parser.add_argument("--frontend-dist", type=Path, default=ROOT / "frontend" / "dist")
    return parser


async def _launch(args: argparse.Namespace) -> int:
    dist = args.frontend_dist.expanduser().resolve()
    if args.build_frontend or not (dist / "index.html").is_file():
        result = subprocess.run(["rtk", "npm", "run", "build", "--prefix", str(ROOT / "frontend")], cwd=ROOT, check=False)
        if result.returncode:
            return result.returncode
    if not (dist / "index.html").is_file():
        raise RuntimeError("frontend_build_output_missing")

    url_host = "[::1]" if args.host == "::1" else args.host
    scheme_host = f"http://{url_host}:{args.port}"
    configured = {entry.strip() for entry in os.environ.get("JSP_ALLOWED_ORIGINS", "").split(",") if entry.strip()}
    configured.add(scheme_host)
    os.environ["JSP_ALLOWED_ORIGINS"] = ",".join(sorted(configured))
    services = build_services()
    await asyncio.to_thread(_migrate, services.engine)
    launch = await services.owner_sessions.create_launch_nonce(scheme_host)
    app = create_app(services, frontend_dist=dist)

    # The nonce lives only in the URL fragment. Browsers do not send fragments in
    # HTTP requests, so it cannot enter application request logs.
    link = f"{scheme_host}/#owner-nonce={quote(launch.nonce, safe='')}"
    print(f"Local application: {scheme_host}", flush=True)
    print(f"One-use owner launch link (valid for 5 minutes): {link}", flush=True)

    import uvicorn

    server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=args.port,
                                           access_log=False, log_config=None))
    await server.serve()
    return 0


def main() -> int:
    args = _parser().parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("port must be between 1 and 65535")
    return asyncio.run(_launch(args))


if __name__ == "__main__":
    raise SystemExit(main())
