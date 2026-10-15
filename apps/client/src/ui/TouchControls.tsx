import { useRef, useState, type PointerEvent } from "react";
import { DASH_COOLDOWN_MS } from "@mini-sumo/shared";
import { vibrate } from "../haptics";
import { inputController } from "../input/InputController";
import { gameStore } from "../network/RoomManager";
import { settingsStore } from "../settings";
import { useStore } from "../store";

/** Max knob travel in px. */
const RADIUS = 56;
/** Half the base size, used to keep a floating base on screen. */
const BASE_HALF = 75;
const DEADZONE = 0.12;

interface StickState {
  active: boolean;
  /** Base centre relative to the touch zone. */
  bx: number;
  by: number;
  /** Knob offset from the base centre. */
  kx: number;
  ky: number;
}

/**
 * Mobile controls: a joystick on the left and a dash button on the right.
 * - Floating joystick (default): touch anywhere in the left part of the screen and the
 *   stick appears under your thumb.
 * - Fixed joystick: always in the bottom-left corner.
 * Both work with multi-touch, so you can steer and dash at the same time.
 */
export function TouchControls() {
  const game = useStore(gameStore);
  const { joystick } = useStore(settingsStore);
  const you = game.players.find((p) => p.isYou);
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [stick, setStick] = useState<StickState>({ active: false, bx: 0, by: 0, kx: 0, ky: 0 });
  const floating = joystick !== "fixed";

  const restingBase = () => {
    const zone = zoneRef.current;
    const height = zone?.clientHeight ?? 300;
    return { bx: BASE_HALF + 20, by: height - BASE_HALF - 20 };
  };

  const move = (clientX: number, clientY: number, base: { bx: number; by: number }) => {
    const rect = zoneRef.current!.getBoundingClientRect();
    let dx = clientX - rect.left - base.bx;
    let dy = clientY - rect.top - base.by;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setStick({ active: true, ...base, kx: dx, ky: dy });
    let nx = dx / RADIUS;
    let ny = dy / RADIUS;
    if (Math.hypot(nx, ny) < DEADZONE) {
      nx = 0;
      ny = 0;
    }
    inputController.setTouchVector(nx, ny);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== null || !zoneRef.current) return;
    const rect = zoneRef.current.getBoundingClientRect();
    let base = restingBase();
    if (floating) {
      // Centre the stick under the thumb, kept fully inside the zone.
      base = {
        bx: Math.min(Math.max(e.clientX - rect.left, BASE_HALF), rect.width - BASE_HALF),
        by: Math.min(Math.max(e.clientY - rect.top, BASE_HALF), rect.height - BASE_HALF),
      };
    } else if (Math.hypot(e.clientX - rect.left - base.bx, e.clientY - rect.top - base.by) > BASE_HALF * 1.4) {
      return; // fixed mode: only react near the stick
    }
    pointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e.clientX, e.clientY, base);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === pointerId.current) move(e.clientX, e.clientY, stick);
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    setStick((s) => ({ ...s, active: false, kx: 0, ky: 0 }));
    inputController.setTouchVector(0, 0);
  };

  if (you && !you.alive) return null; // out of this round: nothing to control

  const cooldown = you?.dashCooldownMs ?? 0;
  const ready = cooldown <= 0;
  const progress = 1 - Math.min(1, cooldown / DASH_COOLDOWN_MS);
  const base = stick.active ? stick : { ...restingBase(), kx: 0, ky: 0 };

  return (
    <div className="touch" onContextMenu={(e) => e.preventDefault()}>
      <div
        ref={zoneRef}
        className={`touch__zone${floating ? " touch__zone--floating" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="application"
        aria-label="Movement joystick: drag to move"
      >
        <div
          className={`joystick${stick.active ? " joystick--active" : ""}`}
          style={{ transform: `translate(${base.bx - BASE_HALF}px, ${base.by - BASE_HALF}px)` }}
        >
          <span className="joystick__knob" style={{ transform: `translate(${base.kx}px, ${base.ky}px)` }} />
        </div>
      </div>

      <button
        className={`dash-btn${ready ? " dash-btn--ready" : ""}`}
        style={{ background: `conic-gradient(var(--sun) ${progress * 360}deg, var(--ink-soft) 0deg)` }}
        onPointerDown={(e) => {
          e.preventDefault();
          if (ready) vibrate(18);
          inputController.requestDash();
        }}
        aria-label={ready ? "Dash" : "Dash recharging"}
      >
        <span>{ready ? "Dash" : (cooldown / 1000).toFixed(1)}</span>
      </button>
    </div>
  );
}
