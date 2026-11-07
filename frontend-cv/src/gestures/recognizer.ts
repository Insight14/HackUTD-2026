export interface Point {
  x: number;
  y: number;
  z: number;
}
export type Gesture = "point" | "palm" | "pinch" | "none";
export const gestureConfig = {
  confidence: 0.75,
  dwellMs: 420,
  cooldownMs: 1100,
  pinchRatio: 0.32,
  swipeDistance: 0.18,
  swipeWindowMs: 420,
  smoothing: 0.3,
};
export function classifyHand(p: Point[], config = gestureConfig): Gesture {
  if (p.length !== 21) return "none";
  const distance = (a: number, b: number) =>
    Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y, p[a].z - p[b].z);
  const scale = distance(0, 9);
  if (scale < 0.015) return "none";
  if (distance(4, 8) / scale < config.pinchRatio) return "pinch";
  const extended = (tip: number, pip: number) =>
    distance(tip, 0) > distance(pip, 0) * 1.14;
  const index = extended(8, 6),
    middle = extended(12, 10),
    ring = extended(16, 14),
    pinky = extended(20, 18);
  if (index && middle && ring && pinky) return "palm";
  if (index && !middle && !ring && !pinky) return "point";
  return "none";
}
export class GestureGate {
  private candidate: Gesture = "none";
  private since = 0;
  private last = -Infinity;
  private latched = false;
  reset() {
    this.candidate = "none";
    this.since = 0;
    this.latched = false;
  }
  update(gesture: Gesture, now: number): boolean {
    if (gesture !== this.candidate) {
      this.candidate = gesture;
      this.since = now;
      this.latched = false;
      return false;
    }
    if (
      gesture === "none" ||
      this.latched ||
      now - this.since < gestureConfig.dwellMs ||
      now - this.last < gestureConfig.cooldownMs
    )
      return false;
    this.last = now;
    this.latched = true;
    return true;
  }
}
