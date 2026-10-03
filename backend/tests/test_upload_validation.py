from __future__ import annotations

import io
import json
import shutil
import zipfile
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import sessionmaker

from helpers import owner, project
from job_search_platform.services.errors import ServiceError
from job_search_platform.services.files import Files


class _NoObjectStore:
    def put(self, *_args, **_kwargs):  # pragma: no cover - must not be reached
        raise AssertionError("invalid_upload_reached_object_store")


class _NoParser:
    async def parse_input(self, *_args, **_kwargs):  # pragma: no cover
        raise AssertionError("invalid_upload_reached_parser")


@pytest.fixture
def upload_context(db_session):
    actor = owner(db_session)
    project_row = project(db_session)
    db_session.commit()
    sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    files = Files(sessions, _NoObjectStore(), _NoParser())
    return files, actor, project_row.id


@pytest.mark.asyncio
async def test_upload_rejects_filename_path_components(upload_context):
    files, actor, project_id = upload_context

    with pytest.raises(ServiceError) as error:
        await files.upload(
            actor, project_id, io.BytesIO(b"synthetic CV text"), "text/plain", "../cv.txt"
        )

    assert error.value.code == "filename_invalid"


@pytest.mark.asyncio
async def test_upload_rejects_declared_mime_that_disagrees_with_content(upload_context):
    files, actor, project_id = upload_context

    with pytest.raises(ServiceError) as error:
        await files.upload(
            actor, project_id, io.BytesIO(b"synthetic CV text"), "application/pdf", "cv.pdf"
        )

    assert error.value.code == "unsupported_media_type"


@pytest.mark.asyncio
async def test_upload_stops_streaming_at_twenty_mib(upload_context):
    files, actor, project_id = upload_context
    too_large = io.BytesIO(b"%PDF-1.7\n" + b"x" * (20 * 1024 * 1024))

    with pytest.raises(ServiceError) as error:
        await files.upload(actor, project_id, too_large, "application/pdf", "large.pdf")

    assert error.value.code == "upload_too_large"
    assert too_large.tell() <= 20 * 1024 * 1024 + 1


@pytest.mark.asyncio
async def test_upload_maps_sandbox_scanned_pdf_error_without_publishing(upload_context, tmp_path):
    from job_search_platform.integrations.hermes_runtime import RuntimeErrorCode

    class ScannedPdfParser:
        def __init__(self):
            self.projects = {}

        async def parse_input(self, _project_id: UUID, _path: str):
            raise RuntimeErrorCode("scanned_pdf_unsupported")

    files, actor, project_id = upload_context
    workspace = tmp_path / str(project_id)
    (workspace / "inputs").mkdir(parents=True)
    files.parser = ScannedPdfParser()
    files.parser.projects[project_id] = type("Project", (), {"workspace": workspace})()
    pdf = b"%PDF-1.7\n% synthetic scanned page\n"

    with pytest.raises(ServiceError) as error:
        await files.upload(actor, project_id, io.BytesIO(pdf), "application/pdf", "scan.pdf")

    assert error.value.code == "scanned_pdf_unsupported"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_pinned_native_sandbox_rejects_docx_zip_expansion():
    from job_search_platform.integrations.hermes_runtime import HermesRuntime, RuntimeErrorCode

    cache = Path.home() / ".cache" / "job-search-platform"
    config_path = cache / "hermes-runtime.json"
    if config_path.is_symlink() or not config_path.is_file():
        pytest.fail("verified_native_runtime_metadata_unavailable")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    test_id = uuid4()
    workspace_root = cache / "hermes-workspaces" / f"core05-zip-{test_id.hex}"
    workspace_root.mkdir(parents=True, mode=0o700)
    workspace = workspace_root / str(test_id)
    workspace.mkdir(mode=0o700)
    runtime = HermesRuntime(
        config["image"],
        environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]),
        workspace_root=workspace_root,
    )
    started = False
    try:
        await runtime.start_project(test_id, workspace)
        started = True
        bomb = workspace / "inputs" / "expansion.docx"
        with zipfile.ZipFile(bomb, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr("word/document.xml", b"x" * (101 * 1024 * 1024))
        with pytest.raises(RuntimeErrorCode) as error:
            await runtime.parse_input(test_id, "inputs/expansion.docx")
        assert str(error.value) == "document_expansion_limit"
    finally:
        if started:
            await runtime.stop(test_id)
        shutil.rmtree(runtime.state_root / str(test_id), ignore_errors=True)
        shutil.rmtree(workspace_root, ignore_errors=True)
