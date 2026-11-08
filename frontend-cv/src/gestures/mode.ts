import type { Gesture } from "./recognizer";
export class HandModeSwitch {
  private candidate = "";
  private since = 0;
  reset() {
    this.candidate = "";
  }
  update(
    gesture: Gesture,
    mode: "zoom" | "navigate",
    now: number,
    frozen = false,
  ) {
    const target =
      !frozen && mode === "navigate" && gesture === "pinch"
        ? "zoom"
        : !frozen && mode === "zoom" && gesture === "palm"
          ? "navigate"
          : "";
    if (target !== this.candidate) {
      this.candidate = target;
      this.since = now;
    }
    const progress = target
      ? Math.min(1, (now - this.since) / (target === "zoom" ? 1000 : 350))
      : 0;
    return {
      pending: !!target,
      progress,
      mode: progress === 1 ? (target as "zoom" | "navigate") : null,
    };
  }
}
