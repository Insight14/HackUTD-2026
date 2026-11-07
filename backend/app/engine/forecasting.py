"""Monte Carlo Forecasting Module for Fluid Levels and High-High Overflow Thresholds.

Simulates uncertain future well inflows and sensor errors to compute:
1. P10, P50, and P90 arrival time bands.
2. Breach probability P(breach) within a forecast horizon.
3. Dynamic widening of uncertainty envelopes when sensors split or drift.
"""
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
from pydantic import BaseModel

class ForecastResult(BaseModel):
    tank_id: str
    current_level_bbl: float
    high_high_threshold_bbl: float
    net_flow_rate_bbl_per_hr: float
    time_to_high_high_minutes: Optional[float]
    p10_minutes: Optional[float]
    p50_minutes: Optional[float]
    p90_minutes: Optional[float]
    breach_probability: float
    num_simulations: int
    uncertainty_widened: bool
    horizon_minutes: float

def run_monte_carlo_forecast(
    tank_capacity_bbl: float,
    current_level_bbl: float,
    high_high_threshold_bbl: float,
    base_inflow_bbl_per_hr: float,
    base_outflow_bbl_per_hr: float,
    forecast_horizon_minutes: float = 120.0,
    num_simulations: int = 500,
    seed: int = 42,
    sensor_trust_status: str = "THREE_WAY_AGREEMENT",
) -> ForecastResult:
    """Run a deterministic Monte Carlo simulation forward from current state."""
    rng = np.random.RandomState(seed)

    # Base parameters
    net_flow = base_inflow_bbl_per_hr - base_outflow_bbl_per_hr

    # If outflow exceeds inflow by a safe margin and tank is below high threshold, low breach
    if net_flow <= -10.0 and current_level_bbl < high_high_threshold_bbl * 0.7:
        return ForecastResult(
            tank_id="tank_a",
            current_level_bbl=round(current_level_bbl, 2),
            high_high_threshold_bbl=high_high_threshold_bbl,
            net_flow_rate_bbl_per_hr=round(net_flow, 2),
            time_to_high_high_minutes=None,
            p10_minutes=None,
            p50_minutes=None,
            p90_minutes=None,
            breach_probability=0.0,
            num_simulations=num_simulations,
            uncertainty_widened=False,
            horizon_minutes=forecast_horizon_minutes,
        )

    # Sensor uncertainty adjustment:
    # If sensors disagree (ODD_ONE_OUT or SPLIT_CONFIDENCE), widen variance sigma
    uncertainty_widened = sensor_trust_status in ("ODD_ONE_OUT", "SPLIT_CONFIDENCE")
    inflow_sigma = 0.08 if uncertainty_widened else 0.03  # 8% vs 3% uncertainty
    level_noise_sigma = 20.0 if uncertainty_widened else 5.0  # barrels noise

    dt_minutes = 1.0
    steps = int(forecast_horizon_minutes / dt_minutes)
    dt_hours = dt_minutes / 60.0

    times_to_breach: List[float] = []
    breach_count = 0

    for _ in range(num_simulations):
        # Sample starting level with sensor noise
        sampled_level = current_level_bbl + rng.normal(0, level_noise_sigma)
        sampled_level = max(0.0, min(tank_capacity_bbl, sampled_level))

        # Check immediate breach
        if sampled_level >= high_high_threshold_bbl:
            breach_count += 1
            times_to_breach.append(0.0)
            continue

        breached = False
        level = sampled_level

        for step in range(1, steps + 1):
            # Inflow stochastic process: mean base_inflow with Gaussian jitter
            step_inflow = max(0.0, base_inflow_bbl_per_hr * (1.0 + rng.normal(0, inflow_sigma)))
            # Outflow slight operational variation (e.g. line backpressure)
            step_outflow = max(0.0, base_outflow_bbl_per_hr * (1.0 + rng.normal(0, 0.015)))

            level += (step_inflow - step_outflow) * dt_hours
            level = max(0.0, min(tank_capacity_bbl, level))

            if level >= high_high_threshold_bbl:
                breach_count += 1
                times_to_breach.append(step * dt_minutes)
                breached = True
                break

        if not breached:
            # If no breach occurred within horizon, record an extrapolation or sentinel
            if net_flow > 0:
                extrapolated = (high_high_threshold_bbl - level) / (net_flow / 60.0)
                times_to_breach.append(forecast_horizon_minutes + max(0.0, extrapolated))
            else:
                times_to_breach.append(999.0)

    # Compute empirical percentiles P10, P50, P90
    sorted_times = np.sort(times_to_breach)
    p10 = float(np.percentile(sorted_times, 10))
    p50 = float(np.percentile(sorted_times, 50))
    p90 = float(np.percentile(sorted_times, 90))

    breach_prob = round(breach_count / num_simulations, 4)

    # Deterministic nominal time
    nominal_time = None
    if net_flow > 0.1:
        nominal_time = round(((high_high_threshold_bbl - current_level_bbl) / net_flow) * 60.0, 1)

    return ForecastResult(
        tank_id="tank_a",
        current_level_bbl=round(current_level_bbl, 2),
        high_high_threshold_bbl=high_high_threshold_bbl,
        net_flow_rate_bbl_per_hr=round(net_flow, 2),
        time_to_high_high_minutes=nominal_time,
        p10_minutes=round(p10, 1) if p10 < 900.0 else None,
        p50_minutes=round(p50, 1) if p50 < 900.0 else None,
        p90_minutes=round(p90, 1) if p90 < 900.0 else None,
        breach_probability=breach_prob,
        num_simulations=num_simulations,
        uncertainty_widened=uncertainty_widened,
        horizon_minutes=forecast_horizon_minutes,
    )

