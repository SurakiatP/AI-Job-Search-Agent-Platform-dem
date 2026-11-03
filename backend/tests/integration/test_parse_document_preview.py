"""Runs the real sandbox image on a generated Thai DOCX; skipped unless JSP_PREVIEW_IMAGE names a built image."""
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

import pytest

IMAGE = os.environ.get("JSP_PREVIEW_IMAGE")
CT = ('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" '
      'ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
RELS = ('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
BODY = ('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        '<w:p><w:r><w:t>ตัวอย่างประวัติย่อ ทดสอบ</w:t></w:r></w:p></w:body></w:document>')


@pytest.mark.skipif(not IMAGE or not shutil.which("docker"), reason="set JSP_PREVIEW_IMAGE to run the sandbox check")
def test_sandbox_keeps_the_rendered_pdf_of_a_thai_docx():
    # Docker Desktop shares the home directory, not every temp directory.
    root = Path(tempfile.mkdtemp(dir=Path.home() / ".cache"))
    try:
        (root / "inputs").mkdir()
        (root / "staging").mkdir()
        with zipfile.ZipFile(root / "inputs" / "t.docx", "w") as archive:
            archive.writestr("[Content_Types].xml", CT)
            archive.writestr("_rels/.rels", RELS)
            archive.writestr("word/document.xml", BODY)
        subprocess.run(["chmod", "-R", "777", str(root)], check=True)
        done = subprocess.run(["docker", "run", "--rm", "--network", "none", "--user", "65534:65534", "-v", f"{root}:/workspace", IMAGE,
                               "python", "/opt/runtime/parse_document.py", "/workspace/inputs/t.docx"],
                              capture_output=True, text=True, check=True, timeout=120)
        result = json.loads(done.stdout)
        assert result["kind"] == "docx" and result["preview"] == "staging/preview.pdf"
        pdf = (root / "staging" / "preview.pdf").read_bytes()
        assert pdf.startswith(b"%PDF-") and len(pdf) < 10 * 1024 * 1024
        assert not (root / "staging" / "doc.pdf").exists()
    finally:
        shutil.rmtree(root, ignore_errors=True)
