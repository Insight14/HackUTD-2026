import { expect, it } from "vitest";
import { HandModeSwitch } from "./mode";
import { SpreadZoomController } from "./zoom";
it("requires a continuous one-second pinch before entering zoom", () => {
  const s = new HandModeSwitch();
  expect(s.update("pinch", "navigate", 0).mode).toBeNull();
  expect(s.update("pinch", "navigate", 999).mode).toBeNull();
  expect(s.update("pinch", "navigate", 1000).mode).toBe("zoom");
});
it("cancels interrupted pinch and frozen switching", () => {
  const s = new HandModeSwitch();
  s.update("pinch", "navigate", 0);
  s.update("none", "navigate", 800);
  expect(s.update("pinch", "navigate", 1000).mode).toBeNull();
  expect(s.update("pinch", "navigate", 2000, true).pending).toBe(false);
});
it("requires a deliberate open palm to leave zoom, not a brief misclassification", () => {
  const s = new HandModeSwitch();
  s.update("palm", "zoom", 0);
  expect(s.update("palm", "zoom", 200).mode).toBeNull();
  expect(s.update("palm", "zoom", 350).mode).toBe("navigate");
  expect(s.update("pinch", "zoom", 400).pending).toBe(false);
});
it("explicit pinch entry enables zoom but clutch still requires safe takeover", () => {
  const z = new SpreadZoomController();
  z.activate(0);
  expect(z.update(0.3, 0.5, false, 0)).toMatchObject({
    state: "active",
    level: 0.3,
  });
  z.update(0.3, 0.5, true, 100);
  expect(z.update(0, 0.5, false, 200).state).toBe("matching");
});
