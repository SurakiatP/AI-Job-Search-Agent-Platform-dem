"""Every direct skill is exposed exactly once on REST, MCP and the public A2A card."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from job_search_platform.api.a2a import _agent_card
from job_search_platform.api.mcp import create_mcp_server
from job_search_platform.api.rest import router
from job_search_platform.services.skills import SKILLS

DIRECT = [s for s in SKILLS if s.kind == "direct"]


def test_direct_skills_have_one_rest_route_one_mcp_tool_one_card_entry():
    assert DIRECT
    tools = [t.name for t in asyncio.run(create_mcp_server(SimpleNamespace(sessions=None, grants=None)).list_tools())]
    card = [s.id for s in _agent_card("http://x", SKILLS).skills]
    for skill in DIRECT:
        path = f"/projects/{{project_id}}/agent/{skill.id.replace('_', '/')}"
        routes = [r for r in router.routes if r.path == path]
        assert len(routes) == 1 and routes[0].methods == {"POST"} and routes[0].operation_id == skill.id
        assert tools.count(skill.id) == 1 and card.count(skill.id) == 1
