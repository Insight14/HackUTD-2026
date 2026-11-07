# TIDEWATCH

> **Real-Time AI-Assisted Decision Console for Produced-Water Operations**  
> *Developed for HackUTD 2026 — Competing in EOG Resources, SpacetimeDB, NVIDIA, and MLH Tracks.*  
> **Public Repository:** [https://github.com/Insight14/HackUTD-2026](https://github.com/Insight14/HackUTD-2026)

---

## 1. Executive Summary

In upstream oil and gas production, produced water is the highest-volume fluid handled on the surface. If water gathering backs up, high-pressure safety interlocks force emergency wellhead shut-ins, costing operators upwards of **$25,000+ per hour** in deferred oil revenue and thousands more in emergency restart penalties.

Night-shift control room operators at 02:00 AM face complex, time-sensitive decisions:
- *Did a transfer pump truly trip, or is downstream backpressure choking the line?*
- *Is the ultrasonic level gauge detecting true fluid height, or surface foaming?*
- *Which response plan has the lowest net cost and will prevent an overflow before the decision window closes?*
- *Which wells should be curtailed first to protect high-margin oil production?*

**Tidewatch** solves this by unifying:
1. **Deterministic Hydraulic & Mass-Balance Simulation:** Grounded fluid dynamics and pump curves.
2. **Monte Carlo Forward Arrival Forecasting:** Calculates empirical P10–P90 probability bands to the 95% High-High alarm threshold.
3. **Bisection Decision Deadlines & Waiting Cost Gradient:** Identifies the exact minute by which actions must be committed, pricing the marginal cost of waiting ($/min).
4. **Shannon-Entropy Field Check Optimization:** Identifies the single highest information-gain field inspection to resolve root causes at minimal cost.
5. **Economic Well Curtailment Optimization:** Value-ranks producing wells by oil margin lost per barrel of water cut ($/bbl), sacrificing low-margin wells first.
6. **SpacetimeDB Live Shared Operational State:** Synchronizes incidents, alerts, approved plans, and deduplicated action claims in real time between the Control Room and Field Technicians on mobile.
7. **Tiger Data Time-Series Hypertables:** High-velocity sensor telemetry ingestion, rolling flow derivatives ($\Delta L / \Delta t$), and predictive accuracy scorecards.
8. **NVIDIA Nemotron AI Operational Assistant:** Plain-language explanations grounded strictly with clickable tool-execution output chips (`[chip:get_state]`, `[chip:forecast]`, etc.).
9. **Physical Demonstration Rig & Computer Vision:** Arduino serial bridge with safety watchdogs and OpenCV HSV optical level segmentation + pump indicator LED detection.

---

## 2. Safety Invariant

> [!IMPORTANT]
> **The AI Assistant (NVIDIA Nemotron) NEVER approves response plans or actuates hardware.**  
> All mathematical optimizations, risk probabilities, and deadlines are computed by the deterministic Python decision engine. The AI assistant acts strictly as an explanatory tool-use assistant that cites verified tool output chips. Only a certified human operator can approve plans (`HUMAN_APPROVED` cryptographic token) or trigger physical hardware relays.

---

## 3. The 5 Canonical Incident Scenarios

Tidewatch includes one-click scripted demonstration scenarios on the top navigation bar:

| Scenario | Title | Root Cause / Trigger | Automated Diagnosis | Authoritative Decision | Economic Impact |
|:---|:---|:---|:---|:---|:---|
| **S1** | **Overnight Primary Pump Trip** | Transfer pump P-1 trips mechanically at 02:15 AM; outflow drops to 0; 120 bbl/hr inflow continues unmitigated. | P-1 mechanical motor trip (>90% probability). | Start Standby Pump P-2 within 58-minute bisection deadline. | Avoids $25,000 facility shutdown at $295 total response cost. |
| **S2** | **Line Restriction vs Pump Degradation** | Pipeline header valve choked 50%; discharge pressure spikes to 128 psi. | Discharge Pipeline Blocked (>80% probability). | Recommends Shannon-entropy inspection of header block valve ($35, 10 min). | Eliminates false emergency pump overhaul ($4,500). |
| **S3** | **Sensor Drift / Foam False Alarm** | Foam layer causes ultrasonic gauge to drift +25% up to 88% alarm; true level is 46%. | 3-way arbiter flags `ODD_ONE_OUT: ultrasonic` (camera & mass balance agree). | Recommends Hand-Gauge Innage Tape (SOP-PW-305, $40). | Prevents unnecessary well curtailment ($3,800+ saved). |
| **S4** | **Upstream Water-Cut Surge** | Upstream fracturing flowback causes +60% water surge (192 bbl/hr), exceeding single pump capacity. | Upstream Inflow Surge (>85% probability). | Value-ranked curtailment: curtails W-12 ($5.40/bbl) and W-7 ($8.20/bbl); spares W-1 ($32.50/bbl). | Saves $1,280/hr in deferred oil revenue vs blind shut-ins. |
| **S5** | **Compound Failure & Contention** | P-1 trips while standby pump P-2 is tagged out for scheduled maintenance (`MAINTENANCE`). | Compound equipment failure with standby unavailable. | Enumerates remaining options: Emergency Trucking + Well Curtailment; shows countdown to 60-min lead time. | Protects facility with dynamic cost-of-waiting tracking. |

---

## 4. Evaluation Benchmark (50 Seeded Monte Carlo Trials)

Run `make eval` to execute the statistical evaluation benchmark comparing Tidewatch against industry baselines:

```text
================================================================================
TIDEWATCH DECISION ENGINE EVALUATION BENCHMARK (50 MONTE CARLO TRIALS)
================================================================================
Strategy                                      | Shutdown Rate  | Mean Cost    | Warning Gained
--------------------------------------------------------------------------------
Baseline 0: Unassisted (React at High-High Alarm) |         80.0% | $  20938.84 |        0.0 min
Baseline 1: Fixed Rule-of-Thumb (70% Threshold) |         40.0% | $  11405.00 |       11.8 min
Baseline 2: Tidewatch Deterministic Decision Engine |          0.0% | $    450.50 |       58.6 min
================================================================================
Cost Savings vs Unassisted (B0):  $20,488.34 per incident
Cost Savings vs Heuristic (B1):   $10,954.50 per incident
Additional Advance Warning Time:  +46.8 minutes
================================================================================
```

---

## 5. Technology Stack & Track Alignment

### Track 1: EOG Resources (Produced-Water Operations)
- **Fluid Mechanics:** Dynamic mass balance ($dL/dt = (Q_{in} - Q_{out}) / A_{tank}$).
- **Decision Engine:** Combinatorial response planning with bisection search and operator risk tolerance ($\alpha = 0.05$).
- **Economic Well Optimization:** Value-ranked curtailment prioritizing lowest oil margin per barrel of water ($5.40/bbl before $32.50/bbl).

### Track 2: SpacetimeDB (Live Shared Operational State)
- **Module:** Official v2.14 TypeScript server module (`spacetimedb/src/index.ts`).
- **Tables (11):** `tank_state`, `pump_state`, `level_estimates`, `alert`, `hypothesis`, `option`, `plan`, `decision`, `action_claim`, `handoff_item`, `presence`.
- **Reducers (9):** `ack_alert`, `approve_plan`, `claim_action`, `complete_action`, `add_note`, `set_risk_tolerance`, `open_handoff`, `accept_handoff`, `resolve_incident`.
- **Zero-Downtime Replication:** Dual-mode adapter with local replicated mirror and multi-client presence tracking.

### Track 3: NVIDIA (AI Agent & Tool Orchestration)
- **Nemotron Architecture:** 10 discrete tool implementations (`get_state`, `diagnose`, `forecast`, `list_options`, `evaluate_plan`, `search_runbooks`, etc.).
- **Ground-Truth Citations:** Every assertion in plain-language briefings links directly to a verifiable tool chip.
- **Safety Gate:** Agent lacks authorization to approve plans or actuate valves (`can_approve_or_actuate = False`).

### Track 4: Tiger Data (Time-Series Hypertables)
- **Hypertable DDL:** `WITH (tsdb.hypertable, tsdb.segmentby = 'tank_id', tsdb.orderby = 'time DESC')`.
- **Telemetry Derivatives:** Computes actual net flow rates from raw tank level changes over rolling windows.
- **Scorecards:** Forecast-vs-actual MAE, MAPE, and P10–P90 coverage scoring.

### Track 5: Hardware-in-the-Loop & Computer Vision
- **Firmware (`hardware/arduino_rig.ino`):** 115,200 baud JSON protocol, HC-SR04 ultrasonic sensor, relay pump actuation, 3,000 ms watchdog.
- **Computer Vision (`vision/camera_service.py`):** 4-corner perspective rectification, HSV blue dye fluid level segmentation, pump indicator LED brightness sensing.

---

## 6. Quick Start & Development

### Prerequisites
- Node.js v18+ (tested on v24)
- Python 3.11+ (tested on 3.13)
- Git

### One-Command Setup & Execution

```bash
# Clone the repository
git clone https://github.com/Insight14/HackUTD-2026.git
cd HackUTD-2026

# Configure environment
cp .env.example .env

# Install backend dependencies
pip install -r backend/requirements.txt

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run all 47 tests across all subsystems
make test

# Run the 50-trial Monte Carlo benchmark
make eval

# Build the frontend for production
make build

# Start both backend and frontend development servers
make dev
```

Open your browser to:
- **Operator Console:** [http://localhost:5173](http://localhost:5173)
- **FastAPI Interactive Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Demonstration Walkthrough Guide:** See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)
