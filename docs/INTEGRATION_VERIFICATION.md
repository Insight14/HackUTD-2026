# Integration Verification Report

**Project:** Tidewatch — Real-Time AI Decision Console  
**Date:** November 2026  
**Environment:** macOS (arm64, Apple Silicon), Python 3.13, Node v24.3.0  

---

## 1. SpacetimeDB
- **SDK Verification:** SpacetimeDB officially supports TypeScript server modules via `spacetimedb/server` and client subscriptions via `spacetimedb` and `spacetimedb/react`.
- **Backend Bridge:** SpacetimeDB exposes standard HTTP endpoints (`POST /v1/database/:database_name/call/:reducer`) as well as WebSocket interfaces, allowing Python to directly push state updates, ingest telemetry, and invoke reducers without custom binary dependencies.
- **Client Sync:** Connected React clients establish a WebSocket (`DbConnection.builder().withUri(...).build()`) and register subscriptions on published tables. Changes stream directly into local client memory caches.
- **Reducer Validation:** Reducers are transactional. Double approvals and conflicting action claims are rejected server-side.
- **Action Plan:** Provide a dedicated adapter `backend/app/integrations/spacetimedb.py` with both HTTP reducer execution and local in-memory fallback for offline testing.

---

## 2. Tiger Data (PostgreSQL / TimescaleDB Protocol)
- **SDK Verification:** Tiger Data is built on PostgreSQL with TimescaleDB time-series extensions (hypertables, `time_bucket`, continuous aggregates).
- **Driver:** Accessed using standard Python database drivers (`asyncpg` / `psycopg3` / `SQLAlchemy`). No proprietary closed-source driver is required.
- **Time-Series Queries:** Hypertables support high-velocity sensor feeds (levels, flow rates, pressures, forecast errors) and fast rolling window aggregates.
- **Fallback Strategy:** When `TIGER_DATA_ENABLED=false` or offline, an in-memory ring-buffer / SQLite time-series adapter provides seamless local development and automated CI testing.

---

## 3. NVIDIA Nemotron
- **API Verification:** NVIDIA models (including `nvidia/nemotron-4-34b-instruct`) are hosted via NVIDIA NIM at `https://integrate.api.nvidia.com/v1`, exposing a standard OpenAI-compatible completions API.
- **SDK:** Uses standard `openai.OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key="nvapi-...")` client.
- **Tool-Use Pipeline:** Model parameters use structured tool/function definitions. Responses cite tool outputs directly.
- **Safety Invariant:** The agent is purely explanatory. Approval endpoints in FastAPI and SpacetimeDB reject any programmatic approval request that does not originate from authenticated human operator sessions.
- **Mock/Offline Mode:** Includes a deterministic mock agent that generates exact tool-call traces for local offline scenarios (S1-S5) without external network dependency.

---

## 4. MongoDB
- **Protocol:** Standard MongoDB driver (`motor` for async FastAPI or `pymongo`).
- **Use Case:** Collection of SOP documents, EOG runbooks, and synthetic historical incident cards.
- **Fallback Strategy:** Embedded JSON documents in `config/runbooks.json` provide instant local fallback when MongoDB credentials are not configured.

---

## 5. Computer Vision & OpenCV
- **Libraries:** `opencv-python`, `numpy`, `scipy`.
- **Calibration & Segmentation:** HSV color space thresholding for water dye detection; perspective transform for tank corners; median filtering for noise reduction; contour bounding for pump LED state.
- **Independent 3-Way Cross Check:**
  - Estimate 1: Ultrasonic distance / level sensor
  - Estimate 2: Optical camera fill fraction
  - Estimate 3: Dynamic flow mass balance ($Level_t = Level_{t-1} + \frac{(Inflow - Outflow) \cdot \Delta t}{Area}$)
- **Graceful Degradation:** When camera is disconnected, system displays `"VISION_OFFLINE"`, never zero or fabricated levels.
