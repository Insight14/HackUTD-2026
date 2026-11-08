import { Spherical, Vector3, MathUtils } from "three";

/** Change elevation around a fixed target without changing zoom or panning. */
export function tiltOrbit(position: Vector3, target: Vector3, delta: number) {
  const spherical = new Spherical().setFromVector3(
    position.clone().sub(target),
  );
  spherical.phi = MathUtils.clamp(spherical.phi + delta, 0.001, Math.PI / 2.12);
  return new Vector3().setFromSpherical(spherical).add(target);
}
