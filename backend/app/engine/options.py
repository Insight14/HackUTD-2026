"""Operational Options and Combinatorial Plan Generator.

Generates available field mitigation responses with lead times, cost models,
and value-ranked well curtailment.
"""
from itertools import combinations
from typing import Dict, List, Any, Optional
from pydantic import BaseModel

class OperationalOption(BaseModel):
    id: str
    name: str
    lead_time_minutes: int
    outflow_delta_bbl_per_hr: float
    inflow_delta_bbl_per_hr: float
    fixed_cost_usd: float
    variable_cost_per_hr_usd: float
    buffer_added_bbl: float = 0.0
    requires_equipment: Optional[str] = None
    wells_affected: Optional[List[str]] = None
    is_available: bool = True

class OperationalPlan(BaseModel):
    id: str
    name: str
    option_ids: List[str]
    options: List[OperationalOption]
    combined_lead_time_minutes: int
    net_flow_delta_bbl_per_hr: float
    fixed_cost_usd: float
    hourly_variable_cost_usd: float
    buffer_added_bbl: float = 0.0

def generate_value_ranked_curtailment(wells: List[Dict[str, Any]], target_reduction_bbl_per_hr: float = 100.0) -> Dict[str, Any]:
    """Rank wells by oil margin lost per barrel of water cut and curtail least valuable first."""
    # Sort wells ascending by oil_margin_per_bbl_water
    active_wells = [w for w in wells if w.get("status") != "SHUT_IN"]
    sorted_wells = sorted(active_wells, key=lambda w: w.get("oil_margin_per_bbl_water", 0.0))

    curtailed_ids = []
    reduced_water = 0.0
    hourly_deferred_margin = 0.0

    for well in sorted_wells:
        wid = well["id"]
        water_rate = well.get("water_rate_bbl_per_hr", 0.0)
        margin = well.get("oil_margin_per_bbl_water", 0.0)

        # Curtail 50% or 100% of well
        cut_water = water_rate * 0.8
        reduced_water += cut_water
        hourly_deferred_margin += cut_water * margin
        curtailed_ids.append(wid)

        if reduced_water >= target_reduction_bbl_per_hr:
            break

    return {
        "curtailed_well_ids": curtailed_ids,
        "water_reduction_bbl_per_hr": round(reduced_water, 2),
        "hourly_deferred_margin_usd": round(hourly_deferred_margin, 2),
    }

def get_available_options(
    topology_config: Dict[str, Any],
    standby_pump_healthy: bool = True,
    tank_b_has_spare_capacity: bool = True,
) -> List[OperationalOption]:
    """Retrieve catalog of operational responses filtered by current physical constraints."""
    wells = topology_config.get("wells", [])
    curtailment_info = generate_value_ranked_curtailment(wells, target_reduction_bbl_per_hr=100.0)

    options: List[OperationalOption] = [
        OperationalOption(
            id="opt_standby_pump",
            name="Start Standby Transfer Pump (P-2)",
            lead_time_minutes=5,
            outflow_delta_bbl_per_hr=120.0,
            inflow_delta_bbl_per_hr=0.0,
            fixed_cost_usd=250.0,
            variable_cost_per_hr_usd=45.0,
            requires_equipment="p_2",
            is_available=standby_pump_healthy,
        ),
        OperationalOption(
            id="opt_reroute_flow",
            name="Reroute Flow to Tank B",
            lead_time_minutes=10,
            outflow_delta_bbl_per_hr=0.0,
            inflow_delta_bbl_per_hr=-70.0,
            fixed_cost_usd=150.0,
            variable_cost_per_hr_usd=0.0,
            is_available=tank_b_has_spare_capacity,
        ),
        OperationalOption(
            id="opt_curtail_wells",
            name=f"Curtail Wells ({', '.join(curtailment_info['curtailed_well_ids'])})",
            lead_time_minutes=20,
            outflow_delta_bbl_per_hr=0.0,
            inflow_delta_bbl_per_hr=-curtailment_info["water_reduction_bbl_per_hr"],
            fixed_cost_usd=0.0,
            variable_cost_per_hr_usd=curtailment_info["hourly_deferred_margin_usd"],
            wells_affected=curtailment_info["curtailed_well_ids"],
            is_available=True,
        ),
        OperationalOption(
            id="opt_alt_disposal",
            name="Open Alternate Disposal Interconnect",
            lead_time_minutes=20,
            outflow_delta_bbl_per_hr=80.0,
            inflow_delta_bbl_per_hr=0.0,
            fixed_cost_usd=500.0,
            variable_cost_per_hr_usd=96.0,
            is_available=True,
        ),
        OperationalOption(
            id="opt_trucks",
            name="Dispatch Emergency Water Trucks (2 Units)",
            lead_time_minutes=60,
            outflow_delta_bbl_per_hr=65.0,
            inflow_delta_bbl_per_hr=0.0,
            fixed_cost_usd=1170.0,
            variable_cost_per_hr_usd=585.0,
            is_available=True,
        ),
        OperationalOption(
            id="opt_temp_storage",
            name="Mobilize Temporary Frac Tanks",
            lead_time_minutes=180,
            outflow_delta_bbl_per_hr=0.0,
            inflow_delta_bbl_per_hr=0.0,
            buffer_added_bbl=500.0,
            fixed_cost_usd=4700.0,
            variable_cost_per_hr_usd=50.0,
            is_available=True,
        ),
        OperationalOption(
            id="opt_shutdown",
            name="Emergency Wellhead Shutdown (Baseline)",
            lead_time_minutes=0,
            outflow_delta_bbl_per_hr=0.0,
            inflow_delta_bbl_per_hr=-125.0,
            fixed_cost_usd=8000.0,
            variable_cost_per_hr_usd=12500.0,
            is_available=True,
        ),
    ]

    return [opt for opt in options if opt.is_available]

