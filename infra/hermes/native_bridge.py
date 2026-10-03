"""Private JSON-lines bridge. It is never exposed as a network endpoint."""
from __future__ import annotations
import json
import os
from pathlib import Path
import shlex
import sys
import threading

WIRE = sys.stdout
sys.stdout = sys.stderr
ALLOWED = {"terminal", "read_file", "write_file", "patch", "search_files"}
LOCK = threading.Lock()
agent = None
thread = None
task_id = os.environ["PLATFORM_PROJECT_ID"]

def emit(value):
    with LOCK:
        WIRE.write(json.dumps(value, ensure_ascii=False) + "\n")
        WIRE.flush()

def main():
    global agent, thread
    import tools.terminal_tool as terminal
    import tools.file_tools as files
    import tools.environments.docker as docker_backend
    from tools.terminal_tool_lifecycle import cleanup_vm
    from tools.registry import registry
    from tools.skills_tool import skill_view
    # Native convenience mounts include composer/attachment caches; the platform
    # deliberately supplies only selected input snapshots and its workspace.
    docker_backend._readonly_skill_mount_args = lambda: []
    # Bounded scratch is sufficient for locked exporters; no tool installs need
    # executable temporary files or a mutable image root.
    docker_backend._BASE_SECURITY_ARGS = ["--cap-drop", "ALL", "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=128m", "--tmpfs",
        "/var/tmp:rw,noexec,nosuid,nodev,size=32m"]

    # Never let native document extraction parse untrusted bytes on the trusted host.
    def deny_document(path, resolved, offset, limit, task_id):
        if Path(str(resolved)).suffix.lower() not in {".txt", ".md", ".json", ".csv", ".py", ".mjs", ".yml", ".yaml", ".html", ".css", ".xml"}:
            return json.dumps({"error": "sandbox_document_parser_required"})
        return None
    files._read_extracted_document = deny_document
    dispatch = registry.dispatch

    def restricted(name, args, **kwargs):
        if name not in ALLOWED or any(key.startswith("_") for key in args):
            return json.dumps({"error": "unsupported_tool"})
        if name == "terminal" and any(key in args for key in ("force", "persist_on_release", "pty")):
            return json.dumps({"error": "unsupported_tool_argument"})
        return dispatch(name, args, **kwargs)
    registry.dispatch = restricted

    for line in sys.stdin:
        request = json.loads(line)
        try:
            op = request["method"]
            if op == "start":
                from run_agent import AIAgent
                import inspect
                parameters = inspect.signature(AIAgent).parameters
                if not {"api_key", "provider", "model", "session_id", "event_callback"}.issubset(parameters):
                    raise RuntimeError("native_interface_invalid")
                if not all(callable(getattr(AIAgent, method, None)) for method in ("run_conversation", "interrupt", "close")):
                    raise RuntimeError("native_interface_invalid")
                startup = json.loads(terminal.terminal_tool("true", task_id=task_id, timeout=30))
                if startup.get("exit_code") != 0:
                    raise RuntimeError("native_start_failed")
                skill = json.loads(skill_view("career-ops", task_id=task_id, preprocess=False))
                if skill.get("error"):
                    raise RuntimeError("native_skill_loading_failed")
                env = next(iter(terminal._active_environments.values()))
                result = {"container_id": env._container_id, "skill_loaded": True, "native_interface": True,
                          "allowed_tools": sorted(ALLOWED)}
            elif op == "tool":
                # Internal diagnostic only; no HTTP/MCP/A2A route may expose it.
                result = restricted(request["name"], request["arguments"], task_id=task_id)
                if isinstance(result, str):
                    result = json.loads(result)
                if not isinstance(result, dict):
                    raise RuntimeError("native_response_invalid")
            elif op == "submit":
                if thread and thread.is_alive():
                    raise RuntimeError("project_busy")
                provider = request.get("provider")
                if not provider:
                    raise RuntimeError("provider_not_configured")
                from run_agent import AIAgent
                agent = AIAgent(**provider, session_id=request["session_id"],
                    enabled_toolsets=["terminal", "file"], skip_memory=True,
                    skip_context_files=True, skip_background_review=True,
                    max_iterations=30, run_budget_seconds=900, quiet_mode=True,
                    save_trajectories=False, verbose_logging=False,
                    event_callback=lambda name, data: emit({"event": "progress"}))
                agent.tools = [t for t in agent.tools if t["function"]["name"] in ALLOWED]
                agent.valid_tool_names = set(ALLOWED)
                def run():
                    try:
                        value = agent.run_conversation(request["prompt"], task_id=task_id,
                                                       conversation_history=[],
                                                       system_message=request["instructions"])
                        if not isinstance(value, dict) or not isinstance(value.get("final_response"), str):
                            raise RuntimeError("native_response_invalid")
                        emit({"event": "result", "result": value["final_response"]})
                    except Exception:
                        emit({"event": "failed", "code": "native_execution_failed"})
                thread = threading.Thread(target=run, daemon=True)
                thread.start()
                result = {"accepted": True}
            elif op == "parse":
                path = Path(request["path"])
                if path.is_absolute() or ".." in path.parts or not str(path).startswith("inputs/"):
                    raise RuntimeError("input_path_invalid")
                execution = json.loads(terminal.terminal_tool(
                    "python /opt/runtime/parse_document.py " + shlex.quote("/workspace/" + str(path)),
                    task_id=task_id, timeout=30))
                result = json.loads(execution.get("output", ""))
                if execution.get("exit_code") != 0:
                    result = {"parse_error": result.get("error", "document_invalid")}
            elif op == "export":
                source = Path(request["source"])
                output = Path(request["output"])
                if any(p.is_absolute() or ".." in p.parts or not str(p).startswith("staging/") for p in (source, output)):
                    raise RuntimeError("artifact_path_invalid")
                format = request["format"]
                scripts = {"pdf": "/opt/runtime/export_pdf.mjs",
                           "docx": "/opt/career-ops-docx/bin/generate-docx.mjs"}
                if format not in scripts or output.suffix != "." + format:
                    raise RuntimeError("unsupported_export")
                command = "node " + scripts[format] + " " + shlex.quote("/workspace/" + str(source)) + " " + shlex.quote("/workspace/" + str(output))
                execution = json.loads(terminal.terminal_tool(command, task_id=task_id, timeout=60))
                if execution.get("exit_code") != 0:
                    raise RuntimeError("export_failed")
                result = {"output": str(output), "format": format}
            elif op == "stop":
                if agent is not None:
                    agent.interrupt(hard_cancel=True)
                environments = list(terminal._active_environments.values())
                cleanup_vm(task_id, force_remove=True)
                for env in environments:
                    env.wait_for_cleanup(timeout=20)
                if thread:
                    thread.join(timeout=10)
                    if thread.is_alive():
                        raise RuntimeError("native_stop_incomplete")
                result = {"stopped": True}
            elif op == "health":
                result = {"alive": True, "running": bool(thread and thread.is_alive())}
            elif op == "close":
                environments = list(terminal._active_environments.values())
                cleanup_vm(task_id, force_remove=True)
                for env in environments:
                    env.wait_for_cleanup(timeout=20)
                emit({"id": request["id"], "result": {"closed": True}})
                return
            else:
                raise RuntimeError("unsupported_native_method")
            emit({"id": request["id"], "result": result})
        except Exception as exc:
            code = str(exc) if str(exc) in {"project_busy", "provider_not_configured", "native_stop_incomplete", "native_skill_loading_failed", "native_response_invalid", "native_start_failed", "input_path_invalid", "artifact_path_invalid", "unsupported_export", "export_failed"} else "native_bridge_failed"
            emit({"id": request.get("id"), "error": code})

if __name__ == "__main__":
    main()
