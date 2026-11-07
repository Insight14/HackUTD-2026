"""Physical Simulator for the Avon Produced-Water System.

Implements fluid mass balance, pump flow curves, well curtailment, threshold checking,
and three-way sensor trust estimation with deterministic reproducibility.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
import numpy as np

from backend.app.simulator.models import (
    TankState,
    PumpState,
    WellState,
    PipelineState,
    DisposalState,
    SensorReadings,
    Alert,
    SystemState,
)

class AvonSimulator:
    """Configurable, deterministic simulator for produced-water gathering operations."""

    def __init__(self, config_data: Optional[Dict[str, Any]] = None, config_path: Optional[Path] = None, seed: int = 42):
        self.seed = seed
        self.rng = np.random.RandomState(self.seed)
        self.config_data = config_data or self._load_config(config_path)
        self._validate_config(self.config_data)

        # Simulation state
        self.simulation_time_seconds: float = 0.0
        self.dt_seconds: float = 5.0
        self.start_wall_clock = datetime.now(timezone.utc)

        # Physical system components
        self.tanks: Dict[str, Dict[str, Any]] = {}
        self.pumps: Dict[str, Dict[str, Any]] = {}
        self.wells: Dict[str, Dict[str, Any]] = {}
        self.pipelines: Dict[str, Dict[str, Any]] = {}
        self.disposal_facilities: Dict[str, Dict[str, Any]] = {}
        self.operating_costs: Dict[str, Any] = {}

        # Faults & sensor drift injection
        self.injected_pump_faults: Dict[str, str] = {}
        self.sensor_drifts: Dict[str, float] = {}
        self.vision_offline: bool = False
        self.inflow_multiplier: float = 1.0

        # Hardware-in-the-loop overrides
        self.hardware_overrides: Dict[str, Dict[str, Any]] = {}

        # Flow balance cumulative trackers for mass-balance sensor estimation
        self.flow_balance_levels: Dict[str, float] = {}

        # Alerts list
        self.alerts: List[Alert] = []

        # Initialize components from configuration
        self._initialize_from_config()

    def _load_config(self, config_path: Optional[Path]) -> Dict[str, Any]:
        if config_path is None:
            config_path = Path(__file__).resolve().parent.parent.parent.parent / "config" / "avon_system.json"
        if not config_path.exists():
            raise FileNotFoundError(f"Configuration file not found at: {config_path}")
        with open(config_path, "r") as f:
            return json.load(f)

    def _validate_config(self, config: Dict[str, Any]) -> None:
        """Validate system topology configuration for physical and mathematical consistency."""
        if "tanks" not in config or not config["tanks"]:
            raise ValueError("Configuration error: 'tanks' list cannot be empty.")
        if "pumps" not in config or not config["pumps"]:
            raise ValueError("Configuration error: 'pumps' list cannot be empty.")
        if "wells" not in config or not config["wells"]:
            raise ValueError("Configuration error: 'wells' list cannot be empty.")

        tank_ids = set()
        for tank in config["tanks"]:
            tid = tank.get("id")
            if not tid:
                raise ValueError("Configuration error: Tank missing 'id'.")
            if tid in tank_ids:
                raise ValueError(f"Configuration error: Duplicate tank ID '{tid}'.")
            tank_ids.add(tid)

            cap = tank.get("total_capacity_bbl", 0)
            high_high = tank.get("high_high_threshold_bbl", 0)
            high = tank.get("high_threshold_bbl", 0)
            initial = tank.get("initial_level_bbl", 0)

            if cap <= 0:
                raise ValueError(f"Tank '{tid}' capacity must be positive, got {cap}.")
            if high_high > cap:
                raise ValueError(f"Tank '{tid}' high_high_threshold ({high_high}) exceeds capacity ({cap}).")
            if high >= high_high:
                raise ValueError(f"Tank '{tid}' high_threshold ({high}) must be strictly less than high_high ({high_high}).")
            if initial < 0 or initial > cap:
                raise ValueError(f"Tank '{tid}' initial level ({initial}) is outside [0, {cap}].")

        for pump in config["pumps"]:
            pid = pump.get("id")
            tid = pump.get("tank_id")
            if not pid or not tid:
                raise ValueError("Configuration error: Pump missing 'id' or 'tank_id'.")
            if tid not in tank_ids:
                raise ValueError(f"Pump '{pid}' references non-existent tank '{tid}'.")
            if pump.get("rated_flow_bbl_per_hr", 0) <= 0:
                raise ValueError(f"Pump '{pid}' rated_flow_bbl_per_hr must be positive.")

        for well in config["wells"]:
            wid = well.get("id")
            tid = well.get("target_tank_id")
            if not wid or not tid:
                raise ValueError("Configuration error: Well missing 'id' or 'target_tank_id'.")
            if tid not in tank_ids:
                raise ValueError(f"Well '{wid}' references non-existent tank '{tid}'.")
            if well.get("water_rate_bbl_per_hr", 0) < 0:
                raise ValueError(f"Well '{wid}' water rate cannot be negative.")

    def _initialize_from_config(self) -> None:
        """Instantiate internal state tables from configuration."""
        self.tanks = {t["id"]: dict(t) for t in self.config_data["tanks"]}
        for t in self.tanks.values():
            t["current_level_bbl"] = float(t["initial_level_bbl"])
            t["inflow_bbl_per_hr"] = 0.0
            t["outflow_bbl_per_hr"] = 0.0
            self.flow_balance_levels[t["id"]] = float(t["initial_level_bbl"])

        self.pumps = {p["id"]: dict(p) for p in self.config_data["pumps"]}
        for p in self.pumps.values():
            p["status"] = p.get("initial_status", "STOPPED")
            p["actual_flow_bbl_per_hr"] = p["rated_flow_bbl_per_hr"] if p["status"] == "RUNNING" else 0.0
            p["discharge_pressure_psi"] = 85.0 if p["status"] == "RUNNING" else 0.0
            p["vibration_rms"] = 1.2 if p["status"] == "RUNNING" else 0.0

        self.wells = {w["id"]: dict(w) for w in self.config_data["wells"]}
        self.pipelines = {pipe["id"]: dict(pipe) for pipe in self.config_data.get("pipelines", [])}
        self.disposal_facilities = {d["id"]: dict(d) for d in self.config_data.get("disposal_facilities", [])}
        self.operating_costs = dict(self.config_data.get("operating_costs", {}))
        self.alerts = []

    def reset(self, seed: Optional[int] = None) -> None:
        """Reset simulator state to initial configuration with reproducible seed."""
        if seed is not None:
            self.seed = seed
        self.rng = np.random.RandomState(self.seed)
        self.simulation_time_seconds = 0.0
        self.injected_pump_faults.clear()
        self.sensor_drifts.clear()
        self.hardware_overrides.clear()
        self.vision_offline = False
        self.inflow_multiplier = 1.0
        self._initialize_from_config()

    # --- FAULT INJECTION & HARDWARE INTERFACES ---

    def inject_pump_failure(self, pump_id: str) -> None:
        """Simulate mechanical trip or failure of a transfer pump."""
        if pump_id not in self.pumps:
            raise ValueError(f"Unknown pump '{pump_id}'.")
        self.injected_pump_faults[pump_id] = "FAILED"
        self.pumps[pump_id]["status"] = "FAILED"
        self.pumps[pump_id]["actual_flow_bbl_per_hr"] = 0.0
        self.pumps[pump_id]["discharge_pressure_psi"] = 0.0
        self.pumps[pump_id]["vibration_rms"] = 0.0

        # Post alert
        self.alerts.append(
            Alert(
                id=f"alert_{int(self.simulation_time_seconds)}_{pump_id}",
                severity="CRITICAL",
                title=f"Pump Trip: {self.pumps[pump_id]['name']}",
                message=f"Zero discharge flow detected on pump {pump_id}. Inflow unmitigated.",
                pump_id=pump_id,
                created_at=datetime.now(timezone.utc).isoformat(),
            )
        )

    def restore_pump(self, pump_id: str, status: str = "RUNNING") -> None:
        """Restore pump to normal operating or standby state."""
        if pump_id in self.injected_pump_faults:
            del self.injected_pump_faults[pump_id]
        if pump_id in self.pumps:
            self.pumps[pump_id]["status"] = status
            if status == "RUNNING":
                self.pumps[pump_id]["actual_flow_bbl_per_hr"] = self.pumps[pump_id]["rated_flow_bbl_per_hr"]
                self.pumps[pump_id]["discharge_pressure_psi"] = 85.0
                self.pumps[pump_id]["vibration_rms"] = 1.2
            else:
                self.pumps[pump_id]["actual_flow_bbl_per_hr"] = 0.0
                self.pumps[pump_id]["discharge_pressure_psi"] = 0.0
                self.pumps[pump_id]["vibration_rms"] = 0.0

    def inject_sensor_drift(self, tank_id: str, drift_fraction: float) -> None:
        """Inject calibration drift or physical sensor fault into ultrasonic gauge."""
        if tank_id not in self.tanks:
            raise ValueError(f"Unknown tank '{tank_id}'.")
        self.sensor_drifts[tank_id] = drift_fraction

    def set_vision_offline(self, offline: bool = True) -> None:
        """Toggle computer vision camera service status."""
        self.vision_offline = offline

    def inject_inflow_surge(self, multiplier: float = 1.5) -> None:
        """Simulate upstream water-cut surge across producing wells."""
        self.inflow_multiplier = multiplier

    def set_hardware_reading(self, tank_id: str, ultrasonic_fraction: float, pump_status: Optional[str] = None) -> None:
        """Ingest live hardware reading from Arduino physical rig."""
        if tank_id not in self.tanks:
            raise ValueError(f"Unknown tank '{tank_id}'.")
        self.hardware_overrides[tank_id] = {
            "ultrasonic_fraction": ultrasonic_fraction,
            "pump_status": pump_status,
        }

    # --- PHYSICS ADVANCEMENT ---

    def step(self, dt_seconds: float = 5.0) -> SystemState:
        """Advance physical simulation forward by dt_seconds."""
        self.dt_seconds = dt_seconds
        self.simulation_time_seconds += dt_seconds

        # 1. Calculate Well Inflow per Tank
        tank_inflows: Dict[str, float] = {tid: 0.0 for tid in self.tanks}
        for well in self.wells.values():
            if well["status"] == "PRODUCING":
                base_rate = well["water_rate_bbl_per_hr"] * self.inflow_multiplier
                # Add small realistic production variation (+/- 2%)
                noise = self.rng.normal(0, 0.02 * base_rate)
                rate = max(0.0, base_rate + noise)
                tank_inflows[well["target_tank_id"]] += rate
            elif well["status"] == "CURTAILED":
                # Curtailed wells produce 50% less water
                base_rate = (well["water_rate_bbl_per_hr"] * 0.5) * self.inflow_multiplier
                tank_inflows[well["target_tank_id"]] += max(0.0, base_rate)

        # 2. Calculate Pump Outflow per Tank
        tank_outflows: Dict[str, float] = {tid: 0.0 for tid in self.tanks}
        for pump in self.pumps.values():
            pid = pump["id"]
            tid = pump["tank_id"]

            # If fault is injected, keep it failed
            if pid in self.injected_pump_faults:
                pump["status"] = self.injected_pump_faults[pid]
                pump["actual_flow_bbl_per_hr"] = 0.0
                pump["discharge_pressure_psi"] = 0.0
                pump["vibration_rms"] = 0.0
            elif pump["status"] == "RUNNING":
                rated = pump["rated_flow_bbl_per_hr"]
                # Normal operational jitter (+/- 1.5%)
                flow = max(0.0, rated + self.rng.normal(0, 0.015 * rated))
                pump["actual_flow_bbl_per_hr"] = round(flow, 2)
                pump["discharge_pressure_psi"] = round(85.0 + self.rng.normal(0, 1.0), 1)
                pump["vibration_rms"] = round(1.2 + abs(self.rng.normal(0, 0.05)), 2)
                tank_outflows[tid] += pump["actual_flow_bbl_per_hr"]
            else:
                pump["actual_flow_bbl_per_hr"] = 0.0
                pump["discharge_pressure_psi"] = 0.0
                pump["vibration_rms"] = 0.0

        # Check downstream pipeline flow constraint
        total_outflow = sum(tank_outflows.values())
        max_pipeline_capacity = sum(pipe["capacity_bbl_per_hr"] for pipe in self.pipelines.values())
        if max_pipeline_capacity > 0 and total_outflow > max_pipeline_capacity:
            # Throttle outflow proportionally
            throttle_ratio = max_pipeline_capacity / total_outflow
            for tid in tank_outflows:
                tank_outflows[tid] *= throttle_ratio

        # 3. Mass-Balance Fluid Update
        dt_hours = dt_seconds / 3600.0
        for tid, tank in self.tanks.items():
            inflow = tank_inflows[tid]
            outflow = tank_outflows[tid]
            net_rate = inflow - outflow

            tank["inflow_bbl_per_hr"] = round(inflow, 2)
            tank["outflow_bbl_per_hr"] = round(outflow, 2)
            tank["net_rate_bbl_per_hr"] = round(net_rate, 2)

            # Integrate true fluid volume
            new_level = tank["current_level_bbl"] + (net_rate * dt_hours)
            new_level = max(0.0, min(tank["total_capacity_bbl"], new_level))
            tank["current_level_bbl"] = round(new_level, 2)
            tank["fill_fraction"] = round(new_level / tank["total_capacity_bbl"], 4)

            # Integrate mass-balance estimate tracker
            self.flow_balance_levels[tid] += net_rate * dt_hours
            self.flow_balance_levels[tid] = max(0.0, min(tank["total_capacity_bbl"], self.flow_balance_levels[tid]))

            # Time to high-high calculation
            if net_rate > 0.1:
                remaining_bbl = tank["high_high_threshold_bbl"] - tank["current_level_bbl"]
                if remaining_bbl > 0:
                    time_mins = (remaining_bbl / net_rate) * 60.0
                    tank["time_to_high_high_minutes"] = round(time_mins, 1)
                else:
                    tank["time_to_high_high_minutes"] = 0.0
            else:
                tank["time_to_high_high_minutes"] = None

        # 4. Generate 3-Way Sensor Estimates
        sensor_readings: Dict[str, SensorReadings] = {}
        for tid, tank in self.tanks.items():
            true_fraction = tank["fill_fraction"]
            total_cap = tank["total_capacity_bbl"]

            # Estimate 1: Ultrasonic sensor (with noise + drift)
            noise_sigma = 0.005  # 0.5% sensor noise
            noise = self.rng.normal(0, noise_sigma)
            drift = self.sensor_drifts.get(tid, 0.0)
            ultrasonic_frac = max(0.0, min(1.0, true_fraction + noise + drift))

            # Hardware override if connected
            if tid in self.hardware_overrides:
                ultrasonic_frac = self.hardware_overrides[tid].get("ultrasonic_fraction", ultrasonic_frac)

            # Estimate 2: Optical Camera estimate
            if self.vision_offline:
                camera_frac = None
            else:
                cam_noise = self.rng.normal(0, 0.008)
                camera_frac = round(max(0.0, min(1.0, true_fraction + cam_noise)), 4)

            # Estimate 3: Flow balance estimate
            flow_frac = round(self.flow_balance_levels[tid] / total_cap, 4)

            # Trust Arbitration
            trust_status, suspect_sensor, confidence = self._evaluate_sensor_trust(
                ultrasonic_frac, camera_frac, flow_frac
            )

            sensor_readings[tid] = SensorReadings(
                tank_id=tid,
                ultrasonic_level_fraction=round(ultrasonic_frac, 4),
                camera_level_fraction=camera_frac,
                flow_balance_level_fraction=flow_frac,
                trust_status=trust_status,
                suspect_sensor=suspect_sensor,
                confidence_level=confidence,
            )

        # 5. Evaluate Overall System Status
        system_status = self._evaluate_system_status()

        return SystemState(
            timestamp=datetime.now(timezone.utc).isoformat(),
            simulation_time_minutes=round(self.simulation_time_seconds / 60.0, 2),
            status=system_status,
            tanks=[TankState(**t) for t in self.tanks.values()],
            pumps=[PumpState(**p) for p in self.pumps.values()],
            wells=[WellState(**w) for w in self.wells.values()],
            pipelines=[PipelineState(**pipe) for pipe in self.pipelines.values()],
            sensor_readings=sensor_readings,
            alerts=list(self.alerts[-10:]),  # Keep last 10 alerts
            total_inflow_bbl_per_hr=round(sum(tank_inflows.values()), 2),
            total_outflow_bbl_per_hr=round(sum(tank_outflows.values()), 2),
        )

    def _evaluate_sensor_trust(
        self,
        ultrasonic: float,
        camera: Optional[float],
        flow_balance: float,
        tolerance: float = 0.04,  # 4% deviation threshold
    ) -> tuple[str, Optional[str], str]:
        """Arbitrate between the 3 independent sensor estimates."""
        if camera is None:
            # Vision offline: compare ultrasonic and flow balance
            if abs(ultrasonic - flow_balance) <= tolerance:
                return "VISION_OFFLINE", None, "MEDIUM"
            else:
                return "VISION_OFFLINE", "ultrasonic", "LOW"

        diff_u_c = abs(ultrasonic - camera)
        diff_u_f = abs(ultrasonic - flow_balance)
        diff_c_f = abs(camera - flow_balance)

        if diff_u_c <= tolerance and diff_u_f <= tolerance and diff_c_f <= tolerance:
            return "THREE_WAY_AGREEMENT", None, "HIGH"

        # Check if camera and flow balance agree, but ultrasonic differs
        if diff_c_f <= tolerance and diff_u_c > tolerance and diff_u_f > tolerance:
            return "ODD_ONE_OUT", "ultrasonic", "MEDIUM"

        # Check if ultrasonic and flow agree, but camera differs
        if diff_u_f <= tolerance and diff_u_c > tolerance and diff_c_f > tolerance:
            return "ODD_ONE_OUT", "camera", "MEDIUM"

        # Check if ultrasonic and camera agree, but flow differs (e.g. unmetered line)
        if diff_u_c <= tolerance and diff_u_f > tolerance and diff_c_f > tolerance:
            return "ODD_ONE_OUT", "flow_balance", "MEDIUM"

        # All three disagree
        return "SPLIT_CONFIDENCE", "all", "LOW"

    def _evaluate_system_status(self) -> str:
        """Evaluate overall network operational status."""
        for t in self.tanks.values():
            if t["current_level_bbl"] >= t["high_high_threshold_bbl"]:
                return "FORCED_SHUTDOWN"
            if t["current_level_bbl"] >= t["high_threshold_bbl"]:
                return "HIGH_LEVEL_WARNING"

        # Check if any pump failed
        for p in self.pumps.values():
            if p["status"] == "FAILED":
                return "ACTION_NEEDED"

        return "NORMAL"
