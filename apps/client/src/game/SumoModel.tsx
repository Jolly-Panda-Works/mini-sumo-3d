import { useRef, type RefObject } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  OctahedronGeometry,
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
  // Hats
  helmet: new SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  neckGuard: new CylinderGeometry(0.62, 0.78, 0.3, 12, 1, true),
  horn: new BoxGeometry(0.07, 0.42, 0.04),
  crest: new CylinderGeometry(0.09, 0.09, 0.03, 10),
  kasa: new ConeGeometry(0.95, 0.42, 14),
  kasaBand: new CylinderGeometry(0.47, 0.5, 0.08, 12),
  crownBand: new CylinderGeometry(0.4, 0.42, 0.2, 12, 1, true),
  crownPoint: new ConeGeometry(0.08, 0.2, 4),
  gem: new OctahedronGeometry(0.05, 0),
  // Masks (a curved plate in front of the face)
  mask: new SphereGeometry(0.56, 14, 10, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.22, Math.PI * 0.52),
  maskEye: new BoxGeometry(0.13, 0.04, 0.03),
  maskEar: new ConeGeometry(0.1, 0.26, 4),
  maskHorn: new ConeGeometry(0.06, 0.24, 6),
  fang: new ConeGeometry(0.03, 0.08, 4),
  nose: new CylinderGeometry(0.035, 0.07, 0.42, 8),
  stripe: new BoxGeometry(0.03, 0.12, 0.02),
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
  ponytail: new CapsuleGeometry(0.11, 0.38, 3, 8),
  afro: new IcosahedronGeometry(0.6, 1),
  bun: new IcosahedronGeometry(0.17, 1),
  headband: new TorusGeometry(0.535, 0.055, 6, 28),
  bandTail: new BoxGeometry(0.08, 0.26, 0.03),
  bigEye: new SphereGeometry(0.09, 10, 8),
  star: new OctahedronGeometry(0.095, 0),
  dot: new SphereGeometry(0.05, 6, 4),
  sagari: new CylinderGeometry(0.025, 0.025, 0.3, 5),
  cape: new BoxGeometry(1.05, 0.95, 0.04),
  armband: new TorusGeometry(0.16, 0.045, 6, 16),
  leg: new CylinderGeometry(0.2, 0.23, 0.34, 8),
  ring: new RingGeometry(0.86, 1.02, 32),
};

