import type { TwinSnapshot } from "./types";
/** Reject invalid external frames instead of rendering misleading levels or geometry. */
export function validateSnapshot(s: TwinSnapshot): void {
  if (
    !s ||
    !["live", "simulator", "synthetic"].includes(s.source) ||
    !Number.isFinite(Date.parse(s.timestamp)) ||
    !Array.isArray(s.equipment)
  )
    throw new Error("Invalid application snapshot metadata");
  const ids = new Set<string>();
  for (const e of s.equipment) {
    if (!e.id || ids.has(e.id)) throw new Error("Equipment IDs must be unique");
    ids.add(e.id);
    if (
      !["tank", "pump", "treatment"].includes(e.kind) ||
      !["running", "standby", "failed", "warning"].includes(e.status)
    )
      throw new Error(`Invalid equipment type or status: ${e.id}`);
    if (e.position?.length !== 3 || !e.position.every(Number.isFinite))
      throw new Error(`Invalid position: ${e.id}`);
    if (
      e.kind === "tank" &&
      (typeof e.level !== "number" ||
        !Number.isFinite(e.level) ||
        e.level < 0 ||
        e.level > 100)
    )
      throw new Error(`Tank level must be between 0 and 100: ${e.id}`);
    if (!Array.isArray(e.history) || !e.history.every(Number.isFinite))
      throw new Error(`Invalid history: ${e.id}`);
    for (const value of [
      e.inflow,
      e.outflow,
      e.capacity,
      e.ultrasonic,
      e.camera,
      e.balance,
    ])
      if (value != null && !Number.isFinite(value))
        throw new Error(`Invalid measurement: ${e.id}`);
  }
  if (
    s.forecast &&
    ![
      s.forecast.minutes,
      s.forecast.p10,
      s.forecast.p90,
      s.forecast.costPerMinute,
    ].every((x) => Number.isFinite(x) && x >= 0)
  )
    throw new Error("Invalid forecast");
}
