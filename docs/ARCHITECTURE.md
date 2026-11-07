# Tidewatch — System Architecture & Data Flow

Tidewatch is a real-time AI-assisted decision console for produced-water operations (EOG, SpacetimeDB, NVIDIA + MLH).

```
                      +-----------------------------+
                      |   Physical Rig (Arduino)    |
                      |   - Ultrasonic Tank Level   |
                      |   - Pump Relay & LED        |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+     +------------------------+
                      |   Simulated Avon System     |     |   OpenCV Vision Rig    |
                      |   - Tanks, Pumps, Wells     |     |   - HSV Dye Detection  |
                      |   - Inflow/Outflow Balance  |     |   - Pump LED Status    |
                      +--------------+--------------+     +-----------+------------+
                                     |                                |
                                     +----------------+---------------+
                                                      |
                                                      v
                                        +----------------------------+
                                        |  Telemetry Ingestion Layer |
                                        +--------------+-------------+
                                                       |
                             +-------------------------+-------------------------+
                             |                                                   |
                             v                                                   v
              +------------------------------+                    +------------------------------+
              |          Tiger Data          |                    |   Deterministic Decision     |
              |   Time-Series Telemetry &    |                    |          Engine              |
              |   Forecast-vs-Actual Audit   |                    |   - Monte Carlo Forecast     |
              +------------------------------+                    |   - Bisection Deadlines      |
                                                                  |   - Cost of Waiting ($/min)  |
                                                                  |   - Naive-Bayes Diagnosis    |
                                                                  |   - 3-Estimate Sensor Trust  |
                                                                  +--------------+---------------+
                                                                                 |
                                                                                 v
+------------------------------+                                  +------------------------------+
|     MongoDB Document Store   |                                  |         SpacetimeDB          |
|   - Runbooks & Procedures    | <----+                           |   - Live Shared State        |
|   - Historical Incidents     |      |                           |   - Reducers: ack, approve,  |
+------------------------------+      |                           |     claim, complete, handoff |
                                      v                           +--------------+---------------+
                      +-------------------------------+                          |
                      |      NVIDIA Nemotron Agent    |                          |
                      |   - Strict Tool-Use Only      |                          |
                      |   - Plain Language Explanations|                         |
                      |   - Zero Math Fabrication     |                          |
                      +---------------+---------------+                          |
                                      |                                          |
                                      +--------------------+---------------------+
                                                           |
                                                           v
                                            +------------------------------+
                                            |   React Operator Console     |
                                            |   - Action Needed Banner     |
                                            |   - Ranked Diagnosis Cards   |
                                            |   - Expiring Options Board   |
                                            |   - 3-Estimate Trust Status  |
                                            |   - Field Tech Mobile View   |
                                            |   - Interactive 3D Twin      |
                                            +------------------------------+
```

## Architectural Responsibility Invariants

1. **Python Decision Engine**: Owns 100% of the mathematical calculations, physical mass-balance integration, Monte Carlo forecast envelopes (P10-P90), bisection deadlines, and Bayesian hypothesis scoring. All formulas are strictly deterministic given a fixed seed.
2. **SpacetimeDB**: The authoritative shared state layer. Replicates tank states, alert acknowledgments, plan approvals, and field technician action claims across multiple simultaneous operator consoles and mobile clients with atomic reducers.
3. **React Console**: Presents the unified operator view. Subscribes reactively to SpacetimeDB. Exposes the human approval gate. Never computes authoritative risk or costs locally.
4. **NVIDIA Nemotron**: An explanatory and retrieval agent. Calls deterministic backend tools to fetch exact numbers. Every numerical figure cited in conversational summaries links back to an exact tool chip. Never approves plans or actuates hardware.
5. **Tiger Data**: Long-term time-series store and scorecard evaluation (comparing predicted forecast horizons with actual observed levels).
6. **MongoDB**: Stores runbooks, standard operating procedures, and synthetic historical incident memory.
7. **Computer Vision & Hardware-in-the-Loop**:
   - Compares 3 independent estimates for tank level: (1) Ultrasonic sensor, (2) Camera HSV fraction, (3) Mass balance inflow/outflow integration.
   - If two agree and one diverges, the outlier is isolated and uncertainty is widened.
   - Physical relay actuation is gated strictly by explicit human operator click in the console.

