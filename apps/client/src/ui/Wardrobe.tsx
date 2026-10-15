import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  FACES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  PLAYER_COLORS,
  Phase,
  randomAppearance,
  type Appearance,
} from "@mini-sumo/shared";
import { SumoModel, useSumoParts } from "../game/SumoModel";
import { gameStore, roomManager } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";
import { setWardrobeOpen } from "../uiStore";

/** Slowly turning, idling preview of the player's wrestler. */
function PreviewSumo({ appearance, color }: { appearance: Appearance; color: string }) {
  const parts = useSumoParts();
  useFrame((frame) => {
    const t = frame.clock.elapsedTime;
    const root = parts.root.current;
    if (!root) return;
    root.rotation.set(0, Math.sin(t * 0.6) * 0.7, 0);
    if (parts.torso.current) parts.torso.current.scale.set(1, 1 + Math.sin(t * 3) * 0.02, 1);
    if (parts.eyes.current) parts.eyes.current.scale.y = t % 3.4 < 0.12 ? 0.2 : 1;
  });
  return <SumoModel parts={parts} color={color} appearance={appearance} showRing={false} />;
}

interface OptionGroupProps {
  label: string;
  options: readonly { label: string; hex?: string }[];
  value: number;
  onChange: (index: number) => void;
}

function OptionGroup({ label, options, value, onChange }: OptionGroupProps) {
  return (
    <fieldset className="wardrobe__group">
      <legend className="field__label">{label}</legend>
      <div className="choices">
        {options.map((option, index) => (
          <button
            key={option.label}
            type="button"
            className={`choice${index === value ? " choice--on" : ""}`}
            aria-pressed={index === value}
            onClick={() => onChange(index)}
          >
            {option.hex && <span className="choice__swatch" style={{ background: option.hex }} aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Customise hair, face and outfit before a match. Changes are saved locally and, in a
 * room lobby, sent to the server right away so everyone sees them.
 */
export function Wardrobe() {
  const { appearance } = useStore(settingsStore);
  const game = useStore(gameStore);
  const doneRef = useRef<HTMLButtonElement>(null);
  const you = game.players.find((p) => p.isYou);
  const color = PLAYER_COLORS[(you?.colorIndex ?? 0) % PLAYER_COLORS.length]!.hex;
  const inLobby = Boolean(you) && (game.phase === Phase.Waiting || game.phase === Phase.Lobby);

  useEffect(() => {
    doneRef.current?.focus();
  }, []);

  const update = (patch: Partial<Appearance>) => {
    const next = { ...settingsStore.get().appearance, ...patch };
    settingsStore.update({ appearance: next });
    if (inLobby) roomManager.setAppearance(next);
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setWardrobeOpen(false)}>
      <section className="panel wardrobe" role="dialog" aria-modal="true" aria-labelledby="wardrobe-title">
        <h2 id="wardrobe-title" className="settings__title">
          Your wrestler
        </h2>

        <div className="wardrobe__body">
          <div className="wardrobe__preview" aria-hidden="true">
            <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, position: [0, 1.25, 4.6] }}>
              <hemisphereLight args={["#F4F7FF", "#7B6A5A", 1.2]} />
              <directionalLight position={[2.5, 4, 3]} intensity={1.6} castShadow />
              <group position-y={-0.85}>
                <PreviewSumo appearance={appearance} color={color} />
                <mesh rotation-x={-Math.PI / 2} receiveShadow>
                  <circleGeometry args={[1.4, 40]} />
                  <meshStandardMaterial color="#EFD6A8" roughness={1} />
                </mesh>
              </group>
            </Canvas>
          </div>

          <div className="wardrobe__options">
            <OptionGroup label="Hair" options={HAIR_STYLES} value={appearance.hair} onChange={(hair) => update({ hair })} />
            <OptionGroup label="Hair colour" options={HAIR_COLORS} value={appearance.hairColor} onChange={(hairColor) => update({ hairColor })} />
            <OptionGroup label="Face" options={FACES} value={appearance.face} onChange={(face) => update({ face })} />
            <OptionGroup label="Outfit" options={OUTFITS} value={appearance.outfit} onChange={(outfit) => update({ outfit })} />
            <p className="hint">Your belt keeps your player colour and number so everyone can tell you apart.</p>
          </div>
        </div>

        <div className="row">
          <button type="button" className="btn btn--grow" onClick={() => update(randomAppearance())}>
            Surprise me
          </button>
          <button ref={doneRef} type="button" className="btn btn--primary btn--grow" onClick={() => setWardrobeOpen(false)}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
