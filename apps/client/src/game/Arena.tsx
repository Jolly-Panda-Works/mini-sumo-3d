import { memo } from "react";
import { ARENA_RADIUS } from "@mini-sumo/shared";

const R = ARENA_RADIUS;
const PLATFORM_HEIGHT = 1.4;

const CORNER_COLORS = ["#3FA34D", "#E2443A", "#F4F1F8", "#2B2340"]; // the four seasonal tassel colours
const CUSHION_COLORS = ["#C2457A", "#E58E3B", "#5B8FCF", "#7C5BB5"];

/**
 * A stylised dohyo: raised clay platform, sand ring, straw-bale boundary (tawara),
 * starting lines, and a lower floor around it so ring-outs read as a real fall.
 * The visible rope sits exactly on the gameplay boundary radius.
 */
export const Arena = memo(function Arena() {
  return (
    <group>
      {/* Lower floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={-PLATFORM_HEIGHT} receiveShadow>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#2F5C8A" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-PLATFORM_HEIGHT + 0.01} receiveShadow>
        <ringGeometry args={[R + 4.2, R + 4.6, 48]} />
        <meshStandardMaterial color="#3D6FA0" roughness={1} />
      </mesh>

      {/* Clay platform */}
      <mesh position-y={-PLATFORM_HEIGHT / 2} receiveShadow castShadow>
        <cylinderGeometry args={[R + 0.5, R + 1.5, PLATFORM_HEIGHT, 28]} />
        <meshStandardMaterial color="#C98A55" roughness={0.95} flatShading />
      </mesh>
      {/* Playing surface */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.005} receiveShadow>
        <circleGeometry args={[R + 0.5, 56]} />
        <meshStandardMaterial color="#E7C996" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <circleGeometry args={[R - 0.15, 56]} />
        <meshStandardMaterial color="#EFD6A8" roughness={1} />
      </mesh>

      {/* Tawara: straw rope on the boundary */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.1} castShadow receiveShadow>
        <torusGeometry args={[R, 0.17, 6, 64]} />
        <meshStandardMaterial color="#CDB46A" roughness={0.9} flatShading />
      </mesh>

      {/* Shikiri-sen starting lines */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.1, 0.02, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.12, 1]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.6} />
        </mesh>
      ))}

      {/* Corner posts with coloured tassels */}
      {CORNER_COLORS.map((color, i) => {
        const angle = Math.PI / 4 + (i * Math.PI) / 2;
        const d = R + 3.3;
        return (
          <group key={color} position={[Math.cos(angle) * d, -PLATFORM_HEIGHT, Math.sin(angle) * d]}>
            <mesh position-y={1.3} castShadow>
              <cylinderGeometry args={[0.16, 0.2, 2.6, 8]} />
              <meshStandardMaterial color="#6B3F2A" roughness={0.8} flatShading />
            </mesh>
            <mesh position-y={2.2} castShadow>
              <coneGeometry args={[0.38, 0.9, 8]} />
              <meshStandardMaterial color={color} roughness={0.7} flatShading />
            </mesh>
            <mesh position-y={2.75}>
              <sphereGeometry args={[0.2, 8, 6]} />
              <meshStandardMaterial color={color} roughness={0.7} flatShading />
            </mesh>
          </group>
        );
      })}

      {/* Spectator cushions */}
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 + 0.2;
        const d = R + 5.6;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * d, -PLATFORM_HEIGHT + 0.1, Math.sin(angle) * d]}
            rotation-y={-angle}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.9, 0.2, 0.9]} />
            <meshStandardMaterial color={CUSHION_COLORS[i % CUSHION_COLORS.length]} roughness={0.9} flatShading />
          </mesh>
        );
      })}
    </group>
  );
});
