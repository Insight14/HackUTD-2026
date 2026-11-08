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
  if (
    p.length !== 21 ||
    p.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        !Number.isFinite(point.z),
    )
  )
    return "none";
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

export type GestureAction = Gesture | "swipe";
export interface GestureSample {
  gesture: Gesture;
  x: number;
  y: number;
  palmX: number;
  palmY: number;
}
export interface GestureFeedback {
  progress: number;
  hint: string;
  action?: GestureAction;
  delta?: number;
}
export const interactionConfig = {
  dwellMs: 420,
  palmDwellMs: 750,
  pinchDwellMs: 300,
  releaseMs: 180,
  cooldownMs: 1100,
  stableRadius: 0.045,
  swipeDistance: 0.18,
  swipeWindowMs: 420,
  swipeVerticalTolerance: 0.12,
};
/** One arbiter for all gestures: a swipe cannot also toggle pause. */
export class GestureController {
  private candidate: Gesture = "none";
  private since = 0;
  private lastFired = -Infinity;
  private releaseSince: number | null = null;
  private locked = false;
  private origin = { x: 0, y: 0 };
  private swipe: { x: number; y: number; time: number } | null = null;
  constructor(private config = interactionConfig) {}
  suspend() {
    this.candidate = "none";
    this.swipe = null;
    this.releaseSince = null;
    // A hidden tab or interrupted tracker must see a neutral hand before rearming.
    this.locked = true;
  }
  update(s: GestureSample, now: number): GestureFeedback {
    const c = this.config;
    if (s.gesture === "none") {
      this.candidate = "none";
      this.swipe = null;
      this.releaseSince ??= now;
      if (now - this.releaseSince >= c.releaseMs) this.locked = false;
      return {
        progress: 0,
        hint: this.locked
          ? "Relax your hand to re-arm"
          : "Point, pinch, or show an open palm",
      };
    }
    this.releaseSince = null;
    if (this.locked)
      return { progress: 0, hint: "Release the gesture before repeating" };
    if (now - this.lastFired < c.cooldownMs)
      return { progress: 0, hint: "Ready in a moment" };
    const x = s.gesture === "palm" ? s.palmX : s.x;
    const y = s.gesture === "palm" ? s.palmY : s.y;
    if (s.gesture !== this.candidate) {
      this.candidate = s.gesture;
      this.since = now;
      this.origin = { x, y };
      this.swipe =
        s.gesture === "palm" ? { x: s.palmX, y: s.palmY, time: now } : null;
    }
    if (s.gesture === "palm") {
      if (!this.swipe || now - this.swipe.time > c.swipeWindowMs)
        this.swipe = { x: s.palmX, y: s.palmY, time: now };
      const dx = s.palmX - this.swipe.x,
        dy = s.palmY - this.swipe.y;
      if (
        Math.abs(dx) >= c.swipeDistance &&
        Math.abs(dy) <= c.swipeVerticalTolerance
      ) {
        this.locked = true;
        this.lastFired = now;
        return {
          progress: 1,
          hint: dx > 0 ? "Rotate right" : "Rotate left",
          action: "swipe",
          delta: Math.sign(dx),
        };
      }
    }
    if (
      s.gesture !== "pinch" &&
      Math.hypot(x - this.origin.x, y - this.origin.y) > c.stableRadius
    ) {
      this.origin = { x, y };
      this.since = now;
      return {
        progress: 0,
        hint:
          s.gesture === "point"
            ? "Steady your finger to select"
            : "Hold still to pause; swipe to rotate",
      };
    }
    const dwell =
      s.gesture === "palm"
        ? c.palmDwellMs
        : s.gesture === "pinch"
          ? c.pinchDwellMs
          : c.dwellMs;
    const progress = Math.min(1, Math.max(0, (now - this.since) / dwell));
    if (progress >= 1) {
      this.locked = true;
      this.lastFired = now;
      return {
        progress: 1,
        hint:
          s.gesture === "point"
            ? "Selection requested"
            : s.gesture === "pinch"
              ? "Zoom closer"
              : "Animation toggled",
        action: s.gesture,
      };
    }
    return {
      progress,
      hint:
        s.gesture === "point"
          ? "Hold steady to select"
          : s.gesture === "pinch"
            ? "Hold pinch to zoom"
            : "Hold still to pause; swipe to rotate",
    };
  }
}
