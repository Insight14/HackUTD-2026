import { describe, it, expect } from "vitest";
import { classifyHand, GestureGate, type Point } from "./recognizer";
function hand() {
  const points: Point[] = Array.from({ length: 21 }, () => ({
    x: 0.5,
    y: 0.65,
    z: 0,
  }));
  points[0] = { x: 0.5, y: 0.9, z: 0 };
  points[9] = { x: 0.5, y: 0.6, z: 0 };
  points[4] = { x: 0.15, y: 0.6, z: 0 };
  for (const [tip, pip, x] of [
    [8, 6, 0.4],
    [12, 10, 0.5],
    [16, 14, 0.6],
    [20, 18, 0.7],
  ]) {
    points[tip] = { x, y: 0.2, z: 0 };
    points[pip] = { x, y: 0.6, z: 0 };
  }
  return points;
}
describe("geometric gesture classifier", () => {
  it("recognizes an extended palm", () =>
    expect(classifyHand(hand())).toBe("palm"));
  it("recognizes a thumb-index pinch relative to palm size", () => {
    const p = hand();
    p[4] = { ...p[8], x: p[8].x + 0.015 };
    expect(classifyHand(p)).toBe("pinch");
  });
  it("recognizes a point with other fingers curled", () => {
    const p = hand();
    [12, 16, 20].forEach((i) => (p[i] = { x: 0.5, y: 0.7, z: 0 }));
    expect(classifyHand(p)).toBe("point");
  });
  it("rejects missing or degenerate landmarks", () => {
    expect(classifyHand([])).toBe("none");
    expect(
      classifyHand(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))),
    ).toBe("none");
  });
});
describe("temporal gesture gate", () => {
  it("requires stable dwell and emits only once until released", () => {
    const g = new GestureGate();
    expect(g.update("palm", 0)).toBe(false);
    expect(g.update("palm", 419)).toBe(false);
    expect(g.update("palm", 421)).toBe(true);
    expect(g.update("palm", 4000)).toBe(false);
    g.update("none", 4100);
    g.update("palm", 4200);
    expect(g.update("palm", 4630)).toBe(true);
  });
  it("suppresses jitter and enforces cooldown across gestures", () => {
    const g = new GestureGate();
    g.update("point", 0);
    g.update("none", 300);
    g.update("point", 400);
    expect(g.update("point", 600)).toBe(false);
    expect(g.update("point", 821)).toBe(true);
    g.update("pinch", 900);
    expect(g.update("pinch", 1400)).toBe(false);
    expect(g.update("pinch", 1922)).toBe(true);
  });
});

import { GestureController, type GestureSample } from "./recognizer";
const sample = (
  gesture: GestureSample["gesture"],
  x = 0.5,
  y = 0.5,
): GestureSample => ({ gesture, x, y, palmX: x, palmY: y });
describe("gesture arbitration", () => {
  it("requires a stable pointing location rather than just a stable finger pose", () => {
    const c = new GestureController();
    c.update(sample("point"), 0);
    expect(c.update(sample("point", 0.7), 350).progress).toBe(0);
    expect(c.update(sample("point", 0.7), 600).action).toBeUndefined();
    expect(c.update(sample("point", 0.7), 780).action).toBe("point");
  });
  it("fires a swipe once and cannot pause from the same open palm", () => {
    const c = new GestureController();
    c.update(sample("palm", 0.3), 0);
    expect(c.update(sample("palm", 0.51), 200).action).toBe("swipe");
    expect(c.update(sample("palm", 0.51), 1200).action).toBeUndefined();
    expect(c.update(sample("palm", 0.51), 2100).hint).toContain("Release");
  });
  it("distinguishes a stationary palm hold from a swipe", () => {
    const c = new GestureController();
    c.update(sample("palm"), 0);
    expect(c.update(sample("palm"), 500).action).toBeUndefined();
    expect(c.update(sample("palm"), 751).action).toBe("palm");
  });
  it("requires a sustained neutral release across every gesture type", () => {
    const c = new GestureController();
    c.update(sample("pinch"), 0);
    expect(c.update(sample("pinch"), 301).action).toBe("pinch");
    c.update(sample("none"), 500);
    c.update(sample("none"), 600);
    expect(c.update(sample("palm"), 1800).action).toBeUndefined();
    expect(c.update(sample("palm"), 2800).hint).toContain("Release");
    c.update(sample("none"), 2900);
    c.update(sample("none"), 3100);
    c.update(sample("point"), 3200);
    expect(c.update(sample("point"), 3621).action).toBe("point");
  });
  it("rejects a vertical palm movement as a horizontal swipe", () => {
    const c = new GestureController();
    c.update(sample("palm", 0.3, 0.3), 0);
    expect(c.update(sample("palm", 0.55, 0.6), 200).action).toBeUndefined();
  });
  it("requires neutral rearming after the tab is suspended", () => {
    const c = new GestureController();
    c.suspend();
    expect(c.update(sample("palm"), 0).action).toBeUndefined();
    expect(c.update(sample("palm"), 1000).action).toBeUndefined();
    c.update(sample("none"), 1100);
    c.update(sample("none"), 1300);
    c.update(sample("palm"), 1400);
    expect(c.update(sample("palm"), 2151).action).toBe("palm");
  });
  it("returns measurable dwell progress without inventing model confidence", () => {
    const c = new GestureController();
    c.update(sample("point"), 0);
    expect(c.update(sample("point"), 210).progress).toBe(0.5);
  });
  it("rejects nonfinite tracking coordinates", () => {
    const p = hand();
    p[8].x = NaN;
    expect(classifyHand(p)).toBe("none");
  });
});
