import { it, expect } from "vitest";
import { demoSnapshot } from "./demo";
import { validateSnapshot } from "./validate";
it("accepts all illustrative scenario frames", () => {
  for (const scenario of ["normal", "failure", "surge", "sensor"])
    expect(() => validateSnapshot(demoSnapshot(10, scenario))).not.toThrow();
});
it("rejects out-of-range levels and duplicate equipment IDs", () => {
  const a = demoSnapshot();
  a.equipment[0].level = 101;
  expect(() => validateSnapshot(a)).toThrow("Tank level");
  const b = demoSnapshot();
  b.equipment[0].id = b.equipment[1].id;
  expect(() => validateSnapshot(b)).toThrow("unique");
});
it("preserves an offline camera and rejects nonfinite geometry", () => {
  const a = demoSnapshot();
  a.equipment[0].camera = null;
  expect(() => validateSnapshot(a)).not.toThrow();
  a.equipment[0].position[0] = NaN;
  expect(() => validateSnapshot(a)).toThrow("position");
});
