"""Unit and Integration Tests for Tidewatch Deterministic Decision Engine."""
import pytest
from backend.app.engine import (
    decision_engine,
    run_monte_carlo_forecast,
    run_naive_bayes_diagnosis,
    generate_value_ranked_curtailment,
    get_available_options,
    enumerate_candidate_plans,
    evaluate_all_plans_and_deadlines,
)

def test_monte_carlo_reproducibility():
    """Verify Monte Carlo forward simulation is strictly repeatable for identical seed."""
    res1 = run_monte_carlo_forecast(
        tank_capacity_bbl=1000.0,
        current_level_bbl=410.0,
        high_high_threshold_bbl=800.0,
        base_inflow_bbl_per_hr=125.0,
        base_outflow_bbl_per_hr=0.0,
        seed=42,
    )

    res2 = run_monte_carlo_forecast(
        tank_capacity_bbl=1000.0,
        current_level_bbl=410.0,
        high_high_threshold_bbl=800.0,
        base_inflow_bbl_per_hr=125.0,
        base_outflow_bbl_per_hr=0.0,
        seed=42,
    )

    assert res1.p10_minutes == pytest.approx(res2.p10_minutes, abs=1e-3)
    assert res1.p90_minutes == pytest.approx(res2.p90_minutes, abs=1e-3)
    assert res1.breach_probability == pytest.approx(res2.breach_probability, abs=1e-3)

def test_sensor_trust_split_widens_forecast_band():
    """Verify sensor disagreement expands P10-P90 uncertainty envelope."""
    normal_res = run_monte_carlo_forecast(
        tank_capacity_bbl=1000.0,
        current_level_bbl=410.0,
        high_high_threshold_bbl=800.0,
        base_inflow_bbl_per_hr=125.0,
        base_outflow_bbl_per_hr=0.0,
        sensor_trust_status="THREE_WAY_AGREEMENT",
        seed=42,
    )

    split_res = run_monte_carlo_forecast(
        tank_capacity_bbl=1000.0,
        current_level_bbl=410.0,
        high_high_threshold_bbl=800.0,
        base_inflow_bbl_per_hr=125.0,
        base_outflow_bbl_per_hr=0.0,
        sensor_trust_status="ODD_ONE_OUT",
        seed=42,
    )

    normal_spread = normal_res.p90_minutes - normal_res.p10_minutes
    split_spread = split_res.p90_minutes - split_res.p10_minutes

    assert split_res.uncertainty_widened is True
    # Disagreement must expand uncertainty spread
    assert split_spread > normal_spread

def test_value_ranked_curtailment():
    """Verify wells are curtailed by lowest oil margin per barrel of water first."""
    wells = [
        {"id": "w_1", "water_rate_bbl_per_hr": 25.0, "oil_margin_per_bbl_water": 32.50, "status": "PRODUCING"},
        {"id": "w_7", "water_rate_bbl_per_hr": 45.0, "oil_margin_per_bbl_water": 8.20, "status": "PRODUCING"},
        {"id": "w_12", "water_rate_bbl_per_hr": 55.0, "oil_margin_per_bbl_water": 5.40, "status": "PRODUCING"},
    ]

    result = generate_value_ranked_curtailment(wells, target_reduction_bbl_per_hr=70.0)

    # W-12 ($5.40) must be curtailed before W-7 ($8.20), and W-1 ($32.50) must be preserved
    assert result["curtailed_well_ids"][0] == "w_12"
    assert "w_1" not in result["curtailed_well_ids"]
    assert result["water_reduction_bbl_per_hr"] >= 70.0

def test_combinatorial_plan_enumeration():
    """Verify enumeration of up to 3 options."""
    options = get_available_options(decision_engine.config, standby_pump_healthy=True)
    plans = enumerate_candidate_plans(options, max_combination_size=3)

    assert len(plans) > 10
    # Every regular plan must have between 1 and 3 options
    for p in plans:
        if p.id != "plan_shutdown":
            assert 1 <= len(p.option_ids) <= 3

