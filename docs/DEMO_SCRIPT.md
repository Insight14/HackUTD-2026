# TIDEWATCH — LIVE JUDGE DEMONSTRATION SCRIPT & WALKTHROUGH

Welcome to **Tidewatch**, the real-time AI-assisted decision console built for night-shift produced-water operations in upstream oil and gas.

This document provides a 5-minute scripted presentation walkthrough for hackathon judges across the **EOG Resources**, **SpacetimeDB**, **NVIDIA**, and **MLH** tracks.

---

## 1. High-Level Concept & Problem Statement (30 seconds)

> *"In oil and gas fields, produced water isn't a byproduct you can ignore — if water gathering stops, oil production stops. When a night-shift operator at 2:00 AM faces a pump failure, a false sensor alarm, or a water surge, they must make high-stakes financial decisions in minutes. Shutting down costs $25,000+ per hour. Starting the wrong equipment burns money or creates environmental spills.  
> Tidewatch is the first console to combine **deterministic hydraulic simulation**, **Monte Carlo bisection deadlines**, **SpacetimeDB real-time multi-operator synchronization**, **Tiger Data time-series telemetry**, and **NVIDIA Nemotron AI explanations with clickable ground-truth chips**."*

---

## 2. Five Canonical Operational Scenarios (2.5 minutes)

Use the top toolbar buttons (**S1** through **S5**) to trigger each scenario live:

### Scenario 1: Overnight Primary Pump Trip
- **Click:** `S1: Overnight Pump Trip`
- **What happens:** Transfer pump P-1 trips at 02:15 AM. Flow drops to 0 while inflow continues at 120 bbl/hr.
- **Console Reaction:**
  1. **Time-to-High-High:** Drops immediately to **~72 minutes** with P10–P90 probability bands.
  2. **Authoritative Diagnosis:** Identifies *Transfer Pump P-1 Mechanical Trip* (>90% confidence).
  3. **Response Plan:** Proposes starting Standby Pump P-2 ($250 fixed + $45/hr).
  4. **Bisection Deadline:** Highlights deadline at **58 minutes** with a cost-of-waiting gradient of **$45/min**.
  5. **Human Approval:** Click **"Approve & Execute Plan (Token: HUMAN_APPROVED)"**.
- **Result:** Standby pump starts, level stabilizes, avoiding a $25,000 facility shutdown.

---

### Scenario 2: Downstream Line Restriction vs Pump Degradation
- **Click:** `S2: Line Restriction`
- **What happens:** Downstream header valve is choked 50%. Outflow drops to 60 bbl/hr, but pump P-1 motor remains running.
- **Console Reaction:**
  1. **Physical Telemetry:** Discharge pressure spikes to **~128 psi** (high backpressure).
  2. **Differential Diagnosis:** Differentiates pump impeller failure from downstream choke. Assigns >80% likelihood to *Discharge Pipeline Blocked*.
  3. **Shannon Entropy Field Check:** Recommends *Check Pipeline Header Block Valve / Discharge Gauge* ($35, 10 min) rather than a costly pump overhaul.

---

### Scenario 3: Sensor Drift / Foam False Alarm
- **Click:** `S3: Sensor Drift (Foam)`
- **What happens:** Surface foam causes ultrasonic gauge to drift +25% upward to **88%**, triggering an alarm. True fluid level is actually **46%**.
- **Console Reaction:**
  1. **3-Way Sensor Trust Arbiter:** Flags `ODD_ONE_OUT: ultrasonic` because Optical Camera and Mass-Balance flow balance agree.
  2. **Decision Engine Spread:** Uncertainty spread P10–P90 widens dramatically.
  3. **Recommended Field Action:** Recommends *Hand-Gauge Tank A with Innage Tape (SOP-PW-305, $40)*.
- **Value Saved:** Prevents premature well curtailment, saving **$3,800+** in unnecessary deferred oil production.

---

### Scenario 4: Upstream Water-Cut Surge & Well Curtailment
- **Click:** `S4: Water-Cut Surge`
- **What happens:** Upstream fracturing flowback creates a +60% water surge (192 bbl/hr), exceeding single-pump capacity.
- **Console Reaction:**
  1. **Capacity Deficit:** Both pumps or curtailment needed.
  2. **Value-Ranked Curtailment:** Engine evaluates well oil margins:
     - Curtails **W-12** ($5.40/bbl margin) and **W-7** ($8.20/bbl margin).
     - Strictly preserves high-margin **W-1** ($32.50/bbl margin).
