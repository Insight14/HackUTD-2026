"""Data models for the Avon Produced-Water System Simulator."""
from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field

class TankState(BaseModel):
    id: str
    name: str
    total_capacity_bbl: float = Field(..., gt=0)
    working_capacity_bbl: float = Field(..., gt=0)
    high_high_threshold_bbl: float = Field(..., gt=0)
    high_threshold_bbl: float = Field(..., gt=0)
    current_level_bbl: float = Field(..., ge=0)
    fill_fraction: float = Field(..., ge=0.0, le=1.5)
    surface_area_sq_ft: float = Field(..., gt=0)
    inflow_bbl_per_hr: float = 0.0
    outflow_bbl_per_hr: float = 0.0
    net_rate_bbl_per_hr: float = 0.0
    time_to_high_high_minutes: Optional[float] = None
    is_hardware_node: bool = False

class PumpState(BaseModel):
    id: str
    name: str
    tank_id: str
    rated_flow_bbl_per_hr: float = Field(..., gt=0)
    actual_flow_bbl_per_hr: float = 0.0
    is_standby: bool = False
    status: Literal["RUNNING", "STOPPED", "FAILED", "STANDBY"] = "STOPPED"
    discharge_pressure_psi: float = 0.0
    vibration_rms: float = 0.0
    power_kw: float = 0.0

class WellState(BaseModel):
    id: str
    name: str
    target_tank_id: str
    water_rate_bbl_per_hr: float = Field(..., ge=0)
    oil_margin_per_bbl_water: float = 0.0
    status: Literal["PRODUCING", "CURTAILED", "SHUT_IN"] = "PRODUCING"

class PipelineState(BaseModel):
    id: str
    source_tank_id: str
    destination: str
    capacity_bbl_per_hr: float = Field(..., gt=0)
    normal_backpressure_psi: float = 0.0
    current_flow_bbl_per_hr: float = 0.0

class DisposalState(BaseModel):
    id: str
    name: str
    max_intake_bbl_per_hr: float = Field(..., gt=0)
    current_intake_bbl_per_hr: float = 0.0
    cost_per_bbl: float = 0.0

class SensorReadings(BaseModel):
    tank_id: str
    ultrasonic_level_fraction: float
    camera_level_fraction: Optional[float] = None
    flow_balance_level_fraction: float
    trust_status: Literal["THREE_WAY_AGREEMENT", "ODD_ONE_OUT", "SPLIT_CONFIDENCE", "VISION_OFFLINE"]
    suspect_sensor: Optional[str] = None
    confidence_level: Literal["HIGH", "MEDIUM", "LOW"] = "HIGH"

class Alert(BaseModel):
    id: str
    severity: Literal["INFO", "WARNING", "CRITICAL"]
    title: str
    message: str
    tank_id: Optional[str] = None
    pump_id: Optional[str] = None
    created_at: str
    acknowledged: bool = False

class SystemState(BaseModel):
    timestamp: str
    simulation_time_minutes: float
    status: Literal["NORMAL", "ACTION_NEEDED", "HIGH_LEVEL_WARNING", "FORCED_SHUTDOWN"]
    tanks: List[TankState]
    pumps: List[PumpState]
    wells: List[WellState]
    pipelines: List[PipelineState]
    sensor_readings: Dict[str, SensorReadings]
    alerts: List[Alert]
    total_inflow_bbl_per_hr: float
    total_outflow_bbl_per_hr: float
    synthetic_label: str = "SYNTHETIC_DATA_LABELED"

