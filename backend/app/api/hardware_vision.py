"""FastAPI Endpoints for Physical Demonstration Rig & OpenCV Vision Service."""
from typing import Optional, Tuple
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hardware.serial_bridge import arduino_bridge
from vision.camera_service import vision_service, VisionMeasurementResult

router = APIRouter(prefix="/api/hardware-vision", tags=["Hardware & Vision"])

class RelayActuationRequest(BaseModel):
    state: bool
    human_approved_token: str

class ProcessTestFrameRequest(BaseModel):
    target_fill_fraction: float = 0.41
    pump_led_on: bool = True

class CalibrationRequest(BaseModel):
    top_left: Tuple[int, int] = (50, 50)
    top_right: Tuple[int, int] = (450, 50)
    bottom_right: Tuple[int, int] = (450, 450)
    bottom_left: Tuple[int, int] = (50, 450)

@router.get("/hardware/status")
async def get_hardware_status():
    """Retrieve connection and telemetry status of the Arduino demonstration rig."""
    return arduino_bridge.get_status()

@router.post("/hardware/relay")
async def actuate_relay(request: RelayActuationRequest):
    """Actuate physical demonstration pump relay (STRICT HUMAN OPERATOR GATE)."""
    result = arduino_bridge.set_pump_relay(
        state=request.state,
        human_approved_token=request.human_approved_token,
    )
    if not result.get("success"):
        raise HTTPException(status_code=403, detail=result.get("error"))
    return result

@router.get("/vision/status", response_model=VisionMeasurementResult)
async def get_vision_measurement():
    """Query OpenCV vision service for live optical tank level and pump LED state."""
    return vision_service.process_frame()

@router.post("/vision/calibrate")
async def calibrate_vision_corners(request: CalibrationRequest):
    """Calibrate the 4 bounding perspective corners of the demonstration tank."""
    return vision_service.calibrate_corners(
        top_left=request.top_left,
        top_right=request.top_right,
        bottom_right=request.bottom_right,
        bottom_left=request.bottom_left,
    )

@router.post("/vision/process-test-frame", response_model=VisionMeasurementResult)
async def process_synthetic_test_frame(request: ProcessTestFrameRequest):
    """Generate and process a test image frame to verify optical segmentation and LED detection."""
    test_img = vision_service.generate_synthetic_test_frame(
        target_fill_fraction=request.target_fill_fraction,
        pump_led_on=request.pump_led_on,
    )
    return vision_service.process_frame(test_img)

