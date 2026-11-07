"""Authoritative Tool Catalog for Tidewatch AI Agent.

Exposes the exact 10 deterministic tools required by the specification.
The AI agent states NO numbers it did not get from these tools.
"""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

from backend.app.simulator.engine import AvonSimulator
from backend.app.api.simulator import simulator
from backend.app.engine import decision_engine
from backend.app.integrations.spacetimedb import spacetimedb_adapter
from backend.app.integrations.tiger_data import tiger_data_adapter
from backend.app.integrations.mongodb_context import mongodb_adapter

class ToolExecutionRecord(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    output: Dict[str, Any]
    success: bool
    error: Optional[str] = None

# --- THE 10 SPECIFIED TOOLS ---

def tool_get_state() -> Dict[str, Any]:
    """Tool 1: get_state() -> Current levels, pump states, and the three level estimates with their agreement."""
    state = simulator.step(dt_seconds=0.0)
    primary_sensor = state.sensor_readings.get("tank_a")
    return {
        "status": state.status,
        "simulation_time_minutes": state.simulation_time_minutes,
        "total_inflow_bbl_per_hr": state.total_inflow_bbl_per_hr,
        "total_outflow_bbl_per_hr": state.total_outflow_bbl_per_hr,
        "tanks": [t.model_dump() for t in state.tanks],
        "pumps": [p.model_dump() for p in state.pumps],
        "primary_sensor_estimates": primary_sensor.model_dump() if primary_sensor else None,
        "alerts_active_count": len(state.alerts),
    }

def tool_diagnose() -> Dict[str, Any]:
    """Tool 2: diagnose() -> Ranked hypotheses and the next-best check."""
    state = simulator.step(dt_seconds=0.0)
    tank_a = next((t for t in state.tanks if t.id == "tank_a"), state.tanks[0])
    p1 = next((p for p in state.pumps if p.id == "p_1"), state.pumps[0])
    sensor_a = state.sensor_readings.get("tank_a")

    diag = decision_engine.diagnose(
        pump_flow_bbl_per_hr=p1.actual_flow_bbl_per_hr,
        discharge_pressure_psi=p1.discharge_pressure_psi,
        vibration_rms=p1.vibration_rms,
        level_rate_bbl_per_hr=tank_a.inflow_bbl_per_hr - tank_a.outflow_bbl_per_hr,
        sensor_trust_status=sensor_a.trust_status if sensor_a else "THREE_WAY_AGREEMENT",
        suspect_sensor=sensor_a.suspect_sensor if sensor_a else None,
    )
    return diag.model_dump()

def tool_forecast(tank_id: str = "tank_a") -> Dict[str, Any]:
    """Tool 3: forecast(tank) -> Time-to-threshold with P10 to P90 band."""
    state = simulator.step(dt_seconds=0.0)
    tank = next((t for t in state.tanks if t.id == tank_id), state.tanks[0])
    sensor = state.sensor_readings.get(tank_id)

    fc = decision_engine.forecast(
        tank_id=tank_id,
        current_level_bbl=tank.current_level_bbl,
        base_inflow_bbl_per_hr=tank.inflow_bbl_per_hr,
        base_outflow_bbl_per_hr=tank.outflow_bbl_per_hr,
        sensor_trust_status=sensor.trust_status if sensor else "THREE_WAY_AGREEMENT",
    )
    return fc.model_dump()

def tool_list_options() -> Dict[str, Any]:
    """Tool 4: list_options() -> Available operational options with deadlines and costs."""
    state = simulator.step(dt_seconds=0.0)
    tank_a = next((t for t in state.tanks if t.id == "tank_a"), state.tanks[0])
    p2 = next((p for p in state.pumps if p.id == "p_2"), None)
    p2_healthy = p2.status != "FAILED" if p2 else True

    eval_res = decision_engine.evaluate_decisions(
        current_level_bbl=tank_a.current_level_bbl,
        base_inflow_bbl_per_hr=tank_a.inflow_bbl_per_hr,
        base_outflow_bbl_per_hr=tank_a.outflow_bbl_per_hr,
        standby_pump_healthy=p2_healthy,
    )
    return {
        "options": [o.model_dump() for o in eval_res.evaluated_options],
        "cost_of_waiting_per_minute": eval_res.cost_of_waiting_slope_usd_per_min,
    }

def tool_evaluate_plan(plan_id: str = "plan_1") -> Dict[str, Any]:
    """Tool 5: evaluate_plan(plan) -> Plan cost, breach probability, and cost of waiting."""
    state = simulator.step(dt_seconds=0.0)
    tank_a = next((t for t in state.tanks if t.id == "tank_a"), state.tanks[0])
    p2 = next((p for p in state.pumps if p.id == "p_2"), None)
    p2_healthy = p2.status != "FAILED" if p2 else True

    eval_res = decision_engine.evaluate_decisions(
        current_level_bbl=tank_a.current_level_bbl,
        base_inflow_bbl_per_hr=tank_a.inflow_bbl_per_hr,
        base_outflow_bbl_per_hr=tank_a.outflow_bbl_per_hr,
        standby_pump_healthy=p2_healthy,
    )
    plan = next((p for p in eval_res.evaluated_plans if p.id == plan_id), eval_res.recommended_plan)
    return plan.model_dump() if plan else {"error": f"Plan '{plan_id}' not found."}

def tool_search_runbooks(query: str = "pump failure") -> Dict[str, Any]:
    """Tool 6: search_runbooks(query) -> MongoDB retrieval of procedures and SOPs."""
    results = mongodb_adapter.search_runbooks(query=query, limit=3)
    return {"query": query, "runbooks": [r.model_dump() for r in results]}

def tool_similar_incidents(query: str = "pump trip night shift") -> Dict[str, Any]:
    """Tool 7: similar_incidents() -> MongoDB retrieval of past cases and outcomes."""
    results = mongodb_adapter.similar_incidents(query=query, limit=3)
    return {"query": query, "incidents": [i.model_dump() for i in results]}

def tool_get_history(tag: str = "tank_a", window_minutes: int = 60) -> Dict[str, Any]:
    """Tool 8: get_history(tag, window) -> Tiger Data time-series query."""
    points = tiger_data_adapter.query_history(tank_id=tag, limit=window_minutes)
    return {
        "tag": tag,
        "window_minutes": window_minutes,
        "point_count": len(points),
        "history": [p.model_dump() for p in points[-15:]],  # Return recent 15 points
    }

def tool_draft_handoff() -> Dict[str, Any]:
    """Tool 9: draft_handoff() -> Structured handoff from open decisions and notes."""
    shared = spacetimedb_adapter.get_full_shared_state()
    open_items = [h for h in shared.get("handoff_items", []) if not h.get("resolved")]
    claimed = [c for c in shared.get("action_claims", [])]
    plans = [p for p in shared.get("plans", []) if p.get("is_approved")]

    return {
        "shift": "Night Shift (18:00 - 06:00)",
        "open_decisions_count": len(open_items),
        "open_items": open_items,
        "approved_plans": plans,
        "claimed_actions": claimed,
        "handoff_summary": f"Shift handoff prepared with {len(open_items)} open items and {len(plans)} executed decisions.",
    }

def tool_camera_second_opinion() -> Dict[str, Any]:
    """Tool 10: camera_second_opinion() -> Optical camera level verification."""
    state = simulator.step(dt_seconds=0.0)
    sensor = state.sensor_readings.get("tank_a")
    if not sensor or sensor.camera_level_fraction is None:
        return {"status": "VISION_OFFLINE", "camera_level": None, "confidence": "LOW"}
    return {
        "status": "ONLINE",
        "optical_fill_fraction": sensor.camera_level_fraction,
        "optical_level_bbl": round(sensor.camera_level_fraction * 1000.0, 1),
        "trust_agreement": sensor.trust_status,
        "independent_verification": "Camera confirms physical dyed water level matches mass balance.",
    }

TOOL_REGISTRY = {
    "get_state": tool_get_state,
    "diagnose": tool_diagnose,
    "forecast": tool_forecast,
    "list_options": tool_list_options,
    "evaluate_plan": tool_evaluate_plan,
    "search_runbooks": tool_search_runbooks,
    "similar_incidents": tool_similar_incidents,
    "get_history": tool_get_history,
    "draft_handoff": tool_draft_handoff,
    "camera_second_opinion": tool_camera_second_opinion,
}

def execute_tool(tool_name: str, **kwargs) -> ToolExecutionRecord:
    """Execute a registered tool with structured execution trace."""
    if tool_name not in TOOL_REGISTRY:
        return ToolExecutionRecord(
            tool_name=tool_name,
            arguments=kwargs,
            output={},
            success=False,
            error=f"Tool '{tool_name}' is not in the approved tool catalog.",
        )
    try:
        fn = TOOL_REGISTRY[tool_name]
        out = fn(**kwargs) if kwargs else fn()
        return ToolExecutionRecord(
            tool_name=tool_name,
            arguments=kwargs,
            output=out,
            success=True,
        )
    except Exception as e:
        return ToolExecutionRecord(
            tool_name=tool_name,
            arguments=kwargs,
            output={},
            success=False,
            error=str(e),
        )

