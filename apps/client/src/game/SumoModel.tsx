import { useRef, type RefObject } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  type Group,
  type Mesh,
} from "three";
import { DEFAULT_APPEARANCE, FACES, HAIR_COLORS, HAIR_STYLES, OUTFITS, type Appearance } from "@mini-sumo/shared";

/** Shared geometry: created once, reused by every sumo (no per-player allocations). */
const GEO = {
  body: new IcosahedronGeometry(0.72, 1),
  belt: new CylinderGeometry(0.75, 0.7, 0.3, 12),
  beltStripe: new CylinderGeometry(0.765, 0.745, 0.05, 12),
  flap: new BoxGeometry(0.32, 0.38, 0.08),
  apron: new BoxGeometry(0.56, 0.62, 0.06),
  emblem: new CircleGeometry(0.14, 16),
  rope: new TorusGeometry(0.78, 0.075, 6, 20),
  shide: new BoxGeometry(0.1, 0.2, 0.02),
  head: new IcosahedronGeometry(0.52, 1),
  knot: new IcosahedronGeometry(0.15, 0),
  knotFan: new BoxGeometry(0.1, 0.08, 0.3),
  spike: new ConeGeometry(0.11, 0.3, 5),
  bowl: new SphereGeometry(0.56, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
  mohawk: new BoxGeometry(0.09, 0.24, 0.13),
  eye: new SphereGeometry(0.065, 8, 6),
  eyeHappy: new TorusGeometry(0.06, 0.018, 4, 10, Math.PI),
  eyeClosed: new BoxGeometry(0.13, 0.025, 0.03),
  lens: new BoxGeometry(0.2, 0.12, 0.04),
  bridge: new BoxGeometry(0.12, 0.03, 0.03),
  brow: new BoxGeometry(0.17, 0.04, 0.04),
  browThick: new BoxGeometry(0.2, 0.075, 0.05),
  cheek: new CircleGeometry(0.085, 10),
  mouth: new BoxGeometry(0.14, 0.035, 0.03),
  smile: new TorusGeometry(0.075, 0.02, 4, 10, Math.PI),
  mouthO: new SphereGeometry(0.04, 8, 6),
  mustache: new CapsuleGeometry(0.035, 0.12, 2, 6),
  arm: new CapsuleGeometry(0.15, 0.3, 3, 8),
  leg: new CylinderGeometry(0.2, 0.23, 0.34, 8),
  ring: new RingGeometry(0.86, 1.02, 32),
};

const SKIN = new MeshStandardMaterial({ color: "#FFD3B0", roughness: 0.8, flatShading: true });
const INK = new MeshStandardMaterial({ color: "#2B2340", roughness: 0.6, flatShading: true });
const WHITE = new MeshStandardMaterial({ color: "#FBF8F2", roughness: 0.7, flatShading: true });
const GOLD = new MeshStandardMaterial({ color: "#F2C14E", roughness: 0.4, metalness: 0.3, flatShading: true });
const CHEEK = new MeshBasicMaterial({ color: "#FF8FA3", transparent: true, opacity: 0.75 });

const materialCache = new Map<string, MeshStandardMaterial>();
const ringMaterials = new Map<string, MeshBasicMaterial>();

function colorMaterial(color: string, roughness = 0.55): MeshStandardMaterial {
  const key = `${color}:${roughness}`;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new MeshStandardMaterial({ color, roughness, flatShading: true });
    materialCache.set(key, mat);
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

// ---------------------------------------------------------------- hair

function Hair({ style, color }: { style: string; color: string }) {
  const mat = colorMaterial(color, 0.6);
  switch (style) {
    case "bald":
      return null;
    case "spiky":
      return (
        <group>
          {[
            [0, 0.5, 0, 0, 0],
            [0.2, 0.44, 0.08, -0.5, 0.35],
            [-0.2, 0.44, 0.08, 0.5, 0.35],
            [0.16, 0.42, -0.2, -0.45, -0.45],
            [-0.16, 0.42, -0.2, 0.45, -0.45],
            [0, 0.38, -0.3, 0, -0.8],
          ].map(([x, y, z, rz, rx], i) => (
            <mesh key={i} geometry={GEO.spike} material={mat} position={[x!, y!, z!]} rotation={[rx!, 0, rz!]} castShadow />
          ))}
        </group>
      );
    case "bowl":
      return <mesh geometry={GEO.bowl} material={mat} position={[0, 0.04, -0.03]} rotation-x={-0.18} castShadow />;
    case "mohawk":
      return (
        <group>
          {[0.32, 0.12, -0.1, -0.32, -0.52].map((angle, i) => (
            <mesh
              key={i}
              geometry={GEO.mohawk}
              material={mat}
              position={[0, Math.cos(angle) * 0.52, Math.sin(angle) * 0.52]}
              rotation-x={angle}
              castShadow
            />
          ))}
        </group>
      );
    default: // topknot (chonmage)
      return (
        <group>
          <mesh geometry={GEO.knot} material={mat} position={[0, 0.5, -0.1]} />
          <mesh geometry={GEO.knotFan} material={mat} position={[0, 0.6, -0.02]} />
        </group>
      );
  }
}

// ---------------------------------------------------------------- face

function Face({ style, eyesRef }: { style: string; eyesRef: RefObject<Group | null> }) {
  const cheeks = (
    <>
      <mesh geometry={GEO.cheek} material={CHEEK} position={[-0.29, -0.08, 0.43]} rotation-y={-0.55} />
      <mesh geometry={GEO.cheek} material={CHEEK} position={[0.29, -0.08, 0.43]} rotation-y={0.55} />
    </>
  );

  switch (style) {
    case "happy":
      return (
        <>
          <group ref={eyesRef} position={[0, 0.06, 0.47]}>
            <mesh geometry={GEO.eyeHappy} material={INK} position-x={-0.17} />
            <mesh geometry={GEO.eyeHappy} material={INK} position-x={0.17} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.22, 0.45]} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.22, 0.45]} />
          <mesh geometry={GEO.smile} material={INK} position={[0, -0.1, 0.49]} rotation-z={Math.PI} />
          {cheeks}
        </>
      );
    case "cool":
      return (
        <>
          <group ref={eyesRef} position={[0, 0.06, 0.5]}>
            <mesh geometry={GEO.lens} material={INK} position-x={-0.15} />
            <mesh geometry={GEO.lens} material={INK} position-x={0.15} />
            <mesh geometry={GEO.bridge} material={INK} position-y={0.03} />
          </group>
          <mesh geometry={GEO.mouth} material={INK} position={[0.04, -0.14, 0.49]} rotation-z={0.25} />
          {cheeks}
        </>
      );
    case "sleepy":
      return (
        <>
          <group ref={eyesRef} position={[0, 0.03, 0.48]}>
            <mesh geometry={GEO.eyeClosed} material={INK} position-x={-0.17} />
            <mesh geometry={GEO.eyeClosed} material={INK} position-x={0.17} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.15, 0.46]} rotation-z={-0.12} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.15, 0.46]} rotation-z={0.12} />
          <mesh geometry={GEO.mouthO} material={INK} position={[0, -0.14, 0.48]} />
          {cheeks}
        </>
      );
    case "fierce":
      return (
        <>
          <group ref={eyesRef} position={[0, 0.04, 0.47]}>
            <mesh geometry={GEO.eye} material={INK} position-x={-0.17} />
            <mesh geometry={GEO.eye} material={INK} position-x={0.17} />
          </group>
          <mesh geometry={GEO.browThick} material={INK} position={[-0.17, 0.18, 0.46]} rotation-z={-0.4} />
          <mesh geometry={GEO.browThick} material={INK} position={[0.17, 0.18, 0.46]} rotation-z={0.4} />
          <mesh geometry={GEO.mustache} material={INK} position={[-0.08, -0.1, 0.5]} rotation-z={1.2} />
          <mesh geometry={GEO.mustache} material={INK} position={[0.08, -0.1, 0.5]} rotation-z={-1.2} />
          {cheeks}
        </>
      );
    default: // determined
      return (
        <>
          <group ref={eyesRef} position={[0, 0.05, 0.47]}>
            <mesh geometry={GEO.eye} material={INK} position-x={-0.17} />
            <mesh geometry={GEO.eye} material={INK} position-x={0.17} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.19, 0.46]} rotation-z={0.15} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.19, 0.46]} rotation-z={-0.15} />
          <mesh geometry={GEO.mouth} material={INK} position={[0, -0.13, 0.49]} />
          {cheeks}
        </>
      );
  }
}

