"""SEC-B03: publishing a builder CV and uploading a CV are rate limited per user (no Docker or MinIO needed)."""
import io
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import sessionmaker

from helpers import owner, primary_cv, project
from job_search_platform.api import resume as resume_api
from job_search_platform.db.models import ResumeDraft
from job_search_platform.services import rate_limits
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.files import Files


async def test_publish_is_rate_limited_per_user(migrated_engine):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor = owner(db)
        p = project(db, owner=actor)
        cv_id = primary_cv(db, p.id).id
        db.add(ResumeDraft(project_id=p.id, cv_id=cv_id, resume_data={}, template_id="onyx", accent="indigo",
                           document_language="en"))
    services = SimpleNamespace(sessions=factory)
    limit = rate_limits.LIMITS["resume_publish"][0]
    for _ in range(limit):  # an empty draft stops at resume_incomplete, before any render, but the call still counts
        with pytest.raises(ServiceError) as err:
            await resume_api._publish("cv", p.id, cv_id, actor, services)
        assert err.value.code == "resume_incomplete"
    with pytest.raises(ServiceError) as err:
        await resume_api._publish("cv", p.id, cv_id, actor, services)
    assert err.value.code == "rate_limited"


async def test_cv_upload_is_rate_limited_per_user(migrated_engine):
    factory = sessionmaker(migrated_engine, expire_on_commit=False)
    with factory.begin() as db:
        actor = owner(db)
        p = project(db, owner=actor)
    files = Files(factory, object_store=None, parser=None)
    limit = rate_limits.LIMITS["cv_upload"][0]
    for _ in range(limit):  # a wrong file type is refused after the limit check
        with pytest.raises(ServiceError) as err:
            await files.upload(actor, p.id, io.BytesIO(b"not a pdf"), "application/pdf", "cv.pdf")
        assert err.value.code == "unsupported_media_type"
    with pytest.raises(ServiceError) as err:
        await files.upload(actor, p.id, io.BytesIO(b"not a pdf"), "application/pdf", "cv.pdf")
    assert err.value.code == "rate_limited"
