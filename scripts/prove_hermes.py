"""Offline real-native proof. Missing dependencies or isolation fail closed."""
from __future__ import annotations
import argparse
import asyncio
import json
from pathlib import Path
import subprocess
import sys
import shutil
import shlex
import os
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/src"))
from job_search_platform.integrations.hermes_runtime import HermesRuntime, RuntimeErrorCode

CACHE = Path.home() / ".cache/job-search-platform"
SYNTHETIC_KEY = "CORE03_SYNTHETIC_SECRET_NEVER_A_REAL_CREDENTIAL"

async def prove(image: str | None = None):
    assert os.environ.get("OPENAI_API_KEY") == SYNTHETIC_KEY
    config = json.loads((CACHE / "hermes-runtime.json").read_text())
    if image is not None:
        config["image"] = image
    proof_id = str(uuid4())
    runtime = HermesRuntime(config["image"], environment=Path(config["environment"]),
        hermes_source=Path(config["hermes"]["source"]),
        career_ops_source=Path(config["career-ops"]["source"]),
        workspace_root=CACHE / "hermes-proofs" / proof_id)
    projects = []
    try:
        for index in range(2):
            workspace = CACHE / "hermes-proofs" / proof_id / str(index)
            workspace.mkdir(parents=True, mode=0o755)
            (workspace / "marker.txt").write_text(f"SYNTHETIC_PROJECT_{index}_MARKER")
            project = await runtime.start_project(uuid4(), workspace)
            assert workspace.stat().st_mode & 0o777 == 0o700
            for private in (runtime.state_root, runtime.state_root / str(project.project_id),
                            runtime.state_root / str(project.project_id) / "process-home"):
                assert private.stat().st_mode & 0o777 == 0o700
            projects.append(project)
        expected = {"terminal", "read_file", "write_file", "patch", "search_files"}
        assert set(projects[0].allowed_tools) == expected
        for first, second in (projects, projects[::-1]):
            async def tool(tool_name, **arguments):
                return await runtime._request(first, "tool", name=tool_name, arguments=arguments)
            read = await tool("read_file", path="/workspace/marker.txt")
            assert f"SYNTHETIC_PROJECT_{projects.index(first)}_MARKER" in json.dumps(read)
            write = await tool("write_file", path="/workspace/native.txt", content="SYNTHETIC native write")
            assert not write.get("error"), write
            patch = await tool("patch", mode="replace", path="/workspace/native.txt",
                               old_string="native write", new_string="native edit")
            assert not patch.get("error"), patch
            search = await tool("search_files", pattern="SYNTHETIC", path="/workspace")
            assert "native.txt" in json.dumps(search), search
            denied_paths = [str(second.workspace / "marker.txt"), str(Path.home() / "host-only.txt"),
                            "/var/run/docker.sock", "/workspace/../other-project/marker.txt"]
            for path in denied_paths:
                result = await tool("read_file", path=path)
                assert result.get("error"), ("read_file", path, result)
                result = await tool("write_file", path=path, content="MALICIOUS_REPLACEMENT")
                assert result.get("error"), ("write_file", path, result)
                result = await tool("patch", mode="replace", path=path,
                                    old_string="MARKER", new_string="MALICIOUS")
                assert result.get("error"), ("patch", path, result)
                result = await tool("search_files", pattern="SYNTHETIC_PROJECT", path=path)
                assert f"SYNTHETIC_PROJECT_{projects.index(second)}_MARKER" not in json.dumps(result)
                result = await tool("terminal", command=f"cat {json.dumps(path)}", timeout=10)
                assert result.get("exit_code") != 0, ("terminal", path, result)
            result = await tool("terminal", command="env; test ! -S /var/run/docker.sock; test ! -e /Users", timeout=10)
            assert result.get("exit_code") == 0
            assert SYNTHETIC_KEY not in result.get("output", "")
            for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "POSTGRES_PASSWORD", "MINIO_ROOT_PASSWORD"):
                assert name not in result.get("output", "")
            (first.workspace / "inputs" / "synthetic_cv.txt").write_text(
                (ROOT / "backend/tests/fixtures/synthetic_cv.txt").read_text())
            parsed = await runtime.parse_input(first.project_id, "inputs/synthetic_cv.txt")
            assert parsed.kind == "text" and "ดร.มะลิ" in parsed.text
            protected = await tool("write_file", path="/workspace/inputs/synthetic_cv.txt", content="MALICIOUS")
            assert protected.get("error"), protected
            staging = first.workspace / "staging"
            staging.mkdir(exist_ok=True)
            for locale, heading in (("en", "Research Scientist"), ("th", "นักวิทยาศาสตร์")):
                markdown = "# SYNTHETIC Example\n\n## " + heading + "\n\nPython, statistics and reproducible research.\n"
                (staging / f"cv-{locale}.md").write_text(markdown)
                # Package-local font bytes are embedded; rendering needs no external URL.
                prepare = ("from pathlib import Path; import base64; "
                    "fonts=list(Path('/opt/runtime/node_modules/@fontsource/noto-sans-thai/files').glob('*thai-400-normal.woff2')); "
                    "font=base64.b64encode(fonts[0].read_bytes()).decode(); "
                    f"html='<html lang=\"{locale}\"><style>@font-face{{font-family:Noto;src:url(data:font/woff2;base64,'+font+')}}body{{font-family:Noto,sans-serif}}</style><h1>{heading}</h1><p>SYNTHETIC Example. Python statistics.</p></html>'; "
                    f"Path('/workspace/staging/cv-{locale}.html').write_text(html)")
                prepared = await tool("terminal", command="python -c " + shlex.quote(prepare), timeout=15)
                assert prepared.get("exit_code") == 0, prepared
                for format, source_extension in (("docx", "md"), ("pdf", "html")):
                    output = f"staging/cv-{locale}.{format}"
                    await runtime.export_document(first.project_id, format,
                                                  f"staging/cv-{locale}.{source_extension}", output)
                    artifact = first.workspace / output
                    assert artifact.is_file() and artifact.stat().st_size > 100
                    shutil.copyfile(artifact, first.workspace / "inputs" / artifact.name)
                    parsed = await runtime.parse_input(first.project_id, f"inputs/{artifact.name}")
                    assert parsed.kind == format and heading.casefold() in parsed.text.casefold(), (format, locale, parsed.text)
                    if format == "pdf" and locale == "th":
                        assert b"/FontFile2" in artifact.read_bytes() and b"/ToUnicode" in artifact.read_bytes()
            # A real image-only PDF must not be accepted as an empty CV.
            objects = [b"<< /Type /Catalog /Pages 2 0 R >>",
                b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
                b"<< /Length 29 >>\nstream\nq 100 0 0 100 0 0 cm /Im0 Do Q\nendstream",
                b"<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n\x80\x80\x80\nendstream"]
            pdf = bytearray(b"%PDF-1.4\n")
            offsets = [0]
            for index, obj in enumerate(objects, 1):
                offsets.append(len(pdf))
                pdf.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
            xref = len(pdf)
            pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
            for offset in offsets[1:]:
                pdf.extend(f"{offset:010} 00000 n \n".encode())
            pdf.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
            (first.workspace / "inputs/scanned.pdf").write_bytes(pdf)
            try:
                await runtime.parse_input(first.project_id, "inputs/scanned.pdf")
            except RuntimeErrorCode as error:
                assert str(error) == "scanned_pdf_unsupported", str(error)
            else:
                raise AssertionError("scanned PDF accepted")
            unsupported = await tool("skill_view", name="../../other-project")
            assert unsupported.get("error") == "unsupported_tool"
            escaped = await tool("terminal", command="true", _host_local=True)
            assert escaped.get("error") == "unsupported_tool"
            inspect = json.loads(subprocess.check_output(["docker", "inspect", first.container_id]))[0]
            host = inspect["HostConfig"]
            assert host["NetworkMode"] == "none" and not host["Privileged"]
            assert host["Memory"] > 0 and host["NanoCpus"] > 0
            assert host["PidsLimit"] == 256
            assert host["ReadonlyRootfs"] is True
            assert host["ShmSize"] == 128 * 1024 * 1024
            assert "size=128m" in host["Tmpfs"]["/tmp"] and "noexec" in host["Tmpfs"]["/tmp"]
            assert not host.get("CapAdd")
            assert "ALL" in host["CapDrop"]
            assert inspect["Config"]["User"] not in ("", "0", "0:0", "root")
            assert not host["PortBindings"]
            for mount in inspect["Mounts"]:
                assert mount["Source"] not in (str(Path.home()), "/var/run/docker.sock")
                if mount["RW"]:
                    assert Path(mount["Source"]).resolve() == first.workspace
                else:
                    assert Path(mount["Source"]).resolve() == first.workspace / "inputs"
            assert (second.workspace / "marker.txt").read_text().startswith("SYNTHETIC_PROJECT_")
            await tool("terminal", command="sleep 60; touch /workspace/SHOULD_NOT_EXIST", background=True)
            await runtime.stop(first.project_id)
            stopped = subprocess.run(["docker", "inspect", first.container_id], capture_output=True)
            assert stopped.returncode != 0, "native stop left execution container alive"
            assert not (first.workspace / "SHOULD_NOT_EXIST").exists()
        # Killing the real trusted bridge must wake event consumers and leave
        # its actual tool container removable without the native RPC channel.
        second = projects[1]
        await runtime.close(second.project_id)
        restarted = await runtime.start_project(second.project_id, second.workspace)
        await runtime._request(restarted, "tool", name="terminal", arguments={"command": "sleep 60", "background": True})
        stream = runtime.events(restarted.project_id)
        event = asyncio.create_task(stream.__anext__())
        restarted.process.kill()
        await restarted.process.wait()
        terminal = await asyncio.wait_for(event, timeout=5)
        assert terminal.kind == "failed" and terminal.code == "native_connection_closed"
        await stream.aclose()
        await runtime.close(restarted.project_id)
        assert subprocess.run(["docker", "inspect", restarted.container_id], capture_output=True).returncode != 0
        return {"status": "complete", "native_tool_isolation": "complete", "native_stop": "complete",
                "skill_loading": "complete", "projects": 2, "tools": sorted(expected),
                "image": config["image"], "live_provider": "not_run", "document_exports": "complete",
                "input_parsing": "complete", "languages": ["en", "th"], "bridge_crash_cleanup": "complete"}
    finally:
        await runtime.close()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", required=True)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--image", help="immutable candidate digest; leaves runtime configuration unchanged"); options = parser.parse_args()
    if not options.worker:
        environment = {"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
                       "HOME": str(Path.home()), "OPENAI_API_KEY": SYNTHETIC_KEY}
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--offline", "--worker"] + (["--image", options.image] if options.image else []), env=environment, timeout=180)
        return result.returncode
    try:
        result = asyncio.run(prove(options.image))
    except Exception as exc:
        result = {"status": "blocked", "code": str(exc) if isinstance(exc, RuntimeErrorCode) else type(exc).__name__}
        print(json.dumps(result, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0

if __name__ == "__main__":
    sys.exit(main())
