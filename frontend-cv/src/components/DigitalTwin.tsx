import { tiltOrbit } from "./orbit";
import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitType } from "three-stdlib";
import type { Equipment, TwinSnapshot, ViewCommand } from "../data/types";
const cyan = "#42e5ee",
  pink = "#f574cd",
  amber = "#ffbe68";
function CameraController({
  command,
  onSelect,
  onZoomChange,
}: {
  onZoomChange?: (level: number) => void;
  command: ViewCommand | null;
  onSelect: (id: string) => void;
}) {
  const controls = useRef<OrbitType>(null);
  const { camera, scene } = useThree();
  const remainingRotation = useRef(0);
  const remainingPitch = useRef(0);
  const targetDistance = useRef<number | null>(null),
    lastReported = useRef(-1),
    reportAt = useRef(0);
  const zoomCallback = useRef(onZoomChange);
  zoomCallback.current = onZoomChange;
  useFrame((state, dt) => {
    const c = controls.current;
    if (!c) return;
    if (targetDistance.current !== null) {
      const offset = camera.position.clone().sub(c.target);
      const distance = THREE.MathUtils.damp(
        offset.length(),
        targetDistance.current,
        9,
        Math.min(dt, 0.1),
      );
      offset.setLength(distance);
      camera.position.copy(c.target.clone().add(offset));
      c.update();
      if (Math.abs(distance - targetDistance.current) < 0.002)
        targetDistance.current = null;
    }
    if (Math.abs(remainingRotation.current) > 0.0001) {
      const amount =
        remainingRotation.current * (1 - Math.exp(-9 * Math.min(dt, 0.1)));
      const offset = camera.position
        .clone()
        .sub(c.target)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), amount);
      camera.position.copy(c.target.clone().add(offset));
      remainingRotation.current -= amount;
      c.update();
    }
    if (Math.abs(remainingPitch.current) > 0.0001) {
      const requested =
        remainingPitch.current * (1 - Math.exp(-9 * Math.min(dt, 0.1)));
      remainingPitch.current -= requested;
      camera.position.copy(tiltOrbit(camera.position, c.target, requested));
      c.update();
    }
    const level = THREE.MathUtils.clamp(
      (38 - camera.position.distanceTo(c.target)) / 30,
      0,
      1,
    );
    if (
      state.clock.elapsedTime - reportAt.current > 0.04 &&
      Math.abs(level - lastReported.current) > 0.001
    ) {
      zoomCallback.current?.(level);
      lastReported.current = level;
      reportAt.current = state.clock.elapsedTime;
    }
  });
  useEffect(() => {
    if (!command || !controls.current) return;
    const c = controls.current;
    if (command.type === "zoom-stop") {
      remainingRotation.current = 0;
      remainingPitch.current = 0;
      targetDistance.current = null;
      return;
    }
    if (command.type === "zoom-level") {
      targetDistance.current =
        38 - 30 * THREE.MathUtils.clamp(command.level, 0, 1);
      return;
    }
    if (command.type !== "select" && command.type !== "zoom") {
      targetDistance.current = null;
      if (command.type !== "rotate") {
        remainingRotation.current = 0;
        remainingPitch.current = 0;
      }
    }
    if (command.type === "select") {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(command.x * 2 - 1, 1 - command.y * 2),
        camera,
      );
      for (const hit of ray.intersectObjects(scene.children, true)) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj.userData.equipmentId) {
            onSelect(obj.userData.equipmentId);
            return;
          }
          obj = obj.parent;
        }
      }
      return;
    }
    if (command.type === "focus") {
      const offset = camera.position.clone().sub(c.target).setLength(12);
      c.target.set(
        command.position[0],
        command.position[1] + 1,
        command.position[2],
      );
      camera.position.copy(c.target.clone().add(offset));
    }
    if (command.type === "reset") {
      camera.position.set(14, 17, 18);
      c.target.set(0, 0, 0);
    }
    if (command.type === "top") {
      camera.position.set(0.01, 23, 0.01);
      c.target.set(0, 0, 0);
    }
    if (command.type === "rotate") {
      remainingRotation.current += command.delta;
      remainingPitch.current += command.pitch ?? 0;
    }
    if (command.type === "zoom") {
      const offset = camera.position.clone().sub(c.target);
      targetDistance.current = THREE.MathUtils.clamp(
        (targetDistance.current ?? offset.length()) * command.delta,
        8,
        38,
      );
    }
    c.update();
  }, [command, camera, scene, onSelect]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      onStart={() => {
        remainingRotation.current = 0;
        remainingPitch.current = 0;
        targetDistance.current = null;
      }}
      minDistance={8}
      maxDistance={38}
      maxPolarAngle={Math.PI / 2.12}
      enableDamping
      dampingFactor={0.08}
    />
  );
}
function Tank({
  e,
  selected,
  onSelect,
}: {
  e: Equipment;
  selected: boolean;
  onSelect: () => void;
}) {
  const water = useRef<THREE.Mesh>(null);
  const level = (e.level ?? 0) / 100;
  const color = e.status === "warning" ? amber : cyan;
  useFrame((_, dt) => {
    if (water.current) {
      water.current.scale.y = THREE.MathUtils.damp(
        water.current.scale.y,
        Math.max(0.01, level),
        4,
        dt,
      );
      water.current.position.y = 0.22 + 1.6 * water.current.scale.y;
    }
  });
  return (
    <group
      position={e.position}
      userData={{ equipmentId: e.id }}
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[1.55, 1.65, 0.25, 48]} />
        <meshStandardMaterial color="#112a38" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.82, 0]}>
        <cylinderGeometry args={[1.25, 1.25, 3.2, 48, 1, true]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.09}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={water}
        position={[0, 0.22 + 1.6 * level, 0]}
        scale={[1, level, 1]}
      >
        <cylinderGeometry args={[1.23, 1.23, 3.2, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.42}
          transparent
          opacity={0.43}
        />
      </mesh>
      {[0.25, 1.05, 1.85, 2.65, 3.45].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry
            args={[1.26, i === 0 || i === 4 ? 0.035 : 0.012, 6, 64]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={i === 0 || i === 4 ? 0.85 : 0.28}
          />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <Line
            key={i}
            points={[
              [Math.cos(a) * 1.26, 0.25, Math.sin(a) * 1.26],
              [Math.cos(a) * 1.26, 3.45, Math.sin(a) * 1.26],
            ]}
            color={color}
            transparent
            opacity={0.23}
          />
        );
      })}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[selected ? 1.9 : 1.65, selected ? 1.95 : 1.67, 64]}
        />
        <meshBasicMaterial
          color={selected ? pink : color}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
