import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { ARENA_RADIUS, Phase } from "@mini-sumo/shared";
import { roomManager } from "../network/RoomManager";
import type { ArenaTheme } from "./arenaThemes";
import { bannerBus } from "./effectsBus";
import { audio } from "../audio/AudioManager";

const R = ARENA_RADIUS;
/** Matches NetSumo's teeter zone: closer to the rope than this (m) is "on the edge". */
const EDGE_ZONE = 1.3;

/**
 * The tawara (straw rope) on the gameplay boundary, which closes in over the final seconds
 * of a bout. The floor it leaves behind turns red, and the rope glows red while anyone is
 * teetering on it.
 */
export function RingEdge({ theme }: { theme: ArenaTheme }) {
  const rope = useRef<Mesh>(null);
  const lost = useRef<Mesh>(null);
  const inner = useRef<Mesh>(null);
  const announced = useRef(false);

  useFrame((frame) => {
    const state = roomManager.state;
    const ringR = state?.ringRadius || R;
    const shrinking = ringR < R - 0.01;
    const t = frame.clock.elapsedTime;

    if (state?.phase === Phase.Playing && shrinking && !announced.current) {
      announced.current = true;
      bannerBus.emit({ text: "RING SHRINKING!", tone: "warn" });
      audio.sample("ring-shrink");
    }
    if (!shrinking) announced.current = false;

    const k = ringR / R;
    if (rope.current) rope.current.scale.set(k, k, 1);
    if (lost.current) {
      lost.current.visible = shrinking;
      (lost.current.material as MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 6) * 0.15;
    }
    if (inner.current) {
      inner.current.visible = shrinking;
      inner.current.scale.setScalar(Math.max(0.01, ringR - 0.15));
    }

    // The closest anyone alive is to falling (0-1).
    let danger = 0;
    if (state?.phase === Phase.Playing) {
      state.players.forEach((p) => {
        if (!p.alive) return;
        const d = Math.hypot(p.x, p.y);
        danger = Math.max(danger, Math.min(1, Math.max(0, (d - (ringR - EDGE_ZONE)) / (EDGE_ZONE * 0.8))));
      });
    }
    const material = rope.current?.material as MeshStandardMaterial | undefined;
    if (material) material.emissiveIntensity = danger * (0.55 + Math.sin(t * 14) * 0.45);
  });

  return (
    <>
      {/* Floor outside the shrinking ring, then the ring's own surface on top of it */}
      <mesh ref={lost} rotation-x={-Math.PI / 2} position-y={0.012} visible={false}>
        <circleGeometry args={[R - 0.15, 56]} />
        <meshBasicMaterial color="#E2443A" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      <mesh ref={inner} rotation-x={-Math.PI / 2} position-y={0.014} visible={false} receiveShadow>
        <circleGeometry args={[1, 56]} />
        <meshStandardMaterial color={theme.ring} roughness={1} />
      </mesh>
      {/* Tawara: straw rope on the boundary */}
      <mesh ref={rope} rotation-x={-Math.PI / 2} position-y={0.1} castShadow receiveShadow>
        <torusGeometry args={[R, 0.17, 6, 64]} />
        <meshStandardMaterial color={theme.rope} emissive="#FF3B30" emissiveIntensity={0} roughness={0.9} flatShading />
      </mesh>
    </>
  );
}
