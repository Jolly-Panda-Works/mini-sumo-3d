import { memo } from "react";
import { ARENA_RADIUS } from "@mini-sumo/shared";
import type { ArenaTheme } from "./arenaThemes";
import { RingEdge } from "./RingEdge";

const R = ARENA_RADIUS;
const PLATFORM_HEIGHT = 1.4;


/**
 * A stylised dohyo: raised clay platform, sand ring, straw-bale boundary (tawara),
 * starting lines, and a lower floor around it so ring-outs read as a real fall.
 * The visible rope sits exactly on the gameplay boundary radius.
 */
export const Arena = memo(function Arena({ theme }: { theme: ArenaTheme }) {
  const CORNER_COLORS = theme.tassels;
  const CUSHION_COLORS = theme.cushions;
  return (
    <group>
      {/* Lower floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={-PLATFORM_HEIGHT} receiveShadow>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color={theme.floor} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-PLATFORM_HEIGHT + 0.01} receiveShadow>
        <ringGeometry args={[R + 4.2, R + 4.6, 48]} />
        <meshStandardMaterial color={theme.floorRing} roughness={1} />
      </mesh>

      {/* Clay platform */}
      <mesh position-y={-PLATFORM_HEIGHT / 2} receiveShadow castShadow>
        <cylinderGeometry args={[R + 0.5, R + 1.5, PLATFORM_HEIGHT, 28]} />
        <meshStandardMaterial color={theme.platform} roughness={0.95} flatShading />
      </mesh>
      {/* Playing surface */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.005} receiveShadow>
        <circleGeometry args={[R + 0.5, 56]} />
        <meshStandardMaterial color={theme.surface} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <circleGeometry args={[R - 0.15, 56]} />
        <meshStandardMaterial color={theme.ring} roughness={1} />
      </mesh>

      {/* Tawara: the rope on the boundary (it closes in near the end of a bout) */}
      <RingEdge theme={theme} />

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
          <group key={i} position={[Math.cos(angle) * d, -PLATFORM_HEIGHT, Math.sin(angle) * d]}>
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

      {/* Gold trim (Champion) */}
      {theme.trim && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <torusGeometry args={[R + 0.45, 0.07, 6, 64]} />
          <meshStandardMaterial color={theme.trim} metalness={0.6} roughness={0.3} />
        </mesh>
      )}

      {/* Lanterns (Festival, Temple, Palace) */}
      {Array.from({ length: theme.lanterns }, (_, i) => {
        const angle = (i / theme.lanterns) * Math.PI * 2 + Math.PI / theme.lanterns;
        const d = R + 2.6;
        return (
          <group key={`lantern-${i}`} position={[Math.cos(angle) * d, -PLATFORM_HEIGHT, Math.sin(angle) * d]}>
            <mesh position-y={0.8}>
              <cylinderGeometry args={[0.05, 0.05, 1.6, 6]} />
              <meshStandardMaterial color="#3A2A2A" roughness={0.8} />
            </mesh>
            <mesh position-y={1.75}>
              <sphereGeometry args={[0.28, 10, 8]} />
              <meshBasicMaterial color={theme.lanternColor} toneMapped={false} />
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
