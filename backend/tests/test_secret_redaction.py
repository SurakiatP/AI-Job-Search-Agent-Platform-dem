from uuid import uuid4

import pytest
from sqlalchemy.orm import sessionmaker

from helpers import owner, project
from job_search_platform.services.contracts import ToolConnectorUpdate
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.settings import Settings
from job_search_platform.integrations.gateway import GatewaySettings
from job_search_platform.integrations.secrets import MacOSKeychain


def settings(engine):
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as db:
        actor, p = owner(db), project(db)
    return Settings(factory), actor, p.id


async def test_only_typed_career_ops_connector_can_be_configured(migrated_engine):
    svc, actor, pid = settings(migrated_engine)
    initial = await svc.get_tools(actor, pid)
    assert initial.connectors[0].adapter == "career_ops" and initial.connectors[0].enabled
    changed = await svc.save_tool(actor, pid, "career_ops", ToolConnectorUpdate(enabled=False))
    assert not changed.enabled and changed.revision == 1
    with pytest.raises(ServiceError, match="unsupported_connector"):
        await svc.save_tool(actor, pid, "arbitrary_url_adapter", ToolConnectorUpdate(enabled=True))


def test_gateway_key_is_never_in_repr_or_snapshot():
    gateway = GatewaySettings.from_env()
    assert "sk-test-gateway" not in repr(gateway) + repr(gateway.provider_config()) + repr(gateway.jev_client())
    assert "sk-test-gateway" not in str(gateway.snapshot())


def test_native_macos_keychain_disposable_entry_roundtrip():
    store = MacOSKeychain()
    sentinel = "SYNTHETIC_DISPOSABLE_KEYCHAIN_" + uuid4().hex
    reference = store.put(sentinel)
    try:
        assert store.get(reference) == sentinel
        assert sentinel not in reference
    finally:
        store.delete(reference)
    with pytest.raises(ServiceError, match="secret_store_unavailable"):
        store.get(reference)
