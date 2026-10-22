from datetime import datetime, timezone

from job_search_platform.services.approvals import budget_day_start


def _utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


def test_bangkok_midnight_boundary():
    # 00:00 Bangkok (UTC+7) is 17:00 UTC the previous day.
    start = _utc(2026, 10, 9, 17)
    assert budget_day_start(_utc(2026, 10, 9, 16, 59, 59)) == _utc(2026, 10, 8, 17)  # 23:59:59 local, old day
    assert budget_day_start(start) == start                                          # exactly 00:00 local
    assert budget_day_start(_utc(2026, 10, 9, 17, 0, 1)) == start                    # just after
    assert budget_day_start(_utc(2026, 10, 10, 16, 59)) == start                     # end of same day
