"""Simulator REST and WebSocket API routes."""
import asyncio
import json
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from backend.app.simulator.engine import AvonSimulator
from backend.app.simulator.models import SystemState

router = APIRouter(prefix="/api/simulator", tags=["Simulator"])

# Singleton simulator instance for the application
simulator = AvonSimulator()

# Background tick loop task reference
_streaming_task: Optional[asyncio.Task] = None
_connected_websockets: set[WebSocket] = set()

class StepRequest(BaseModel):
    dt_seconds: float = 5.0

class ResetRequest(BaseModel):
    seed: Optional[int] = None

class PumpFaultRequest(BaseModel):
    pump_id: str

class PumpRestoreRequest(BaseModel):
    pump_id: str
    status: str = "RUNNING"

class SensorFaultRequest(BaseModel):
    tank_id: str
    drift_fraction: float

class SurgeFaultRequest(BaseModel):
    multiplier: float = 1.5

class HardwareIngestRequest(BaseModel):
    tank_id: str
    ultrasonic_fraction: float
    pump_status: Optional[str] = None

@router.get("/state", response_model=SystemState)
async def get_state():
    """Retrieve the current physical snapshot of the Avon system."""
    return simulator.step(dt_seconds=0.0)

@router.post("/step", response_model=SystemState)
async def step_simulation(request: StepRequest):
    """Advance the simulation forward by dt_seconds."""
    if request.dt_seconds < 0:
        raise HTTPException(status_code=400, detail="dt_seconds cannot be negative.")
    state = simulator.step(dt_seconds=request.dt_seconds)
    # Broadcast to any active websockets
    await broadcast_state(state)
    return state

@router.post("/reset", response_model=SystemState)
async def reset_simulation(request: ResetRequest):
    """Reset the simulator to initial configuration with reproducible seed."""
    simulator.reset(seed=request.seed)
    state = simulator.step(dt_seconds=0.0)
    await broadcast_state(state)
    return state

@router.post("/fault/pump", response_model=SystemState)
async def inject_pump_fault(request: PumpFaultRequest):
    """Trip or fail a transfer pump."""
    try:
        simulator.inject_pump_failure(request.pump_id)
        state = simulator.step(dt_seconds=0.0)
        await broadcast_state(state)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/fault/restore", response_model=SystemState)
async def restore_pump(request: PumpRestoreRequest):
    """Restore a failed or stopped pump."""
    try:
        simulator.restore_pump(request.pump_id, status=request.status)
        state = simulator.step(dt_seconds=0.0)
        await broadcast_state(state)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/fault/sensor", response_model=SystemState)
async def inject_sensor_drift(request: SensorFaultRequest):
    """Inject ultrasonic sensor calibration drift or foam interference."""
    try:
        simulator.inject_sensor_drift(request.tank_id, request.drift_fraction)
        state = simulator.step(dt_seconds=0.0)
        await broadcast_state(state)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/fault/surge", response_model=SystemState)
async def inject_inflow_surge(request: SurgeFaultRequest):
    """Inject upstream water-cut surge across producing wells."""
    simulator.inject_inflow_surge(request.multiplier)
    state = simulator.step(dt_seconds=0.0)
    await broadcast_state(state)
    return state

@router.post("/hardware/ingest", response_model=SystemState)
async def ingest_hardware_reading(request: HardwareIngestRequest):
    """Ingest live hardware reading from Arduino demonstration rig."""
    try:
        simulator.set_hardware_reading(
            tank_id=request.tank_id,
            ultrasonic_fraction=request.ultrasonic_fraction,
            pump_status=request.pump_status,
        )
        state = simulator.step(dt_seconds=0.0)
        await broadcast_state(state)
        return state
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

async def broadcast_state(state: SystemState):
    """Broadcast state to all connected WebSocket clients."""
    if not _connected_websockets:
        return
    payload = state.model_dump_json()
    disconnected = set()
    for ws in _connected_websockets:
        try:
            await ws.send_text(payload)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        _connected_websockets.discard(ws)

@router.websocket("/ws")
async def websocket_telemetry(websocket: WebSocket):
    """WebSocket endpoint for live 1 Hz telemetry streaming."""
    await websocket.accept()
    _connected_websockets.add(websocket)
    # Send initial state immediately
    initial_state = simulator.step(dt_seconds=0.0)
    await websocket.send_text(initial_state.model_dump_json())

    try:
        while True:
            # Keep connection open and receive optional client messages (pause, step, resume)
            data = await websocket.receive_text()
            try:
                cmd = json.loads(data)
                action = cmd.get("action")
                if action == "step":
                    dt = float(cmd.get("dt_seconds", 5.0))
                    state = simulator.step(dt_seconds=dt)
                    await broadcast_state(state)
                elif action == "reset":
                    simulator.reset(seed=cmd.get("seed"))
                    state = simulator.step(dt_seconds=0.0)
                    await broadcast_state(state)
                elif action == "pump_trip":
                    simulator.inject_pump_failure(cmd.get("pump_id", "p_1"))
                    state = simulator.step(dt_seconds=0.0)
                    await broadcast_state(state)
            except Exception as e:
                await websocket.send_text(json.dumps({"error": str(e)}))
    except WebSocketDisconnect:
        _connected_websockets.discard(websocket)
    except Exception:
        _connected_websockets.discard(websocket)
