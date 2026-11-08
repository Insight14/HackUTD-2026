import { describe, expect, it } from "vitest";
import { PalmRotationController } from "./rotation";

describe("open-palm rotation arbitration", () => {
  it("reserves the start of an open palm so a swipe cannot zoom first", () => {
    const c = new PalmRotationController();
    expect(c.update(true, 0.3, 0.5, 0).blockZoom).toBe(true);
    expect(c.update(true, 0.34, 0.5, 67)).toMatchObject({
      rotating: true,
      blockZoom: true,
    });
  });
  it("tracks speed and direction with an upper bound", () => {
    const turn = (dx: number) => {
      const c = new PalmRotationController();
      c.update(true, 0.3, 0.5, 0);
      return c.update(true, 0.3 + dx, 0.5, 100).delta;
    };
    expect(turn(0.02)).toBeLessThan(0);
    expect(Math.abs(turn(0.04))).toBeGreaterThan(Math.abs(turn(0.02)));
    expect(turn(0.5)).toBeGreaterThanOrEqual(-0.24);
    expect(turn(0.5)).toBeLessThan(0);
    expect(turn(-0.5)).toBeLessThanOrEqual(0.24);
    expect(turn(-0.5)).toBeGreaterThan(0);
  });
  it("keeps zoom locked through stops and brief classification dropouts", () => {
    const c = new PalmRotationController();
    c.update(true, 0.3, 0.5, 0);
    c.update(true, 0.4, 0.5, 100);
    expect(c.update(true, 0.4, 0.5, 167)).toMatchObject({
      blockZoom: true,
    });
    expect(c.update(false, 0.4, 0.5, 200).blockZoom).toBe(true);
    expect(c.update(false, 0.4, 0.5, 400).blockZoom).toBe(true);
    expect(c.update(false, 0.4, 0.5, 450).blockZoom).toBe(false);
  });
  it("allows stationary full finger spread to retain zoom", () => {
    const c = new PalmRotationController();
    c.update(true, 0.3, 0.5, 0);
    c.update(true, 0.301, 0.5, 100);
    expect(c.update(true, 0.3, 0.5, 200)).toMatchObject({
      blockZoom: false,
      rotating: false,
      delta: 0,
    });
  });
  it("rejects vertical motion and stale frames", () => {
    const c = new PalmRotationController();
    c.update(true, 0.3, 0.3, 0);
    expect(c.update(true, 0.31, 0.4, 100).delta).toBe(0);
    expect(c.update(true, 0.8, 0.4, 800).delta).toBe(0);
  });
  it("clears rotation on clutch, hand loss, and mode reset", () => {
    const c = new PalmRotationController();
    c.update(true, 0.3, 0.5, 0);
    c.update(true, 0.4, 0.5, 100);
    c.reset();
    expect(c.update(false, 0.4, 0.5, 167).blockZoom).toBe(false);
    expect(c.update(true, 0.9, 0.5, 200).delta).toBe(0);
  });
});

it("eases speed changes and settles after the hand stops", () => {
  const c = new PalmRotationController();
  c.update(true, 0.2, 0.5, 0);
  const first = c.update(true, 0.3, 0.5, 67).delta;
  const second = c.update(true, 0.4, 0.5, 134).delta;
  expect(Math.abs(second)).toBeGreaterThan(Math.abs(first));
  const stop = c.update(true, 0.4, 0.5, 201).delta;
  expect(Math.abs(stop)).toBeLessThan(Math.abs(second));
  expect(stop).toBeLessThan(0);
  for (let t = 268; t <= 804; t += 67) c.update(true, 0.4, 0.5, t);
  expect(c.update(true, 0.4, 0.5, 871).delta).toBe(0);
});

it("responds to a small central swipe without requiring a large hand excursion", () => {
  const c = new PalmRotationController();
  c.update(true, 0.45, 0.5, 0);
  let angle = 0;
  for (let i = 1; i <= 10; i++)
    angle += c.update(true, 0.45 + i * 0.01, 0.5, i * 67).delta;
  // Only 10% of the frame produces a useful turn (over 30 degrees).
  expect(Math.abs(angle)).toBeGreaterThan(Math.PI / 6);
});
it("resumes promptly after one misclassified palm frame without a baseline jump", () => {
  const c = new PalmRotationController();
  c.update(true, 0.4, 0.5, 0);
  c.update(true, 0.42, 0.5, 67);
  expect(c.update(false, 0.44, 0.5, 134).delta).toBe(0);
  expect(c.update(true, 0.46, 0.5, 201).delta).toBeLessThan(0);
});
it("does not activate from small stationary tracking jitter", () => {
  const c = new PalmRotationController();
  for (let i = 0; i < 20; i++) {
    expect(c.update(true, 0.5 + (i % 2) * 0.001, 0.5, i * 67).rotating).toBe(
      false,
    );
  }
});

it("maps palm up toward side view and palm down toward top view", () => {
  for (const direction of [-1, 1]) {
    const c = new PalmRotationController();
    c.update(true, 0.5, 0.5, 0);
    const result = c.update(true, 0.5, 0.5 + direction * 0.05, 100);
    expect(Math.sign(result.pitch)).toBe(-direction);
    expect(result.delta).toBe(0);
    expect(result.blockZoom).toBe(true);
    expect(Math.abs(result.pitch)).toBeLessThanOrEqual(0.16);
  }
});
it("stops vertical movement on pose loss and clears it on freeze", () => {
  const c = new PalmRotationController();
  c.update(true, 0.5, 0.5, 0);
  c.update(true, 0.5, 0.4, 100);
  expect(c.update(false, 0.5, 0.3, 167).pitch).toBe(0);
  c.reset();
  expect(c.update(true, 0.5, 0.2, 234).pitch).toBe(0);
});
