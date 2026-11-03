"""Run only inside the network-disabled execution image."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

THAI_MARKS = re.compile("[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]")
THAI_CONSONANTS = re.compile("[\u0e01-\u0e2e]")

def broken_thai(text: str) -> bool:
    # A Thai text layer with its combining marks lost (bad font encoding) has plenty of consonants and almost no marks.
    consonants = len(THAI_CONSONANTS.findall(text))
    return consonants >= 200 and len(THAI_MARKS.findall(text)) / consonants < 0.02

def render_pages(path: Path, reason: str, sha256: str) -> dict:
    """Render the first pages to JPEG files for the host to send to a vision model. Never returns image bytes."""
    staging = Path("/workspace/staging")
    staging.mkdir(mode=0o700, exist_ok=True)
    for old in staging.glob("ocr-*.jpg"):
        old.unlink()
    subprocess.run(["pdftoppm", "-jpeg", "-jpegopt", "quality=70", "-r", "110", "-f", "1", "-l", "4",
                    str(path), str(staging / "ocr")], check=True, timeout=20, capture_output=True)
    files = sorted(staging.glob("ocr-*.jpg"))
    if not files:
        raise ValueError("document_invalid")
    names = []
    for number, file in enumerate(files, 1):
        target = staging / f"ocr-{number}.jpg"
        if file != target:
            file.rename(target)
        names.append(f"staging/{target.name}")
    return {"needs_vision": True, "reason": reason, "pages": names, "kind": "pdf", "sha256": sha256}

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
            return render_pages(path, "scanned_pdf", hashlib.sha256(data).hexdigest())
        if kind == "pdf" and broken_thai(text):
            return render_pages(path, "broken_thai", hashlib.sha256(data).hexdigest())
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
