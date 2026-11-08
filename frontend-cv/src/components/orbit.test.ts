import { expect, it } from "vitest";
import { Vector3 } from "three";
import { tiltOrbit } from "./orbit";
it("tilts around equipment without translating the target or changing zoom", () => {
  const target = new Vector3(4, 1, -2),
    position = new Vector3(14, 17, 18);
  const before = target.clone();
  const top = tiltOrbit(position, target, -0.4);
  const side = tiltOrbit(position, target, 0.4);
  expect(top.y).toBeGreaterThan(position.y);
  expect(side.y).toBeLessThan(position.y);
  expect(top.distanceTo(target)).toBeCloseTo(position.distanceTo(target));
  expect(side.distanceTo(target)).toBeCloseTo(position.distanceTo(target));
  expect(target.equals(before)).toBe(true);
});
it("stops at top and side limits without flipping or going underground", () => {
  const target = new Vector3(),
    position = new Vector3(14, 17, 18);
  const top = tiltOrbit(position, target, -100);
  const side = tiltOrbit(position, target, 100);
  expect(top.y).toBeCloseTo(position.length(), 3);
  expect(side.y).toBeGreaterThan(0);
  expect(side.length()).toBeCloseTo(position.length());
});
