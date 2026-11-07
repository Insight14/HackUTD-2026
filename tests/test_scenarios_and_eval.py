"""Unit and Scenario Tests for Tidewatch 5 Canonical Operational Scenarios and Evaluation Benchmark."""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.simulator.engine import AvonSimulator
from backend.app.simulator.scenarios import ScenarioRunner, SCENARIO_CATALOG
from backend.app.engine.evaluation_benchmark import EvaluationBenchmark

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def sim():
    return AvonSimulator()

def test_scenario_catalog_integrity():
    """Verify all 5 canonical scenarios are registered with full specification metadata."""
    assert len(SCENARIO_CATALOG) == 5
    for sc_id, sc in SCENARIO_CATALOG.items():
        assert sc.id == sc_id
        assert sc.scenario_number in [1, 2, 3, 4, 5]
        assert len(sc.title) > 0
        assert len(sc.description) > 0
        assert len(sc.expected_diagnosis) > 0
        assert len(sc.expected_action) > 0

def test_scenario_1_pump_trip(sim):
    """Test S1: Primary pump trip overnight, standby start recommendation."""
    runner = ScenarioRunner(sim)
    result = runner.activate_scenario("scenario_1_pump_trip")

    state = result["system_state"]
    p1 = next(p for p in state["pumps"] if p["id"] == "p_1")
    assert p1["status"] == "FAILED"
    assert p1["actual_flow_bbl_per_hr"] == 0.0

    diagnosis = result["diagnosis"]
    assert diagnosis["top_hypothesis"]["id"] == "pump_failed"
    assert diagnosis["top_hypothesis"]["probability"] > 0.85

    eval_res = result["evaluation"]
    rec_plan = eval_res["recommended_plan"]
    assert rec_plan is not None
    # Recommended plan should be feasible and cost effective (< $500 vs $25k shutdown)
    assert rec_plan["is_feasible"] is True
    assert rec_plan["expected_cost_usd"] < 500.0
    assert len(rec_plan["option_ids"]) > 0

def test_scenario_2_line_restriction(sim):
    """Test S2: Downstream line restriction differential diagnosis."""
    runner = ScenarioRunner(sim)
    result = runner.activate_scenario("scenario_2_line_restriction")

    state = result["system_state"]
    p1 = next(p for p in state["pumps"] if p["id"] == "p_1")
    assert p1["status"] == "RUNNING"
    # Spiked backpressure indicates discharge bottleneck
    assert p1["discharge_pressure_psi"] > 115.0

    diagnosis = result["diagnosis"]
    assert diagnosis["top_hypothesis"]["id"] == "discharge_blocked"

    # Next best check should target pipeline or discharge gauge
    top_check = diagnosis["next_best_check"]
    assert top_check["id"] in ["check_discharge_gauge", "inspect_block_valve"]

def test_scenario_3_sensor_drift(sim):
    """Test S3: Foam sensor drift, 3-way arbitration, hand-dip tape recommendation."""
    runner = ScenarioRunner(sim)
    result = runner.activate_scenario("scenario_3_sensor_drift")

    state = result["system_state"]
    sensors = state["sensor_readings"]["tank_a"]
    assert sensors["trust_status"] == "ODD_ONE_OUT"
    assert sensors["suspect_sensor"] == "ultrasonic"

    diagnosis = result["diagnosis"]
    assert diagnosis["top_hypothesis"]["id"] == "sensor_fault"
    assert diagnosis["next_best_check"]["id"] == "dip_tank_manual_tape"

def test_scenario_4_water_cut_surge(sim):
    """Test S4: Inflow surge exceeding single-pump capacity, value-ranked curtailment."""
    runner = ScenarioRunner(sim)
    result = runner.activate_scenario("scenario_4_water_cut_surge")

    state = result["system_state"]
    assert state["total_inflow_bbl_per_hr"] > 180.0

    eval_res = result["evaluation"]
    rec_plan = eval_res["recommended_plan"]
    assert rec_plan is not None

def test_scenario_5_maintenance_contention(sim):
    """Test S5: Compound failure where P-1 fails and standby P-2 is in maintenance."""
    runner = ScenarioRunner(sim)
    result = runner.activate_scenario("scenario_5_maintenance_contention")

    state = result["system_state"]
    p1 = next(p for p in state["pumps"] if p["id"] == "p_1")
    p2 = next(p for p in state["pumps"] if p["id"] == "p_2")
    assert p1["status"] == "FAILED"
    assert p2["status"] == "MAINTENANCE"

    eval_res = result["evaluation"]
    # Standby pump option must NOT be in the recommended plan because P-2 is in maintenance
    rec_plan = eval_res["recommended_plan"]
    if rec_plan:
        assert "opt_standby_pump" not in rec_plan["option_ids"]

def test_evaluation_benchmark_metrics(sim):
    """Test comparative benchmark strategy results over 15 seeded trials."""
    benchmark = EvaluationBenchmark(sim, n_trials=15, seed=42)
    report = benchmark.run_benchmark()

    # B0 must have high shutdown rate and cost
    assert report.baseline_0_do_nothing.shutdown_rate_pct >= 60.0
    assert report.baseline_0_do_nothing.mean_cost_usd > 15000.0

    # B2 (Tidewatch) must prevent shutdowns and save substantial costs
    assert report.baseline_2_tidewatch.shutdown_rate_pct == 0.0
    assert report.baseline_2_tidewatch.mean_cost_usd < 2000.0
    assert report.cost_savings_vs_b0_usd > 15000.0
    assert report.additional_warning_minutes_vs_b1 > 20.0

def test_api_scenarios_endpoints(client):
    """Test REST API endpoints for scenario activation and benchmark reports."""
    # List scenarios
    r = client.get("/api/scenarios/list")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 5

    # Activate S1
    r = client.post("/api/scenarios/activate/scenario_1_pump_trip")
    assert r.status_code == 200
    res = r.json()
    assert res["scenario"]["id"] == "scenario_1_pump_trip"
    assert "diagnosis" in res
    assert "forecast" in res

    # Check active scenario
    r = client.get("/api/scenarios/active")
    assert r.status_code == 200
    assert r.json()["active_scenario"]["id"] == "scenario_1_pump_trip"

    # Run small benchmark via API
    r = client.post("/api/scenarios/benchmark", json={"n_trials": 10, "seed": 42})
    assert r.status_code == 200
    bench = r.json()
    assert "baseline_0_do_nothing" in bench
    assert "baseline_2_tidewatch" in bench
    assert bench["cost_savings_vs_b0_usd"] > 0
