"""Offline proof that the pinned native Hermes request includes CareerOps context."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import textwrap

import pytest

ROOT = Path(__file__).resolve().parents[3]
CACHE = Path.home() / ".cache/job-search-platform"
SYNTHETIC_KEY = "OFFLINE_SYNTHETIC_KEY_NEVER_SENT_TO_A_PROVIDER"


@pytest.mark.parametrize(
    ("operation", "required_markers", "excluded_markers"),
    [
        (
            "evaluate_job",
            ("## Scoring System", "## Mode Routing", "# Mode: job — Full A-H Evaluation"),
            ("# Mode: cover — Cover Letter Generator",),
        ),
            (
                "draft_documents",
                (
                    "## Scoring System",
                    "## Professional Writing & ATS Compatibility",
                    "## Mode Routing",
                    "# Mode: text — Tailored Markdown CV",
                    "# Mode: cover — Cover Letter Generator",
                ),
                ("# Mode: job — Full A-H Evaluation",),
            ),
    ],
)
def test_pinned_hermes_request_contains_router_and_mode(
    operation: str,
    required_markers: tuple[str, ...],
    excluded_markers: tuple[str, ...],
) -> None:
    """Run pinned AIAgent through its real conversation/request path with HTTP mocked."""
    config_path = CACHE / "hermes-runtime.json"
    if not config_path.is_file():
        pytest.skip("pinned offline Hermes runtime fixture is not installed")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    environment = Path(config["environment"])
    career_ops = Path(config["career-ops"]["source"])
    hermes = Path(config["hermes"]["source"])
    python = environment / ".venv/bin/python"
    if not python.is_file() or not career_ops.is_dir() or not hermes.is_dir():
        pytest.skip("pinned offline Hermes runtime fixture is incomplete")

    script = textwrap.dedent(
        r"""
        import hashlib, json, os, pathlib, sys, tempfile

        root = pathlib.Path(os.environ["PROOF_REPO"])
        career_ops = pathlib.Path(os.environ["PROOF_CAREER_OPS"])
        hermes = pathlib.Path(os.environ["PROOF_HERMES"])
        sys.path.insert(0, str(root / "infra/hermes"))
        sys.path.insert(0, str(hermes))
        from native_bridge import _career_ops_context, _pinned_career_ops_text, _system_message
        from tools.skills_tool import skill_view

        operation = os.environ["PROOF_OPERATION"]
        home = pathlib.Path(tempfile.mkdtemp(prefix="career-ops-context-proof-"))
        skills = home / "skills"
        skills.mkdir()
        (skills / "career-ops").symlink_to(
            career_ops / ".agents/skills/career-ops", target_is_directory=True
        )
        os.environ["HERMES_HOME"] = str(home)
        skill = json.loads(skill_view("career-ops", task_id="offline-proof", preprocess=False))
        if skill.get("success") is not True:
            raise AssertionError("pinned skill_view did not load CareerOps")
        context = _career_ops_context(operation, str(career_ops), skill)
        try:
            _career_ops_context("scan", str(career_ops), skill)
        except RuntimeError as error:
            invalid_operation_closed = str(error) == "native_operation_invalid"
        else:
            invalid_operation_closed = False
        try:
            _career_ops_context(operation, str(home / "missing-source"), skill)
        except RuntimeError as error:
            missing_source_closed = str(error) == "native_skill_loading_failed"
        else:
            missing_source_closed = False
        try:
            _pinned_career_ops_text(career_ops, "modes/apply.md")
        except RuntimeError as error:
            unapproved_file_closed = str(error) == "native_skill_loading_failed"
        else:
            unapproved_file_closed = False
        instructions = _system_message(
            "Platform JSON contract: return the platform-required JSON object.", context
        )

        import httpx
        from openai import OpenAI
        from run_agent import AIAgent

        captured = []
        def handler(request):
            payload = json.loads(request.content)
            captured.append(payload)
            chunks = [
                {"id": "offline-proof", "object": "chat.completion.chunk", "created": 1,
                 "model": "gpt-4o-mini", "choices": [{"index": 0,
                 "delta": {"content": "offline response"}, "finish_reason": None}]},
                {"id": "offline-proof", "object": "chat.completion.chunk", "created": 1,
                 "model": "gpt-4o-mini", "choices": [{"index": 0,
                 "delta": {}, "finish_reason": "stop"}]},
            ]
            body = "".join("data: " + json.dumps(chunk) + "\n\n" for chunk in chunks)
            body += "data: [DONE]\n\n"
            return httpx.Response(200, content=body.encode(),
                                  headers={"content-type": "text/event-stream"})

        dummy_key = os.environ["PROOF_DUMMY_KEY"]
        agent = AIAgent(api_key=dummy_key, provider="openai", model="gpt-4o-mini",
                        base_url="https://offline.invalid/v1", session_id="offline-proof",
                        max_iterations=1, quiet_mode=True, save_trajectories=False)
        agent.tools = [t for t in agent.tools
                       if t.get("function", {}).get("name") in
                       {"terminal", "read_file", "write_file", "patch", "search_files"}]
        agent.valid_tool_names = {t["function"]["name"] for t in agent.tools}
        def mock_client(_kwargs, *, reason, shared):
            client = httpx.Client(transport=httpx.MockTransport(handler))
            return OpenAI(api_key=dummy_key, base_url="https://offline.invalid/v1",
                          http_client=client, max_retries=0)
        agent._create_openai_client = mock_client
        try:
            result = agent.run_conversation(
                "Evaluate or draft from the supplied synthetic inputs only.",
                task_id="offline-proof", conversation_history=[], system_message=instructions,
            )
            if not isinstance(result, dict) or not isinstance(result.get("final_response"), str):
                raise AssertionError("pinned AIAgent did not complete its offline turn")
        finally:
            agent.close()
        if len(captured) != 1:
            raise AssertionError("expected exactly one intercepted model request")
        request = captured[0]
        system = "\n".join(
            str(message.get("content", ""))
            for message in request.get("messages", [])
            if message.get("role") == "system"
        )
        report = json.dumps({
            "operation": operation,
            "request_count": len(captured),
            "router_present": "## Mode Routing" in system,
            "invalid_operation_closed": invalid_operation_closed,
            "missing_source_closed": missing_source_closed,
            "unapproved_file_closed": unapproved_file_closed,
            "required_markers": {marker: marker in system for marker in
                                  json.loads(os.environ["PROOF_REQUIRED_MARKERS"])},
            "excluded_markers": {marker: marker not in system for marker in
                                  json.loads(os.environ["PROOF_EXCLUDED_MARKERS"])},
            "context_sha256": hashlib.sha256(system.encode()).hexdigest(),
            "tool_names": sorted(tool.get("function", {}).get("name", "")
                                 for tool in request.get("tools", [])),
        }, sort_keys=True)
        sys.__stdout__.write(report + "\n")
        sys.__stdout__.flush()
        """
    )
    environment_vars = os.environ.copy()
    environment_vars.update(
        {
            "PROOF_REPO": str(ROOT),
            "PROOF_CAREER_OPS": str(career_ops),
            "PROOF_HERMES": str(hermes),
            "PROOF_OPERATION": operation,
            "PROOF_DUMMY_KEY": SYNTHETIC_KEY,
            "PROOF_REQUIRED_MARKERS": json.dumps(required_markers),
            "PROOF_EXCLUDED_MARKERS": json.dumps(excluded_markers),
            "PLATFORM_CAREER_OPS_SOURCE": str(career_ops),
            "PLATFORM_PROJECT_ID": "00000000-0000-4000-8000-000000000001",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    result = subprocess.run(
        [str(python), "-c", script],
        cwd=ROOT,
        env=environment_vars,
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.strip(), result.stderr or "offline Hermes proof emitted no result"
    proof = json.loads(result.stdout.strip().splitlines()[-1])
    print(json.dumps(proof, sort_keys=True))
    assert proof["operation"] == operation
    assert proof["request_count"] == 1
    assert proof["router_present"] is True
    assert proof["invalid_operation_closed"] is True
    assert proof["missing_source_closed"] is True
    assert proof["unapproved_file_closed"] is True
    assert all(proof["required_markers"].values())
    assert all(proof["excluded_markers"].values())
    assert proof["tool_names"] == sorted(
        {"terminal", "read_file", "write_file", "patch", "search_files"}
    )
