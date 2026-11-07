"""Unit and Integration Tests for Hardware Bridge and OpenCV Vision Service."""
import pytest
from hardware.serial_bridge import arduino_bridge
from vision.camera_service import vision_service
from backend.app.simulator.engine import AvonSimulator

def test_hardware_serial_bridge_virtual_mode_and_status():
    """Verify hardware bridge operates safely in virtual demonstration mode when disconnected."""
    status = arduino_bridge.get_status()
    assert "latest_reading" in status
    assert status["latest_reading"]["simulated_fallback"] is True

def test_hardware_actuation_security_token_enforcement():
    """Verify relay actuation strictly rejects calls lacking the HUMAN_APPROVED security token."""
    # 1. Reject unauthorized call
    bad_res = arduino_bridge.set_pump_relay(state=True, human_approved_token="UNAUTHORIZED_CALL")
    assert bad_res["success"] is False
    assert "ACTUATION_DENIED" in bad_res["error"]

    # 2. Allow human authorized call
    good_res = arduino_bridge.set_pump_relay(state=True, human_approved_token="HUMAN_APPROVED")
    assert good_res["success"] is True
    assert good_res["relay_state"] is True
    assert arduino_bridge.latest_telemetry["pump_running"] is True

    # Reset relay to false
    arduino_bridge.set_pump_relay(state=False, human_approved_token="HUMAN_APPROVED")
    assert arduino_bridge.latest_telemetry["pump_running"] is False

def test_vision_offline_graceful_degradation():
    """Verify camera reports VISION_OFFLINE and None level when hardware camera is disconnected."""
    # Ensure camera is closed
    vision_service.release()
    result = vision_service.process_frame(frame=None)

    assert result.status == "VISION_OFFLINE"
    assert result.optical_fill_fraction is None
    assert result.estimated_level_bbl is None
    assert result.confidence == "LOW"

def test_opencv_hsv_segmentation_and_level_estimation():
    """Verify OpenCV color thresholding and median filtering accurately measures fluid column."""
    # Generate synthetic test frame of clear tank with 41% blue dyed water
    target_fraction = 0.41
    test_frame = vision_service.generate_synthetic_test_frame(
        target_fill_fraction=target_fraction,
        pump_led_on=True,
    )

    measurement = vision_service.process_frame(test_frame)

    assert measurement.status == "ONLINE"
    assert measurement.optical_fill_fraction is not None
    # Verify optical fraction within +/- 2.5% of known ground truth
    assert measurement.optical_fill_fraction == pytest.approx(target_fraction, abs=0.025)
    assert measurement.estimated_level_bbl == pytest.approx(target_fraction * 1000.0, abs=25.0)
    assert measurement.pump_led_illuminated is True
    assert measurement.pump_state_detected == "RUNNING"

def test_opencv_pump_led_detection_dark_state():
    """Verify vision service detects dark LED when pump is stopped."""
    test_frame = vision_service.generate_synthetic_test_frame(
        target_fill_fraction=0.50,
        pump_led_on=False,  # Pump stopped
    )

    measurement = vision_service.process_frame(test_frame)
    assert measurement.pump_led_illuminated is False
    assert measurement.pump_state_detected == "STOPPED"

def test_three_way_sensor_triangulation_and_fault_detection():
    """Verify 3-way sensor cross-check isolates faulty sensor and alerts operator."""
    sim = AvonSimulator(seed=42)

    # 1. Normal state: 3-way agreement
    s1 = sim.step(dt_seconds=1.0)
    readings = s1.sensor_readings["tank_a"]
    assert readings.trust_status == "THREE_WAY_AGREEMENT"
    assert readings.confidence_level == "HIGH"
    assert readings.suspect_sensor is None

    # 2. Cover/drift ultrasonic sensor by +25%
    sim.inject_sensor_drift("tank_a", 0.25)
    s2 = sim.step(dt_seconds=1.0)
    drift_readings = s2.sensor_readings["tank_a"]
    assert drift_readings.trust_status == "ODD_ONE_OUT"
    assert drift_readings.suspect_sensor == "ultrasonic"
    assert drift_readings.confidence_level == "MEDIUM"

    # 3. Vision service offline
    sim.set_vision_offline(True)
    s3 = sim.step(dt_seconds=1.0)
    offline_readings = s3.sensor_readings["tank_a"]
    assert offline_readings.trust_status == "VISION_OFFLINE"
    assert offline_readings.camera_level_fraction is None

