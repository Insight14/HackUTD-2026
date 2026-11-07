"""Scripted Incident Scenarios for Demonstrating Produced-Water Decision Support.

Implements the 5 canonical operational scenarios defined in the Tidewatch specification:
1. Primary pump trip at night.
2. Downstream line restriction resembling pump degradation.
3. Sensor drift / foam false alarm with 3-way arbitration.
4. Upstream water-cut surge requiring value-ranked curtailment.
5. Compound failure with standby equipment under scheduled maintenance.
"""
from typing import Dict, List, Any, Optional
from pydantic import BaseModel

from backend.app.simulator.engine import AvonSimulator
from backend.app.engine import decision_engine

class ScenarioDefinition(BaseModel):
    id: str
    scenario_number: int
    title: str
    subtitle: str
    description: str
    expected_diagnosis: str
    expected_action: str
    key_metrics_highlight: str
    initial_conditions: Dict[str, Any]

SCENARIO_CATALOG: Dict[str, ScenarioDefinition] = {
    "scenario_1_pump_trip": ScenarioDefinition(
        id="scenario_1_pump_trip",
        scenario_number=1,
        title="Overnight Primary Pump Trip",
        subtitle="Unmitigated Inflow & Standby Start Deadline",
        description="Transfer pump P-1 trips mechanically at 02:15 AM while operating under normal 120 bbl/hr inflow. Outflow halts completely. Level begins rising toward High-High 95% threshold (~72 minutes to breach).",
        expected_diagnosis="Transfer Pump P-1 Failed / Tripped (Confidence > 90%)",
        expected_action="Approve Plan: Start Standby Transfer Pump (P-2) within 58-minute deadline",
        key_metrics_highlight="Deadline: 58 min | Plan Cost: $295 | Avoided Shutdown: $25,000",
        initial_conditions={"p_1": "FAILED", "p_2": "STOPPED", "inflow_mult": 1.0},
    ),
    "scenario_2_line_restriction": ScenarioDefinition(
        id="scenario_2_line_restriction",
        scenario_number=2,
        title="Downstream Line Restriction",
        subtitle="Differential Diagnosis vs Pump Degradation",
        description="Downstream pipeline header valve is partially choked, restricting capacity by 50%. Outflow drops to 60 bbl/hr, but P-1 remains running with backpressure spiking to ~128 psi. System differentiates line restriction from pump trip.",
        expected_diagnosis="Discharge Pipeline Blocked / Valve Closed (Confidence > 80%)",
        expected_action="Dispatch Field Tech: Inspect Pipeline Header Block Valve ($35, 10 min)",
        key_metrics_highlight="Discharge Pressure: 128 psi | High Information Gain | Eliminates False Overhaul",
        initial_conditions={"p_1": "RUNNING", "restriction": 0.5},
    ),
    "scenario_3_sensor_drift": ScenarioDefinition(
        id="scenario_3_sensor_drift",
        scenario_number=3,
        title="Sensor Drift / Foam False Alarm",
        subtitle="3-Way Sensor Trust Arbitration & Uncertainty Spread",
        description="Ultrasonic level gauge on Tank A drifts upward by +25% due to surface foaming, triggering a false High alarm (88%). True fluid level is 46%. Optical camera and mass balance agree, isolating the ultrasonic gauge.",
        expected_diagnosis="Sensor Fault / Calibration Drift (ODD_ONE_OUT: Ultrasonic)",
        expected_action="Dispatch Field Tech: Hand-Gauge Tank A with Innage Tape (SOP-PW-305, $40)",
        key_metrics_highlight="Sensor Trust: ODD_ONE_OUT | True Level: 46% vs Ultrasonic: 88% | Prevents False Curtailment",
        initial_conditions={"p_1": "RUNNING", "sensor_drift": 0.25},
    ),
    "scenario_4_water_cut_surge": ScenarioDefinition(
        id="scenario_4_water_cut_surge",
        scenario_number=4,
        title="Upstream Water-Cut Surge",
        subtitle="Capacity Deficit & Value-Ranked Well Curtailment",
        description="Produced water inflow surges by +60% to 192 bbl/hr due to pad fracturing flowback. Inflow exceeds single-pump capacity (120 bbl/hr). System performs economic optimization across producing wells.",
        expected_diagnosis="Upstream Inflow Surge / Water Breakthrough (Confidence > 85%)",
        expected_action="Approve Curtailment: Curtail W-12 ($5.40/bbl) and W-7 ($8.20/bbl); Preserve W-1 ($32.50/bbl)",
        key_metrics_highlight="Inflow: 192 bbl/hr | Curtailment Saves $1,280/hr Deferred Oil Revenue",
        initial_conditions={"p_1": "RUNNING", "inflow_mult": 1.6},
    ),
    "scenario_5_maintenance_contention": ScenarioDefinition(
        id="scenario_5_maintenance_contention",
        scenario_number=5,
        title="Compound Failure & Maintenance Contention",
        subtitle="Standby Unavailable, Truck Hauling & Live Countdown",
        description="Primary pump P-1 trips while standby pump P-2 is tagged out for scheduled overhaul (MAINTENANCE). With no mechanical standby available, system evaluates combined truck hauling and well curtailment with lead-time countdown.",
        expected_diagnosis="Pump P-1 Failed & Standby P-2 Unavailable (Maintenance Contention)",
        expected_action="Approve Combined Plan: Dispatch Emergency Trucks + Curtail Wells W-12/W-7",
        key_metrics_highlight="Standby P-2: MAINTENANCE | Truck Lead Time: 60 min | Cost of Waiting: $52/min",
        initial_conditions={"p_1": "FAILED", "p_2": "MAINTENANCE", "inflow_mult": 1.0},
    ),
}

