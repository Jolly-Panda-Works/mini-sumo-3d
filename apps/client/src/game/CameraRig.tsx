import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Fog, Vector3, type PerspectiveCamera } from "three";
import { ARENA_RADIUS } from "@mini-sumo/shared";
import { shakeBus } from "./effectsBus";

const ELEVATION = (54 * Math.PI) / 180;
const FOV_LANDSCAPE = 40;
const FOV_PORTRAIT = 52;

/**
 * Fixed three-quarter camera that always fits the whole ring (portrait or landscape).
 * - Portrait screens get a wider field of view (so the camera can come closer) and the ring
 *   is shifted down, into the free space below the HUD.
 * - Fog follows the camera distance, so a far camera never washes the scene out.
 * In the menu it slowly orbits. Shake is a cosmetic offset that decays quickly.
 */
export function CameraRig({ orbit }: { orbit: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const base = useMemo(() => new Vector3(0, 15, 12), []);
  const goal = useMemo(() => new Vector3(), []);
  const look = useRef(0);
  const shake = useRef(0);
  const orbitAngle = useRef(0);

  useEffect(() => shakeBus.on((amount) => (shake.current = Math.min(1, shake.current + amount))), []);

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 0.1);
    const aspect = Math.max(0.3, size.width / Math.max(1, size.height));
    // 0 on square/landscape screens, 1 on tall phones (aspect <= 0.5).
    const portrait = Math.min(1, Math.max(0, (1 - aspect) / 0.5));

    const fov = FOV_LANDSCAPE + (FOV_PORTRAIT - FOV_LANDSCAPE) * portrait;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    // Tighter side margins on phones: the rim plus a little floor is enough.
    const halfWidth = ARENA_RADIUS + 2.4 - portrait * 1.2;
    const halfDepth = ARENA_RADIUS + 1.8;
    const distance = Math.max(halfWidth / (tanHalf * aspect), (halfDepth * 0.85) / tanHalf, 14);

    // Look at a point behind the ring centre: the ring then sits lower on tall screens.
    const lookZ = 0.4 - portrait * ARENA_RADIUS * 0.55;
    look.current += (lookZ - look.current) * (1 - Math.exp(-3 * dt));

    if (orbit) orbitAngle.current += dt * 0.08;
    else orbitAngle.current += (0 - orbitAngle.current) * (1 - Math.exp(-2 * dt));
    const a = orbitAngle.current;
    const flat = Math.cos(ELEVATION) * distance;
    goal.set(Math.sin(a) * flat, Math.sin(ELEVATION) * distance, Math.cos(a) * flat + look.current);
    base.lerp(goal, 1 - Math.exp(-3 * dt));

    const amp = shake.current * 0.35;
    const t = frame.clock.elapsedTime;
    camera.position.set(base.x + Math.sin(t * 61) * amp, base.y + Math.sin(t * 47) * amp, base.z + Math.cos(t * 53) * amp);
    camera.lookAt(0, -0.6, look.current);
    shake.current *= Math.exp(-7 * dt);

    // Keep the fog behind the arena whatever the distance.
    if (scene.fog instanceof Fog) {
      scene.fog.near = distance + ARENA_RADIUS + 4;
      scene.fog.far = distance + ARENA_RADIUS + 45;
    }
  });

  return null;
}
