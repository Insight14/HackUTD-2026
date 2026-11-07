"""Naive-Bayes Fault Diagnosis and Information-Gain Next-Best Field Check.

Implements transparent Bayesian inference over physical sensor observations and calculates
Shannon entropy reduction to recommend the single cheapest, highest-value field inspection.
"""
import math
from typing import Dict, List, Optional, Any, Tuple
from pydantic import BaseModel

class HypothesisItem(BaseModel):
    id: str
    title: str
    probability: float
    description: str
    prior_probability: float

class FieldCheckItem(BaseModel):
    id: str
    name: str
    target_equipment: str
    cost_usd: float
    duration_minutes: int
    expected_information_gain: float
    efficiency_score: float  # IG / Cost
    outcome_scenarios: List[str]

class DiagnosisResult(BaseModel):
    hypotheses: List[HypothesisItem]
    top_hypothesis: HypothesisItem
    next_best_check: FieldCheckItem
    candidate_checks: List[FieldCheckItem]
    current_entropy_bits: float
    evidence_observed: Dict[str, Any]

# --- TRANSPARENT HAND-SET LIKELIHOOD LOOKUP TABLE ---
# P(Evidence | Hypothesis) for discrete observations

PRIORS: Dict[str, float] = {
    "pump_failed": 0.30,
    "discharge_blocked": 0.20,
    "downstream_leak": 0.15,
    "inflow_surge": 0.15,
    "sensor_fault": 0.20,
}

# Likelihood of observing pump flow == 0
LIKELIHOOD_FLOW_ZERO: Dict[str, float] = {
    "pump_failed": 0.98,
    "discharge_blocked": 0.90,
    "downstream_leak": 0.05,
    "inflow_surge": 0.02,
    "sensor_fault": 0.05,
}

# Likelihood of observing zero discharge pressure (P < 15 psi)
LIKELIHOOD_PRESSURE_ZERO: Dict[str, float] = {
    "pump_failed": 0.95,
    "discharge_blocked": 0.01,  # Blocked line causes high pressure!
    "downstream_leak": 0.40,
    "inflow_surge": 0.02,
    "sensor_fault": 0.05,
}

# Likelihood of observing high discharge pressure (P > 115 psi)
LIKELIHOOD_PRESSURE_HIGH: Dict[str, float] = {
    "pump_failed": 0.01,
    "discharge_blocked": 0.96,
    "downstream_leak": 0.01,
    "inflow_surge": 0.15,
    "sensor_fault": 0.05,
}

# Likelihood of sensor disagreement (ODD_ONE_OUT where ultrasonic is suspect)
LIKELIHOOD_SENSOR_SPLIT: Dict[str, float] = {
    "pump_failed": 0.05,
    "discharge_blocked": 0.05,
    "downstream_leak": 0.05,
    "inflow_surge": 0.08,
    "sensor_fault": 0.92,
}

# Likelihood of rapid tank level accumulation (dL/dt > expected)
LIKELIHOOD_LEVEL_SURGE: Dict[str, float] = {
    "pump_failed": 0.90,
    "discharge_blocked": 0.90,
    "downstream_leak": 0.10,
    "inflow_surge": 0.95,
    "sensor_fault": 0.40,
}

HYPOTHESIS_METADATA: Dict[str, Dict[str, str]] = {
    "pump_failed": {
        "title": "Transfer Pump P-1 Failed / Tripped",
        "description": "Electric motor tripped or mechanical failure, halting primary outflow from Tank A.",
    },
    "discharge_blocked": {
        "title": "Discharge Pipeline Blocked / Valve Closed",
        "description": "Downstream block valve closed or hydrate plug restricting discharge flow.",
    },
    "downstream_leak": {
        "title": "Downstream Gathering Line Leak",
        "description": "Loss of containment downstream of transfer pump causing pressure loss.",
    },
    "inflow_surge": {
        "title": "Upstream Inflow Surge (Water-Cut Jump)",
        "description": "Producing wells delivering fluid at rates exceeding gathering pipeline allocation.",
    },
    "sensor_fault": {
        "title": "Ultrasonic Level Sensor Fault / False Echo",
        "description": "Sensor drifting due to foam blanket or transducer drift; disagreed with camera and mass balance.",
    },
}

def calculate_entropy(probabilities: List[float]) -> float:
    """Calculate Shannon entropy H(S) in bits."""
    entropy = 0.0
    for p in probabilities:
        if p > 1e-9:
            entropy -= p * math.log2(p)
    return entropy

