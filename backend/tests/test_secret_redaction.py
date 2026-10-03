from uuid import uuid4

import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from helpers import owner, project
from job_search_platform.db.models import ProviderConfiguration
from job_search_platform.services.contracts import ProviderSettingsUpdate, ToolConnectorUpdate
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.settings import Settings
from job_search_platform.integrations.secrets import MacOSKeychain


class MemorySecrets:
    """Synthetic test double; production never selects this store."""
    def __init__(self):
        self.values = {}

    def put(self, value):
        reference = "keychain:" + str(uuid4())
        self.values[reference] = value
        return reference

    def get(self, reference):
        return self.values[reference]

    def delete(self, reference):
        self.values.pop(reference, None)


def settings(engine, store, probe=None):
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as db:
        actor, p = owner(db), project(db)
    return Settings(factory, store, connection_tester=probe), actor, p.id


async def test_secret_not_in_db_public_views_or_logs_and_old_revision_survives(migrated_engine, caplog):
    store = MemorySecrets()
    svc, actor, pid = settings(migrated_engine, store)
    first_key = "SYNTHETIC_PROVIDER_SECRET_FIRST_" + uuid4().hex
    second_key = "SYNTHETIC_PROVIDER_SECRET_SECOND_" + uuid4().hex
    first = await svc.save_provider(actor, pid, ProviderSettingsUpdate(
        provider="openai", model="synthetic-model", credential=SecretStr(first_key)))
    assert first.configured and first.revision == 1
    second = await svc.save_provider(actor, pid, ProviderSettingsUpdate(
        provider="openai", model="synthetic-model", credential=SecretStr(second_key)))
    assert second.revision == 2
    with sessionmaker(migrated_engine)() as db:
        rows = list(db.scalars(select(ProviderConfiguration).order_by(ProviderConfiguration.revision)))
        assert all(first_key not in str(row.__dict__) and second_key not in str(row.__dict__) for row in rows)
        old_id = rows[0].id
    native = await svc.trusted_provider(pid, configuration_id=old_id)
    assert native.api_key == first_key
    public = await svc.get_provider(actor, pid)
    for key in (first_key, second_key):
        assert key not in public.model_dump_json() + repr(public) + repr(native) + caplog.text


async def test_provider_allowlist_and_probe_errors_do_not_echo_secret(migrated_engine, caplog):
    sentinel = "SYNTHETIC_ERROR_SECRET_" + uuid4().hex
    def failing_probe(config):
        raise RuntimeError(sentinel)
    svc, actor, pid = settings(migrated_engine, MemorySecrets(), failing_probe)
    with pytest.raises(ServiceError, match="unsupported_provider"):
        await svc.save_provider(actor, pid, ProviderSettingsUpdate(
            provider="http://127.0.0.1:59000", model="test", credential=SecretStr(sentinel)))
    await svc.save_provider(actor, pid, ProviderSettingsUpdate(
        provider="openai", model="test", credential=SecretStr(sentinel)))
    result = await svc.test_provider(actor, pid)
    assert result.status == "failed"
    assert sentinel not in result.model_dump_json() + repr(result) + caplog.text


async def test_only_typed_career_ops_connector_can_be_configured(migrated_engine):
    svc, actor, pid = settings(migrated_engine, MemorySecrets())
    initial = await svc.get_tools(actor, pid)
    assert initial.connectors[0].adapter == "career_ops" and initial.connectors[0].enabled
    changed = await svc.save_tool(actor, pid, "career_ops", ToolConnectorUpdate(enabled=False))
    assert not changed.enabled and changed.revision == 1
    with pytest.raises(ServiceError, match="unsupported_connector"):
        await svc.save_tool(actor, pid, "arbitrary_url_adapter", ToolConnectorUpdate(enabled=True))


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


async def test_unavailable_store_never_falls_back_to_database(migrated_engine, caplog):
    sentinel = "SYNTHETIC_STORE_FAILURE_" + uuid4().hex
    class Unavailable:
        def put(self, value):
            raise RuntimeError(sentinel)
    svc, actor, pid = settings(migrated_engine, Unavailable())
    with pytest.raises(ServiceError, match="secret_store_unavailable") as error:
        await svc.save_provider(actor, pid, ProviderSettingsUpdate(
            provider="openai", model="test", credential=SecretStr(sentinel)))
    with sessionmaker(migrated_engine)() as db:
        assert db.scalar(select(ProviderConfiguration)) is None
    assert sentinel not in str(error.value) + caplog.text


async def test_failed_config_commit_removes_only_new_secret(migrated_engine):
    from sqlalchemy import event
    store = MemorySecrets()
    svc, actor, pid = settings(migrated_engine, store)
    def fail_commit(session):
        raise RuntimeError("synthetic metadata commit failure")
    event.listen(svc.sessions, "before_commit", fail_commit)
    try:
        with pytest.raises(ServiceError, match="settings_save_failed"):
            await svc.save_provider(actor, pid, ProviderSettingsUpdate(
                provider="openai", model="test", credential=SecretStr("SYNTHETIC_COMMIT_KEY")))
        assert store.values == {}
    finally:
        event.remove(svc.sessions, "before_commit", fail_commit)
    with sessionmaker(migrated_engine)() as db:
        assert db.scalar(select(ProviderConfiguration)) is None
