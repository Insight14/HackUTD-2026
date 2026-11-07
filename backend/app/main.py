"""FastAPI Backend Entrypoint for Tidewatch."""
import json
import asyncio
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.config import settings
from backend.app.api.simulator import router as simulator_router, simulator, broadcast_state
from backend.app.api.spacetimedb import router as spacetimedb_router
from backend.app.api.decision_engine import router as engine_router



_background_ticker_task = None

async def _simulation_tick_loop():
    """Background ticker advancing simulation time every second."""
    try:
        while True:
            await asyncio.sleep(1.0)
            state = simulator.step(dt_seconds=1.0)
            await broadcast_state(state)
    except asyncio.CancelledError:
        pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _background_ticker_task
    print(f"Starting {settings.app_name} in {settings.environment} mode.")
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

