"""Run only inside the network-disabled execution image.

Every upload becomes page pictures for the host's vision OCR; the document's own text layer is never read.
PDF: pdftoppm. DOCX: mammoth -> HTML -> chromium print -> PDF -> pdftoppm. TXT/MD: HTML <pre> -> same print path.
"""
from __future__ import annotations
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

MAX_PAGES = 10
MAX_EDGE_PX = 1800
DPI = 120
MAX_PNG_BYTES = 3 * 1024 * 1024  # the host rejects pages over 4 MB; a bigger PNG falls back to JPEG for that page
MAX_PREVIEW_BYTES = 10 * 1024 * 1024  # the host drops a bigger preview PDF; the upload itself still works
MAX_TEXT_BYTES = 300_000  # ~ more than 10 printed pages of text; stops chromium from printing hundreds of pages
STAGING = Path("/workspace/staging")
CSS = """@page { size: A4; margin: 14mm; }
body { font-family: 'Noto Sans Thai', 'Noto Sans', sans-serif; font-size: 11pt; line-height: 1.45; }
img { max-width: 100%; height: auto; } table { border-collapse: collapse; } td, th { border: 1px solid #888; padding: 2px 4px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: 'Noto Sans Thai', 'Noto Sans', monospace; margin: 0; }"""
CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'"


def _run(cmd: list[str], timeout: int, env: dict | None = None) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, check=True, timeout=timeout, capture_output=True, text=True, errors="replace", env=env)
    except subprocess.CalledProcessError as exc:
        if "Incorrect password" in (exc.stderr or ""):
            raise ValueError("document_encrypted") from None
        raise ValueError("document_invalid") from None
    except subprocess.TimeoutExpired:
        raise ValueError("document_invalid") from None


def _page_info(pdf: Path) -> list[tuple[float, float]]:
    out = _run(["pdfinfo", "-f", "1", "-l", str(MAX_PAGES + 1), str(pdf)], 20).stdout
    match = re.search(r"^Pages:\s+(\d+)", out, re.M)
    if not match or int(match[1]) < 1:
        raise ValueError("document_invalid")
    if int(match[1]) > MAX_PAGES:
        raise ValueError("document_too_many_pages")
    sizes = [(float(w), float(h)) for w, h in re.findall(r"^Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts", out, re.M)]
    if len(sizes) != int(match[1]):
        raise ValueError("document_invalid")
    return sizes


def render_pdf(pdf: Path) -> list[str]:
    for old in (*STAGING.glob("page-*"), STAGING / "preview.pdf"):
        old.unlink(missing_ok=True)
    names = []
    for number, (width, height) in enumerate(_page_info(pdf), 1):
        dpi = max(30, min(DPI, int(MAX_EDGE_PX * 72 / max(width, height, 1))))  # long edge stays <= MAX_EDGE_PX
        stem = STAGING / f"page-{number}"
        _run(["pdftoppm", "-png", "-gray", "-r", str(dpi), "-f", str(number), "-l", str(number), "-singlefile", str(pdf), str(stem)], 25)
        target = stem.with_suffix(".png")
        if target.stat().st_size > MAX_PNG_BYTES:
            target.unlink()
            _run(["pdftoppm", "-jpeg", "-jpegopt", "quality=80", "-r", str(dpi), "-f", str(number), "-l", str(number),
                  "-singlefile", str(pdf), str(stem)], 25)
            target = stem.with_suffix(".jpg")
        names.append(f"staging/{target.name}")
    return names


def html_to_pdf(body: str, out: Path) -> None:
    page = STAGING / "doc.html"
    page.write_text(f'<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="{CSP}">'
                    f"<style>{CSS}</style>{body}", encoding="utf-8")
    profile = Path("/tmp/chrome-profile")  # not under /workspace: on some hosts (btrfs bind mounts) chromium cannot create its socket directory there
    try:
        # HOME and the profile dir must be writable: the image runs with a read-only root, /tmp is the container tmpfs.
        _run(["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-crashpad",
              f"--crash-dumps-dir={profile}", "--no-pdf-header-footer", f"--user-data-dir={profile}",
              f"--print-to-pdf={out}", page.as_uri()], 40, {"PATH": "/usr/bin:/bin:/usr/local/bin", "HOME": "/tmp"})
    finally:
        shutil.rmtree(profile, ignore_errors=True)
        page.unlink(missing_ok=True)
    if not out.is_file():
        raise ValueError("document_invalid")


def docx_html(path: Path) -> str:
    import mammoth
    with path.open("rb") as handle:
        return mammoth.convert_to_html(handle).value  # embedded images become data: URIs


def parse(path: Path) -> dict:
    root = Path("/workspace/inputs").resolve()
    if path.is_symlink() or not path.resolve(strict=True).is_relative_to(root):
        raise ValueError("input_path_invalid")
    size = path.stat().st_size
    if not 0 < size <= 20 * 1024 * 1024:
        raise ValueError("input_size_invalid")
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    STAGING.mkdir(mode=0o700, exist_ok=True)
    if b"%PDF-" in data[:1024]:  # mail clients and scanners put a BOM or blank lines before the header; the upload sniff allows it too
        kind, pdf = "pdf", path
    elif data.startswith(b"PK\x03\x04"):
        kind, pdf = "docx", STAGING / "doc.pdf"
        try:
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
        except zipfile.BadZipFile:
            raise ValueError("document_invalid") from None
        html_to_pdf(docx_html(path), pdf)
    else:
        kind, pdf = "text", STAGING / "doc.pdf"
        if path.suffix.lower() not in {".txt", ".md"} or b"\0" in data:
            raise ValueError("unsupported_input")
        if len(data) > MAX_TEXT_BYTES:
            raise ValueError("document_too_many_pages")
        text = data.decode("utf-8")
        if not text.strip():
            raise ValueError("empty_input")
        html_to_pdf(f"<pre>{html.escape(text)}</pre>", pdf)
    try:
        pages = render_pdf(pdf)
        result = {"pages": pages, "kind": kind, "sha256": digest}
        if kind == "docx" and pdf.stat().st_size <= MAX_PREVIEW_BYTES:  # the rendered PDF becomes the CV preview; the host reads and deletes it
            pdf.replace(STAGING / "preview.pdf")
            result["preview"] = "staging/preview.pdf"
    finally:
        if pdf != path:
            pdf.unlink(missing_ok=True)
    return result


if __name__ == "__main__":
    try:
        value = parse(Path(sys.argv[1]))
    except Exception as exc:
        allowed = {"input_path_invalid", "input_size_invalid", "document_expansion_limit",
                   "document_invalid", "document_encrypted", "unsupported_input", "document_too_many_pages", "empty_input"}
        code = str(exc) if str(exc) in allowed else "document_invalid"
        print(json.dumps({"error": code}))
        sys.exit(1)
    print(json.dumps(value, ensure_ascii=False))
