"""After a deploy the browser must fetch the new index.html, or it asks for chunk files that no longer exist (blank page)."""
from fastapi.testclient import TestClient

from job_search_platform import main


def test_spa_shell_is_revalidated_and_hashed_assets_are_immutable(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html></html>")
    (tmp_path / "assets" / "index-abc123.js").write_text("1")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    client = TestClient(main.create_app(services=object(), frontend_dist=tmp_path))
    for path in ("/", "/app/projects/x/console"):
        assert client.get(path).headers["cache-control"] == "no-cache"
    assert client.get("/assets/index-abc123.js").headers["cache-control"] == "public, max-age=31536000, immutable"
    assert client.get("/favicon.svg").headers["cache-control"] == "no-cache"
