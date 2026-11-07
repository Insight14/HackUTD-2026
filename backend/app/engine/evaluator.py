"""Expected-Cost, Breach Probability, Bisection Deadlines, and Cost-of-Waiting Evaluator."""
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
from pydantic import BaseModel

from backend.app.engine.forecasting import run_monte_carlo_forecast
from backend.app.engine.options import OperationalPlan, OperationalOption

class EvaluatedPlan(BaseModel):
    id: str
    name: str
    option_ids: List[str]
    expected_cost_usd: float
    breach_probability: float
    decision_deadline_minutes: float
    is_expired: bool
    minutes_remaining: float
    cost_of_waiting_per_minute: float
    is_feasible: bool
    is_recommended: bool = False
    net_flow_after_mitigation_bbl_per_hr: float

class EvaluatedOption(BaseModel):
    id: str
    name: str
    lead_time_minutes: int
    estimated_cost_usd: float
    decision_deadline_minutes: float
    is_expired: bool
    status: str

class DecisionEvaluationResult(BaseModel):
    recommended_plan: Optional[EvaluatedPlan]
    evaluated_plans: List[EvaluatedPlan]
    evaluated_options: List[EvaluatedOption]
    cost_of_waiting_slope_usd_per_min: float
    delay_10min_cost_delta_usd: float
    operator_risk_limit: float
    baseline_shutdown_cost_usd: float

def simulate_plan_breach_probability(
    tank_capacity_bbl: float,
    current_level_bbl: float,
    high_high_threshold_bbl: float,
    base_inflow_bbl_per_hr: float,
    base_outflow_bbl_per_hr: float,
    plan: OperationalPlan,
    decision_delay_minutes: float = 0.0,
    forecast_horizon_minutes: float = 120.0,
    num_simulations: int = 300,
    seed: int = 42,
    sensor_trust_status: str = "THREE_WAY_AGREEMENT",
) -> float:
    """Simulate system forward with a response plan taking effect after (decision_delay + lead_time)."""
    rng = np.random.RandomState(seed)

    effective_start_minute = decision_delay_minutes + plan.combined_lead_time_minutes
    effective_capacity = high_high_threshold_bbl + plan.buffer_added_bbl

    uncertainty_widened = sensor_trust_status in ("ODD_ONE_OUT", "SPLIT_CONFIDENCE")
    inflow_sigma = 0.08 if uncertainty_widened else 0.03
    level_noise_sigma = 20.0 if uncertainty_widened else 5.0

    dt_minutes = 1.0
    steps = int(forecast_horizon_minutes / dt_minutes)
    dt_hours = dt_minutes / 60.0

    breach_count = 0

    for _ in range(num_simulations):
        level = current_level_bbl + rng.normal(0, level_noise_sigma)
        level = max(0.0, min(tank_capacity_bbl, level))

        if level >= high_high_threshold_bbl:
            breach_count += 1
            continue

        breached = False
        for step in range(1, steps + 1):
            curr_minute = step * dt_minutes

            # Before plan takes effect: baseline flow
            if curr_minute < effective_start_minute:
                step_in = max(0.0, base_inflow_bbl_per_hr * (1.0 + rng.normal(0, inflow_sigma)))
                step_out = max(0.0, base_outflow_bbl_per_hr * (1.0 + rng.normal(0, 0.015)))
            else:
                # After plan takes effect: mitigated flow
                mitigated_in = max(0.0, base_inflow_bbl_per_hr - plan.options[0].inflow_delta_bbl_per_hr if plan.options else base_inflow_bbl_per_hr)
                step_in = max(0.0, (base_inflow_bbl_per_hr - sum(abs(o.inflow_delta_bbl_per_hr) for o in plan.options)) * (1.0 + rng.normal(0, inflow_sigma)))
                step_out = max(0.0, (base_outflow_bbl_per_hr + sum(o.outflow_delta_bbl_per_hr for o in plan.options)) * (1.0 + rng.normal(0, 0.015)))

            level += (step_in - step_out) * dt_hours
            level = max(0.0, min(tank_capacity_bbl, level))

            # Threshold check
            active_threshold = high_high_threshold_bbl if curr_minute < effective_start_minute else effective_capacity
            if level >= active_threshold:
                breach_count += 1
                breached = True
                break

    return breach_count / num_simulations

