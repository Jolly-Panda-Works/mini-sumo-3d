import { Canvas } from "@react-three/fiber";
import { PLAYER_COLORS, type Appearance } from "@mini-sumo/shared";
import { PreviewSumo } from "./Wardrobe";

/** A wrestler on a small ring, slowly turning (same look as the wardrobe preview). */
export function WrestlerPreview({ appearance, className = "" }: { appearance: Appearance; className?: string }) {
  return (
    <div className={`wrestler-preview ${className}`} aria-hidden="true">
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.25, 4.6] }}>
        <hemisphereLight args={["#F4F7FF", "#7B6A5A", 1.2]} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow />
        <group position-y={-0.85}>
          <PreviewSumo appearance={appearance} color={PLAYER_COLORS[0]!.hex} />
          <mesh rotation-x={-Math.PI / 2} receiveShadow>
            <circleGeometry args={[1.4, 40]} />
            <meshStandardMaterial color="#EFD6A8" roughness={1} />
          </mesh>
        </group>
      </Canvas>
    </div>
  );
}
