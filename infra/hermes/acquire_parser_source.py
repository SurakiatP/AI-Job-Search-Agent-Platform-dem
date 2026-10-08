"""Acquire the hash-verified parser release source for dependency inventory only."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import tarfile
import urllib.request

URL = "https://files.pythonhosted.org/packages/35/54/ee43b1661a954e53eaed85878a7ccc37ed73e02e6577bb26437ec5f9de94/firecrawl_anydoc-0.2.4.tar.gz"
SHA256 = "3e29460272fea81cde08fd5af11f6b0f1ff05919214ddc939867f72362c83032"

def main():
    root = Path.home() / ".cache/job-search-platform/parser-source"
    if root.is_symlink():
        raise RuntimeError("parser_source_path_invalid")
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    root.chmod(0o700)
    archive = root / "firecrawl_anydoc-0.2.4.tar.gz"
    if not archive.exists():
        with urllib.request.urlopen(URL, timeout=30) as response:
            data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024 or hashlib.sha256(data).hexdigest() != SHA256:
            raise RuntimeError("parser_source_hash_invalid")
        archive.write_bytes(data)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise RuntimeError("parser_source_hash_invalid")
    source = root / "firecrawl_anydoc-0.2.4"
    if source.is_symlink():
        raise RuntimeError("parser_source_path_invalid")
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        if (len(members) > 2000 or sum(m.size for m in members) > 20 * 1024 * 1024
                or any(m.issym() or m.islnk() or m.isdev() for m in members)):
            raise RuntimeError("parser_source_archive_invalid")
        if not source.exists():
            bundle.extractall(root, filter="data")
        expected = {m.name: m for m in members if m.isfile()}
        actual = {str(p.relative_to(root)): p for p in source.rglob("*") if p.is_file()}
        if actual.keys() != expected.keys():
            raise RuntimeError("parser_source_dirty")
        for name, file in actual.items():
            if file.is_symlink() or file.read_bytes() != bundle.extractfile(expected[name]).read():
                raise RuntimeError("parser_source_dirty")
    digest = hashlib.sha256()
    files = sorted(p for p in source.rglob("*") if p.is_file())
    for file in files:
        digest.update(str(file.relative_to(source)).encode())
        digest.update(file.read_bytes())
        file.chmod(file.stat().st_mode & ~0o222)
    locks = [{"path": str(p), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
             for p in source.rglob("Cargo.lock")]
    if not locks:
        raise RuntimeError("parser_source_lock_missing")
    result = {"version": "0.2.4", "source": str(source), "sdist_url": URL,
              "sdist_sha256": SHA256, "source_tree_sha256": digest.hexdigest(),
              "cargo_locks": locks, "wheel_mapping": "release source inventory; not compiled-wheel attestation"}
    manifest = root / "manifest.json"
    manifest.write_text(json.dumps(result, indent=2) + "\n")
    manifest.chmod(0o600)
    print(json.dumps(result, sort_keys=True))

if __name__ == "__main__":
    main()