const SKIN = new MeshStandardMaterial({ color: "#FFD3B0", roughness: 0.8, flatShading: true });
const INK = new MeshStandardMaterial({ color: "#2B2340", roughness: 0.6, flatShading: true });
const WHITE = new MeshStandardMaterial({ color: "#FBF8F2", roughness: 0.7, flatShading: true });
const GOLD = new MeshStandardMaterial({ color: "#F2C14E", roughness: 0.4, metalness: 0.3, flatShading: true });
const CHEEK = new MeshBasicMaterial({ color: "#FF8FA3", transparent: true, opacity: 0.75 });
const BAND = new MeshStandardMaterial({ color: "#E2443A", roughness: 0.6, flatShading: true });
const SAKURA = new MeshStandardMaterial({ color: "#FF9EC4", roughness: 0.6, flatShading: true });
const DRAGON = new MeshStandardMaterial({ color: "#1C1A24", roughness: 0.55, flatShading: true });
const IRON = new MeshStandardMaterial({ color: "#3B3F4E", roughness: 0.45, metalness: 0.45, flatShading: true });
const STRAW = new MeshStandardMaterial({ color: "#D8B266", roughness: 0.95, flatShading: true });
const MASK_WHITE = new MeshStandardMaterial({ color: "#F7F3EA", roughness: 0.5, flatShading: true });
const MASK_RED = new MeshStandardMaterial({ color: "#D23A2E", roughness: 0.5, flatShading: true });
const GEM = new MeshStandardMaterial({ color: "#E2443A", roughness: 0.2, emissive: "#5A0E0A", flatShading: true });
const SPARKLE = new MeshStandardMaterial({ color: "#FFD23F", roughness: 0.3, emissive: "#8A6400", flatShading: true });

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
    case "ponytail":
      return (
        <group>
          <mesh geometry={GEO.knot} material={mat} position={[0, 0.36, -0.45]} />
          <mesh geometry={GEO.ponytail} material={mat} position={[0, 0.1, -0.6]} rotation-x={0.35} castShadow />
        </group>
      );
    case "afro":
      return <mesh geometry={GEO.afro} material={mat} position={[0, 0.28, -0.2]} scale={[1.12, 1, 1]} castShadow />;
    case "buns":
      return (
        <group>
          <mesh geometry={GEO.bun} material={mat} position={[-0.3, 0.44, -0.06]} castShadow />
          <mesh geometry={GEO.bun} material={mat} position={[0.3, 0.44, -0.06]} castShadow />
        </group>
      );
    case "kasa":
      // Straw hat: a wide shallow cone over the head
      return (
        <group position-y={0.42}>
          <mesh geometry={GEO.kasa} material={STRAW} castShadow />
          <mesh geometry={GEO.kasaBand} material={BAND} position-y={-0.12} />
        </group>
      );
    case "kabuto":
      // Samurai helmet: iron dome, flared neck guard, gold horns and crest
      return (
        <group>
          <mesh geometry={GEO.helmet} material={IRON} position-y={0.02} castShadow />
          <mesh geometry={GEO.neckGuard} material={IRON} position={[0, 0.02, -0.04]} castShadow />
          <mesh geometry={GEO.horn} material={GOLD} position={[-0.16, 0.6, 0.38]} rotation={[0.25, 0, 0.45]} />
          <mesh geometry={GEO.horn} material={GOLD} position={[0.16, 0.6, 0.38]} rotation={[0.25, 0, -0.45]} />
          <mesh geometry={GEO.crest} material={GOLD} position={[0, 0.42, 0.45]} rotation-x={Math.PI / 2 - 0.5} />
        </group>
      );
    case "crown":
      // Gold crown with points and gems
      return (
        <group position-y={0.48}>
          <mesh geometry={GEO.crownBand} material={GOLD} castShadow />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <group key={i}>
                <mesh geometry={GEO.crownPoint} material={GOLD} position={[Math.sin(a) * 0.4, 0.18, Math.cos(a) * 0.4]} />
                <mesh geometry={GEO.gem} material={GEM} position={[Math.sin(a + 0.52) * 0.42, 0, Math.cos(a + 0.52) * 0.42]} />
              </group>
            );
          })}
        </group>
      );
    case "samurai":
      return (
        <group>
          <mesh geometry={GEO.knot} material={mat} position={[0, 0.5, -0.1]} />
          <mesh geometry={GEO.knotFan} material={mat} position={[0, 0.6, -0.02]} />
          <mesh geometry={GEO.headband} material={BAND} position-y={0.16} rotation-x={Math.PI / 2} />
          <mesh geometry={GEO.bandTail} material={BAND} position={[0.08, 0.02, -0.55]} rotation-z={0.3} />
          <mesh geometry={GEO.bandTail} material={BAND} position={[-0.06, 0.0, -0.55]} rotation-z={-0.25} />
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
    case "laughing":
      // Eyes shut tight with joy, a big open laugh
      return (
        <>
          <group ref={eyesRef} position={[0, 0.06, 0.47]}>
            <mesh geometry={GEO.eyeClosed} material={INK} position={[-0.17, 0, 0.035]} rotation-z={0.25} scale={[1.15, 1.4, 1.6]} />
            <mesh geometry={GEO.eyeClosed} material={INK} position={[0.17, 0, 0.035]} rotation-z={-0.25} scale={[1.15, 1.4, 1.6]} />
          </group>
          <mesh geometry={GEO.mouth} material={INK} position={[0, -0.15, 0.49]} scale={[1.7, 1.5, 1]} />
          <mesh geometry={GEO.cheek} material={CHEEK} position={[-0.3, -0.06, 0.4]} />
          <mesh geometry={GEO.cheek} material={CHEEK} position={[0.3, -0.06, 0.4]} />
        </>
      );
    case "smug":
      // Half-closed eyes, one raised brow, a lopsided smile
      return (
        <>
          <group ref={eyesRef} position={[0, 0.05, 0.47]}>
            <mesh geometry={GEO.eye} material={INK} position-x={-0.17} scale={[1, 0.55, 1]} />
            <mesh geometry={GEO.eye} material={INK} position-x={0.17} scale={[1, 0.55, 1]} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.17, 0.48]} rotation-z={0.05} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.22, 0.46]} rotation-z={-0.3} />
          <mesh geometry={GEO.smile} material={INK} position={[0.06, -0.13, 0.49]} rotation-z={0.25} scale={[0.8, 1, 1]} />
        </>
      );
    case "kitsune":
      // White fox mask: pointed ears, narrow eyes, red markings
      return (
        <>
          <mesh geometry={GEO.mask} material={MASK_WHITE} position-z={0.02} />
          <group ref={eyesRef} position={[0, 0.07, 0.53]}>
            <mesh geometry={GEO.maskEye} material={INK} position-x={-0.16} rotation-z={-0.3} />
            <mesh geometry={GEO.maskEye} material={INK} position-x={0.16} rotation-z={0.3} />
          </group>
          <mesh geometry={GEO.maskEar} material={MASK_WHITE} position={[-0.27, 0.48, 0.25]} rotation-z={0.35} />
          <mesh geometry={GEO.maskEar} material={MASK_WHITE} position={[0.27, 0.48, 0.25]} rotation-z={-0.35} />
          <mesh geometry={GEO.stripe} material={MASK_RED} position={[-0.17, 0.19, 0.53]} rotation-z={0.5} />
          <mesh geometry={GEO.stripe} material={MASK_RED} position={[0.17, 0.19, 0.53]} rotation-z={-0.5} />
          <mesh geometry={GEO.stripe} material={MASK_RED} position={[0, 0.27, 0.53]} />
          <mesh geometry={GEO.smile} material={MASK_RED} position={[0, -0.14, 0.55]} rotation-z={Math.PI} />
        </>
      );
    case "oni":
      // Red demon mask: horns, angry brows, fangs
      return (
        <>
          <mesh geometry={GEO.mask} material={MASK_RED} position-z={0.02} />
          <group ref={eyesRef} position={[0, 0.07, 0.54]}>
            <mesh geometry={GEO.bigEye} material={GOLD} position-x={-0.16} scale={[1, 0.7, 0.5]} />
            <mesh geometry={GEO.bigEye} material={GOLD} position-x={0.16} scale={[1, 0.7, 0.5]} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.16, 0.2, 0.54]} rotation-z={-0.45} />
          <mesh geometry={GEO.brow} material={INK} position={[0.16, 0.2, 0.54]} rotation-z={0.45} />
          <mesh geometry={GEO.maskHorn} material={MASK_WHITE} position={[-0.22, 0.5, 0.22]} rotation-z={0.3} />
          <mesh geometry={GEO.maskHorn} material={MASK_WHITE} position={[0.22, 0.5, 0.22]} rotation-z={-0.3} />
          <mesh geometry={GEO.mouth} material={INK} position={[0, -0.15, 0.55]} scale={[1.6, 1.4, 1]} />
          <mesh geometry={GEO.fang} material={MASK_WHITE} position={[-0.07, -0.13, 0.57]} rotation-x={Math.PI} />
          <mesh geometry={GEO.fang} material={MASK_WHITE} position={[0.07, -0.13, 0.57]} rotation-x={Math.PI} />
        </>
      );
    case "tengu":
      // Red tengu mask: the long nose, bushy white brows
      return (
        <>
          <mesh geometry={GEO.mask} material={MASK_RED} position-z={0.02} />
          <group ref={eyesRef} position={[0, 0.1, 0.54]}>
            <mesh geometry={GEO.eye} material={INK} position-x={-0.16} />
            <mesh geometry={GEO.eye} material={INK} position-x={0.16} />
          </group>
          <mesh geometry={GEO.brow} material={MASK_WHITE} position={[-0.16, 0.23, 0.54]} rotation-z={-0.25} scale={[1.3, 1.6, 1]} />
          <mesh geometry={GEO.brow} material={MASK_WHITE} position={[0.16, 0.23, 0.54]} rotation-z={0.25} scale={[1.3, 1.6, 1]} />
          <mesh geometry={GEO.nose} material={MASK_RED} position={[0, -0.02, 0.72]} rotation-x={Math.PI / 2 - 0.15} castShadow />
          <mesh geometry={GEO.mouth} material={INK} position={[0, -0.2, 0.53]} />
        </>
      );
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
    case "wink":
      return (
        <>
          {/* Same size and height as the other faces: one eye closed (like Sleepy's), one open,
              brows level; the closed eye sits a hair forward so the faceted head can't hide it */}
          <group ref={eyesRef} position={[0, 0.05, 0.48]}>
            <mesh geometry={GEO.eyeClosed} material={INK} position={[-0.17, 0, 0.012]} />
            <mesh geometry={GEO.eye} material={INK} position-x={0.17} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.2, 0.46]} rotation-z={0.1} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.2, 0.46]} rotation-z={-0.1} />
          <mesh geometry={GEO.smile} material={INK} position={[0.03, -0.1, 0.49]} rotation-z={Math.PI} />
          {cheeks}
        </>
      );
    case "surprised":
      return (
        <>
          <group ref={eyesRef} position={[0, 0.06, 0.46]}>
            <mesh geometry={GEO.bigEye} material={INK} position-x={-0.17} />
            <mesh geometry={GEO.bigEye} material={INK} position-x={0.17} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.25, 0.44]} rotation-z={-0.2} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.25, 0.44]} rotation-z={0.2} />
          <mesh geometry={GEO.mouthO} material={INK} position={[0, -0.15, 0.48]} scale={[1.2, 1.5, 1]} />
          {cheeks}
        </>
      );
    case "grumpy":
      return (
        <>
          <group ref={eyesRef} position={[0, 0.03, 0.47]}>
            <mesh geometry={GEO.eye} material={INK} position-x={-0.17} scale={[1, 0.6, 1]} />
            <mesh geometry={GEO.eye} material={INK} position-x={0.17} scale={[1, 0.6, 1]} />
          </group>
          <mesh geometry={GEO.browThick} material={INK} position={[-0.17, 0.13, 0.47]} rotation-z={-0.3} />
          <mesh geometry={GEO.browThick} material={INK} position={[0.17, 0.13, 0.47]} rotation-z={0.3} />
          <mesh geometry={GEO.smile} material={INK} position={[0, -0.18, 0.49]} />
          {cheeks}
        </>
      );
    case "sparkly":
      return (
        <>
          <group ref={eyesRef} position={[0, 0.06, 0.48]}>
            <mesh geometry={GEO.star} material={SPARKLE} position-x={-0.17} scale={[1, 1, 0.45]} rotation-z={Math.PI / 4} />
            <mesh geometry={GEO.star} material={SPARKLE} position-x={0.17} scale={[1, 1, 0.45]} rotation-z={Math.PI / 4} />
          </group>
          <mesh geometry={GEO.brow} material={INK} position={[-0.17, 0.21, 0.46]} rotation-z={0.1} />
          <mesh geometry={GEO.brow} material={INK} position={[0.17, 0.21, 0.46]} rotation-z={-0.1} />
          <mesh geometry={GEO.smile} material={INK} position={[0, -0.1, 0.49]} rotation-z={Math.PI} />
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
    case "polka":
      return (
        <>
          {base}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <mesh key={i} geometry={GEO.dot} material={WHITE} position={[Math.sin(a) * 0.75, 0.2 + (i % 2 ? 0.06 : -0.06), Math.cos(a) * 0.75]} />;
          })}
          <mesh geometry={GEO.flap} material={belt} position={[0, 0.12, 0.66]} castShadow />
        </>
      );
    case "sagari":
      return (
        <>
          {base}
          {Array.from({ length: 9 }, (_, i) => {
            const a = ((i - 4) / 9) * Math.PI * 0.9;
            return <mesh key={i} geometry={GEO.sagari} material={belt} position={[Math.sin(a) * 0.72, -0.08, Math.cos(a) * 0.72]} />;
          })}
        </>
      );
    case "cape":
      return (
        <>
          {base}
          <mesh geometry={GEO.flap} material={belt} position={[0, 0.12, 0.66]} castShadow />
          <mesh geometry={GEO.cape} material={belt} position={[0, 0.55, -0.7]} rotation-x={0.18} castShadow />
          <mesh geometry={GEO.dot} material={GOLD} position={[-0.42, 1.0, -0.6]} />
          <mesh geometry={GEO.dot} material={GOLD} position={[0.42, 1.0, -0.6]} />
        </>
      );
    case "sakura":
      // Pink blossoms dotted round the belt
      return (
        <>
          {base}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <mesh key={i} geometry={GEO.dot} material={SAKURA} position={[Math.sin(a) * 0.75, 0.2 + (i % 2 ? 0.07 : -0.05), Math.cos(a) * 0.75]} scale={1.25} />;
          })}
          <mesh geometry={GEO.flap} material={belt} position={[0, 0.12, 0.66]} castShadow />
        </>
      );
    case "dragon":
      // A black belt with gold studs and the champion's rope
      return (
        <>
          <mesh geometry={GEO.belt} material={DRAGON} position-y={0.2} castShadow />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <mesh key={i} geometry={GEO.dot} material={GOLD} position={[Math.sin(a) * 0.76, 0.2, Math.cos(a) * 0.76]} scale={0.8} />;
          })}
          <mesh geometry={GEO.rope} material={GOLD} position-y={0.31} rotation-x={Math.PI / 2} castShadow />
          <mesh geometry={GEO.flap} material={DRAGON} position={[0, 0.12, 0.66]} castShadow />
        </>
      );
    case "kesho":
      // The ceremonial apron of the top wrestlers: apron, emblem, rope and paper strips
      return (
        <>
          {base}
          <mesh geometry={GEO.rope} material={WHITE} position-y={0.22} rotation-x={Math.PI / 2} castShadow />
          <mesh geometry={GEO.apron} material={belt} position={[0, -0.06, 0.7]} rotation-x={-0.08} castShadow />
          <mesh geometry={GEO.emblem} material={GOLD} position={[0, -0.02, 0.735]} rotation-x={-0.08} />
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} geometry={GEO.shide} material={WHITE} position={[x, 0.02, 0.74]} rotation-z={x * 0.8} />
          ))}
        </>
      );
    case "golden":
      // All gold: the belt, its flap and the rope
      return (
        <>
          <mesh geometry={GEO.belt} material={GOLD} position-y={0.2} castShadow />
          <mesh geometry={GEO.rope} material={GOLD} position-y={0.22} rotation-x={Math.PI / 2} castShadow />
          <mesh geometry={GEO.flap} material={GOLD} position={[0, 0.12, 0.66]} castShadow />
          <mesh geometry={GEO.emblem} material={GEM} position={[0, 0.2, 0.79]} />
        </>
      );
    default: // classic and armbands (bands are drawn on the arms)
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
  const armband = outfit === "armbands" ? <mesh geometry={GEO.armband} material={colorMaterial(color)} position-y={-0.32} rotation-x={Math.PI / 2} /> : null;

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
          {armband}
        </group>
        <group ref={parts.armR} position={[0.7, 0.62, 0.05]} rotation-z={-0.7}>
          <mesh geometry={GEO.arm} material={SKIN} position-y={-0.22} castShadow />
          {armband}
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
