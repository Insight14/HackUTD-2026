"""Unit and Integration Tests for NVIDIA Nemotron Agent & Tool Execution."""
import pytest
from backend.app.agent.tools import TOOL_REGISTRY, execute_tool
from backend.app.agent.nemotron import nemotron_agent

def test_all_ten_tools_registered_and_executable():
    """Verify all 10 tools required by the product plan are implemented and execute cleanly."""
    expected_tools = [
        "get_state",
        "diagnose",
        "forecast",
        "list_options",
        "evaluate_plan",
        "search_runbooks",
        "similar_incidents",
        "get_history",
        "draft_handoff",
        "camera_second_opinion",
    ]

    for tool_name in expected_tools:
        assert tool_name in TOOL_REGISTRY, f"Missing required tool: {tool_name}"
        record = execute_tool(tool_name)
        assert record.success is True, f"Tool {tool_name} failed: {record.error}"
        assert isinstance(record.output, dict), f"Tool {tool_name} did not return a dictionary"

def test_mongodb_runbooks_and_similar_incidents():
    """Verify MongoDB context searches return relevant SOPs and precedent cases."""
    rb_res = execute_tool("search_runbooks", query="pump failure")
    assert len(rb_res.output["runbooks"]) > 0
    assert "SOP-PW-101" in rb_res.output["runbooks"][0]["title"]

    inc_res = execute_tool("similar_incidents", query="March pump failure")
    assert len(inc_res.output["incidents"]) > 0
    assert "March 14" in inc_res.output["incidents"][0]["summary"] or "Pump P-1" in inc_res.output["incidents"][0]["summary"]

def test_nemotron_explanation_and_chip_linking():
    """Verify the agent generates grounded explanation and cites verified tool chips."""
    response = nemotron_agent.explain_incident()

    # Plain language explanation must cite tool chips
    assert len(response.plain_language_explanation) > 100
    assert "[chip:get_state]" in response.plain_language_explanation
    assert "[chip:diagnose]" in response.plain_language_explanation
    assert "[chip:forecast]" in response.plain_language_explanation
    assert "[chip:evaluate_plan]" in response.plain_language_explanation

    # Every chip must carry verified numerical values
    assert len(response.cited_tool_chips) >= 8
    chip_tools = {c.tool_name for c in response.cited_tool_chips}
    assert "get_state" in chip_tools
    assert "diagnose" in chip_tools
    assert "forecast" in chip_tools
    assert "evaluate_plan" in chip_tools

    # Tool trace must capture the multi-step reasoning
    assert len(response.tool_execution_trace) >= 5

def test_agent_safety_invariant_enforcement():
    """Verify safety invariant: agent cannot approve plans or actuate hardware."""
    response = nemotron_agent.explain_incident()
    assert response.safety_boundary_enforced is True
    assert response.can_approve_or_actuate is False
    assert "Safety Boundary" in response.plain_language_explanation

def test_honest_tool_failure_handling():
    """Verify calling an unknown tool reports honest failure without guessing."""
    rec = execute_tool("nonexistent_telepathy_tool")
    assert rec.success is False
    assert "not in the approved tool catalog" in rec.error

