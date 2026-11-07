import type { TwinSnapshot } from "./types";
// Illustrative fixture only. Never used as fallback for a disconnected live source.
export function demoSnapshot(tick = 0, scenario = "failure"): TwinSnapshot {
  const surge = scenario === "surge";
  const fault = scenario === "sensor";
  const normal = scenario === "normal";
  const level = Math.min(
    96,
    (normal ? 57 : surge ? 83 : 78.4) + Math.sin(tick / 10) * 0.7,
  );
  return {
    source: "synthetic",
    timestamp: new Date().toISOString(),
    equipment: [
      {
        id: "T-101",
        name: "West gathering tank",
        kind: "tank",
        status: "running",
        position: [-5, 0, -2.5],
        level: 54.2,
        capacity: 1000,
        inflow: 120,
        outflow: 118,
        history: [42, 44, 46, 48, 50, 52, 54.2],
        ultrasonic: 54.2,
        camera: 54,
        balance: 54.6,
      },
      {
        id: "T-102",
        name: "Buffer storage",
        kind: "tank",
        status: "running",
        position: [-5, 0, 3],
        level: 36.8,
        capacity: 1000,
        inflow: 80,
        outflow: 82,
        history: [42, 41, 40, 38, 39, 38, 36.8],
        ultrasonic: 36.8,
        camera: 37.1,
        balance: 36.5,
      },
      {
        id: "T-104",
        name: "East gathering tank",
        kind: "tank",
        status: normal ? "running" : "warning",
        position: [1, 0, -2.5],
        level,
        capacity: 1500,
        inflow: surge ? 340 : 240,
        outflow: normal ? 238 : 84,
        history: [42, 47, 49, 56, 62, 70, level],
        ultrasonic: fault ? 41 : level,
        camera: level - 0.6,
        balance: level - 0.9,
      },
      {
        id: "P-01",
        name: "Primary transfer pump",
        kind: "pump",
        status: normal || surge || fault ? "running" : "failed",
        position: [-1.5, 0, 2],
        inflow: normal ? 238 : 84,
        outflow: normal ? 238 : 84,
        history: [240, 242, 239, 242, 160, 90, 84],
      },
      {
        id: "P-02",
        name: "Standby transfer pump",
        kind: "pump",
        status: "standby",
        position: [2, 0, 3.8],
        inflow: 0,
        outflow: 0,
        history: [0, 0, 0, 0, 0, 0, 0],
      },
      {
        id: "D-01",
        name: "Water treatment",
        kind: "treatment",
        status: "running",
        position: [6.2, 0, 0],
        inflow: 202,
        outflow: 202,
        history: [240, 244, 241, 230, 220, 210, 202],
      },
    ],
    incident: normal
      ? null
      : {
          title: fault
            ? "Level sensor disagreement"
            : surge
              ? "Upstream inflow surge"
              : "Primary transfer pump offline",
          description: fault
            ? "Ultrasonic reading differs from camera and flow balance. Verify the sensor on site."
            : surge
              ? "East gathering inflow exceeds normal operating range. Inspect T-104."
              : "Reduced outflow is raising T-104. Inspect the affected equipment and return to the operator console for response approval.",
          equipmentId: fault || surge ? "T-104" : "P-01",
        },
    forecast: normal
      ? null
      : { minutes: 41, p10: 28, p90: 63, costPerMinute: 310 },
  };
}
