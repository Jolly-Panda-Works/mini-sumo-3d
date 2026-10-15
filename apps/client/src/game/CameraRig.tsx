import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type PerspectiveCamera } from "three";
import { ARENA_RADIUS } from "@mini-sumo/shared";
import { shakeBus } from "./effectsBus";

const ELEVATION = (54 * Math.PI) / 180;

/**
 * Fixed three-quarter camera that always fits the whole ring (portrait or landscape).
 * In the menu it slowly orbits. Shake is a cosmetic offset that decays quickly.
 */
export function CameraRig({ orbit }: { orbit: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const base = useMemo(() => new Vector3(0, 15, 12), []);
  const target = useMemo(() => new Vector3(), []);
  const shake = useRef(0);
  const orbitAngle = useRef(0);

  useEffect(() => shakeBus.on((amount) => (shake.current = Math.min(1, shake.current + amount))), []);

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 0.1);
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const halfWidth = ARENA_RADIUS + 2.4;
    const halfDepth = ARENA_RADIUS + 1.8;
    const distance = Math.max(halfWidth / (tanHalf * aspect), (halfDepth * 0.85) / tanHalf, 14);

    if (orbit) orbitAngle.current += dt * 0.08;
    else orbitAngle.current += (0 - orbitAngle.current) * (1 - Math.exp(-2 * dt));
    const a = orbitAngle.current;
    const flat = Math.cos(ELEVATION) * distance;
    target.set(Math.sin(a) * flat, Math.sin(ELEVATION) * distance, Math.cos(a) * flat);
    base.lerp(target, 1 - Math.exp(-3 * dt));

    const amp = shake.current * 0.35;
    const t = frame.clock.elapsedTime;
    camera.position.set(base.x + Math.sin(t * 61) * amp, base.y + Math.sin(t * 47) * amp, base.z + Math.cos(t * 53) * amp);
    camera.lookAt(0, -0.6, 0.4);
    shake.current *= Math.exp(-7 * dt);
  });

  return null;
}
