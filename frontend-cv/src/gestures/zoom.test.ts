import { describe, it, expect } from "vitest";
import {
  fingerSpread,
  spreadLevel,
  validZoomRange,
  SpreadZoomController,
  HandClutch,
} from "./zoom";
import type { Point } from "./recognizer";
describe("proportional zoom", () => {
  it("maps calibrated closed, partial and full spread to both endpoints and intermediate zoom", () => {
    const range = { closed: 0.2, open: 1.2 };
    expect(spreadLevel(0.2, range)).toBe(0);
    expect(spreadLevel(0.4, range)).toBeCloseTo(0.2);
    expect(spreadLevel(1.2, range)).toBe(1);
    expect(spreadLevel(1.8, range)).toBe(1);
    expect(spreadLevel(0, range)).toBe(0);
  });
  it("rejects unusable calibration ranges", () => {
    expect(validZoomRange({ closed: 0.3, open: 1.2 })).toBe(true);
    expect(validZoomRange({ closed: 0.4, open: 0.5 })).toBe(false);
    expect(validZoomRange({ closed: NaN, open: 1.5 })).toBe(false);
  });
  it("is insensitive to camera distance when the whole hand scales", () => {
    const p: Point[] = Array.from({ length: 21 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    p[0].y = 0.8;
    p[9].y = 0.5;
    p[4].x = 0.2;
    p[8].x = 0.7;
    const scaled = p.map((v) => ({ x: v.x * 0.5, y: v.y * 0.5, z: 0 }));
    expect(fingerSpread(p)).toBeCloseTo(fingerSpread(scaled)!);
    expect(fingerSpread([])).toBe(null);
  });
  it("does not jump when a newly seen hand starts fully closed", () => {
    const z = new SpreadZoomController();
    expect(z.update(0, 0.6, false, 0).level).toBe(0.6);
    expect(z.update(0, 0.6, false, 500).state).toBe("matching");
  });
  it("requires a deliberate match, then supports continuous zoom in and out", () => {
    const z = new SpreadZoomController();
    z.update(0.5, 0.5, false, 0);
    expect(z.update(0.5, 0.5, false, 221).state).toBe("active");
    expect(z.update(0.7, 0.5, false, 300).level).toBe(0.7);
    expect(z.update(1, 0.7, false, 400).level).toBe(1);
    expect(z.update(0.3, 1, false, 500).level).toBe(0.3);
    expect(z.update(0, 0.3, false, 600).level).toBe(0);
  });
  it("freezes and ignores the neutral return, then demands a fresh matching hold", () => {
    const z = new SpreadZoomController();
    z.update(0.6, 0.6, false, 0);
    z.update(0.6, 0.6, false, 221);
    expect(z.update(0.1, 0.6, true, 300).level).toBe(0.6);
    expect(z.update(0, 0.6, false, 900).level).toBe(0.6);
    z.update(0.6, 0.6, false, 1000);
    expect(z.update(0.9, 0.6, false, 1100).state).toBe("matching");
    z.update(0.6, 0.6, false, 1200);
    expect(z.update(0.6, 0.6, false, 1421).state).toBe("active");
  });
  it("requires a match after hand loss or a manual view change", () => {
    const z = new SpreadZoomController();
    z.update(0.4, 0.4, false, 0);
    z.update(0.4, 0.4, false, 221);
    z.reset();
    expect(z.update(0.9, 0.4, false, 1000).level).toBe(0.4);
  });
  it("debounces second-hand disappearance for 500 ms and supports a manual clutch", () => {
    const c = new HandClutch();
    expect(c.update(false, false, 0)).toBe(false);
    expect(c.update(true, false, 100)).toBe(true);
    expect(c.update(false, false, 400)).toBe(true);
    expect(c.update(false, false, 601)).toBe(false);
    expect(c.update(false, true, 900)).toBe(true);
  });
});