class ScenarioRunner:
    """Manages scenario lifecycle, physics setup, and automated decision-engine evaluation."""

    def __init__(self, simulator: AvonSimulator):
        self.simulator = simulator
        self.active_scenario_id: Optional[str] = None

    def list_scenarios(self) -> List[ScenarioDefinition]:
        return list(SCENARIO_CATALOG.values())

    def get_scenario(self, scenario_id: str) -> Optional[ScenarioDefinition]:
        return SCENARIO_CATALOG.get(scenario_id)

    def activate_scenario(self, scenario_id: str) -> Dict[str, Any]:
        """Apply initial conditions and inject operational events for the selected scenario."""
        if scenario_id not in SCENARIO_CATALOG:
            raise ValueError(f"Unknown scenario ID '{scenario_id}'.")

        defn = SCENARIO_CATALOG[scenario_id]
        self.active_scenario_id = scenario_id

        # 1. Reset simulator to clean baseline
        self.simulator.reset(seed=42)

        # 2. Configure according to scenario definition
        if scenario_id == "scenario_1_pump_trip":
            # Normal start, then P-1 trips
            self.simulator.step(dt_seconds=5.0)
            self.simulator.inject_pump_failure("p_1")
            self.simulator.step(dt_seconds=5.0)

        elif scenario_id == "scenario_2_line_restriction":
            # Pipeline choked to 50%
            self.simulator.restore_pump("p_1", status="RUNNING")
            self.simulator.inject_pipeline_restriction("pipe_main", capacity_fraction=0.5)
            self.simulator.step(dt_seconds=5.0)

        elif scenario_id == "scenario_3_sensor_drift":
            # +25% ultrasonic drift
            self.simulator.restore_pump("p_1", status="RUNNING")
            self.simulator.inject_sensor_drift("tank_a", drift_fraction=0.25)
            self.simulator.step(dt_seconds=5.0)

        elif scenario_id == "scenario_4_water_cut_surge":
            # +60% inflow surge
            self.simulator.restore_pump("p_1", status="RUNNING")
            self.simulator.inject_inflow_surge(multiplier=1.6)
            self.simulator.step(dt_seconds=5.0)

        elif scenario_id == "scenario_5_maintenance_contention":
            # P-2 tagged out in maintenance, P-1 trips
            self.simulator.set_pump_status("p_2", "MAINTENANCE")
            self.simulator.inject_pump_failure("p_1")
            self.simulator.step(dt_seconds=5.0)

        # 3. Execute authoritative decision cycle on new state
        state = self.simulator.step(dt_seconds=0.0)
        cycle_result = decision_engine.run_full_engine_cycle(state.model_dump(), sync_to_spacetimedb=True)

        return {
            "scenario": defn.model_dump(),
            "system_state": state.model_dump(),
            "diagnosis": cycle_result["diagnosis"],
            "forecast": cycle_result["forecast"],
            "evaluation": cycle_result["evaluation"],
            "is_synthetic": True,
            "provenance": "SYNTHETIC_DATA_LABELED: Scripted physical test scenario",
        }
