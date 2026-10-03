"""Run only inside the network-disabled execution image."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys
import zipfile

def parse(path: Path) -> dict:
    root = Path("/workspace/inputs").resolve()
    if path.is_symlink() or not path.resolve(strict=True).is_relative_to(root):
        raise ValueError("input_path_invalid")
    size = path.stat().st_size
    if not 0 < size <= 20 * 1024 * 1024:
        raise ValueError("input_size_invalid")
    data = path.read_bytes()
    if data.startswith(b"%PDF-"):
        kind = "pdf"
    elif data.startswith(b"PK\x03\x04"):
        kind = "docx"
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(e.file_size for e in entries) > 100 * 1024 * 1024:
                raise ValueError("document_expansion_limit")
            if "word/document.xml" not in archive.namelist():
                raise ValueError("document_invalid")
            if any(e.flag_bits & 1 for e in entries):
                raise ValueError("document_encrypted")
            if any(e.file_size / max(1, e.compress_size) > 100 for e in entries):
                raise ValueError("document_expansion_limit")
    else:
        kind = "text"
        if path.suffix.lower() not in {".txt", ".md"} or b"\0" in data:
            raise ValueError("unsupported_input")
    if kind == "text":
        text = data.decode("utf-8")
    else:
        import anydoc
        try:
            text = anydoc.to_markdown_bytes(data, ocr="reject")
        except anydoc.NeedsOcrError:
            raise ValueError("scanned_pdf_unsupported") from None
    if not isinstance(text, str) or not text.strip():
        raise ValueError("empty_input")
    if len(text.encode("utf-8")) > 1024 * 1024:
        raise ValueError("extracted_text_limit")
    return {"text": text, "kind": kind, "sha256": hashlib.sha256(data).hexdigest()}

if __name__ == "__main__":
    try:
        value = parse(Path(sys.argv[1]))
    except Exception as exc:
        allowed = {"input_path_invalid", "input_size_invalid", "document_expansion_limit",
                   "document_invalid", "document_encrypted", "unsupported_input",
                   "scanned_pdf_unsupported", "empty_input", "extracted_text_limit"}
        code = str(exc) if str(exc) in allowed else "document_invalid"
        print(json.dumps({"error": code}))
        sys.exit(1)
    print(json.dumps(value, ensure_ascii=False))
