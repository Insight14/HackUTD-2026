"""Unit and Integration Tests for Avon System Physical Simulator."""
import pytest
from backend.app.simulator.engine import AvonSimulator

def test_config_validation_empty_tanks():
    invalid_config = {"tanks": [], "pumps": [{"id": "p1"}], "wells": [{"id": "w1"}]}
    with pytest.raises(ValueError, match="tanks"):
        AvonSimulator(config_data=invalid_config)

def test_config_validation_invalid_thresholds():
    invalid_config = {
        "tanks": [
            {
                "id": "tank_1",
                "name": "Test Tank",
                "total_capacity_bbl": 1000.0,
                "working_capacity_bbl": 850.0,
                "high_high_threshold_bbl": 700.0,
                "high_threshold_bbl": 750.0,  # Invalid: high > high_high
                "initial_level_bbl": 400.0,
                "surface_area_sq_ft": 400.0,
            }
        ],
        "pumps": [
            {
                "id": "p_1",
                "name": "Pump 1",
                "tank_id": "tank_1",
                "rated_flow_bbl_per_hr": 100.0,
            }
        ],
        "wells": [
            {
                "id": "w_1",
                "name": "Well 1",
                "target_tank_id": "tank_1",
                "water_rate_bbl_per_hr": 100.0,
            }
        ],
    }
    with pytest.raises(ValueError, match="high_threshold"):
        AvonSimulator(config_data=invalid_config)

def test_config_validation_nonexistent_tank_reference():
    invalid_config = {
        "tanks": [
            {
                "id": "tank_1",
                "name": "Test Tank",
                "total_capacity_bbl": 1000.0,
                "working_capacity_bbl": 850.0,
                "high_high_threshold_bbl": 800.0,
                "high_threshold_bbl": 700.0,
                "initial_level_bbl": 400.0,
                "surface_area_sq_ft": 400.0,
            }
        ],
        "pumps": [
            {
                "id": "p_1",
                "name": "Pump 1",
                "tank_id": "nonexistent_tank",  # Invalid reference
                "rated_flow_bbl_per_hr": 100.0,
            }
        ],
        "wells": [{"id": "w_1", "name": "Well 1", "target_tank_id": "tank_1", "water_rate_bbl_per_hr": 50.0}],
    }
    with pytest.raises(ValueError, match="non-existent tank"):
        AvonSimulator(config_data=invalid_config)

def test_deterministic_repeatability():
    sim1 = AvonSimulator(seed=12345)
    sim2 = AvonSimulator(seed=12345)

    for _ in range(15):
        s1 = sim1.step(dt_seconds=5.0)
        s2 = sim2.step(dt_seconds=5.0)

        # Check tank A levels match exactly
        assert s1.tanks[0].current_level_bbl == pytest.approx(s2.tanks[0].current_level_bbl, abs=1e-5)
        # Check pump flows match exactly
        assert s1.pumps[0].actual_flow_bbl_per_hr == pytest.approx(s2.pumps[0].actual_flow_bbl_per_hr, abs=1e-5)
        # Check sensor readings match exactly
        assert (
            s1.sensor_readings["tank_a"].ultrasonic_level_fraction
            == pytest.approx(s2.sensor_readings["tank_a"].ultrasonic_level_fraction, abs=1e-5)
        )

def test_mass_balance_fluid_integration():
    sim = AvonSimulator(seed=42)
    initial_level = sim.tanks["tank_a"]["current_level_bbl"]

    # Stop all pumps on tank_a
    for p in sim.pumps.values():
        if p["tank_id"] == "tank_a":
            sim.pumps[p["id"]]["status"] = "STOPPED"

    # Step for 1 hour (3600 seconds)
    state = sim.step(dt_seconds=3600.0)
    tank_a = next(t for t in state.tanks if t.id == "tank_a")

    # Inflow into tank_a is w_1 (25) + w_7 (45) + w_12 (55) = 125 bbl/hr (plus minor jitter)
    expected_gain = tank_a.inflow_bbl_per_hr * 1.0
    assert tank_a.current_level_bbl == pytest.approx(initial_level + expected_gain, abs=0.5)

def test_pump_failure_triggers_alert_and_time_to_high_high():
    sim = AvonSimulator(seed=42)
    sim.inject_pump_failure("p_1")

    state = sim.step(dt_seconds=5.0)
    assert state.status == "ACTION_NEEDED"
    assert any(a.pump_id == "p_1" and a.severity == "CRITICAL" for a in state.alerts)

    tank_a = next(t for t in state.tanks if t.id == "tank_a")
    assert tank_a.time_to_high_high_minutes is not None
    assert tank_a.time_to_high_high_minutes > 0.0

def test_sensor_trust_arbitration():
    sim = AvonSimulator(seed=42)

    # 1. Baseline agreement
    state = sim.step(dt_seconds=1.0)
    assert state.sensor_readings["tank_a"].trust_status == "THREE_WAY_AGREEMENT"
    assert state.sensor_readings["tank_a"].confidence_level == "HIGH"

    # 2. Inject sensor drift (+20% fake level)
    sim.inject_sensor_drift("tank_a", 0.20)
    state_drift = sim.step(dt_seconds=1.0)
    assert state_drift.sensor_readings["tank_a"].trust_status == "ODD_ONE_OUT"
    assert state_drift.sensor_readings["tank_a"].suspect_sensor == "ultrasonic"

    # 3. Vision offline
    sim.set_vision_offline(True)
    state_offline = sim.step(dt_seconds=1.0)
    assert state_offline.sensor_readings["tank_a"].trust_status == "VISION_OFFLINE"

def test_hardware_reading_override():
    sim = AvonSimulator(seed=42)
    sim.set_hardware_reading("tank_a", ultrasonic_fraction=0.77, pump_status="RUNNING")

    state = sim.step(dt_seconds=1.0)
    assert state.sensor_readings["tank_a"].ultrasonic_level_fraction == 0.77