def enumerate_candidate_plans(
    available_options: List[OperationalOption],
    max_combination_size: int = 3,
) -> List[OperationalPlan]:
    """Enumerate candidate response plans of up to max_combination_size options."""
    # Filter out shutdown from combinatorial combinations (shutdown is evaluated standalone)
    regular_options = [opt for opt in available_options if opt.id != "opt_shutdown"]
    plans: List[OperationalPlan] = []

    plan_idx = 1
    # Generate 1-option, 2-option, and 3-option combinations
    for k in range(1, max_combination_size + 1):
        for combo in combinations(regular_options, k):
            opt_list = list(combo)
            opt_ids = [o.id for o in opt_list]
            name = " + ".join([o.name.split("(")[0].strip() for o in opt_list])

            # Effective lead time is the maximum of the individual lead times
            lead_time = max(o.lead_time_minutes for o in opt_list)
            # Net flow improvement = Outflow added - Inflow reduced (as negative inflow delta)
            net_delta = sum(o.outflow_delta_bbl_per_hr - o.inflow_delta_bbl_per_hr for o in opt_list)
            fixed_cost = sum(o.fixed_cost_usd for o in opt_list)
            hourly_cost = sum(o.variable_cost_per_hr_usd for o in opt_list)
            buffer_added = sum(o.buffer_added_bbl for o in opt_list)

            plans.append(
                OperationalPlan(
                    id=f"plan_{plan_idx}",
                    name=name,
                    option_ids=opt_ids,
                    options=opt_list,
                    combined_lead_time_minutes=lead_time,
                    net_flow_delta_bbl_per_hr=round(net_delta, 2),
                    fixed_cost_usd=round(fixed_cost, 2),
                    hourly_variable_cost_usd=round(hourly_cost, 2),
                    buffer_added_bbl=round(buffer_added, 2),
                )
            )
            plan_idx += 1

    # Add shutdown baseline plan
    shutdown_opt = next((opt for opt in available_options if opt.id == "opt_shutdown"), None)
    if shutdown_opt:
        plans.append(
            OperationalPlan(
                id="plan_shutdown",
                name="Accept Forced Shutdown (Baseline)",
                option_ids=["opt_shutdown"],
                options=[shutdown_opt],
                combined_lead_time_minutes=0,
                net_flow_delta_bbl_per_hr=125.0,
                fixed_cost_usd=shutdown_opt.fixed_cost_usd,
                hourly_variable_cost_usd=shutdown_opt.variable_cost_per_hr_usd,
            )
        )

    return plans

