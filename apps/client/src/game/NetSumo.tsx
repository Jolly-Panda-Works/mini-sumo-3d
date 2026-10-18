import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { CanvasTexture, Sprite } from "three";
import { PLAYER_COLORS, Phase, lerpAngle, type Appearance } from "@mini-sumo/shared";
import { roomManager } from "../network/RoomManager";
import { dustBus, lastHitAt } from "./effectsBus";
import { createNameTagTexture } from "./nameTag";
import { SumoModel, useSumoParts } from "./SumoModel";
import { BackBanner } from "./PowerUpFlags";

const OUTER_FLOOR_Y = -1.4;

interface Props {
  id: string;
  name: string;
  colorIndex: number;
  isYou: boolean;
  hair: number;
  hairColor: number;
  face: number;
  outfit: number;
}

/** Converts gameplay facing (atan2(y, x)) to a three.js yaw for a model facing +Z. */
function yawFromAngle(angle: number): number {
  return Math.atan2(Math.cos(angle), Math.sin(angle));
}

/**
 * Renders one player. Positions come only from the authoritative Colyseus state and are
 * smoothed for display; nothing here influences gameplay.
 */
export const NetSumo = memo(function NetSumo({ id, name, colorIndex, isYou, hair, hairColor, face, outfit }: Props) {
  const appearance = useMemo<Appearance>(() => ({ hair, hairColor, face, outfit, avatar: 0 }), [hair, hairColor, face, outfit]);
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]!.hex;
  const parts = useSumoParts();
  const tagRef = useRef<Sprite>(null);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    const created = createNameTagTexture(colorIndex + 1, name, color, isYou);
    setTexture(created);
    return () => created.dispose();
  }, [colorIndex, name, color, isYou]);

  const seed = useMemo(() => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1000) / 1000;
  }, [id]);

  const v = useRef({
    ready: false,
    x: 0,
    z: 0,
    y: 0,
    yaw: 0,
    walk: 0,
    speed: 0,
    falling: false,
    fvx: 0,
    fvy: 0,
    fvz: 0,
    tumble: 0,
    wasAlive: true,
    /** When this wrestler first appeared (for the pop-in). */
    bornAt: -1,
    /** Display size (grows with the Giant power-up). */
    size: 1,
    /** Which foot last touched down (footstep dust), and the last dash puff. */
    step: 0,
    trailAt: 0,
  });

  useFrame((frame, delta) => {
    const state = roomManager.state;
    const p = state?.players.get(id);
    const root = parts.root.current;
    const torso = parts.torso.current;
    if (!state || !p || !root || !torso) return;

    const s = v.current;
    const dt = Math.min(delta, 0.1);
    const t = frame.clock.elapsedTime;
    root.rotation.order = "YXZ";

    const jumpDistance = Math.hypot(p.x - s.x, p.y - s.z);
    if (!s.ready) {
      // Joined the room: pop in at the ring side with a puff of dust.
      s.bornAt = t;
      dustBus.emit({ x: p.x, y: p.y, count: 10, speed: 1.4 });
    }
    if (!s.ready || (p.alive && (!s.wasAlive || jumpDistance > 4))) {
      // New player, new round or teleport (spawn): snap instead of sliding across the ring.
      s.ready = true;
      s.x = p.x;
      s.z = p.y;
      s.y = 0;
      s.yaw = yawFromAngle(p.angle);
      s.falling = false;
      s.tumble = 0;
    }

    const sinceHit = (performance.now() - (lastHitAt.get(id) ?? -1e9)) / 1000;
    const hitSquash = sinceHit < 0.35 ? Math.sin((sinceHit / 0.35) * Math.PI) * 0.28 : 0;
    const blink = (t + seed * 4) % 3.7 < 0.12;

    if (p.alive) {
      const k = 1 - Math.exp(-18 * dt);
      const px = s.x;
      const pz = s.z;
      s.x += (p.x - s.x) * k;
      s.z += (p.y - s.z) * k;
      s.speed += (Math.hypot(s.x - px, s.z - pz) / Math.max(dt, 1e-4) - s.speed) * 0.25;
      s.yaw = lerpAngle(s.yaw, yawFromAngle(p.angle), 1 - Math.exp(-12 * dt));

      const isWinner = state.phase === Phase.RoundOver && state.winnerId === id;
      s.y = isWinner ? Math.abs(Math.sin(t * 6)) * 0.45 : s.y + (0 - s.y) * k;
      s.walk += s.speed * dt * 2.4;

      const moving = Math.min(1, s.speed / 4);
      const lean = p.dashing ? 0.38 : moving * 0.12;
      root.position.set(s.x, s.y, s.z);
      root.rotation.set(lean, s.yaw, 0);
      const pop = Math.min(1, (t - s.bornAt) / 0.45);
      const c1 = 1.70158;
      const giant = (p as { powerUp?: string }).powerUp === "giant" ? 1.4 : 1;
      s.size += (giant - s.size) * (1 - Math.exp(-6 * dt));
      root.scale.setScalar((pop < 1 ? Math.max(0.01, 1 + (c1 + 1) * (pop - 1) ** 3 + c1 * (pop - 1) ** 2) : 1) * s.size);

      const bob = Math.sin(t * 3 + seed * 6) * 0.02;
      const stretch = p.dashing ? 0.12 : 0;
      torso.scale.set(1 + hitSquash + stretch * 0.3, 1 - hitSquash * 0.8 + bob - stretch * 0.4, 1 + hitSquash * 0.5 + stretch);

      // Particles: a little dust at each footstep, a trail while dashing.
      const foot = Math.sin(s.walk) >= 0 ? 1 : -1;
      if (moving > 0.35 && foot !== s.step) {
        dustBus.emit({ x: s.x + Math.cos(s.yaw) * 0.25 * foot, y: s.z - Math.sin(s.yaw) * 0.25 * foot, count: 2, speed: 0.45 });
      }
      s.step = foot;
      if (p.dashing && t - s.trailAt > 0.045) {
        s.trailAt = t;
        dustBus.emit({ x: s.x, y: s.z, count: 3, speed: 1.1 });
      }

      const swing = Math.sin(s.walk) * 0.7 * moving;
      if (parts.armL.current) parts.armL.current.rotation.set(isWinner ? 0 : swing, 0, isWinner ? 2.6 : 0.7);
      if (parts.armR.current) parts.armR.current.rotation.set(isWinner ? 0 : -swing, 0, isWinner ? -2.6 : -0.7);
      if (parts.legL.current) parts.legL.current.position.y = 0.17 + Math.max(0, Math.sin(s.walk)) * 0.12 * moving;
      if (parts.legR.current) parts.legR.current.position.y = 0.17 + Math.max(0, -Math.sin(s.walk)) * 0.12 * moving;
      if (parts.eyes.current) parts.eyes.current.scale.y = sinceHit < 0.3 || blink ? 0.2 : 1;
      if (parts.ring.current) parts.ring.current.visible = true;
    } else {
      if (!s.falling) {
        // Launch outward from where they left the ring.
        s.falling = true;
        const len = Math.hypot(s.x, s.z) || 1;
        s.fvx = (s.x / len) * 3.2;
        s.fvz = (s.z / len) * 3.2;
        s.fvy = 3.8;
        s.tumble = 0;
      }
      if (s.y > OUTER_FLOOR_Y + 0.01 || s.fvy > 0) {
        s.fvy -= 20 * dt;
        s.x += s.fvx * dt;
        s.z += s.fvz * dt;
        s.y = Math.max(OUTER_FLOOR_Y, s.y + s.fvy * dt);
        s.tumble = Math.min(1.45, s.tumble + 5 * dt);
        if (s.y <= OUTER_FLOOR_Y) s.fvy = 0;
      }
      root.position.set(s.x, s.y, s.z);
      root.rotation.set(-s.tumble, s.yaw + Math.sin(t * 2) * 0.1, 0);
      torso.scale.set(1, 1, 1);
      if (parts.eyes.current) parts.eyes.current.scale.y = 0.15;
      if (parts.armL.current) parts.armL.current.rotation.set(0, 0, 2.2);
      if (parts.armR.current) parts.armR.current.rotation.set(0, 0, -2.2);
      if (parts.ring.current) parts.ring.current.visible = false;
    }

    const tag = tagRef.current;
    if (tag) {
      tag.position.set(s.x, s.y + (p.alive ? 2.55 * s.size : 1.4), s.z);
      tag.visible = p.connected && texture !== null;
    }
    s.wasAlive = p.alive;
  });

  return (
    <>
      <SumoModel parts={parts} color={color} appearance={appearance} />
      <BackBanner id={id} root={parts.root} />
      <sprite ref={tagRef} scale={[2.3, 0.52, 1]} renderOrder={10} visible={false}>
        {texture && <spriteMaterial key={texture.uuid} map={texture} depthTest={false} transparent />}
      </sprite>
    </>
  );
});