def bisect_decision_deadline(
    tank_capacity_bbl: float,
    current_level_bbl: float,
    high_high_threshold_bbl: float,
    base_inflow_bbl_per_hr: float,
    base_outflow_bbl_per_hr: float,
    plan: OperationalPlan,
    risk_limit: float = 0.05,
    max_horizon_minutes: float = 90.0,
    sensor_trust_status: str = "THREE_WAY_AGREEMENT",
) -> float:
    """Use bisection search to find the latest start time where P(breach) <= risk_limit."""
    # Check immediate breach risk at t=0
    p0 = simulate_plan_breach_probability(
        tank_capacity_bbl,
        current_level_bbl,
        high_high_threshold_bbl,
        base_inflow_bbl_per_hr,
        base_outflow_bbl_per_hr,
        plan,
        decision_delay_minutes=0.0,
        sensor_trust_status=sensor_trust_status,
    )

    if p0 > risk_limit:
        # Already too late / lead time exceeds time-to-threshold
        return -1.0

    low = 0.0
    high = max_horizon_minutes
    best_deadline = 0.0

    # 8 bisection iterations yields resolution within ~0.35 min
    for _ in range(8):
        mid = (low + high) / 2.0
        p_mid = simulate_plan_breach_probability(
            tank_capacity_bbl,
            current_level_bbl,
            high_high_threshold_bbl,
            base_inflow_bbl_per_hr,
            base_outflow_bbl_per_hr,
            plan,
            decision_delay_minutes=mid,
            sensor_trust_status=sensor_trust_status,
        )

        if p_mid <= risk_limit:
            best_deadline = mid
            low = mid
        else:
            high = mid

    return round(best_deadline, 1)

