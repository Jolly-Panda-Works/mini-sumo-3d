import { useFrame } from "@react-three/fiber";
import { DEFAULT_APPEARANCE, PLAYER_COLORS, type Appearance } from "@mini-sumo/shared";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { SumoModel, useSumoParts } from "./SumoModel";

/** Decorative pair shown behind the main menu (purely cosmetic, not networked). */
function StompingSumo({ x, colorIndex, phase, appearance }: { x: number; colorIndex: number; phase: number; appearance: Appearance }) {
  const parts = useSumoParts();
  useFrame((frame) => {
    const t = frame.clock.elapsedTime + phase;
    const root = parts.root.current;
    if (!root) return;
    root.position.set(x, 0, 0);
    root.rotation.set(0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    const cycle = (t % 2.4) / 2.4;
    const lift = Math.max(0, Math.sin(cycle * Math.PI * 2));
    const left = Math.floor(t / 2.4) % 2 === 0;
    if (parts.legL.current) parts.legL.current.position.y = 0.17 + (left ? lift * 0.45 : 0);
    if (parts.legR.current) parts.legR.current.position.y = 0.17 + (left ? 0 : lift * 0.45);
    if (parts.torso.current) {
      const squash = cycle > 0.5 && cycle < 0.6 ? 0.12 : 0;
      parts.torso.current.scale.set(1 + squash, 1 - squash, 1 + squash);
      parts.torso.current.rotation.z = (left ? -1 : 1) * lift * 0.12;
    }
    if (parts.eyes.current) parts.eyes.current.scale.y = t % 3.1 < 0.12 ? 0.2 : 1;
  });
  return <SumoModel parts={parts} color={PLAYER_COLORS[colorIndex]!.hex} appearance={appearance} />;
}

const RIVAL: Appearance = { hair: 2, hairColor: 1, face: 4, outfit: 1, avatar: 0 };

/** The left wrestler wears the player's own look, so the menu previews the customisation. */
export function MenuSumos() {
  const { appearance } = useStore(settingsStore);
  return (
    <>
      <StompingSumo x={-1.8} colorIndex={0} phase={0} appearance={appearance ?? DEFAULT_APPEARANCE} />
      <StompingSumo x={1.8} colorIndex={1} phase={1.2} appearance={RIVAL} />
    </>
  );
}
