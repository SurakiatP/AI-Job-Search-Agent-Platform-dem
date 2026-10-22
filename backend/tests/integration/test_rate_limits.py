from datetime import datetime, timedelta, timezone
import pytest
from job_search_platform.services import rate_limits
from job_search_platform.services.errors import ServiceError


def test_window_blocks_then_releases(db_session):
    now = datetime(2026, 10, 13, 12, tzinfo=timezone.utc)
    for _ in range(5):
        rate_limits.hit(db_session, "signup_ip", "10.0.0.1", now=now)
    with pytest.raises(ServiceError) as err:
        rate_limits.hit(db_session, "signup_ip", "10.0.0.1", now=now + timedelta(seconds=10))
    assert err.value.code == "rate_limited" and int(err.value.fields["retry_after"]) > 0
    rate_limits.hit(db_session, "signup_ip", "10.0.0.2", now=now)  # other key unaffected
    rate_limits.hit(db_session, "signup_ip", "10.0.0.1", now=now + timedelta(seconds=3601))


def test_prune_removes_old_rows(db_session):
    old = datetime(2026, 10, 1, tzinfo=timezone.utc)
    rate_limits.hit(db_session, "login_ip", "k", now=old)
    assert rate_limits.prune(db_session, now=old + timedelta(days=2)) == 1