function Pump({
  e,
  onSelect,
  selected,
  paused,
}: {
  e: Equipment;
  onSelect: () => void;
  selected: boolean;
  paused: boolean;
}) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current && e.status === "running" && !paused)
      rotor.current.rotation.z += dt * 3;
  });
  const color =
    e.status === "failed" ? pink : e.status === "standby" ? "#8f95b5" : cyan;
  return (
    <group
      position={e.position}
      userData={{ equipmentId: e.id }}
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[2, 0.35, 1.3]} />
        <meshStandardMaterial color="#102536" />
      </mesh>
      <mesh position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 1.3, 24]} />
        <meshStandardMaterial
          color="#163e4d"
          emissive={color}
          emissiveIntensity={0.13}
        />
      </mesh>
      <mesh position={[0, 0.8, 0.68]}>
        <torusGeometry args={[0.48, 0.035, 8, 40]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <group ref={rotor} position={[0, 0.8, 0.69]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
            <boxGeometry args={[0.75, 0.065, 0.04]} />
            <meshBasicMaterial color={color} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
function Pipe({
  points,
  paused,
  blocked = false,
}: {
  points: [number, number, number][];
  paused: boolean;
  blocked?: boolean;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        points.map((p) => new THREE.Vector3(...p)),
        false,
        "catmullrom",
        0.05,
      ),
    [points],
  );
  const particles = useRef<THREE.Group>(null);
  const progress = useRef(0);
  useFrame((_, dt) => {
    if (!paused) progress.current += dt * 0.12;
    particles.current?.children.forEach((c, i) =>
      c.position.copy(curve.getPointAt((progress.current + i / 7) % 1)),
    );
  });
  return (
    <>
      <mesh>
        <tubeGeometry args={[curve, 60, 0.095, 8, false]} />
        <meshStandardMaterial
          color={blocked ? "#733b65" : "#155d6b"}
          emissive={blocked ? pink : cyan}
          emissiveIntensity={0.25}
        />
      </mesh>
      <Line
        points={points}
        color={blocked ? pink : cyan}
        lineWidth={1.5}
        transparent
        opacity={0.5}
      />
      {!blocked && (
        <group ref={particles}>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i}>
              <sphereGeometry args={[0.065, 8, 8]} />
              <meshBasicMaterial color="#b9ffff" />
            </mesh>
          ))}
        </group>
      )}
    </>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="webgl-error">
        3D rendering is unavailable on this device.
        <br />
        Use the equipment list to inspect all telemetry.
      </div>
    ) : (
      this.props.children
    );
  }
}
export function DigitalTwin({
  snapshot,
  selected,
  onSelect,
  paused,
  command,
  onZoomChange,
}: {
  snapshot: TwinSnapshot;
  selected: string;
  onSelect: (id: string) => void;
  paused: boolean;
  command: ViewCommand | null;
  onZoomChange?: (level: number) => void;
}) {
  const failed =
    snapshot.equipment.find((e) => e.id === "P-01")?.status === "failed";
  return (
    <SceneBoundary>
      <div className="twin-canvas">
        <Canvas
          camera={{ position: [14, 17, 18], fov: 42 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          fallback={
            <div className="webgl-error">
              WebGL unavailable. Select equipment from the list.
            </div>
          }
        >
          <ambientLight intensity={1.5} />
          <directionalLight
            position={[5, 12, 5]}
            intensity={2}
            color="#96f3ff"
          />
          <pointLight position={[-5, 5, 3]} color={pink} intensity={20} />
          <gridHelper
            args={[40, 40, "#215260", "#13232f"]}
            position={[0, -0.03, 0]}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
            <planeGeometry args={[42, 42]} />
            <meshStandardMaterial color="#080f18" transparent opacity={0.8} />
          </mesh>
          {[8.5, 9, 10.8].map((r, i) => (
            <mesh
              key={r}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.01, 0]}
            >
              <ringGeometry args={[r, r + 0.012, 128]} />
              <meshBasicMaterial
                color={i === 1 ? pink : cyan}
                transparent
                opacity={0.22}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
          <Line
            points={[
              [-8, 0.01, -6],
              [9, 0.01, -6],
              [9, 0.01, 6],
              [-8, 0.01, 6],
              [-8, 0.01, -6],
            ]}
            color={cyan}
            transparent
            opacity={0.3}
          />
          {snapshot.equipment.map((e) =>
            e.kind === "tank" ? (
              <Tank
                key={e.id}
                e={e}
                selected={selected === e.id}
                onSelect={() => onSelect(e.id)}
              />
            ) : e.kind === "pump" ? (
              <Pump
                key={e.id}
                e={e}
                paused={paused}
                selected={selected === e.id}
                onSelect={() => onSelect(e.id)}
              />
            ) : (
              <group
                key={e.id}
                position={e.position}
                userData={{ equipmentId: e.id }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelect(e.id);
                }}
              >
                <mesh position={[0, 0.65, 0]}>
                  <boxGeometry args={[2.5, 1.3, 3]} />
                  <meshStandardMaterial color="#133444" />
                </mesh>
                <mesh position={[0, 0.66, 0]}>
                  <boxGeometry args={[2.52, 1.32, 3.02]} />
                  <meshBasicMaterial wireframe color={cyan} />
                </mesh>
                {[-0.7, 0, 0.7].map((x) => (
                  <mesh key={x} position={[x, 1.5, 0]}>
                    <cylinderGeometry args={[0.18, 0.18, 0.4, 12]} />
                    <meshBasicMaterial color="#277488" />
                  </mesh>
                ))}
              </group>
            ),
          )}
          <Pipe
            points={[
              [-5, 0.5, -2.5],
              [-5, 0.5, 0],
              [-1.5, 0.5, 0],
              [-1.5, 0.5, 2],
            ]}
            paused={paused}
          />
          <Pipe
            points={[
              [-5, 0.5, 3],
              [-5, 0.5, 4.5],
              [-1.5, 0.5, 4.5],
              [-1.5, 0.5, 2],
            ]}
            paused={paused}
          />
          <Pipe
            points={[
              [1, 0.5, -2.5],
              [1, 0.5, 0],
              [-1.5, 0.5, 0],
              [-1.5, 0.5, 2],
            ]}
            paused={paused}
            blocked={failed}
          />
          <Pipe
            points={[
              [-1.5, 0.5, 2],
              [3.8, 0.5, 2],
              [3.8, 0.5, 0],
              [6.2, 0.5, 0],
            ]}
            paused={paused}
            blocked={failed}
          />
          <Pipe
            points={[
              [2, 0.5, 3.8],
              [3.8, 0.5, 3.8],
              [3.8, 0.5, 0],
              [6.2, 0.5, 0],
            ]}
            paused={paused}
            blocked
          />
          <CameraController
            command={command}
            onSelect={onSelect}
            onZoomChange={onZoomChange}
          />
          {snapshot.equipment.map((e) => (
            <EquipmentBoard
              key={e.id}
              e={e}
              selected={selected === e.id}
              onSelect={() => onSelect(e.id)}
            />
          ))}
        </Canvas>
      </div>
    </SceneBoundary>
  );
}

/** A world-fixed sign with separately oriented front/back text, never a billboard. */
function EquipmentBoard({
  e,
  selected,
  onSelect,
}: {
  e: Equipment;
  selected: boolean;
  onSelect: () => void;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 384;
    const ctx = canvas.getContext("2d")!;
    const color =
      e.status === "failed" ? pink : e.status === "warning" ? amber : cyan;
    ctx.fillStyle = "#091724";
    ctx.fillRect(0, 0, 768, 384);
    ctx.strokeStyle = selected ? "#ffffff" : color;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 760, 376);
    ctx.textAlign = "center";
    ctx.fillStyle = "#cceaf0";
    ctx.font = "bold 56px monospace";
    ctx.fillText(e.id, 384, 84);
    ctx.fillStyle = color;
    ctx.font = "bold 96px monospace";
    ctx.fillText(
      e.kind === "tank"
        ? `${e.level?.toFixed(1) ?? "—"}%`
        : e.status.toUpperCase(),
      384,
      222,
    );
    ctx.font = "32px monospace";
    ctx.fillText(
      e.kind === "tank"
        ? e.status === "warning"
          ? "HIGH LEVEL"
          : "NOMINAL"
        : e.kind.toUpperCase(),
      384,
      322,
    );
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [e.id, e.kind, e.level, e.status, selected]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group
      position={[
        e.position[0],
        e.position[1] + (e.kind === "tank" ? 4.7 : 2.7),
        e.position[2],
      ]}
      userData={{ equipmentId: e.id }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh>
        <boxGeometry args={[2.6, 1.3, 0.08]} />
        <meshBasicMaterial color="#163b49" />
      </mesh>
      {[0, Math.PI].map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <mesh position={[0, 0, 0.045]}>
            <planeGeometry args={[2.58, 1.28]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.85, 0]}>
        <boxGeometry args={[0.045, 0.4, 0.045]} />
        <meshBasicMaterial color={cyan} />
      </mesh>
    </group>
  );
}
