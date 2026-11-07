"""FastAPI Backend Entrypoint for Tidewatch."""
import json
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.config import settings
from backend.app.api.simulator import router as simulator_router, simulator, broadcast_state
from backend.app.api.spacetimedb import router as spacetimedb_router
from backend.app.api.decision_engine import router as engine_router
from backend.app.api.tiger_data import router as telemetry_router
from backend.app.api.agent import router as agent_router
from backend.app.api.hardware_vision import router as hardware_vision_router
from backend.app.api.scenarios import router as scenarios_router
from fastapi.staticfiles import StaticFiles
from backend.app.integrations.tiger_data import tiger_data_adapter, TelemetryPoint
from backend.app.integrations.mongodb_context import mongodb_adapter



_background_ticker_task = None

async def _simulation_tick_loop():
    """Background ticker advancing simulation time and ingesting time-series telemetry."""
    try:
        while True:
            await asyncio.sleep(1.0)
            state = simulator.step(dt_seconds=1.0)
            await broadcast_state(state)

            # Ingest live telemetry into Tiger Data store
            tank_a = next((t for t in state.tanks if t.id == "tank_a"), None)
            p1 = next((p for p in state.pumps if p.id == "p_1"), None)
            if tank_a and p1:
                tiger_data_adapter.ingest_telemetry(
                    TelemetryPoint(
                        timestamp=datetime.now(timezone.utc),
                        tank_id="tank_a",
                        level_bbl=tank_a.current_level_bbl,
                        fill_fraction=tank_a.fill_fraction,
                        inflow_bbl_per_hr=tank_a.inflow_bbl_per_hr,
                        outflow_bbl_per_hr=tank_a.outflow_bbl_per_hr,
                        net_rate_bbl_per_hr=tank_a.net_rate_bbl_per_hr,
                        pump_id="p_1",
                        pump_status=p1.status,
                        pump_discharge_psi=p1.discharge_pressure_psi,
                        pump_vibration_rms=p1.vibration_rms,
                        is_synthetic=True,
                    )
                )
    except asyncio.CancelledError:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _background_ticker_task
    print(f"Starting {settings.app_name} in {settings.environment} mode.")
    # Initialize Tiger Data time-series connection
    await tiger_data_adapter.connect()
    # Initialize MongoDB context and SOP collection connection
    await mongodb_adapter.connect()
    _background_ticker_task = asyncio.create_task(_simulation_tick_loop())
    yield
    if _background_ticker_task:
        _background_ticker_task.cancel()
    print("Shutting down Tidewatch backend.")

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Real-time AI-assisted decision console for produced-water operations",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(simulator_router)
app.include_router(spacetimedb_router)
app.include_router(engine_router)
app.include_router(telemetry_router)
app.include_router(agent_router)
app.include_router(hardware_vision_router)
app.include_router(scenarios_router)







@app.get("/api/health")
async def health_check():
    """Health check endpoint reporting integration status."""
    return {
        "status": "healthy",
        "service": settings.app_name,
        "environment": settings.environment,
        "integrations": {
            "spacetimedb": {"uri": settings.spacetimedb_uri, "database": settings.spacetimedb_database},
            "tiger_data": {"enabled": settings.tiger_data_enabled},
            "nvidia_nemotron": {"enabled": settings.nvidia_enabled},
            "mongodb": {"enabled": settings.mongodb_enabled},
        },
    }

@app.get("/api/config/topology")
async def get_topology():
    """Retrieve the authoritative Avon system physical topology and parameters."""
    if not settings.topology_config_path.exists():
        return {"error": "Topology configuration file not found"}
    with open(settings.topology_config_path, "r") as f:
        return json.load(f)

# Mount production frontend build if available
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


