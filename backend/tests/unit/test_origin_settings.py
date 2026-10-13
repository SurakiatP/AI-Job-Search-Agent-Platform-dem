import pytest

from job_search_platform.main import _owner_sessions


def test_default_allows_both_loopback_spellings(monkeypatch):
    monkeypatch.delenv("APP_PUBLIC_ORIGIN", raising=False)
    monkeypatch.delenv("JSP_DEV_ORIGIN", raising=False)
    assert _owner_sessions(None).origins == {"http://127.0.0.1:8000", "http://localhost:8000"}


def test_dev_origin_must_be_loopback_http(monkeypatch):
    monkeypatch.delenv("APP_PUBLIC_ORIGIN", raising=False)
    monkeypatch.setenv("JSP_DEV_ORIGIN", "http://localhost:5173/")
    assert "http://localhost:5173" in _owner_sessions(None).origins
    for bad in ("https://evil.example", "http://evil.example:5173", "http://localhost:5173/x"):
        monkeypatch.setenv("JSP_DEV_ORIGIN", bad)
        with pytest.raises(RuntimeError, match="development_origin_must_be_loopback"):
            _owner_sessions(None)