def run_naive_bayes_diagnosis(
    pump_flow_bbl_per_hr: float,
    discharge_pressure_psi: float,
    vibration_rms: float,
    level_rate_bbl_per_hr: float,
    sensor_trust_status: str,
    suspect_sensor: Optional[str] = None,
) -> DiagnosisResult:
    """Run Naive-Bayes posterior calculation over physical evidence."""
    unnormalized_posteriors: Dict[str, float] = {}

    evidence_dict: Dict[str, Any] = {
        "pump_flow_bbl_per_hr": pump_flow_bbl_per_hr,
        "discharge_pressure_psi": discharge_pressure_psi,
        "vibration_rms": vibration_rms,
        "level_rate_bbl_per_hr": level_rate_bbl_per_hr,
        "sensor_trust_status": sensor_trust_status,
        "suspect_sensor": suspect_sensor,
    }

    is_flow_zero = pump_flow_bbl_per_hr < 10.0
    is_pressure_zero = discharge_pressure_psi < 20.0
    is_pressure_high = discharge_pressure_psi > 115.0
    is_sensor_split = sensor_trust_status in ("ODD_ONE_OUT", "SPLIT_CONFIDENCE") and (suspect_sensor == "ultrasonic")
    is_level_rising = level_rate_bbl_per_hr > 20.0

    for h, prior in PRIORS.items():
        likelihood = 1.0

        # Feature 1: Flow rate
        if is_flow_zero:
            likelihood *= LIKELIHOOD_FLOW_ZERO[h]
        else:
            likelihood *= 1.0 - LIKELIHOOD_FLOW_ZERO[h]

        # Feature 2: Discharge pressure
        if is_pressure_zero:
            likelihood *= LIKELIHOOD_PRESSURE_ZERO[h]
        elif is_pressure_high:
            likelihood *= LIKELIHOOD_PRESSURE_HIGH[h]
        else:
            likelihood *= 0.5  # Normal operating pressure

        # Feature 3: Sensor trust split
        if is_sensor_split:
            likelihood *= LIKELIHOOD_SENSOR_SPLIT[h]
        else:
            likelihood *= 1.0 - LIKELIHOOD_SENSOR_SPLIT[h]

        # Feature 4: Level accumulation
        if is_level_rising:
            likelihood *= LIKELIHOOD_LEVEL_SURGE[h]

        unnormalized_posteriors[h] = prior * likelihood

    total_prob = sum(unnormalized_posteriors.values())
    if total_prob <= 0:
        total_prob = 1.0

    hypotheses_list: List[HypothesisItem] = []
    for h, raw_score in unnormalized_posteriors.items():
        norm_p = round(raw_score / total_prob, 4)
        hypotheses_list.append(
            HypothesisItem(
                id=h,
                title=HYPOTHESIS_METADATA[h]["title"],
                probability=norm_p,
                description=HYPOTHESIS_METADATA[h]["description"],
                prior_probability=PRIORS[h],
            )
        )

    # Sort descending by probability
    hypotheses_list.sort(key=lambda h: h.probability, reverse=True)
    current_entropy = calculate_entropy([h.probability for h in hypotheses_list])

    # Calculate Information Gain for Candidate Field Checks
    candidate_checks = evaluate_next_best_checks(hypotheses_list, current_entropy)
    top_check = candidate_checks[0]

    return DiagnosisResult(
        hypotheses=hypotheses_list,
        top_hypothesis=hypotheses_list[0],
        next_best_check=top_check,
        candidate_checks=candidate_checks,
        current_entropy_bits=round(current_entropy, 3),
        evidence_observed=evidence_dict,
    )

def evaluate_next_best_checks(
    hypotheses: List[HypothesisItem],
    current_entropy: float,
) -> List[FieldCheckItem]:
    """Calculate expected information gain (entropy reduction) for field verification actions."""
    prob_map = {h.id: h.probability for h in hypotheses}

    checks_catalog = [
        {
            "id": "check_discharge_gauge",
            "name": "Check P-1 Discharge Pressure Gauge",
            "target": "p_1",
            "cost_usd": 25.0,
            "duration_min": 5,
            # If outcome is zero pressure: strongly confirms pump_failed
            # If outcome is high pressure: strongly confirms discharge_blocked
            "outcomes": [
                {"name": "zero_psi", "p": prob_map.get("pump_failed", 0.3) + 0.1, "entropy_after": 0.45},
                {"name": "high_psi", "p": prob_map.get("discharge_blocked", 0.2) + 0.05, "entropy_after": 0.50},
                {"name": "normal_psi", "p": 0.35, "entropy_after": 0.85},
            ],
        },
        {
            "id": "dip_tank_manual_tape",
            "name": "Hand-Gauge Tank A with Innage Tape",
            "target": "tank_a",
            "cost_usd": 40.0,
            "duration_min": 12,
            # Resolves sensor_fault vs real physical fluid volume
            "outcomes": [
                {"name": "tape_matches_ultrasonic", "p": 0.70, "entropy_after": 0.80},
                {"name": "tape_matches_camera", "p": 0.30, "entropy_after": 0.35},
            ],
        },
        {
            "id": "inspect_block_valve",
            "name": "Inspect Pipeline Header Block Valve",
            "target": "pipe_main",
            "cost_usd": 35.0,
            "duration_min": 10,
            "outcomes": [
                {"name": "valve_closed", "p": prob_map.get("discharge_blocked", 0.2), "entropy_after": 0.30},
                {"name": "valve_open", "p": 0.80, "entropy_after": 0.95},
            ],
        },
        {
            "id": "inspect_wellhead_water_cuts",
            "name": "Sample Wellhead Water Cuts at Avon Pad",
            "target": "wells",
            "cost_usd": 75.0,
            "duration_min": 25,
            "outcomes": [
                {"name": "water_cut_high", "p": prob_map.get("inflow_surge", 0.2), "entropy_after": 0.60},
                {"name": "water_cut_normal", "p": 0.80, "entropy_after": 1.10},
            ],
        },
    ]

    evaluated_checks: List[FieldCheckItem] = []

    for c in checks_catalog:
        # Expected posterior entropy: sum(p_o * H_o)
        total_p = sum(o["p"] for o in c["outcomes"])
        expected_post_entropy = sum((o["p"] / total_p) * o["entropy_after"] for o in c["outcomes"])
        info_gain = max(0.05, current_entropy - expected_post_entropy)
        efficiency = info_gain / (c["cost_usd"] / 10.0)

        evaluated_checks.append(
            FieldCheckItem(
                id=c["id"],
                name=c["name"],
                target_equipment=c["target"],
                cost_usd=c["cost_usd"],
                duration_minutes=c["duration_min"],
                expected_information_gain=round(info_gain, 3),
                efficiency_score=round(efficiency, 3),
                outcome_scenarios=[o["name"] for o in c["outcomes"]],
            )
        )

    # Sort descending by efficiency score (highest information gain per cost)
    evaluated_checks.sort(key=lambda x: x.efficiency_score, reverse=True)
    return evaluated_checks
