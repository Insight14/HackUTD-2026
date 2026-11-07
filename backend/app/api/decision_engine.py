"""FastAPI Endpoints for Deterministic Decision Engine."""
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app.engine import decision_engine
from backend.app.simulator.engine import AvonSimulator
from backend.app.api.simulator import simulator

router = APIRouter(prefix="/api/engine", tags=["Decision Engine"])

class ForecastRequest(BaseModel):
    tank_id: str = "tank_a"
    current_level_bbl: float = 410.0
    base_inflow_bbl_per_hr: float = 125.0
    base_outflow_bbl_per_hr: float = 0.0
    sensor_trust_status: str = "THREE_WAY_AGREEMENT"
    horizon_minutes: float = 120.0
    seed: int = 42

class DiagnoseRequest(BaseModel):
    pump_flow_bbl_per_hr: float = 0.0
    discharge_pressure_psi: float = 0.0
    vibration_rms: float = 0.0
    level_rate_bbl_per_hr: float = 125.0
    sensor_trust_status: str = "THREE_WAY_AGREEMENT"
    suspect_sensor: Optional[str] = None

class EvaluateRequest(BaseModel):
    current_level_bbl: float = 410.0
    base_inflow_bbl_per_hr: float = 125.0
    base_outflow_bbl_per_hr: float = 0.0
    standby_pump_healthy: bool = True
    sensor_trust_status: str = "THREE_WAY_AGREEMENT"
    risk_limit: float = 0.05

@router.post("/forecast")
async def run_forecast(request: ForecastRequest):
    """Run Monte Carlo simulation to compute P10-P90 time-to-threshold bands."""
    return decision_engine.forecast(
        tank_id=request.tank_id,
        current_level_bbl=request.current_level_bbl,
        base_inflow_bbl_per_hr=request.base_inflow_bbl_per_hr,
        base_outflow_bbl_per_hr=request.base_outflow_bbl_per_hr,
        sensor_trust_status=request.sensor_trust_status,
        horizon_minutes=request.horizon_minutes,
        seed=request.seed,
    )

@router.post("/diagnose")
async def run_diagnosis(request: DiagnoseRequest):
    """Execute Naive-Bayes fault classifier with Shannon Information Gain."""
    return decision_engine.diagnose(
        pump_flow_bbl_per_hr=request.pump_flow_bbl_per_hr,
        discharge_pressure_psi=request.discharge_pressure_psi,
        vibration_rms=request.vibration_rms,
        level_rate_bbl_per_hr=request.level_rate_bbl_per_hr,
        sensor_trust_status=request.sensor_trust_status,
        suspect_sensor=request.suspect_sensor,
    )

@router.post("/evaluate")
async def evaluate_decisions(request: EvaluateRequest):
    """Enumerate response plans and compute bisection deadlines and cost of waiting."""
    return decision_engine.evaluate_decisions(
        current_level_bbl=request.current_level_bbl,
        base_inflow_bbl_per_hr=request.base_inflow_bbl_per_hr,
        base_outflow_bbl_per_hr=request.base_outflow_bbl_per_hr,
        standby_pump_healthy=request.standby_pump_healthy,
        sensor_trust_status=request.sensor_trust_status,
        risk_limit=request.risk_limit,
    )

@router.post("/run-cycle")
async def run_engine_cycle():
    """Run full decision engine cycle against live simulator state and sync to SpacetimeDB."""
    state = simulator.step(dt_seconds=0.0)
    return decision_engine.run_full_engine_cycle(state.model_dump(), sync_to_spacetimedb=True)
