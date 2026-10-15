import { useRef, type RefObject } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  type Group,
  type Mesh,
} from "three";

/** Shared geometry: created once, reused by every sumo (no per-player allocations). */
const GEO = {
  body: new IcosahedronGeometry(0.72, 1),
  belt: new CylinderGeometry(0.75, 0.7, 0.3, 12),
  flap: new BoxGeometry(0.32, 0.38, 0.08),
  head: new IcosahedronGeometry(0.52, 1),
  knot: new IcosahedronGeometry(0.15, 0),
  knotFan: new BoxGeometry(0.1, 0.08, 0.3),
  eye: new SphereGeometry(0.065, 8, 6),
  brow: new BoxGeometry(0.17, 0.04, 0.04),
  cheek: new CircleGeometry(0.085, 10),
  mouth: new BoxGeometry(0.14, 0.035, 0.03),
  arm: new CapsuleGeometry(0.15, 0.3, 3, 8),
  leg: new CylinderGeometry(0.2, 0.23, 0.34, 8),
  ring: new RingGeometry(0.86, 1.02, 32),
};

const SKIN = new MeshStandardMaterial({ color: "#FFD3B0", roughness: 0.8, flatShading: true });
const INK = new MeshStandardMaterial({ color: "#2B2340", roughness: 0.6, flatShading: true });
const CHEEK = new MeshBasicMaterial({ color: "#FF8FA3", transparent: true, opacity: 0.75 });

const colorMaterials = new Map<string, MeshStandardMaterial>();
const ringMaterials = new Map<string, MeshBasicMaterial>();

function beltMaterial(color: string): MeshStandardMaterial {
  let mat = colorMaterials.get(color);
  if (!mat) {
    mat = new MeshStandardMaterial({ color, roughness: 0.55, flatShading: true });
    colorMaterials.set(color, mat);
  }
  return mat;
}

function ringMaterial(color: string): MeshBasicMaterial {
  let mat = ringMaterials.get(color);
  if (!mat) {
    mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    ringMaterials.set(color, mat);
  }
  return mat;
}

export interface SumoParts {
  root: RefObject<Group | null>;
  torso: RefObject<Group | null>;
  head: RefObject<Group | null>;
  eyes: RefObject<Group | null>;
  armL: RefObject<Group | null>;
  armR: RefObject<Group | null>;
  legL: RefObject<Mesh | null>;
  legR: RefObject<Mesh | null>;
  ring: RefObject<Mesh | null>;
}

export function useSumoParts(): SumoParts {
  return {
    root: useRef<Group>(null),
    torso: useRef<Group>(null),
    head: useRef<Group>(null),
    eyes: useRef<Group>(null),
    armL: useRef<Group>(null),
    armR: useRef<Group>(null),
    legL: useRef<Mesh>(null),
    legR: useRef<Mesh>(null),
    ring: useRef<Mesh>(null),
  };
}

/**
 * A compact toy sumo: big head, round body, short limbs, a mawashi belt in the
 * player's colour. Origin is between the feet; the model faces +Z.
 */
export function SumoModel({ parts, color, showRing = true }: { parts: SumoParts; color: string; showRing?: boolean }) {
  const belt = beltMaterial(color);
  return (
    <group ref={parts.root}>
      {showRing && (
        <mesh ref={parts.ring} geometry={GEO.ring} material={ringMaterial(color)} rotation-x={-Math.PI / 2} position-y={0.03} renderOrder={1} />
      )}
      <mesh ref={parts.legL} geometry={GEO.leg} material={SKIN} position={[-0.32, 0.17, 0]} castShadow />
      <mesh ref={parts.legR} geometry={GEO.leg} material={SKIN} position={[0.32, 0.17, 0]} castShadow />

      <group ref={parts.torso} position-y={0.3}>
        <mesh geometry={GEO.body} material={SKIN} position-y={0.42} scale={[1, 0.88, 0.92]} castShadow />
        <mesh geometry={GEO.belt} material={belt} position-y={0.2} castShadow />
        <mesh geometry={GEO.flap} material={belt} position={[0, 0.12, 0.66]} castShadow />

        <group ref={parts.armL} position={[-0.7, 0.62, 0.05]} rotation-z={0.7}>
          <mesh geometry={GEO.arm} material={SKIN} position-y={-0.22} castShadow />
        </group>
        <group ref={parts.armR} position={[0.7, 0.62, 0.05]} rotation-z={-0.7}>
          <mesh geometry={GEO.arm} material={SKIN} position-y={-0.22} castShadow />
        </group>

        <group ref={parts.head} position-y={1.12}>
          <mesh geometry={GEO.head} material={SKIN} castShadow />
          <mesh geometry={GEO.knot} material={INK} position={[0, 0.5, -0.1]} />
          <mesh geometry={GEO.knotFan} material={INK} position={[0, 0.6, -0.02]} />
          <group ref={parts.eyes} position={[0, 0.05, 0.47]}>
            <mesh geometry={GEO.eye} material={INK} position-x={-0.17} />
            <mesh geometry={GEO.eye} material={INK} position-x={0.17} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.19, 0.46]} rotation-z={0.15} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.19, 0.46]} rotation-z={-0.15} />
          <mesh geometry={GEO.cheek} material={CHEEK} position={[-0.29, -0.08, 0.43]} rotation-y={-0.55} />
          <mesh geometry={GEO.cheek} material={CHEEK} position={[0.29, -0.08, 0.43]} rotation-y={0.55} />
          <mesh geometry={GEO.mouth} material={INK} position={[0, -0.13, 0.49]} />
        </group>
      </group>
    </group>
  );
}
