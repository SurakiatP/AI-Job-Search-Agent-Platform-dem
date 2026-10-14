"""WP5 job store schema. Synthetic data only."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from job_search_platform.db.models import IngestRun, JobPosting


def _posting(**extra):
    now = datetime.now(timezone.utc)
    values = dict(id=uuid.uuid4(), source="greenhouse", board="acme", external_id="1", slug="gh-acme-1",
                  title="Synthetic Engineer", source_url="https://example.test/1", first_seen_at=now,
                  last_seen_at=now, content_hash="h", updated_at=now)
    values.update(extra)
    return JobPosting(**values)


@pytest.mark.integration
def test_posting_round_trip_and_defaults(db_session):
    db_session.add(_posting())
    db_session.flush()
    row = db_session.query(JobPosting).one()
    assert row.cities == [] and row.skills == [] and row.missed_runs == 0
    assert row.closed_at is None and row.canonical_id is None and row.index_dirty is True


@pytest.mark.integration
def test_source_external_id_unique(db_session):
    db_session.add(_posting())
    db_session.flush()
    db_session.add(_posting(slug="other"))
    with pytest.raises(IntegrityError):
        db_session.flush()


@pytest.mark.integration
def test_source_is_checked(db_session):
    db_session.add(_posting(source="jobsdb"))
    with pytest.raises(IntegrityError):
        db_session.flush()


@pytest.mark.integration
def test_ingest_run_row(db_session):
    db_session.add(IngestRun(id=uuid.uuid4(), started_at=datetime.now(timezone.utc), status="running"))
    db_session.flush()
    assert db_session.query(IngestRun).one().per_board == {}
