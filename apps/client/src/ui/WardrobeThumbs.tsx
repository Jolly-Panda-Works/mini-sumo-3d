import { useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Appearance, CosmeticCategory } from "@mini-sumo/shared";
import { createStore, useStore } from "../store";
import { SumoModel, useSumoParts } from "../game/SumoModel";

/**
 * Thumbnails for the wardrobe slots: each item drawn on your own wrestler (close-up of the
 * head for hair, colour and face; the belt for outfits). One small hidden canvas renders
 * them one after another; the pictures are cached for the session.
 */
interface Job {
  key: string;
  appearance: Appearance;
  category: CosmeticCategory;
  color: string;
}

const thumbs = createStore<Record<string, string>>({});
const queue: Job[] = [];
const queued = new Set<string>();

export function thumbKey(category: CosmeticCategory, appearance: Appearance, color: string): string {
  return `${category}:${appearance.hair}.${appearance.hairColor}.${appearance.face}.${appearance.outfit}:${color}`;
}

/** Asks for a thumbnail (once); `useThumb` returns it when ready. */
export function requestThumb(job: Job): void {
  if (thumbs.get()[job.key] || queued.has(job.key)) return;
  queued.add(job.key);
  queue.push(job);
}

export function useThumb(key: string): string | undefined {
  return useStore(thumbs)[key];
}

const SHOTS: Record<CosmeticCategory | "avatar", { position: [number, number, number]; target: [number, number, number] }> = {
  hair: { position: [0.55, 1.75, 2.3], target: [0, 1.5, 0] },
  // Colours: a close-up of the hair from slightly above, so the colour fills the picture.
  hairColor: { position: [0.35, 2.35, 1.55], target: [0, 1.82, 0] },
  face: { position: [0.25, 1.55, 2.1], target: [0, 1.42, 0] },
  outfit: { position: [0.6, 1.0, 3.1], target: [0, 0.65, 0] },
  avatar: { position: [0, 1.25, 4.6], target: [0, 1, 0] },
};

function Studio() {
  const { gl, camera } = useThree();
  const parts = useSumoParts();
  const [job, setJob] = useState<Job | null>(null);
  const frames = useRef(0);

  useFrame(() => {
    if (!job) {
      const next = queue.shift();
      if (!next) return;
      const shot = SHOTS[next.category];
      camera.position.set(...shot.position);
      camera.lookAt(...shot.target);
      frames.current = 0;
      setJob(next);
      return;
    }
    // Let the new look render for a couple of frames, then take the picture.
    frames.current += 1;
    if (frames.current < 3) return;
    thumbs.update({ [job.key]: gl.domElement.toDataURL("image/png") });
    queued.delete(job.key);
    setJob(null);
  });

  if (!job) return null;
  return (
    <group rotation-y={0.35}>
      <SumoModel parts={parts} color={job.color} appearance={job.appearance} showRing={false} />
    </group>
  );
}

/** The hidden canvas that renders the thumbnails (mount it while the wardrobe is open). */
export function ThumbStudio() {
  return (
    <div className="thumb-studio" aria-hidden="true">
      <Canvas
        dpr={1}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        camera={{ fov: 30, position: [0, 1.6, 2.4] }}
        style={{ width: 128, height: 128 }}
      >
        <hemisphereLight args={["#F4F7FF", "#7B6A5A", 1.25]} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.6} />
        <Studio />
      </Canvas>
    </div>
  );
}
