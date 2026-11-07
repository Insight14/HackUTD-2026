"""FastAPI Endpoints for Tiger Data Time-Series Telemetry & Forecast Scorecards."""
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

from backend.app.integrations.tiger_data import tiger_data_adapter, TelemetryPoint
from backend.app.simulator.engine import AvonSimulator
from backend.app.api.simulator import simulator

router = APIRouter(prefix="/api/telemetry", tags=["Tiger Data Telemetry"])

class RecordForecastRequest(BaseModel):
    tank_id: str = "tank_a"
    predicted_level_bbl: float
    horizon_minutes: float = 15.0
    predicted_p10_minutes: Optional[float] = None
    predicted_p90_minutes: Optional[float] = None

@router.get("/status")
async def get_status():
    """Retrieve Tiger Data connection status and synthetic data labels."""
    return tiger_data_adapter.get_status()

@router.get("/history")
async def get_history(
    tank_id: str = "tank_a",
    minutes: int = Query(60, ge=1, le=1440),
    limit: int = Query(100, ge=1, le=1000),
):
    """Retrieve historical time-series points within a rolling minute window."""
    now = datetime.now(timezone.utc)
    start_t = now - timedelta(minutes=minutes)
    points = tiger_data_adapter.query_history(
        tank_id=tank_id,
        start_time=start_t,
        end_time=now,
        limit=limit,
    )
    return {
        "tank_id": tank_id,
        "window_minutes": minutes,
        "count": len(points),
        "synthetic_label": "SYNTHETIC_DATA_LABELED",
        "points": [p.model_dump() for p in points],
    }

@router.get("/flow-estimate")
async def get_flow_rate_estimation(
    tank_id: str = "tank_a",
    window_minutes: float = Query(15.0, ge=1.0, le=120.0),
):
    """Derive implied net flow rate from physical fluid level changes over time."""
    return tiger_data_adapter.estimate_flow_rate_from_level_changes(
        tank_id=tank_id,
        window_minutes=window_minutes,
    )

@router.get("/scorecard")
async def get_forecast_scorecard():
    """Retrieve forecast-versus-actual accuracy scorecard."""
    # Pass current simulator tank levels to update actuals
    state = simulator.step(dt_seconds=0.0)
    current_levels = {t.id: t.current_level_bbl for t in state.tanks}
    return tiger_data_adapter.update_actuals_and_scorecard(current_levels)

@router.get("/baselines")
async def get_baselines(
    tank_id: str = "tank_a",
    window_minutes: float = Query(60.0, ge=5.0, le=720.0),
):
    """Retrieve statistical moving baselines (mean & std dev) for flow and pressure."""
    return tiger_data_adapter.compute_baselines(tank_id=tank_id, window_minutes=window_minutes)

@router.post("/record-forecast")
async def record_forecast(request: RecordForecastRequest):
    """Record a forecast prediction into the time-series store for scorecard auditing."""
    return tiger_data_adapter.record_forecast_prediction(
        tank_id=request.tank_id,
        predicted_level_bbl=request.predicted_level_bbl,
        horizon_minutes=request.horizon_minutes,
        predicted_p10_minutes=request.predicted_p10_minutes,
        predicted_p90_minutes=request.predicted_p90_minutes,
    )

