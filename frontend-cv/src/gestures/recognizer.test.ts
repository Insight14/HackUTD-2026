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
