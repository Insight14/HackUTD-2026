import type { Point } from "./recognizer";
export interface ZoomRange {
  closed: number;
  open: number;
}
export const defaultZoomRange: ZoomRange = { closed: 0.2, open: 1.45 };
export function validZoomRange(range: ZoomRange) {
  return (
    Number.isFinite(range.closed) &&
    Number.isFinite(range.open) &&
    range.closed >= 0 &&
    range.open - range.closed >= 0.3 &&
    range.open <= 5
  );
}
/** Palm-relative 2D separation, corrected for camera aspect ratio. */
export function fingerSpread(points: Point[], aspect = 4 / 3): number | null {
  if (
    points.length !== 21 ||
    points.some((p) => ![p.x, p.y].every(Number.isFinite))
  )
    return null;
  const distance = (a: number, b: number) =>
    Math.hypot((points[a].x - points[b].x) * aspect, points[a].y - points[b].y);
  const scale = distance(0, 9);
  return scale > 0.025 ? distance(4, 8) / scale : null;
}
export function spreadLevel(spread: number, range: ZoomRange) {
  return Math.max(
    0,
    Math.min(1, (spread - range.closed) / (range.open - range.closed)),
  );
}
export class HandClutch {
  private lastSeen = -Infinity;
  update(otherPalm: boolean, manual: boolean, now: number) {
    if (otherPalm) this.lastSeen = now;
    return manual || otherPalm || now - this.lastSeen < 500;
  }
}
export interface ZoomFeedback {
  level: number;
  raw: number;
  state: "matching" | "active" | "frozen";
  hint: string;
}
/** Absolute zoom with soft takeover: releasing the clutch never moves the camera. */
export class SpreadZoomController {
  private armed = false;
  private previous: number | null = null;
  private matchedSince: number | null = null;
  reset() {
    this.armed = false;
    this.previous = null;
    this.matchedSince = null;
  }
  /** A deliberate one-second pinch explicitly takes ownership of zoom. */
  activate(raw: number) {
    this.armed = true;
    this.previous = raw;
    this.matchedSince = null;
  }
  update(
    raw: number,
    current: number,
    frozen: boolean,
    now: number,
  ): ZoomFeedback {
    raw = Math.max(0, Math.min(1, raw));
    current = Math.max(0, Math.min(1, current));
    if (frozen) {
      this.reset();
      return {
        level: current,
        raw,
        state: "frozen",
        hint: "Controls frozen — reposition your control hand",
      };
    }
    if (!this.armed) {
      const near = Math.abs(raw - current) <= 0.045;
      // Hold near the current setting; crossing it in a fast neutral movement is not enough.
      if (near) this.matchedSince ??= now;
      else this.matchedSince = null;
      if (this.matchedSince !== null && now - this.matchedSince >= 220) {
        this.armed = true;
        this.previous = raw;
        return {
          level: current,
          raw,
          state: "active",
          hint: "Spread to zoom in · close to zoom out",
        };
      }
      return {
        level: current,
        raw,
        state: "matching",
        hint: "Match the white marker and hold briefly to resume",
      };
    }
    // Small deadband suppresses landmark noise; camera damping handles motion between targets.
    if (this.previous !== null && Math.abs(raw - this.previous) < 0.012)
      return {
        level: this.previous,
        raw,
        state: "active",
        hint: "Spread to zoom in · close to zoom out",
      };
    this.previous = raw;
    return {
      level: raw,
      raw,
      state: "active",
      hint:
        raw >= 0.99
          ? "Fully zoomed in"
          : raw <= 0.01
            ? "Fully zoomed out"
            : "Spread to zoom in · close to zoom out",
    };
  }
}