def test_bisection_deadlines_and_expired_options():
    """Verify decision deadlines: fast options have positive deadlines, slow options expire."""
    options = get_available_options(decision_engine.config, standby_pump_healthy=True)
    plans = enumerate_candidate_plans(options, max_combination_size=2)

    # Current state: Tank A at 410 bbl, filling at 125 bbl/h, threshold 800 bbl (~187 min to high-high)
    # Simulate tight scenario: Tank A at 720 bbl (80 bbl remaining -> ~38 minutes to high-high)
    results = evaluate_all_plans_and_deadlines(
        plans=plans,
        available_options=options,
        tank_capacity_bbl=1000.0,
        current_level_bbl=720.0,
        high_high_threshold_bbl=800.0,
        base_inflow_bbl_per_hr=125.0,
        base_outflow_bbl_per_hr=0.0,
        risk_limit=0.05,
    )

    assert results.recommended_plan is not None

    # Water trucks have 60 min lead time which exceeds 38 min nominal time-to-breach -> EXPIRED
    truck_opt = next((o for o in results.evaluated_options if o.id == "opt_trucks"), None)
    assert truck_opt is not None
    assert truck_opt.is_expired is True
    assert truck_opt.status == "EXPIRED"

def test_cost_of_waiting_slope():
    """Verify cost-of-waiting slope ($/min) is non-negative and correctly priced."""
    options = get_available_options(decision_engine.config, standby_pump_healthy=True)
    plans = enumerate_candidate_plans(options, max_combination_size=2)

    results = evaluate_all_plans_and_deadlines(
        plans=plans,
        available_options=options,
        tank_capacity_bbl=1000.0,
        current_level_bbl=650.0,
        high_high_threshold_bbl=800.0,
        base_inflow_bbl_per_hr=125.0,
        base_outflow_bbl_per_hr=0.0,
        risk_limit=0.05,
    )

    assert results.cost_of_waiting_slope_usd_per_min >= 0.0
    assert results.delay_10min_cost_delta_usd >= 0.0

def test_naive_bayes_pump_failure_diagnosis():
    """Verify pump trip (zero flow + zero discharge pressure) diagnoses pump_failed."""
    diag = run_naive_bayes_diagnosis(
        pump_flow_bbl_per_hr=0.0,
        discharge_pressure_psi=0.0,
        vibration_rms=0.0,
        level_rate_bbl_per_hr=125.0,
        sensor_trust_status="THREE_WAY_AGREEMENT",
    )

    assert diag.top_hypothesis.id == "pump_failed"
    assert diag.top_hypothesis.probability > 0.60
    assert diag.next_best_check.name == "Check P-1 Discharge Pressure Gauge"

def test_naive_bayes_discharge_blocked_diagnosis():
    """Verify zero flow with high backpressure diagnoses discharge_blocked."""
    diag = run_naive_bayes_diagnosis(
        pump_flow_bbl_per_hr=0.0,
        discharge_pressure_psi=145.0,  # High backpressure
        vibration_rms=2.8,
        level_rate_bbl_per_hr=125.0,
        sensor_trust_status="THREE_WAY_AGREEMENT",
    )

    assert diag.top_hypothesis.id == "discharge_blocked"
    assert diag.top_hypothesis.probability > 0.60

def test_naive_bayes_sensor_fault_diagnosis():
    """Verify sensor disagreement with normal pump metrics diagnoses sensor_fault."""
    diag = run_naive_bayes_diagnosis(
        pump_flow_bbl_per_hr=120.0,
        discharge_pressure_psi=85.0,
        vibration_rms=1.2,
        level_rate_bbl_per_hr=0.0,
        sensor_trust_status="ODD_ONE_OUT",
        suspect_sensor="ultrasonic",
    )

    assert diag.top_hypothesis.id == "sensor_fault"
    assert diag.top_hypothesis.probability > 0.60
    assert "Hand-Gauge Tank A" in diag.next_best_check.name or "Discharge" in diag.next_best_check.name