def evaluate_all_plans_and_deadlines(
    plans: List[OperationalPlan],
    available_options: List[OperationalOption],
    tank_capacity_bbl: float,
    current_level_bbl: float,
    high_high_threshold_bbl: float,
    base_inflow_bbl_per_hr: float,
    base_outflow_bbl_per_hr: float,
    shutdown_cost_per_hr: float = 12500.0,
    restart_cost: float = 8000.0,
    spill_penalty: float = 50000.0,
    risk_limit: float = 0.05,
    sensor_trust_status: str = "THREE_WAY_AGREEMENT",
) -> DecisionEvaluationResult:
    """Evaluate expected costs, bisection deadlines, and cost of waiting across all plans."""
    total_shutdown_penalty = restart_cost + (shutdown_cost_per_hr * 4.0) + (spill_penalty * 0.1)

    evaluated_plans: List[EvaluatedPlan] = []

    for plan in plans:
        if plan.id == "plan_shutdown":
            evaluated_plans.append(
                EvaluatedPlan(
                    id=plan.id,
                    name=plan.name,
                    option_ids=plan.option_ids,
                    expected_cost_usd=plan.fixed_cost_usd + (plan.hourly_variable_cost_usd * 2.0),
                    breach_probability=0.0,
                    decision_deadline_minutes=0.0,
                    is_expired=False,
                    minutes_remaining=0.0,
                    cost_of_waiting_per_minute=0.0,
                    is_feasible=True,
                    net_flow_after_mitigation_bbl_per_hr=0.0,
                )
            )
            continue

        # 1. Breach probability if executed immediately
        p_breach = simulate_plan_breach_probability(
            tank_capacity_bbl,
            current_level_bbl,
            high_high_threshold_bbl,
            base_inflow_bbl_per_hr,
            base_outflow_bbl_per_hr,
            plan,
            decision_delay_minutes=0.0,
            sensor_trust_status=sensor_trust_status,
        )

        # 2. Bisection deadline
        deadline_mins = bisect_decision_deadline(
            tank_capacity_bbl,
            current_level_bbl,
            high_high_threshold_bbl,
            base_inflow_bbl_per_hr,
            base_outflow_bbl_per_hr,
            plan,
            risk_limit=risk_limit,
            sensor_trust_status=sensor_trust_status,
        )

        is_expired = deadline_mins <= 0.0

        # 3. Expected Cost = Direct plan costs + (Breach Prob * Shutdown Penalty)
        operational_duration_hrs = 2.0  # standard shift response window
        direct_cost = plan.fixed_cost_usd + (plan.hourly_variable_cost_usd * operational_duration_hrs)
        expected_cost = direct_cost + (p_breach * total_shutdown_penalty)

        # Mitigated net flow rate
        mitigated_flow = (base_inflow_bbl_per_hr - plan.net_flow_delta_bbl_per_hr) - base_outflow_bbl_per_hr

        is_feasible = (not is_expired) and (p_breach <= risk_limit * 1.5)

        evaluated_plans.append(
            EvaluatedPlan(
                id=plan.id,
                name=plan.name,
                option_ids=plan.option_ids,
                expected_cost_usd=round(expected_cost, 2),
                breach_probability=round(p_breach, 4),
                decision_deadline_minutes=deadline_mins if not is_expired else 0.0,
                is_expired=is_expired,
                minutes_remaining=max(0.0, deadline_mins),
                cost_of_waiting_per_minute=0.0,  # Computed below
                is_feasible=is_feasible,
                net_flow_after_mitigation_bbl_per_hr=round(mitigated_flow, 2),
            )
        )

    # 4. Pick lowest-cost feasible plan
    feasible_plans = [p for p in evaluated_plans if p.is_feasible and p.id != "plan_shutdown"]
    if feasible_plans:
        # Sort by expected cost ascending
        feasible_plans.sort(key=lambda p: p.expected_cost_usd)
        best_plan = feasible_plans[0]
        best_plan.is_recommended = True
    else:
        # Fallback to shutdown plan
        best_plan = next(p for p in evaluated_plans if p.id == "plan_shutdown")
        best_plan.is_recommended = True

    # 5. Calculate Cost of Waiting (re-evaluating optimal plan delayed by 10 minutes)
    cost_now = best_plan.expected_cost_usd
    p_breach_10m = simulate_plan_breach_probability(
        tank_capacity_bbl,
        current_level_bbl,
        high_high_threshold_bbl,
        base_inflow_bbl_per_hr,
        base_outflow_bbl_per_hr,
        next(p for p in plans if p.id == best_plan.id),
        decision_delay_minutes=10.0,
        sensor_trust_status=sensor_trust_status,
    )
    cost_delayed = (best_plan.expected_cost_usd - (best_plan.breach_probability * total_shutdown_penalty)) + (
        p_breach_10m * total_shutdown_penalty
    )

    cost_delta = max(0.0, cost_delayed - cost_now)
    slope = round(cost_delta / 10.0, 2)
    best_plan.cost_of_waiting_per_minute = slope

    # 6. Evaluate individual options for UI options board
    evaluated_options: List[EvaluatedOption] = []
    for opt in available_options:
        # Check if individual option lead time can beat nominal time to high-high
        nom_time = ((high_high_threshold_bbl - current_level_bbl) / max(0.1, base_inflow_bbl_per_hr - base_outflow_bbl_per_hr)) * 60.0
        deadline = round(max(-10.0, nom_time - opt.lead_time_minutes), 1)
        is_exp = deadline <= 0.0

        evaluated_options.append(
            EvaluatedOption(
                id=opt.id,
                name=opt.name,
                lead_time_minutes=opt.lead_time_minutes,
                estimated_cost_usd=opt.fixed_cost_usd + (opt.variable_cost_per_hr_usd * 2.0),
                decision_deadline_minutes=deadline,
                is_expired=is_exp,
                status="EXPIRED" if is_exp else "AVAILABLE",
            )
        )

    return DecisionEvaluationResult(
        recommended_plan=best_plan,
        evaluated_plans=evaluated_plans,
        evaluated_options=evaluated_options,
        cost_of_waiting_slope_usd_per_min=slope,
        delay_10min_cost_delta_usd=round(cost_delta, 2),
        operator_risk_limit=risk_limit,
        baseline_shutdown_cost_usd=total_shutdown_penalty,
    )
