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

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from job_search_platform.main import _migrate, acquire_service_maintenance, build_services, create_app  # noqa: E402


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "::1"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
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
    os.environ.setdefault("APP_PUBLIC_ORIGIN", scheme_host)
    services = build_services()
    guard = acquire_service_maintenance(services)
    try:
        await asyncio.to_thread(_migrate, services.engine)
        app = create_app(services, frontend_dist=dist)

        print(f"App: {scheme_host}/login", flush=True)

        import uvicorn

        server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=args.port,
                                               access_log=False, log_config=None))
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