// ---------------------------------------------------------------- outfit

function Outfit({ style, color }: { style: string; color: string }) {
  const belt = colorMaterial(color);
  const base = <mesh geometry={GEO.belt} material={belt} position-y={0.2} castShadow />;
  switch (style) {
    case "striped":
      return (
        <>
          {base}
          <mesh geometry={GEO.beltStripe} material={WHITE} position-y={0.29} />
          <mesh geometry={GEO.beltStripe} material={WHITE} position-y={0.11} />
          <mesh geometry={GEO.flap} material={belt} position={[0, 0.12, 0.66]} castShadow />
        </>
      );
    case "apron":
      return (
        <>
          {base}
          <mesh geometry={GEO.apron} material={belt} position={[0, -0.06, 0.7]} rotation-x={-0.08} castShadow />
          <mesh geometry={GEO.emblem} material={GOLD} position={[0, -0.02, 0.735]} rotation-x={-0.08} />
        </>
      );
    case "champion":
      return (
        <>
          {base}
          <mesh geometry={GEO.rope} material={WHITE} position-y={0.22} rotation-x={Math.PI / 2} castShadow />
          {[-0.22, 0, 0.22].map((x) => (
            <mesh key={x} geometry={GEO.shide} material={WHITE} position={[x, 0.04, 0.78]} rotation-z={x * 0.8} />
          ))}
          <mesh geometry={GEO.flap} material={belt} position={[0, 0.12, 0.66]} castShadow />
        </>
      );
    default: // classic
      return (
        <>
          {base}
          <mesh geometry={GEO.flap} material={belt} position={[0, 0.12, 0.66]} castShadow />
        </>
      );
  }
}

