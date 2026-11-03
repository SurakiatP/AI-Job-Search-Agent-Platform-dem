from job_search_platform.services.ocr import MAX_PREVIEW_BYTES, read_preview


def test_read_preview_accepts_only_a_pdf_under_the_cap(tmp_path):
    (tmp_path / "staging").mkdir()
    target = tmp_path / "staging" / "preview.pdf"
    assert read_preview(tmp_path, "staging/preview.pdf") is None  # absent
    target.write_bytes(b"%PDF-1.7 synthetic")
    assert read_preview(tmp_path, "staging/preview.pdf") == b"%PDF-1.7 synthetic"
    assert read_preview(tmp_path, "staging/other.pdf") is None  # only the fixed name
    target.write_bytes(b"not a pdf")
    assert read_preview(tmp_path, "staging/preview.pdf") is None
    target.write_bytes(b"%PDF-" + b"0" * MAX_PREVIEW_BYTES)
    assert read_preview(tmp_path, "staging/preview.pdf") is None
    target.unlink()
    target.symlink_to(tmp_path / "staging")
    assert read_preview(tmp_path, "staging/preview.pdf") is None
