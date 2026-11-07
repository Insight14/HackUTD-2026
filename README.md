# TIDEWATCH

> Real-Time AI-Assisted Decision Console for Produced-Water Operations  
> Built for EOG Resources, SpacetimeDB, NVIDIA, and MLH tracks.

---

## What is Tidewatch?

Tidewatch helps a night-shift oil-field operator manage produced-water gathering networks. When a transfer pump fails, a gathering tank fills excessively, or a level sensor drifts, Tidewatch:

1. **Diagnoses Root Cause:** Naive-Bayes fault classifier over physics evidence, ranking hypotheses with expected information gain.
2. **Forecasts Time-to-Threshold:** Monte Carlo physical simulation generating P10–P90 arrival bands to high-high overflow limits.
3. **Prices Available Responses:** Combinatorial search over available operational actions (standby pumps, well curtailment, rerouting, trucking).
4. **Calculates Decision Deadlines & Cost of Waiting:** Live bisection countdown for every response option and dynamic slope ($/min) of waiting.
5. **Cross-Checks Sensor Trust:** Triangulates physical level sensor, optical computer vision, and mass-balance flow integration.
6. **Synchronizes Across Roles:** SpacetimeDB provides instant, multi-operator incident synchronization and field technician action claiming.
7. **Maintains Shift Handoff:** Carries open decisions, expired options, and audit logs cleanly across shifts.

---

## Safety Invariant

**The AI agent (NVIDIA Nemotron) never approves plans or directly actuates field hardware.**  
All mathematical optimizations and physical forecasts are calculated by the deterministic Python decision engine. The AI agent acts strictly as an explanatory tool-use assistant that cites verified tool output chips. Only a certified human operator can approve plans or trigger hardware relays.

---

## Project Structure

```text
├── backend/                # Python FastAPI decision engine & simulation services
│   ├── app/
│   │   ├── api/            # REST and WebSocket endpoints
│   │   ├── engine/         # Deterministic decision math (Monte Carlo, Bayes, Plan search)
│   │   ├── simulator/      # Avon network physical simulator & fault injection
│   │   ├── integrations/   # SpacetimeDB, Tiger Data, MongoDB, and Nemotron adapters
│   │   ├── config.py       # Pydantic environment configuration
│   │   └── main.py         # FastAPI application entrypoint
│   └── requirements.txt    # Python dependencies
├── frontend/               # Vite + React + TypeScript + Tailwind CSS console
│   ├── src/
│   │   ├── components/     # Gauges, countdown clocks, options board, audit timeline
│   │   ├── lib/            # SpacetimeDB client connections and reactive hooks
│   │   ├── views/          # Operator Console, Field Tech Mobile view, 3D Digital Twin
│   │   ├── App.tsx         # Main application layout
│   │   └── main.tsx        # React DOM entrypoint
│   └── package.json        # Frontend dependencies
├── spacetimedb/            # SpacetimeDB TypeScript module
│   ├── src/
│   │   └── index.ts        # Shared tables and transactional reducers
│   └── package.json        # SpacetimeDB module manifest
├── config/                 # Topology and illustrative operating parameters
│   └── avon_system.json    # Tank volumes, pump curves, well margins, costs
├── vision/                 # OpenCV camera level and pump LED detection
├── hardware/               # Arduino firmware and serial communication
├── tests/                  # Unit, integration, and scenario tests (S1–S5)
├── docs/                   # Architecture diagrams and integration verification
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── README.md
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v18+ (tested on v24)
- **Python**: 3.11+ (tested on 3.13)
- **Git**

### 2. Quick Setup

```bash
# Clone the repository
git clone <repo-url>
cd HackUTD_Project

# Configure environment variables
cp .env.example .env

# Setup backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Setup frontend
cd frontend
npm install
cd ..
```

### 3. Running the Development Stack

**Terminal 1 — Backend API & Decision Engine:**
```bash
cd backend
uvicorn backend.app.main:app --reload --port 8000
```

**Terminal 2 — Frontend Operator Console:**
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` to view the Tidewatch console.

---

## Synthetic Data Notice

All costs, flow parameters, fluid volumes, and failure distributions are illustrative defaults modeled after typical Permian Basin produced-water operations. They can be replaced with real EOG field parameters via `config/avon_system.json`.