- **Economic Optimization:** Saves $1,280/hr in deferred oil revenue compared to blind shut-ins.

---

### Scenario 5: Compound Failure & Maintenance Contention
- **Click:** `S5: Standby Contention`
- **What happens:** Primary pump P-1 trips while standby pump P-2 is tagged out for scheduled overhaul (`MAINTENANCE`).
- **Console Reaction:**
  1. **Constraint Awareness:** Eliminates P-2 from viable candidates.
  2. **Combinatorial Plan:** Proposes *Emergency Truck Hauling + Well Curtailment*.
  3. **Live Countdown:** Shows live countdown to the 60-minute truck order deadline, with escalating cost of waiting.

---

## 3. SpacetimeDB Multi-Client Live State (1 minute)

Demonstrate multi-operator collaboration across Control Room and Field:

1. **In Control Room View (R.D.):**
   - Click **"Approve & Execute Plan"** on an incident.
   - Observe that an action claim is automatically created in SpacetimeDB.
2. **Switch Client to "Field Phone (Mike S.)":**
   - In the top bar, click **"Field Phone (Mike S.)"**.
   - Notice the high-contrast mobile view designed for field trucks.
   - Click **"Claim Task as Mike S."** &rarr; status updates to `CLAIMED` instantly via SpacetimeDB reducer.
   - Enter field notes (e.g., *"Tape measured 46.2%, foam layer cleared"*) and click **"Sign Off & Complete Action"**.
3. **Switch Back to Control Room:**
   - The action displays as `COMPLETED` immediately with Mike's sign-off notes and timestamp.
   - No polling, zero-latency shared operational state.

---

## 4. Hardware Rig & OpenCV Computer Vision (45 seconds)

- **Arduino Physical Rig (`hardware/arduino_rig.ino`):**
  - Connected via USB serial at 115,200 baud.
  - HC-SR04 ultrasonic sensor reads physical water height in the demonstration tank.
  - Relays actuate physical pumps **only** when signed with a `HUMAN_APPROVED` cryptographic token.
  - Built-in 3,000 ms watchdog halts pumps if serial heartbeat drops.
- **OpenCV Optical Level Estimation (`vision/camera_service.py`):**
  - 4-corner perspective calibration rectifies acrylic tank face.
  - 5x5 median blur + HSV segmentation measures blue fluid column fill fraction.
  - Max-brightness bounding box detects physical pump green indicator LEDs.
  - Gracefully enters `VISION_OFFLINE` mode with medium-confidence mass balance arbitration if camera is occluded.

---

## 5. NVIDIA Nemotron AI Assistant with Ground-Truth Chips (45 seconds)

- Click **"Briefing"** in the AI Operational Assistant card.
- **Plain-Language Explanation:** Nemotron summarizes the situation using clear operational language.
- **Tool Chips:** All numbers are strictly cited from deterministic calculation chips (`[chip:get_state]`, `[chip:diagnose]`, `[chip:forecast]`).
- **Tool Execution Trace:** Click **"Show Tool Execution Trace"** to inspect exact JSON arguments and outputs.
- **Safety Boundary Invariant:** Note the explicit badge:  
  `can_approve_or_actuate = False`. The AI agent *never* approves plans or actuates valves. Only human operators hold approval authority.

---

## 6. Monte Carlo Evaluation Benchmark (30 seconds)

- Click the **"Monte Carlo Benchmark"** button in the top bar.
- Click **"Run 50-Trial Benchmark"**.
- View the live comparison table:
  - **Baseline 0 (Unassisted):** 80% forced shutdown rate, **$20,938** mean cost, 0 min warning.
  - **Baseline 1 (Fixed 70% Heuristic):** 40% shutdown rate, **$11,405** mean cost, 11.8 min warning.
  - **Baseline 2 (Tidewatch):** **0.0% shutdown rate**, **$450.50** mean cost, **58.6 min warning gained**.
- **Bottom Line:** **+$20,488.34 saved per incident** and **+46.8 minutes of advance notice**!

---

## 7. Digital Shift Handoff Sign-off

- Click **"Shift Handoff"** in the top bar.
- Click **"Draft with AI Assistant"** to auto-generate a structured shift narrative.
- Click **"Approve & Sign Shift Transfer"** to commit the digital log to SpacetimeDB with tamper-evident audit history.

