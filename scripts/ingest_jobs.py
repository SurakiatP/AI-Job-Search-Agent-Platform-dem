"""WP5 hourly job ingest (run-once worker, TOR appendix ก.3): run | discover | status."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from job_search_platform import config  # noqa: E402
from job_search_platform.db.models import IngestRun  # noqa: E402
from job_search_platform.db.session import make_engine  # noqa: E402
from job_search_platform.integrations import crawler, job_boards, meili  # noqa: E402
from job_search_platform.integrations.logging import configure_logging  # noqa: E402
from job_search_platform.main import _private_text  # noqa: E402
from job_search_platform.services import job_crawl, job_index, job_store  # noqa: E402
from job_search_platform.services.errors import ServiceError  # noqa: E402


def _sessions() -> sessionmaker:
    url = URL.create("postgresql+psycopg", username=_private_text("postgres-user"),
                     password=_private_text("postgres-password"), host=config.postgres_host(),
                     port=config.postgres_port(), database=config.database_name())
    return sessionmaker(make_engine(url), expire_on_commit=False)


def run(args) -> int:
    sources = tuple(s for s in job_boards.SOURCES if not args.source or s == args.source)
    sites = [s for s in job_store.load_crawl_sites() if not args.source or s == args.source]
    try:
        index = (meili.client(), config.meili_index())
    except RuntimeError:
        logging.getLogger(__name__).warning("index_unconfigured")
        index = None
    result = job_store.run_ingest(_sessions(), boards=job_store.load_boards(), sources=sources, index=index,
                                  crawl_sites=sites, crawl=job_crawl.crawl_site)
    print(json.dumps({"status": result.status, "fetched": result.fetched, "created": result.created,
                      "updated": result.updated, "deleted": result.deleted, "merged": result.merged,
                      "index": (result.per_board or {}).get("index", {}).get("state")}))
    return 1 if result.status == "failed" else 0


def discover(args) -> int:
    rows = job_boards.fetch_board("freehire", None)
    merged = job_store.discover_boards(rows, job_store.load_boards())
    job_store.write_boards(merged)
    print(json.dumps({source: len(tokens) for source, tokens in merged.items()}))
    return 0


def _index_client():
    try:
        return meili.client(), config.meili_index()
    except RuntimeError:
        raise meili.MeiliError("index_unconfigured")


def reindex(args) -> int:
    client, index = _index_client()
    print(json.dumps({"documents": job_index.rebuild(_sessions(), client, index)}))
    return 0


def index_settings(args) -> int:
    client, index = _index_client()
    client.wait(client.update_settings(index, job_index.SETTINGS))
    print(json.dumps({"settings": "applied"}))
    return 0


def status(args) -> int:
    with _sessions()() as db:
        for row in db.scalars(select(IngestRun).order_by(IngestRun.started_at.desc()).limit(5)):
            print(json.dumps({"started_at": row.started_at.isoformat(), "status": row.status, "fetched": row.fetched,
                              "created": row.created, "deleted": row.deleted, "merged": row.merged}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    one = sub.add_parser("run")
    one.add_argument("--source", choices=job_boards.SOURCES + crawler.SITES)
    one.set_defaults(func=run)
    sub.add_parser("discover").set_defaults(func=discover)
    sub.add_parser("reindex").set_defaults(func=reindex)
    sub.add_parser("index-settings").set_defaults(func=index_settings)
    sub.add_parser("status").set_defaults(func=status)
    args = parser.parse_args()
    configure_logging()
    try:
        return args.func(args)
    except ServiceError as exc:
        print(f"error: {exc.code}", file=sys.stderr)
        return 2
    except (meili.MeiliError, SQLAlchemyError) as exc:
        print(f"error: {exc if isinstance(exc, meili.MeiliError) else 'database_error'}", file=sys.stderr)
        return 2
    except job_boards.BoardError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
