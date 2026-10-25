import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, type Sprite, type SpriteMaterial } from "three";
import { roomManager } from "../network/RoomManager";
import { calloutBus, type Callout } from "./effectsBus";

const POOL = 8;
const LIFE = 1.05;
const W = 512;
const H = 160;
const FONT = '800 104px "Baloo 2", ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';

/** One texture per word and colour, kept for the session (there are only a handful). */
const textures = new Map<string, CanvasTexture>();

function draw(canvas: HTMLCanvasElement, text: string, color: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // A dark drop and outline, like the countdown art, so it reads on any arena.
  ctx.lineWidth = 22;
  ctx.strokeStyle = "#2B2340";
  ctx.strokeText(text, W / 2, H / 2 + 10, W - 30);
  ctx.strokeText(text, W / 2, H / 2 + 2, W - 30);
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, H / 2 + 2, W - 30);
}

export function textureFor(text: string, color: string): CanvasTexture {
  const key = `${text}|${color}`;
  let texture = textures.get(key);
  if (texture) return texture;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  draw(canvas, text, color);
  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const made = texture;
  document.fonts?.ready.then(() => {
    draw(canvas, text, color);
    made.needsUpdate = true;
  });
  textures.set(key, texture);
  return texture;
}

interface Slot extends Callout {
  life: number;
  /** Small sideways drift so stacked callouts don't sit on top of each other. */
  drift: number;
}

/** Pooled words that pop up over the ring, rise and fade (cosmetic only). */
export function Callouts() {
  const refs = useRef<(Sprite | null)[]>([]);
  const slots = useMemo<Slot[]>(() => Array.from({ length: POOL }, () => ({ text: "", x: 0, y: 0, color: "#fff", life: 0, drift: 0 })), []);
  const cursor = useRef(0);

  useEffect(
    () =>
      calloutBus.on((callout) => {
        const index = cursor.current;
        cursor.current = (cursor.current + 1) % POOL;
        Object.assign(slots[index]!, { size: 0.7, follow: undefined }, callout, { life: LIFE, drift: (Math.random() - 0.5) * 0.6 });
        const sprite = refs.current[index];
        if (sprite) {
          const material = sprite.material as SpriteMaterial;
          material.map = textureFor(callout.text, callout.color);
          material.needsUpdate = true;
        }
      }),
    [slots],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const players = roomManager.state?.players;
    for (let i = 0; i < POOL; i++) {
      const slot = slots[i]!;
      const sprite = refs.current[i];
      if (!sprite) continue;
      if (slot.life <= 0) {
        sprite.visible = false;
        continue;
      }
      slot.life = Math.max(0, slot.life - dt);
      const age = LIFE - slot.life;
      const followed = slot.follow ? players?.get(slot.follow) : undefined;
      if (followed?.alive) {
        slot.x = followed.x;
        slot.y = followed.y;
      }
      // Pop in with an overshoot, rise, then fade out over the last third.
      const pop = Math.min(1, age / 0.16);
      const overshoot = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.45 : 1;
      const h = (slot.size ?? 0.7) * pop * overshoot;
      sprite.visible = true;
      sprite.scale.set(h * (W / H), h, 1);
      sprite.position.set(slot.x + slot.drift * age, 3.1 + age * 0.9, slot.y);
      (sprite.material as SpriteMaterial).opacity = Math.min(1, slot.life / (LIFE * 0.35));
    }
  });

  return (
    <>
      {slots.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          visible={false}
          renderOrder={12}
        >
          <spriteMaterial transparent depthTest={false} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}
