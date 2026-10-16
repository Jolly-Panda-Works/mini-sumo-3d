import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { roomManager } from "../network/RoomManager";
import { dustBus } from "./effectsBus";
import { Nobori } from "./Nobori";
import { bannerTexture } from "./powerUpArt";

function setBanner(meshes: (Mesh | null)[], kind: string): void {
  const map = bannerTexture(kind);
  for (const mesh of meshes) {
    if (!mesh) continue;
    const mat = mesh.material as MeshStandardMaterial;
    if (mat.map !== map) {
      mat.map = map;
      mat.needsUpdate = true;
    }
  }
}

const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

/**
 * The power-up flag planted on the ring: it pops up out of a puff of smoke, sways in the
 * wind, turns to face the camera and vanishes in smoke when taken or when it expires.
 */
export function ItemFlag() {
  const group = useRef<Group>(null);
  const front = useRef<Mesh>(null);
  const back = useRef<Mesh>(null);
  const s = useRef({ kind: "", x: 0, y: 0, born: 0 });

  useFrame(({ clock, camera }) => {
    const g = group.current;
    const state = roomManager.state;
    if (!g) return;
    const kind = (state?.itemKind as string | undefined) ?? "";
    const t = clock.elapsedTime;
    const v = s.current;
    if (kind && (kind !== v.kind || Math.hypot((state!.itemX ?? 0) - v.x, (state!.itemY ?? 0) - v.y) > 0.01)) {
      v.kind = kind;
      v.x = state!.itemX ?? 0;
      v.y = state!.itemY ?? 0;
      v.born = t;
      setBanner([front.current, back.current], kind);
      dustBus.emit({ x: v.x, y: v.y, count: 14, speed: 1.6 });
    } else if (!kind && v.kind) {
      dustBus.emit({ x: v.x, y: v.y, count: 18, speed: 2 });
      v.kind = "";
    }
    g.visible = v.kind !== "";
    if (!g.visible) return;
    const pop = Math.min(1, (t - v.born) / 0.45);
    g.position.set(v.x, 0, v.y);
    g.scale.set(1, Math.max(0.01, easeOutBack(pop)), 1);
    // Face the camera, with a gentle sway.
    g.rotation.y = Math.atan2(camera.position.x - v.x, camera.position.z - v.y) + Math.sin(t * 1.7) * 0.12;
    if (front.current) front.current.rotation.z = Math.sin(t * 2.3) * 0.03;
  });

  return (
    <group ref={group} visible={false}>
      <mesh position-y={0.04} receiveShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.08, 16]} />
        <meshStandardMaterial color="#8d8f96" metalness={0.5} roughness={0.4} />
      </mesh>
      <Nobori height={2.1} width={0.62} bannerRef={front} backRef={back} />
    </group>
  );
}

/**
 * The banner on a wrestler's back (a sashimono) while their power-up lasts: it rises out of
 * a puff of smoke, flickers in the last two seconds and disappears in smoke at the end.
 */
export function BackBanner({ id, root }: { id: string; root: RefObject<Group | null> }) {
  const group = useRef<Group>(null);
  const front = useRef<Mesh>(null);
  const back = useRef<Mesh>(null);
  const s = useRef({ kind: "", since: 0 });

  useFrame(({ clock }) => {
    const g = group.current;
    const body = root.current;
    const p = roomManager.state?.players.get(id) as { powerUp?: string; powerUpMs?: number; alive?: boolean } | undefined;
    if (!g || !body) return;
    const t = clock.elapsedTime;
    const kind = p?.alive ? (p.powerUp ?? "") : "";
    const v = s.current;
    if (kind !== v.kind) {
      if (v.kind) dustBus.emit({ x: body.position.x, y: body.position.z, count: 16, speed: 1.8 });
      if (kind) {
        setBanner([front.current, back.current], kind);
        dustBus.emit({ x: body.position.x, y: body.position.z, count: 12, speed: 1.4 });
      }
      v.kind = kind;
      v.since = t;
    }
    if (!v.kind) {
      g.visible = false;
      return;
    }
    const rise = Math.min(1, (t - v.since) / 0.4);
    const ending = (p?.powerUpMs ?? 0) < 2000;
    g.visible = !ending || Math.floor(t * 8) % 2 === 0;
    g.position.copy(body.position);
    g.rotation.y = body.rotation.y;
    g.scale.setScalar(body.scale.x);
    const inner = g.children[0] as Group | undefined;
    if (inner) {
      inner.position.y = -1.6 * (1 - easeOutBack(rise));
      inner.rotation.z = Math.sin(t * 2.1) * 0.04;
    }
  });

  return (
    <group ref={group} visible={false}>
      {/* On the back: behind the wrestler, a little to the side, leaning back slightly */}
      <group position={[-0.25, 0.35, -0.62]} rotation={[-0.12, Math.PI / 2, 0]}>
        <Nobori height={2.4} width={0.6} bannerRef={front} backRef={back} />
      </group>
    </group>
  );
}
