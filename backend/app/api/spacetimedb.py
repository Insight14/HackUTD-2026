"""FastAPI Endpoints for SpacetimeDB Live Shared Operational State."""
import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from backend.app.integrations.spacetimedb import spacetimedb_adapter

router = APIRouter(prefix="/api/spacetimedb", tags=["SpacetimeDB"])

_connected_clients: set[WebSocket] = set()

class AckAlertRequest(BaseModel):
    alert_id: str
    user_name: str

class ApprovePlanRequest(BaseModel):
    plan_id: str
    operator_name: str

class ClaimActionRequest(BaseModel):
    action_id: str
    action_name: str
    claimed_by: str

class CompleteActionRequest(BaseModel):
    claim_id: str
    completed_by: str

class AddNoteRequest(BaseModel):
    title: str
    details: str
    category: str = "SHIFT_HANDOFF"
    user_name: str

class AcceptHandoffRequest(BaseModel):
    item_id: str
    accepted_by: str

class PresenceHeartbeatRequest(BaseModel):
    identity: str
    name: str
    role: str

@router.get("/state")
async def get_shared_state():
    """Retrieve the authoritative shared operational state from SpacetimeDB."""
    return spacetimedb_adapter.get_full_shared_state()

@router.post("/reducers/ack_alert")
async def ack_alert(request: AckAlertRequest):
    """Invoke ack_alert reducer."""
    try:
        alert = await spacetimedb_adapter.ack_alert(request.alert_id, request.user_name)
        await broadcast_state_change("alert_ack", alert.model_dump())
        return alert
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/reducers/approve_plan")
async def approve_plan(request: ApprovePlanRequest):
    """Invoke approve_plan reducer (HUMAN OPERATOR GATE)."""
    try:
        decision = await spacetimedb_adapter.approve_plan(request.plan_id, request.operator_name)
        await broadcast_state_change("plan_approved", decision.model_dump())
        return decision
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/reducers/claim_action")
async def claim_action(request: ClaimActionRequest):
    """Invoke claim_action reducer (DEDUPLICATION ENFORCED)."""
    try:
        claim = await spacetimedb_adapter.claim_action(request.action_id, request.action_name, request.claimed_by)
        await broadcast_state_change("action_claimed", claim.model_dump())
        return claim
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

@router.post("/reducers/complete_action")
async def complete_action(request: CompleteActionRequest):
    """Invoke complete_action reducer."""
    try:
        claim = await spacetimedb_adapter.complete_action(request.claim_id, request.completed_by)
        await broadcast_state_change("action_completed", claim.model_dump())
        return claim
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/reducers/add_note")
async def add_note(request: AddNoteRequest):
    """Invoke add_note reducer."""
    item = await spacetimedb_adapter.add_note(request.title, request.details, request.category, request.user_name)
    await broadcast_state_change("note_added", item.model_dump())
    return item

@router.post("/reducers/accept_handoff")
async def accept_handoff(request: AcceptHandoffRequest):
    """Invoke accept_handoff reducer."""
    try:
        item = await spacetimedb_adapter.accept_handoff(request.item_id, request.accepted_by)
        await broadcast_state_change("handoff_accepted", item.model_dump())
        return item
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/presence/heartbeat")
async def presence_heartbeat(request: PresenceHeartbeatRequest):
    """Heartbeat operator presence."""
    rec = await spacetimedb_adapter.update_presence(request.identity, request.name, request.role)
    await broadcast_state_change("presence_updated", rec.model_dump())
    return rec

async def broadcast_state_change(event_type: str, data: Any):
    """Notify all connected clients of state changes in real time."""
    if not _connected_clients:
        return
    full_state = spacetimedb_adapter.get_full_shared_state()
    message = json.dumps({"event": event_type, "data": data, "state": full_state})
    disconnected = set()
    for ws in _connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)
    for ws in disconnected:
        _connected_clients.discard(ws)

@router.websocket("/ws")
async def spacetimedb_realtime_ws(websocket: WebSocket):
    """WebSocket connection subscribing to live SpacetimeDB table updates."""
    await websocket.accept()
    _connected_clients.add(websocket)
    # Send full hydrated state on initial connect
    full_state = spacetimedb_adapter.get_full_shared_state()
    await websocket.send_text(json.dumps({"event": "initial_state", "state": full_state}))

    try:
        while True:
            text = await websocket.receive_text()
            # Process inbound messages if needed
            try:
                cmd = json.loads(text)
                action = cmd.get("action")
                if action == "claim_action":
                    await spacetimedb_adapter.claim_action(cmd["action_id"], cmd["action_name"], cmd["claimed_by"])
                    await broadcast_state_change("action_claimed", {})
                elif action == "approve_plan":
                    await spacetimedb_adapter.approve_plan(cmd["plan_id"], cmd["operator_name"])
                    await broadcast_state_change("plan_approved", {})
            except Exception as e:
                await websocket.send_text(json.dumps({"error": str(e)}))
    except WebSocketDisconnect:
        _connected_clients.discard(websocket)
    except Exception:
        _connected_clients.discard(websocket)

