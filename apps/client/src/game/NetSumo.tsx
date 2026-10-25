import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { CanvasTexture, Group, Sprite } from "three";
import { ARENA_RADIUS, PLAYER_COLORS, Phase, lerpAngle, type Appearance } from "@mini-sumo/shared";
import { roomManager } from "../network/RoomManager";
import { calloutBus, dustBus, hitStop, lastDashAt, lastHit, lastHitAt, pulseBus, shakeBus, timeScale } from "./effectsBus";
import { textureFor } from "./Callouts";
import { vibrate } from "../haptics";
import { DEFAULT_CONFIG as SIM, createBody, stepMovement, tryDash, type SimBody } from "@mini-sumo/sim";
import { createNameTagTexture } from "./nameTag";
import { SumoModel, useSumoParts } from "./SumoModel";
import { BackBanner } from "./PowerUpFlags";

const OUTER_FLOOR_Y = -1.4;
/** Closer to the rope than this (m) the wrestler starts to teeter. */
const EDGE_ZONE = 1.3;
/** The last stretch of the countdown (ms): everyone lifts a leg for the shiko stomp at GO. */
const STOMP_MS = 650;

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
  const starsRef = useRef<Group>(null);
  /** "!" over the head while teetering on the rope. */
  const alertRef = useRef<Sprite>(null);
  const alertTexture = useMemo(() => textureFor("!", "#FFC23C"), []);
  /** Your own wrestler, moved at once on this device (prediction); null for everyone else. */
  const predicted = useRef<SimBody | null>(null);
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
    /** Ring-out fall: spin speed (rad/s) and whether they've hit the floor yet. */
    spin: 0,
    landed: false,
    /** Edge: how close to falling (0-1), when a pushed teeter last happened (for "SAVED!"), the last buzz. */
    danger: 0,
    edgeAt: -1,
    buzzAt: -1,
    phase: "" as string,
    cooling: false,
  });

  useFrame((frame, delta) => {
    const state = roomManager.state;
    const p = state?.players.get(id);
    const root = parts.root.current;
    const torso = parts.torso.current;
    if (!state || !p || !root || !torso) return;

    const s = v.current;
    // Hit-stop: frozen for a split second after a strong hit (the server keeps going; the
    // wrestlers catch up right after, which reads as a snap of force).
    const dt = performance.now() < hitStop.until ? 0 : Math.min(delta, 0.1) * timeScale();
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
      s.landed = false;
      s.edgeAt = -1;
    }

    // GO: everyone stamps down the lifted leg (shiko) with a puff of dust.
    if (s.phase === Phase.Countdown && state.phase === Phase.Playing && p.alive) {
      dustBus.emit({ x: s.x, y: s.z, count: 12, speed: 1.6 });
      pulseBus.emit({ x: s.x, y: s.z, color, size: 1.1 });
      shakeBus.emit(0.12);
    }
    s.phase = state.phase;
    const stomp =
      state.phase === Phase.Countdown && state.phaseRemainingMs > 0 && state.phaseRemainingMs <= STOMP_MS ? 1 - state.phaseRemainingMs / STOMP_MS : 0;

    // Your dash is ready again: a ring in your colour.
    const cooling = p.dashCooldownMs > 0;
    if (isYou && s.cooling && !cooling && p.alive && state.phase === Phase.Playing) pulseBus.emit({ x: s.x, y: s.z, color, size: 1.3 });
    s.cooling = cooling;

    const sinceHit = (performance.now() - (lastHitAt.get(id) ?? -1e9)) / 1000;
    // Exaggerated hits: a squash that grows with the hit, then wobbles out like jelly.
    const hit = lastHit.get(id);
    const hitPower = hit ? Math.min(1, 0.35 + hit.strength / 9) : 0.5;
    const hitSquash = sinceHit < 0.7 ? Math.exp(-5.5 * sinceHit) * Math.cos(sinceHit * 24) * 0.55 * hitPower : 0;
    // …and the body is knocked back, leaning away from the hit, then springs upright.
    const recoil = sinceHit < 0.8 ? Math.exp(-4.5 * sinceHit) * Math.sin(Math.min(1, sinceHit / 0.08) * Math.PI * 0.5) * 0.75 * hitPower : 0;
    const stunned = Boolean((p as { stunned?: boolean }).stunned);
    const blink = (t + seed * 4) % 3.7 < 0.12;

    if (p.alive) {
      // Your own wrestler moves at once (prediction): the same movement rules as the server,
      // run here with your stick input, then gently pulled toward where the server says you
      // are (collisions and hits come from the server). Everyone else follows the server.
      let targetX = p.x;
      let targetZ = p.y;
      const me = id === roomManager.sessionId && state.phase === Phase.Playing;
      if (me) {
        const b = (predicted.current ??= createBody(id, p.x, p.y));
        const nowMs = performance.now();
        // The ring closes in near the end: the rope moves with it.
        const sim = state.ringRadius < SIM.arenaRadius ? { ...SIM, arenaRadius: state.ringRadius } : SIM;
        b.speedScale = p.powerUp === "wind" ? SIM.windSpeedScale : 1;
        if (stunned) {
          b.inputX = 0;
          b.inputY = 0;
        } else {
          b.inputX = roomManager.localInput.x;
          b.inputY = roomManager.localInput.y;
          // Only a dash the server will accept (ready, not already dashing): no snapping back.
          if (roomManager.takeDashPress() && !p.dashing && p.dashCooldownMs <= 0 && tryDash(b, nowMs, sim, 0)) lastDashAt.set(id, nowMs);
        }
        stepMovement(b, dt, sim, nowMs);
        const ex = p.x - b.x;
        const ey = p.y - b.y;
        if (Math.hypot(ex, ey) > 2.2) {
          // Far off (a big hit, a respawn): jump to the server's position.
          b.x = p.x;
          b.y = p.y;
          b.vx = p.vx;
          b.vy = p.vy;
        } else {
          const c = 1 - Math.exp(-7 * dt);
          b.x += ex * c;
          b.y += ey * c;
          b.vx += (p.vx - b.vx) * c;
          b.vy += (p.vy - b.vy) * c;
        }
        targetX = b.x;
        targetZ = b.y;
      } else {
        predicted.current = null;
      }
      const k = 1 - Math.exp(-(me ? 45 : 18) * dt);
      const px = s.x;
      const pz = s.z;
      s.x += (targetX - s.x) * k;
      s.z += (targetZ - s.z) * k;
      s.speed += (Math.hypot(s.x - px, s.z - pz) / Math.max(dt, 1e-4) - s.speed) * 0.25;
      // Your own wrestler turns with your stick at once; others follow the server.
      const facing = predicted.current ? predicted.current.angle : p.angle;
      s.yaw = lerpAngle(s.yaw, yawFromAngle(facing), 1 - Math.exp(-(predicted.current ? 20 : 12) * dt));

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
      // A dash: a quick crouch first, then the stretch forward.
      const sinceDash = (performance.now() - (lastDashAt.get(id) ?? -1e9)) / 1000;
      const windup = sinceDash < 0.09 ? Math.sin((sinceDash / 0.09) * Math.PI) * 0.24 : 0;
      const stretch = p.dashing && windup === 0 ? 0.18 : 0;
      torso.scale.set(
        1 + hitSquash + stretch * 0.3 + windup * 0.6,
        1 - hitSquash * 0.8 + bob - stretch * 0.4 - windup,
        1 + hitSquash * 0.5 + stretch + windup * 0.4,
      );

      // On the rope: teeter (lean out, wobble, windmill the arms) with a "!" overhead.
      const ringR = state.ringRadius || ARENA_RADIUS;
      const dist = Math.hypot(s.x, s.z);
      const onRope = state.phase === Phase.Playing ? Math.min(1, Math.max(0, (dist - (ringR - EDGE_ZONE)) / (EDGE_ZONE * 0.8))) : 0;
      s.danger += (onRope - s.danger) * (1 - Math.exp(-10 * dt));
      if (s.danger > 0.7) {
        // Pushed there (a recent hit): it's a save if they make it back to the middle.
        if (sinceHit < 1.5 || stunned) s.edgeAt = t;
        if (isYou && t - s.buzzAt > 1.2) {
          s.buzzAt = t;
          vibrate(12);
        }
      } else if (s.edgeAt >= 0 && dist < ringR - EDGE_ZONE - 1.2) {
        if (t - s.edgeAt < 1.8) calloutBus.emit({ text: "SAVED!", x: s.x, y: s.z, color: "#7CE38B", size: 0.65, follow: id });
        s.edgeAt = -1;
      }

      // Lean away from where the hit came from (in the wrestler's own frame).
      let tiltX = 0;
      let tiltZ = 0;
      if (recoil > 0.001 && hit) {
        const ax = s.x - hit.x;
        const az = s.z - hit.y;
        const len = Math.hypot(ax, az) || 1;
        const fwd = (ax * Math.sin(s.yaw) + az * Math.cos(s.yaw)) / len;
        const side = (ax * Math.cos(s.yaw) - az * Math.sin(s.yaw)) / len;
        tiltX = fwd * recoil;
        tiltZ = -side * recoil;
      }
      if (s.danger > 0.05 && dist > 0.01) {
        const fwd = (s.x * Math.sin(s.yaw) + s.z * Math.cos(s.yaw)) / dist;
        const side = (s.x * Math.cos(s.yaw) - s.z * Math.sin(s.yaw)) / dist;
        const sway = 0.22 + Math.sin(t * 11 + seed * 5) * 0.14;
        tiltX += fwd * sway * s.danger;
        tiltZ -= side * sway * s.danger;
      }
      // Stunned (hit by a dash): a dizzy sway.
      if (stunned) {
        tiltX += Math.sin(t * 9) * 0.12;
        tiltZ += Math.cos(t * 7) * 0.16;
      }
      torso.rotation.set(tiltX, stunned ? Math.sin(t * 5) * 0.35 : 0, tiltZ);

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
      // Hit or stunned: arms fly up and flail.
      const flail = stunned ? 1.6 + Math.sin(t * 14) * 0.5 : recoil * 2.2;
      // Teetering: the arms windmill to keep balance.
      const mill = s.danger > 0.25 ? Math.min(1, (s.danger - 0.25) / 0.4) : 0;
      const millX = Math.sin(t * 17 + seed * 3) * 1.7 * mill;
      const millZ = (1.2 + Math.cos(t * 17 + seed * 3) * 0.6) * mill;
      // Shiko before GO: arms out, one leg lifted high.
      const lift = Math.sin(stomp * Math.PI * 0.5);
      if (parts.armL.current) parts.armL.current.rotation.set(isWinner ? 0 : swing + millX, 0, isWinner ? 2.6 : 0.7 + flail + millZ + lift * 0.9);
      if (parts.armR.current) parts.armR.current.rotation.set(isWinner ? 0 : -swing - millX, 0, isWinner ? -2.6 : -0.7 - flail - millZ - lift * 0.9);
      if (parts.legL.current) parts.legL.current.position.y = 0.17 + Math.max(0, Math.sin(s.walk)) * 0.12 * moving;
      if (parts.legR.current) parts.legR.current.position.y = 0.17 + Math.max(0, -Math.sin(s.walk)) * 0.12 * moving + lift * 0.42;
      if (lift > 0) torso.rotation.z += lift * 0.22;
      if (parts.eyes.current) parts.eyes.current.scale.y = sinceHit < 0.3 || blink ? 0.2 : stunned ? 0.45 + Math.sin(t * 12) * 0.25 : 1;
      if (parts.ring.current) parts.ring.current.visible = true;
    } else {
      if (!s.falling) {
        // Launch outward from where they left the ring.
        // Harder the faster they were going, and spinning as they fly.
        s.falling = true;
        s.landed = false;
        const len = Math.hypot(s.x, s.z) || 1;
        const out = 3.2 + Math.min(4, s.speed * 0.45);
        s.fvx = (s.x / len) * out;
        s.fvz = (s.z / len) * out;
        s.fvy = 4.6;
        s.tumble = 0;
        s.spin = (seed < 0.5 ? -1 : 1) * (7 + Math.min(6, s.speed));
      }
      if (s.y > OUTER_FLOOR_Y + 0.01 || s.fvy > 0) {
        s.fvy -= 20 * dt;
        s.x += s.fvx * dt;
        s.z += s.fvz * dt;
        s.y = Math.max(OUTER_FLOOR_Y, s.y + s.fvy * dt);
        s.tumble = Math.min(1.45, s.tumble + 5 * dt);
        s.yaw += s.spin * dt;
        if (s.y <= OUTER_FLOOR_Y) {
          s.fvy = 0;
          if (!s.landed) {
            // Thud: a big puff where they land.
            s.landed = true;
            dustBus.emit({ x: s.x, y: s.z, count: 18, speed: 2 });
            shakeBus.emit(0.3);
          }
        }
      }
      root.position.set(s.x, s.y, s.z);
      root.rotation.set(-s.tumble, s.yaw + Math.sin(t * 2) * 0.1, 0);
      torso.scale.set(1, 1, 1);
      torso.rotation.set(0, 0, 0);
      if (parts.eyes.current) parts.eyes.current.scale.y = 0.15;
      if (parts.armL.current) parts.armL.current.rotation.set(0, 0, 2.2);
      if (parts.armR.current) parts.armR.current.rotation.set(0, 0, -2.2);
      if (parts.ring.current) parts.ring.current.visible = false;
    }

    const stars = starsRef.current;
    if (stars) {
      // Dizzy stars: stunned, or lying on the floor after a ring-out.
      const knockedOut = !p.alive && s.landed;
      stars.visible = (p.alive && stunned) || knockedOut;
      if (stars.visible) {
        stars.position.set(s.x, s.y + (knockedOut ? 0.9 : 2.05 * s.size), s.z);
        stars.rotation.y = t * 6;
        stars.scale.setScalar(s.size);
      }
    }

    const alert = alertRef.current;
    if (alert) {
      alert.visible = p.alive && s.danger > 0.45;
      if (alert.visible) {
        const h = 0.75 + Math.sin(t * 18) * 0.12;
        alert.position.set(s.x, s.y + 3.15 * s.size, s.z);
        alert.scale.set(h * 3.2, h, 1);
      }
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
      {/* Stunned: little stars circling over the head */}
      <group ref={starsRef} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.42, Math.sin(i * 2.1) * 0.06, Math.sin((i / 3) * Math.PI * 2) * 0.42]} rotation={[0.4, i, 0.3]}>
            <octahedronGeometry args={[0.11, 0]} />
            <meshBasicMaterial color="#FFD84D" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <sprite ref={alertRef} renderOrder={11} visible={false}>
        <spriteMaterial map={alertTexture} depthTest={false} transparent />
      </sprite>
      <sprite ref={tagRef} scale={[2.3, 0.52, 1]} renderOrder={10} visible={false}>
        {texture && <spriteMaterial key={texture.uuid} map={texture} depthTest={false} transparent />}
      </sprite>
    </>
  );
});
