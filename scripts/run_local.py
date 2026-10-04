"""Start the same-origin, loopback-only local application."""
from __future__ import annotations

import argparse
import asyncio
import ipaddress
from contextlib import nullcontext
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from job_search_platform.main import _migrate, acquire_service_maintenance, build_services, create_app  # noqa: E402


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "::1"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--open-browser", action="store_true", help="open authenticated owner app when ready")
    parser.add_argument("--build-frontend", action="store_true", help="build the frontend before starting")
    parser.add_argument("--frontend-dist", type=Path, default=ROOT / "frontend" / "dist")
    parser.add_argument("--enable-sharing", action="store_true", help="enable project-token MCP/A2A listener")
    parser.add_argument("--share-host", default="127.0.0.1", help="concrete loopback or LAN IP address")
    parser.add_argument("--share-port", type=int, default=8001)
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
    guard = acquire_service_maintenance(services)
    try:
        await asyncio.to_thread(_migrate, services.engine)
        launch = await services.owner_sessions.create_launch_nonce(scheme_host)
        app = create_app(services, frontend_dist=dist)

        # The nonce lives only in the URL fragment. Browsers do not send fragments in
        # HTTP requests, so it cannot enter application request logs.
        link = f"{scheme_host}/#owner-nonce={quote(launch.nonce, safe='')}"
        print(f"Local application: {scheme_host}", flush=True)
        if not getattr(args, "open_browser", False):
            print(f"One-use owner launch link (valid for 5 minutes): {link}", flush=True)

        import uvicorn

        server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=args.port,
                                               access_log=False, log_config=None))
        async def open_when_ready():
            for _ in range(200):
                if server.started:
                    import webbrowser
                    await asyncio.to_thread(webbrowser.open, link)
                    return
                await asyncio.sleep(0.05)
            raise RuntimeError("owner_listener_start_timeout")

        browser_task = asyncio.create_task(open_when_ready()) if getattr(args, "open_browser", False) else None
        shared_task = None
        shared_server = None
        try:
            if getattr(args, "enable_sharing", False):
                from job_search_platform.api.shared import create_shared_app
                class SharedServer(uvicorn.Server):
                    def capture_signals(self):
                        return nullcontext()
                shared_server = SharedServer(uvicorn.Config(
                    create_shared_app(services, host=args.share_host, port=args.share_port),
                    host=args.share_host, port=args.share_port, access_log=False, log_config=None,
                ))
                shared_task = asyncio.create_task(shared_server.serve())
                for _ in range(100):
                    if shared_task.done():
                        await shared_task
                        raise RuntimeError("shared_listener_start_failed")
                    if shared_server.started:
                        break
                    await asyncio.sleep(0.05)
                else:
                    raise RuntimeError("shared_listener_start_timeout")
                print(f"Project-token sharing enabled at port {args.share_port}", flush=True)
            await server.serve()
            if not server.started:
                raise RuntimeError("owner_listener_start_failed")
        finally:
            if browser_task is not None:
                if not browser_task.done():
                    browser_task.cancel()
                try:
                    await browser_task
                except asyncio.CancelledError:
                    pass
            if shared_server is not None:
                shared_server.should_exit = True
            if shared_task is not None:
                await shared_task
        return 0
    finally:
        if guard is not None and services.shutdown_confirmed:
            guard.close()
            services.maintenance_lock = None


def main() -> int:
    args = _parser().parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("port must be between 1 and 65535")
    if not 1 <= args.share_port <= 65535 or args.share_port == args.port:
        raise SystemExit("share port must be valid and distinct from owner port")
    try:
        ipaddress.ip_address(args.share_host)
    except ValueError:
        raise SystemExit("share host must be a concrete IP address") from None
    if args.share_host in {"0.0.0.0", "::"}:
        raise SystemExit("share host must be a concrete loopback or LAN address")
    return asyncio.run(_launch(args))


if __name__ == "__main__":
    raise SystemExit(main())
