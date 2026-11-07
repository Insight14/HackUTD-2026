"""Unit and Integration Tests for Tiger Data Time-Series Integration."""
from datetime import datetime, timezone, timedelta
import pytest

from backend.app.integrations.tiger_data import TigerDataAdapter, TelemetryPoint

def test_telemetry_ingestion_and_retrieval():
    """Verify telemetry points can be inserted and retrieved."""
    adapter = TigerDataAdapter(enabled=False)
    now = datetime.now(timezone.utc)

    point = TelemetryPoint(
        timestamp=now,
        tank_id="tank_a",
        level_bbl=415.5,
        fill_fraction=0.4155,
        inflow_bbl_per_hr=125.0,
        outflow_bbl_per_hr=120.0,
        net_rate_bbl_per_hr=5.0,
        pump_id="p_1",
        pump_status="RUNNING",
        pump_discharge_psi=85.0,
        pump_vibration_rms=1.2,
        is_synthetic=True,
    )
    adapter.ingest_telemetry(point)

    history = adapter.query_history(tank_id="tank_a", limit=10)
    assert len(history) > 0
    assert history[-1].level_bbl == 415.5
    assert history[-1].is_synthetic is True
    assert history[-1].synthetic_label == "SYNTHETIC_DATA_LABELED"

def test_historical_time_window_filtering():
    """Verify historical queries return the correct time window."""
    adapter = TigerDataAdapter(enabled=False)
    now = datetime.now(timezone.utc)

    # Clear existing store
    adapter.telemetry_store.clear()

    # Insert point 30 minutes ago, 15 minutes ago, and now
    p_30m = TelemetryPoint(
        timestamp=now - timedelta(minutes=30),
        tank_id="tank_a",
        level_bbl=400.0,
        fill_fraction=0.40,
        inflow_bbl_per_hr=120.0,
        outflow_bbl_per_hr=120.0,
        net_rate_bbl_per_hr=0.0,
        pump_id="p_1",
        pump_status="RUNNING",
        pump_discharge_psi=85.0,
        pump_vibration_rms=1.2,
    )
    p_15m = TelemetryPoint(
        timestamp=now - timedelta(minutes=15),
        tank_id="tank_a",
        level_bbl=405.0,
        fill_fraction=0.405,
        inflow_bbl_per_hr=125.0,
        outflow_bbl_per_hr=120.0,
        net_rate_bbl_per_hr=5.0,
        pump_id="p_1",
        pump_status="RUNNING",
        pump_discharge_psi=85.0,
        pump_vibration_rms=1.2,
    )
    p_now = TelemetryPoint(
        timestamp=now,
        tank_id="tank_a",
        level_bbl=410.0,
        fill_fraction=0.41,
        inflow_bbl_per_hr=125.0,
        outflow_bbl_per_hr=120.0,
        net_rate_bbl_per_hr=5.0,
        pump_id="p_1",
        pump_status="RUNNING",
        pump_discharge_psi=85.0,
        pump_vibration_rms=1.2,
    )

    adapter.ingest_telemetry(p_30m)
    adapter.ingest_telemetry(p_15m)
    adapter.ingest_telemetry(p_now)

    # Query window: last 20 minutes
    recent = adapter.query_history(
        tank_id="tank_a",
        start_time=now - timedelta(minutes=20),
        end_time=now + timedelta(minutes=1),
    )

    assert len(recent) == 2
    assert recent[0].level_bbl == 405.0
    assert recent[1].level_bbl == 410.0

def test_flow_rate_estimation_from_level_changes():
    """Verify calculating implied flow rate from physical fluid level changes."""
    adapter = TigerDataAdapter(enabled=False)
    adapter.telemetry_store.clear()
    now = datetime.now(timezone.utc)

    # 15 minutes ago, level was 400.0 bbl
    adapter.ingest_telemetry(
        TelemetryPoint(
            timestamp=now - timedelta(minutes=15),
            tank_id="tank_a",
            level_bbl=400.0,
            fill_fraction=0.40,
            inflow_bbl_per_hr=100.0,
            outflow_bbl_per_hr=0.0,
            net_rate_bbl_per_hr=100.0,
            pump_id="p_1",
            pump_status="STOPPED",
            pump_discharge_psi=0.0,
            pump_vibration_rms=0.0,
        )
    )
    # Now, level is 425.0 bbl (gained 25 bbl in 15 min = 100 bbl/h implied flow rate)
    adapter.ingest_telemetry(
        TelemetryPoint(
            timestamp=now,
            tank_id="tank_a",
            level_bbl=425.0,
            fill_fraction=0.425,
            inflow_bbl_per_hr=100.0,
            outflow_bbl_per_hr=0.0,
            net_rate_bbl_per_hr=100.0,
            pump_id="p_1",
            pump_status="STOPPED",
            pump_discharge_psi=0.0,
            pump_vibration_rms=0.0,
        )
    )

    est = adapter.estimate_flow_rate_from_level_changes(tank_id="tank_a", window_minutes=20.0)
    assert est.delta_level_bbl == pytest.approx(25.0, abs=0.1)
    assert est.implied_net_flow_bbl_per_hr == pytest.approx(100.0, abs=1.0)
    assert est.discrepancy_flagged is False

def test_forecast_scorecard_auditing():
    """Verify forecast predictions are recorded, evaluated against actuals, and scored."""
    adapter = TigerDataAdapter(enabled=False)
    adapter.scorecard_store.clear()

    # Record a prediction for Tank A with target time in the past
    now = datetime.now(timezone.utc)
    entry = adapter.record_forecast_prediction(
        tank_id="tank_a",
        predicted_level_bbl=450.0,
        horizon_minutes=0.0,  # Ready immediately
        predicted_p10_minutes=15.0,
        predicted_p90_minutes=25.0,
    )
    # Set target_time slightly in the past
    entry.target_time = now - timedelta(seconds=1)

    # Audit scorecard against actual level of 452.0 bbl
    scorecard = adapter.update_actuals_and_scorecard({"tank_a": 452.0})

    assert scorecard.total_forecasts_evaluated == 1
    assert scorecard.mean_absolute_error_bbl == pytest.approx(2.0, abs=0.01)
    assert scorecard.p10_p90_coverage_percentage == 100.0
    assert scorecard.is_synthetic is True

def test_status_and_offline_fallback():
    """Verify status reports fallback buffer active and labels synthetic data."""
    adapter = TigerDataAdapter(enabled=False)
    status = adapter.get_status()

    assert status["fallback_buffer_active"] is True
    assert status["is_synthetic"] is True
    assert status["synthetic_data_label"] == "SYNTHETIC_DATA_LABELED"
