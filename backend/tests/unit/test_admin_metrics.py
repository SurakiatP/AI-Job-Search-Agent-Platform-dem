"""Range windows, bucket sizes and Bangkok time zone math of the admin overview; supervisor probe hook."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from job_search_platform.services import admin_metrics as m
from job_search_platform.services.errors import ServiceError
from job_search_platform.workers.supervisor import WorkerSupervisor

NOW = datetime(2026, 11, 4, 18, 30, 17, tzinfo=timezone.utc)  # 01:30:17 on Thu 5 Nov in Bangkok


@pytest.mark.parametrize("range_,bucket,count", [
    ("1m", 5, 12), ("5m", 15, 20), ("10m", 30, 20), ("15m", 60, 15), ("30m", 60, 30), ("1h", 120, 30),
    ("4h", 600, 24), ("10h", 1800, 20), ("7d", 86400, 7), ("30d", 86400, 30), ("90d", 86400, 90)])
def test_bucket_size_and_count_per_range(range_, bucket, count):
    w = m.window(range_, NOW)
    assert (w.bucket, w.count) == (bucket, count)
    assert w.end > NOW >= w.end - timedelta(seconds=max(bucket, 1)) and (w.start.timestamp() + (7 * 3600 if bucket >= 86400 else 0)) % bucket == 0


def test_previous_window_has_equal_length_and_touches_current():
    w = m.window("30m", NOW)
    p = w.previous()
    assert p.end == w.start and p.end - p.start == w.end - w.start and p.count == w.count


def test_day_buckets_start_at_bangkok_midnight():
    w = m.window("7d", NOW)
    assert w.end == datetime(2026, 11, 5, 17, 0, tzinfo=timezone.utc)  # 6 Nov 00:00 Bangkok: today's bucket is the last
    assert w.start == datetime(2026, 10, 29, 17, 0, tzinfo=timezone.utc)
    assert w.bucket_start(6).astimezone(m.BKK).day == 5 and w.bucket_start(6).astimezone(m.BKK).hour == 0


def test_since_start_is_weekly_from_a_bangkok_monday_and_first_record():
    first = datetime(2026, 10, 7, 20, 0, tzinfo=timezone.utc)  # Thu 8 Oct 03:00 Bangkok
    w = m.window("all", NOW, first)
    assert w.bucket == 7 * 86400
    assert w.start == datetime(2026, 10, 5, 0, 0, tzinfo=m.BKK)  # that week's Monday
    assert w.end == datetime(2026, 11, 9, 0, 0, tzinfo=m.BKK) and w.count == 5
    assert m.window("all", NOW).count == 1  # no data yet: just this week


def test_unknown_range_is_refused():
    with pytest.raises(ServiceError) as err:
        m.window("2h", NOW)
    assert err.value.code == "invalid_range"


def test_ingest_boards_keep_error_codes_only():
    boards = m._boards({"greenhouse:acme": {"state": "failed", "error": "status_503", "fetched": 3},
                        "lever:x": {"state": "failed", "error": "bad body <script>"}, "freehire:-": {"state": "ok", "fetched": 9, "created": 2},
                        "lever:y": {"state": "skipped"}, "index": {"state": "ok"}})
    assert boards["greenhouse:acme"] == {"status": "failed", "jobs_total": 3, "jobs_new": 0, "error_code": "status_503"}
    assert boards["lever:x"]["error_code"] == "error"
    assert boards["freehire:-"]["status"] == "complete" and boards["freehire:-"]["jobs_new"] == 2
    assert boards["lever:y"]["status"] == "partial" and "index" not in boards


def test_supervisor_probes_in_its_own_loop_and_survives_a_failing_probe():
    calls = []

    async def probe():
        calls.append(1)
        raise RuntimeError("probe down")

    async def run():
        supervisor = WorkerSupervisor(None, None, None, None, probe=probe, probe_interval=0.01)
        task = asyncio.create_task(supervisor._probe_loop())
        await asyncio.sleep(0.1)
        assert not task.done()  # the failure did not end the loop
        supervisor._closing.set()
        await asyncio.wait_for(task, 1)
        await supervisor._purge_step()  # housekeeping no longer runs the probe
    asyncio.run(run())
    assert len(calls) >= 3 and WorkerSupervisor(None, None, None, None, probe=probe).probe_interval == 30
