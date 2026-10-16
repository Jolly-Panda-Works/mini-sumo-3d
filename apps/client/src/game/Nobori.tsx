import { forwardRef, type Ref } from "react";
import type { Group, Mesh } from "three";
import { DoubleSide } from "three";

/**
 * A nobori flag: pole, top crossbar and a vertical banner (double-sided so the kanji reads
 * the right way from both sides). Sizes in metres; the pole stands at the group origin.
 */
export const Nobori = forwardRef<Group, { height?: number; width?: number; bannerRef?: Ref<Mesh>; backRef?: Ref<Mesh> }>(
  function Nobori({ height = 2.2, width = 0.62, bannerRef, backRef }, ref) {
    const bannerH = height * 0.72;
    return (
      <group ref={ref}>
        <mesh position-y={height / 2} castShadow>
          <cylinderGeometry args={[0.035, 0.045, height, 8]} />
          <meshStandardMaterial color="#9a9fa8" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[width / 2, height - 0.04, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.025, 0.025, width + 0.08, 6]} />
          <meshStandardMaterial color="#9a9fa8" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh ref={bannerRef} position={[width / 2 + 0.03, height - 0.06 - bannerH / 2, 0.012]}>
          <planeGeometry args={[width, bannerH]} />
          <meshStandardMaterial color="#ffffff" roughness={0.85} side={DoubleSide} />
        </mesh>
        <mesh ref={backRef} position={[width / 2 + 0.03, height - 0.06 - bannerH / 2, -0.012]} rotation-y={Math.PI}>
          <planeGeometry args={[width, bannerH]} />
          <meshStandardMaterial color="#ffffff" roughness={0.85} />
        </mesh>
      </group>
    );
  },
);
