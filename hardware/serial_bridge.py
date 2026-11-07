"""Serial Communication Bridge for Arduino Demonstration Rig.

Reads ultrasonic level telemetry, drives the pump relay upon human approval,
and feeds measurements directly into the Avon simulator ingest pipeline.
Gracefully handles physical disconnections without interrupting the application.
"""
import asyncio
import json
import logging
import threading
import time
from typing import Optional, Dict, Any

from backend.app.simulator.engine import AvonSimulator
from backend.app.api.simulator import simulator

logger = logging.getLogger("serial_bridge")

class ArduinoSerialBridge:
    """Manages serial communication with physical Arduino demonstration rig."""

    def __init__(self, port: str = "/dev/tty.usbmodem1101", baud_rate: int = 115200, enabled: bool = False):
        self.port = port
        self.baud_rate = baud_rate
        self.enabled = enabled

        self._serial = None
        self._connected = False
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_heartbeat_sent = 0.0

        # Latest telemetry frame
        self.latest_telemetry: Dict[str, Any] = {
            "ultrasonic_fraction": 0.41,
            "level_bbl": 410.0,
            "raw_distance_cm": 14.62,
            "pump_running": True,
            "watchdog_ok": True,
            "connected": False,
            "simulated_fallback": True,
        }

    def connect(self) -> bool:
        """Attempt connection to Arduino serial port."""
        if not self.enabled:
            logger.info("Hardware serial bridge disabled in configuration; running in virtual mode.")
            self._connected = False
            return False

        try:
            import serial
            self._serial = serial.Serial(self.port, self.baud_rate, timeout=1.0)
            self._connected = True
            self._running = True
            self._thread = threading.Thread(target=self._read_loop, daemon=True)
            self._thread.start()
            logger.info(f"Connected to Arduino rig on port: {self.port}")
            return True
        except Exception as e:
            self._connected = False
            logger.warning(f"Could not connect to physical Arduino on {self.port}: {e}. Simulator fallback active.")
            return False

    def disconnect(self):
        """Safely close serial port."""
        self._running = False
        if self._serial and self._serial.is_open:
            try:
                self._serial.close()
            except Exception:
                pass
        self._connected = False

    def _read_loop(self):
        """Background thread reading serial lines from Arduino."""
        while self._running:
            if not self._serial or not self._serial.is_open:
                time.sleep(1.0)
                continue

            try:
                # Send periodic heartbeat keep-alive
                now = time.time()
                if now - self._last_heartbeat_sent > 1.0:
                    self._serial.write(b"{\"command\":\"PING\"}\n")
                    self._last_heartbeat_sent = now

                line = self._serial.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                if line.startswith("{") and line.endswith("}"):
                    data = json.loads(line)
                    if data.get("type") == "telemetry":
                        u_frac = float(data.get("ultrasonic_fraction", 0.41))
                        p_run = bool(data.get("pump_running", False))
                        pump_stat = "RUNNING" if p_run else "STOPPED"

                        self.latest_telemetry = {
                            "ultrasonic_fraction": u_frac,
                            "level_bbl": float(data.get("level_bbl", u_frac * 1000.0)),
                            "raw_distance_cm": float(data.get("raw_distance_cm", 14.0)),
                            "pump_running": p_run,
                            "watchdog_ok": bool(data.get("watchdog_ok", True)),
                            "connected": True,
                            "simulated_fallback": False,
                        }

                        # Forward to simulator hardware ingest interface
                        simulator.set_hardware_reading(
                            tank_id="tank_a",
                            ultrasonic_fraction=u_frac,
                            pump_status=pump_stat,
                        )
            except Exception as e:
                logger.error(f"Error reading serial telemetry: {e}")
                time.sleep(0.5)

    def set_pump_relay(self, state: bool, human_approved_token: str) -> Dict[str, Any]:
        """Trigger physical pump relay (STRICT HUMAN OPERATOR GATE)."""
        if human_approved_token != "HUMAN_APPROVED":
            return {
                "success": False,
                "error": "ACTUATION_DENIED: Physical hardware actuation requires explicit human approval token.",
            }

        # Update latest telemetry cache
        self.latest_telemetry["pump_running"] = state

        if not self._connected or not self._serial:
            # Virtual demonstration mode
            logger.info(f"Hardware in virtual mode: pump relay set to {state}")
            return {
                "success": True,
                "relay_state": state,
                "mode": "VIRTUAL_DEMONSTRATION",
                "message": f"Demonstration pump relay switched to {'ON' if state else 'OFF'}.",
            }

        try:
            cmd = json.dumps({"command": "SET_RELAY", "state": state, "token": human_approved_token}) + "\n"
            self._serial.write(cmd.encode("utf-8"))
            return {
                "success": True,
                "relay_state": state,
                "mode": "HARDWARE_SERIAL_TRANSMITTED",
                "message": f"Serial actuation sent to Arduino rig on {self.port}.",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to transmit serial actuation: {e}",
            }

    def get_status(self) -> Dict[str, Any]:
        """Return hardware rig connection status and latest reading."""
        return {
            "enabled": self.enabled,
            "connected": self._connected,
            "port": self.port,
            "baud_rate": self.baud_rate,
            "latest_reading": self.latest_telemetry,
        }

arduino_bridge = ArduinoSerialBridge()