// ---------------------------------------------------------------- model

/**
 * A compact toy sumo: big head, round body, short limbs and a mawashi belt in the player's
 * slot colour. Hair, face and outfit come from the appearance. Origin is between the feet;
 * the model faces +Z.
 */
export function SumoModel({
  parts,
  color,
  appearance = DEFAULT_APPEARANCE,
  showRing = true,
}: {
  parts: SumoParts;
  color: string;
  appearance?: Appearance;
  showRing?: boolean;
}) {
  const hairStyle = HAIR_STYLES[appearance.hair]?.id ?? "topknot";
  const hairColor = HAIR_COLORS[appearance.hairColor]?.hex ?? HAIR_COLORS[0].hex;
  const face = FACES[appearance.face]?.id ?? "determined";
  const outfit = OUTFITS[appearance.outfit]?.id ?? "classic";

  return (
    <group ref={parts.root}>
      {showRing && (
        <mesh ref={parts.ring} geometry={GEO.ring} material={ringMaterial(color)} rotation-x={-Math.PI / 2} position-y={0.03} renderOrder={1} />
      )}
      <mesh ref={parts.legL} geometry={GEO.leg} material={SKIN} position={[-0.32, 0.17, 0]} castShadow />
      <mesh ref={parts.legR} geometry={GEO.leg} material={SKIN} position={[0.32, 0.17, 0]} castShadow />

      <group ref={parts.torso} position-y={0.3}>
        <mesh geometry={GEO.body} material={SKIN} position-y={0.42} scale={[1, 0.88, 0.92]} castShadow />
        <Outfit style={outfit} color={color} />

        <group ref={parts.armL} position={[-0.7, 0.62, 0.05]} rotation-z={0.7}>
          <mesh geometry={GEO.arm} material={SKIN} position-y={-0.22} castShadow />
        </group>
        <group ref={parts.armR} position={[0.7, 0.62, 0.05]} rotation-z={-0.7}>
          <mesh geometry={GEO.arm} material={SKIN} position-y={-0.22} castShadow />
        </group>

        <group ref={parts.head} position-y={1.12}>
          <mesh geometry={GEO.head} material={SKIN} castShadow />
          <Hair style={hairStyle} color={hairColor} />
          <Face style={face} eyesRef={parts.eyes} />
        </group>
      </group>
    </group>
  );
}
