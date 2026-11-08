/** Separates whole-palm translation from thumb–index zoom. Angles are radians. */
export class PalmRotationController {
  private previous: { x: number; y: number; time: number } | null = null;
  private palmSince = 0;
  private releasedSince: number | null = null;
  private rotating = false;
  private speed = 0;
  private verticalSpeed = 0;
  reset() {
    this.previous = null;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.rotating = false;
    this.releasedSince = null;
  }
  update(palm: boolean, x: number, y: number, now: number) {
    if (!palm) {
      this.releasedSince ??= now;
      // A single misclassified frame must not restart the entire swipe.
      // Keep the baseline current, but never rotate on an uncertain pose.
      this.previous = this.rotating ? { x, y, time: now } : null;
      this.speed *= 0.65;
      this.verticalSpeed *= 0.65;
      if (now - this.releasedSince >= 250) {
        this.rotating = false;
        this.previous = null;
        this.speed = 0;
        this.verticalSpeed = 0;
      }
      return {
        blockZoom: this.rotating,
        rotating: this.rotating,
        delta: 0,
        pitch: 0,
      };
    }
    this.releasedSince = null;
    const prev = this.previous;
    this.previous = { x, y, time: now };
    if (!prev || now - prev.time > 200 || now <= prev.time) {
      this.palmSince = now;
      this.speed = 0;
      this.verticalSpeed = 0;
      return { blockZoom: true, rotating: this.rotating, delta: 0, pitch: 0 };
    }
    const dt = (now - prev.time) / 1000;
    const dx = x - prev.x,
      dy = y - prev.y;
    const horizontal =
      Math.abs(dx) > Math.abs(dy) * (this.rotating ? 0.45 : 1.3);
    const moving =
      horizontal &&
      Math.abs(dx) / dt > (this.rotating ? 0.025 : 0.05) &&
      Math.abs(dx) > (this.rotating ? 0.0015 : 0.003);
    const verticalMoving =
      Math.abs(dy) > Math.abs(dx) * (this.rotating ? 0.45 : 1.3) &&
      Math.abs(dy) / dt > (this.rotating ? 0.025 : 0.05) &&
      Math.abs(dy) > (this.rotating ? 0.0015 : 0.003);
    if (moving || verticalMoving) this.rotating = true;
    // Match cursor orbit: drag down toward a top view, up toward a side view.
    const verticalTarget = verticalMoving
      ? Math.max(-1.6, Math.min(1.6, (-dy / dt) * 4.8))
      : 0;
    this.verticalSpeed +=
      (verticalTarget - this.verticalSpeed) * (1 - Math.exp(-dt / 0.1));
    if (!verticalMoving && Math.abs(this.verticalSpeed) < 0.015)
      this.verticalSpeed = 0;
    // Reverse the orbit direction; low-pass velocity smooths frame-to-frame jitter.
    // The cap still applies, and a stopped hand settles quickly without coasting.
    const target = moving ? Math.max(-2.4, Math.min(2.4, -(dx / dt) * 7.2)) : 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt / 0.1));
    if (!moving && Math.abs(this.speed) < 0.015) this.speed = 0;
    return {
      blockZoom: this.rotating || now - this.palmSince < 180,
      rotating: this.rotating,
      delta: this.rotating ? this.speed * dt : 0,
      pitch: this.rotating ? this.verticalSpeed * dt : 0,
    };
  }
}
