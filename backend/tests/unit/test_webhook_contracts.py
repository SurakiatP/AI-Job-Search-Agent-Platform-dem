"""FR-P06 contracts. Synthetic data only."""
import pytest
from pydantic import ValidationError

from job_search_platform.services.contracts import SavedSearchUpdate, WebhookCreate, WebhookUpdate


def test_webhook_create_rules():
    body = WebhookCreate(url="https://hooks.example.test/jsp", events=["run.completed", "run.completed", "digest.ready"])
    assert body.events == ["digest.ready", "run.completed"]
    for bad in ({"url": "https://x.test", "events": []}, {"url": "https://x.test", "events": ["run.started"]},
                {"url": "", "events": ["run.completed"]}, {"url": "https://x.test/" + "a" * 2050, "events": ["run.completed"]}):
        with pytest.raises(ValidationError):
            WebhookCreate(**bad)
    with pytest.raises(ValidationError):
        WebhookCreate(url="https://x.test", events=["ping"])


def test_webhook_update_and_saved_search_push():
    with pytest.raises(ValidationError):
        WebhookUpdate()
    assert WebhookUpdate(enabled=False).enabled is False
    assert SavedSearchUpdate(push_enabled=True).push_enabled is True
