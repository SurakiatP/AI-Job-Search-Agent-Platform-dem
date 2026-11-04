"""Admin console contract (spec D5: metadata only). Synthetic data only; needs no infrastructure."""
from pathlib import Path

import yaml

from job_search_platform.services import contracts

SPEC = yaml.safe_load((Path(__file__).resolve().parents[3] / "docs" / "contracts" / "application-api.yaml").read_text())
SCHEMAS = SPEC["components"]["schemas"]

EXPECTED = {
    "/admin/overview": {"get"}, "/admin/overview/bucket": {"get"}, "/admin/overview.csv": {"get"},
    "/admin/prefs": {"get", "put"},
    "/admin/users": {"get"}, "/admin/users/{user_id}": {"get"},
    "/admin/users/{user_id}/suspend": {"post"}, "/admin/users/{user_id}/enable": {"post"},
    "/admin/users/{user_id}/reset-password": {"post"}, "/admin/users/{user_id}/delete": {"post"},
    "/admin/runs": {"get"}, "/admin/runs/{run_id}": {"get"},
    "/admin/runs/{run_id}/cancel": {"post"}, "/admin/runs/{run_id}/retry": {"post"},
    "/admin/usage": {"get"},
    "/admin/models/catalog": {"get"}, "/admin/models": {"get", "post"}, "/admin/models/price": {"put"},
    "/admin/models/use-official-price": {"post"},
    "/admin/tasks": {"get"}, "/admin/tasks/{operation}": {"put"},
    "/admin/benchmarks": {"get", "post"}, "/admin/benchmarks/{benchmark_id}": {"get"},
    "/admin/system": {"get"}, "/admin/webhooks": {"get"}, "/admin/webhooks/{delivery_id}/resend": {"post"},
    "/admin/audit": {"get"},
}
FORBIDDEN = {"input_snapshot", "result_payload", "text", "content", "answers", "avatar", "payload", "body", "cv_text",
             "message_text", "password", "token"}
VERBS = {"get", "post", "put", "patch", "delete"}


def _ref_name(ref):
    return ref.rsplit("/", 1)[1]


def _walk(node, seen, path):
    """Yield (path, property name) for every property of every schema reachable from node."""
    if isinstance(node, list):
        for child in node:
            yield from _walk(child, seen, path)
    elif isinstance(node, dict):
        ref = node.get("$ref")
        if ref and ref.startswith("#/components/schemas/"):
            name = _ref_name(ref)
            if name not in seen:
                seen.add(name)
                yield from _walk(SCHEMAS[name], seen, name)
        for key, child in node.items():
            if key == "properties":
                for prop, sub in child.items():
                    yield path, prop
                    yield from _walk(sub, seen, f"{path}.{prop}")
            elif key != "$ref":
                yield from _walk(child, seen, path)


def _admin_response_schemas():
    for path, ops in SPEC["paths"].items():
        if not path.startswith("/admin/"):
            continue
        for verb in VERBS & ops.keys():
            for code, response in ops[verb]["responses"].items():
                if code.startswith("2"):
                    yield from response.get("content", {}).items()


def test_every_admin_path_and_method_is_documented():
    admin = {path: VERBS & ops.keys() for path, ops in SPEC["paths"].items() if path.startswith("/admin/")}
    assert admin == EXPECTED
    for path, verbs in admin.items():
        for verb in verbs:
            op = SPEC["paths"][path][verb]
            assert op["tags"] == ["admin"]
            assert "403" in op["responses"], (path, verb)
    assert {"name": "admin"} in SPEC["tags"]


def test_admin_responses_never_expose_content_fields():
    seen: set[str] = set()
    found = []
    for _, media in _admin_response_schemas():
        found += [(where, prop) for where, prop in _walk(media.get("schema", {}), seen, "response") if prop in FORBIDDEN]
    assert not found
    assert seen  # the walk really reached schemas


def test_pydantic_views_match_yaml_schemas():
    admin = sorted(name for name in SCHEMAS if name.startswith("Admin"))
    assert admin
    for name in admin:
        model = getattr(contracts, name)
        assert set(model.model_fields) == set(SCHEMAS[name]["properties"]), name
        assert {f for f, info in model.model_fields.items() if info.is_required()} == set(SCHEMAS[name].get("required", [])), name
