"""Tidewatch Deterministic Decision Engine Package."""
from typing import Dict, Any, Optional
from pathlib import Path
import json

from backend.app.engine.forecasting import run_monte_carlo_forecast, ForecastResult
from backend.app.engine.options import (
    OperationalOption,
    OperationalPlan,
    get_available_options,
    enumerate_candidate_plans,
    generate_value_ranked_curtailment,
)
from backend.app.engine.evaluator import (
    evaluate_all_plans_and_deadlines,
    DecisionEvaluationResult,
    EvaluatedPlan,
    EvaluatedOption,
)
from backend.app.engine.diagnosis import (
    run_naive_bayes_diagnosis,
    DiagnosisResult,
    HypothesisItem,
    FieldCheckItem,
)
from backend.app.integrations.spacetimedb import (
    spacetimedb_adapter,
    PlanRecord,
    OptionRecord,
    HypothesisRecord,
)

class TidewatchDecisionEngine:
    """Deterministic, mathematically rigorous decision engine for produced-water operations."""

    def __init__(self, topology_config_path: Optional[Path] = None):
        if topology_config_path is None:
            topology_config_path = (
                Path(__file__).resolve().parent.parent.parent.parent / "config" / "avon_system.json"
            )
        with open(topology_config_path, "r") as f:
            self.config = json.load(f)

    def forecast(
        self,
        tank_id: str,
        current_level_bbl: float,
        base_inflow_bbl_per_hr: float,
        base_outflow_bbl_per_hr: float,
        sensor_trust_status: str = "THREE_WAY_AGREEMENT",
        horizon_minutes: float = 120.0,
        seed: int = 42,
    ) -> ForecastResult:
        """Calculate forward fluid volume Monte Carlo distribution and P10-P90 bands."""
        tank_info = next((t for t in self.config["tanks"] if t["id"] == tank_id), self.config["tanks"][0])
        return run_monte_carlo_forecast(
            tank_capacity_bbl=tank_info["total_capacity_bbl"],
            current_level_bbl=current_level_bbl,
            high_high_threshold_bbl=tank_info["high_high_threshold_bbl"],
            base_inflow_bbl_per_hr=base_inflow_bbl_per_hr,
            base_outflow_bbl_per_hr=base_outflow_bbl_per_hr,
            forecast_horizon_minutes=horizon_minutes,
            seed=seed,
            sensor_trust_status=sensor_trust_status,
        )

    def diagnose(
        self,
        pump_flow_bbl_per_hr: float,
        discharge_pressure_psi: float,
        vibration_rms: float,
        level_rate_bbl_per_hr: float,
        sensor_trust_status: str = "THREE_WAY_AGREEMENT",
        suspect_sensor: Optional[str] = None,
    ) -> DiagnosisResult:
        """Run transparent Naive-Bayes fault classifier with Shannon Information Gain."""
        return run_naive_bayes_diagnosis(
            pump_flow_bbl_per_hr=pump_flow_bbl_per_hr,
            discharge_pressure_psi=discharge_pressure_psi,
            vibration_rms=vibration_rms,
            level_rate_bbl_per_hr=level_rate_bbl_per_hr,
            sensor_trust_status=sensor_trust_status,
            suspect_sensor=suspect_sensor,
        )

    def evaluate_decisions(
        self,
        current_level_bbl: float,
        base_inflow_bbl_per_hr: float,
        base_outflow_bbl_per_hr: float,
        standby_pump_healthy: bool = True,
        sensor_trust_status: str = "THREE_WAY_AGREEMENT",
        risk_limit: float = 0.05,
    ) -> DecisionEvaluationResult:
        """Enumerate and evaluate all response plans, bisection deadlines, and cost of waiting."""
        tank_a = self.config["tanks"][0]
        options = get_available_options(self.config, standby_pump_healthy=standby_pump_healthy)
        candidate_plans = enumerate_candidate_plans(options, max_combination_size=3)

        return evaluate_all_plans_and_deadlines(
            plans=candidate_plans,
            available_options=options,
            tank_capacity_bbl=tank_a["total_capacity_bbl"],
            current_level_bbl=current_level_bbl,
            high_high_threshold_bbl=tank_a["high_high_threshold_bbl"],
            base_inflow_bbl_per_hr=base_inflow_bbl_per_hr,
            base_outflow_bbl_per_hr=base_outflow_bbl_per_hr,
            risk_limit=risk_limit,
            sensor_trust_status=sensor_trust_status,
        )

    def run_full_engine_cycle(
        self,
        sim_state: Dict[str, Any],
        sync_to_spacetimedb: bool = True,
    ) -> Dict[str, Any]:
        """Execute complete decision cycle and sync results to SpacetimeDB."""
        tanks = sim_state.get("tanks", [])
        pumps = sim_state.get("pumps", [])
        sensor_readings = sim_state.get("sensor_readings", {})

        tank_a = next((t for t in tanks if t.get("id") == "tank_a"), None)
        p1 = next((p for p in pumps if p.get("id") == "p_1"), None)
        p2 = next((p for p in pumps if p.get("id") == "p_2"), None)
        sensor_a = sensor_readings.get("tank_a", {})

        curr_level = tank_a.get("current_level_bbl", 410.0) if tank_a else 410.0
        inflow = tank_a.get("inflow_bbl_per_hr", 125.0) if tank_a else 125.0
        outflow = tank_a.get("outflow_bbl_per_hr", 120.0) if tank_a else 120.0
        p_flow = p1.get("actual_flow_bbl_per_hr", 120.0) if p1 else 120.0
        p_press = p1.get("discharge_pressure_psi", 85.0) if p1 else 85.0
        p_vib = p1.get("vibration_rms", 1.2) if p1 else 1.2
        trust_status = sensor_a.get("trust_status", "THREE_WAY_AGREEMENT")
        suspect = sensor_a.get("suspect_sensor")
        p2_healthy = p2.get("status") != "FAILED" if p2 else True

        # 1. Diagnosis
        diag = self.diagnose(
            pump_flow_bbl_per_hr=p_flow,
            discharge_pressure_psi=p_press,
            vibration_rms=p_vib,
            level_rate_bbl_per_hr=inflow - outflow,
            sensor_trust_status=trust_status,
            suspect_sensor=suspect,
        )

        # 2. Forecast
        fc = self.forecast(
            tank_id="tank_a",
            current_level_bbl=curr_level,
            base_inflow_bbl_per_hr=inflow,
            base_outflow_bbl_per_hr=outflow,
            sensor_trust_status=trust_status,
        )

        # 3. Decision Evaluation
        eval_res = self.evaluate_decisions(
            current_level_bbl=curr_level,
            base_inflow_bbl_per_hr=inflow,
            base_outflow_bbl_per_hr=outflow,
            standby_pump_healthy=p2_healthy,
            sensor_trust_status=trust_status,
        )

        # 4. Synchronize to SpacetimeDB
        if sync_to_spacetimedb:
            # Sync options
            for opt in eval_res.evaluated_options:
                spacetimedb_adapter.options[opt.id] = OptionRecord(
                    id=opt.id,
                    name=opt.name,
                    lead_time_minutes=opt.lead_time_minutes,
                    estimated_cost_usd=opt.estimated_cost_usd,
                    decision_deadline_minutes=opt.decision_deadline_minutes,
                    is_expired=opt.is_expired,
                    status=opt.status,
                )

            # Sync recommended plan
            if eval_res.recommended_plan:
                bp = eval_res.recommended_plan
                spacetimedb_adapter.plans[bp.id] = PlanRecord(
                    id=bp.id,
                    name=bp.name,
                    option_ids=bp.option_ids,
                    expected_cost_usd=bp.expected_cost_usd,
                    breach_probability=bp.breach_probability,
                    decide_by_timestamp="02:19",
                    minutes_remaining=bp.minutes_remaining,
                    cost_of_waiting_per_minute=bp.cost_of_waiting_per_minute,
                    is_recommended=True,
                    is_approved=spacetimedb_adapter.plans.get(bp.id, PlanRecord(
                        id=bp.id, name=bp.name, option_ids=bp.option_ids, expected_cost_usd=bp.expected_cost_usd,
                        breach_probability=bp.breach_probability, decide_by_timestamp="02:19",
                        minutes_remaining=bp.minutes_remaining, cost_of_waiting_per_minute=bp.cost_of_waiting_per_minute,
                        is_recommended=True
                    )).is_approved,
                )

            # Sync top hypotheses
            for h in diag.hypotheses[:3]:
                spacetimedb_adapter.hypotheses[h.id] = HypothesisRecord(
                    id=h.id,
                    title=h.title,
                    probability=h.probability,
                    evidence_summary=f"Prior: {int(h.prior_probability * 100)}%",
                    recommended_check=diag.next_best_check.name,
                    expected_information_gain=diag.next_best_check.expected_information_gain,
                )

        return {
            "forecast": fc.model_dump(),
            "diagnosis": diag.model_dump(),
            "evaluation": eval_res.model_dump(),
        }

decision_engine = TidewatchDecisionEngine()

__all__ = [
    "TidewatchDecisionEngine",
    "decision_engine",
    "run_monte_carlo_forecast",
    "run_naive_bayes_diagnosis",
    "evaluate_all_plans_and_deadlines",
    "get_available_options",
    "generate_value_ranked_curtailment",
]

