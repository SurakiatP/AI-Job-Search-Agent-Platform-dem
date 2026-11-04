"""USD to THB reference rate: provider order, one-hour cache, stale fallback. No network."""
import pytest

from job_search_platform.services import fx
from job_search_platform.services.errors import ServiceError


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    fx._cache.clear()
    clock = [1000.0]
    monkeypatch.setattr(fx.time, "time", lambda: clock[0])
    return clock


def provider(rate, name="Frankfurter (European Central Bank reference rates)"):
    return lambda: {"rate": rate, "as_of": "2026-11-03", "source": name, "source_url": "https://example.test"}


def boom():
    raise OSError("down")


def test_primary_then_cache_then_stale_then_fallback(monkeypatch, clean):
    monkeypatch.setattr(fx, "_frankfurter", provider(35.1))
    monkeypatch.setattr(fx, "_er_api", provider(99.0, "ExchangeRate-API open access"))
    first = fx.usd_thb()
    assert first["rate"] == 35.1 and first["stale"] is False and first["source"].startswith("Frankfurter") and first["as_of"] == "2026-11-03"
    monkeypatch.setattr(fx, "_frankfurter", boom)
    clean[0] += 100
    assert fx.usd_thb()["rate"] == 35.1  # cached, no refetch
    clean[0] += fx.TTL
    fallback = fx.usd_thb()  # primary down: the fallback answers and names itself
    assert fallback["rate"] == 99.0 and fallback["source"] == "ExchangeRate-API open access" and fallback["stale"] is False
    monkeypatch.setattr(fx, "_er_api", boom)
    clean[0] += fx.TTL
    old = fx.usd_thb()
    assert old["rate"] == 99.0 and old["stale"] is True


def test_nothing_ever_fetched_is_unavailable(monkeypatch):
    monkeypatch.setattr(fx, "_frankfurter", boom)
    monkeypatch.setattr(fx, "_er_api", boom)
    with pytest.raises(ServiceError) as error:
        fx.usd_thb()
    assert error.value.code == "fx_unavailable"
