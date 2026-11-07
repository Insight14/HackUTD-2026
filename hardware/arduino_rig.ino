/*
 * Tidewatch Demonstration Rig — Arduino Firmware
 *
 * Hardware-in-the-Loop demonstration node for Avon Gathering Tank A.
 * Features:
 * - HC-SR04 Ultrasonic Level Sensor for fluid distance measurement.
 * - Relay control for demonstration transfer pump.
 * - Pump status indicator LED (read optically by OpenCV camera).
 * - Structured JSON-over-serial protocol at 115200 baud.
 * - Safety Watchdog: Auto-shuts off relay if host disconnects for > 3000ms.
 * - Actuation Safety Barrier: Requires explicit "HUMAN_APPROVED" security token.
 */

#include <Arduino.h>

// Pin Definitions
const int TRIG_PIN = 9;
const int ECHO_PIN = 10;
const int RELAY_PIN = 7;
const int PUMP_LED_PIN = 8;
const int BOARD_LED_PIN = 13;

// Calibration Parameters (Clear Demo Tank Dimensions in cm)
const float TANK_EMPTY_DISTANCE_CM = 22.0; // Distance from transducer to bottom
const float TANK_FULL_DISTANCE_CM = 4.0;   // Distance when fluid reaches brim
const float TANK_HEIGHT_CM = TANK_EMPTY_DISTANCE_CM - TANK_FULL_DISTANCE_CM; // 18.0 cm
const float TANK_A_FULL_CAPACITY_BBL = 1000.0;

// Watchdog Timer (3000ms timeout)
unsigned long lastHeartbeatMillis = 0;
const unsigned long WATCHDOG_TIMEOUT_MS = 3000;

// Operating State
bool pumpRelayActive = false;
unsigned long lastTelemetryMillis = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 250; // 4 Hz transmission

float readUltrasonicDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
  if (duration == 0) {
    return TANK_EMPTY_DISTANCE_CM; // Timeout or sensor disconnected
  }
  float distanceCm = (duration * 0.0343) / 2.0;
  return constrain(distanceCm, TANK_FULL_DISTANCE_CM, TANK_EMPTY_DISTANCE_CM);
}

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(PUMP_LED_PIN, OUTPUT);
  pinMode(BOARD_LED_PIN, OUTPUT);

  // Initial Safe State: Relay OFF
  digitalWrite(RELAY_PIN, LOW);
  digitalWrite(PUMP_LED_PIN, LOW);
  digitalWrite(BOARD_LED_PIN, LOW);

  lastHeartbeatMillis = millis();
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Process Inbound Serial Commands from Host Console
  if (Serial.available() > 0) {
    String line = Serial.readStringUntil('\n');
    line.trim();

    // Heartbeat ping
    if (line.indexOf("PING") >= 0 || line.indexOf("HEARTBEAT") >= 0) {
      lastHeartbeatMillis = currentMillis;
    }

    // Relay Actuation Command (Strict Security Token Check)
    if (line.indexOf("SET_RELAY") >= 0) {
      lastHeartbeatMillis = currentMillis;
      if (line.indexOf("HUMAN_APPROVED") >= 0) {
        if (line.indexOf("\"state\": true") >= 0 || line.indexOf("\"state\":true") >= 0) {
          pumpRelayActive = true;
          digitalWrite(RELAY_PIN, HIGH);
          digitalWrite(PUMP_LED_PIN, HIGH);
          digitalWrite(BOARD_LED_PIN, HIGH);
          Serial.println("{\"type\":\"ack\",\"status\":\"RELAY_ACTIVATED\",\"authorized\":true}");
        } else {
          pumpRelayActive = false;
          digitalWrite(RELAY_PIN, LOW);
          digitalWrite(PUMP_LED_PIN, LOW);
          digitalWrite(BOARD_LED_PIN, LOW);
          Serial.println("{\"type\":\"ack\",\"status\":\"RELAY_DEACTIVATED\",\"authorized\":true}");
        }
      } else {
        // Unauthorized actuation attempt rejected
        Serial.println("{\"type\":\"error\",\"message\":\"ACTUATION_REJECTED: Missing HUMAN_APPROVED security token\"}");
      }
    }
  }

  // 2. Safety Watchdog Timeout Check
  if (currentMillis - lastHeartbeatMillis > WATCHDOG_TIMEOUT_MS) {
    if (pumpRelayActive) {
      pumpRelayActive = false;
      digitalWrite(RELAY_PIN, LOW);
      digitalWrite(PUMP_LED_PIN, LOW);
      digitalWrite(BOARD_LED_PIN, LOW);
      Serial.println("{\"type\":\"alert\",\"message\":\"WATCHDOG_TRIP: Communication loss with host console. Relay forced safe.\"}");
    }
  }

  // 3. Emit Periodic Telemetry JSON (4 Hz)
  if (currentMillis - lastTelemetryMillis >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMillis = currentMillis;

    float distanceCm = readUltrasonicDistanceCm();
    float fluidHeightCm = TANK_EMPTY_DISTANCE_CM - distanceCm;
    float fillFraction = constrain(fluidHeightCm / TANK_HEIGHT_CM, 0.0, 1.0);
    float estimatedLevelBbl = fillFraction * TANK_A_FULL_CAPACITY_BBL;

    Serial.print("{\"type\":\"telemetry\"");
    Serial.print(",\"ultrasonic_fraction\":");
    Serial.print(fillFraction, 4);
    Serial.print(",\"level_bbl\":");
    Serial.print(estimatedLevelBbl, 1);
    Serial.print(",\"raw_distance_cm\":");
    Serial.print(distanceCm, 2);
    Serial.print(",\"pump_running\":");
    Serial.print(pumpRelayActive ? "true" : "false");
    Serial.print(",\"watchdog_ok\":");
    Serial.print((currentMillis - lastHeartbeatMillis <= WATCHDOG_TIMEOUT_MS) ? "true" : "false");
    Serial.println("}");
  }
}

