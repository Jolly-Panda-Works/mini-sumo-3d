import { useRef, useState, type PointerEvent } from "react";
import { DASH_COOLDOWN_MS } from "@mini-sumo/shared";
import { inputController } from "../input/InputController";
import { gameStore } from "../network/RoomManager";
import { useStore } from "../store";

const RADIUS = 52;

/** Virtual joystick (left) and dash button (right). Pointer events cover touch, pen and mouse. */
export function TouchControls() {
  const game = useStore(gameStore);
  const you = game.players.find((p) => p.isYou);
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (e: PointerEvent<HTMLDivElement>) => {
    let dx = e.clientX - origin.current.x;
    let dy = e.clientY - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    inputController.setTouchVector(dx / RADIUS, dy / RADIUS);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    update(e);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === pointerId.current) update(e);
  };

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    inputController.setTouchVector(0, 0);
  };

  const cooldown = you?.dashCooldownMs ?? 0;
  const progress = 1 - Math.min(1, cooldown / DASH_COOLDOWN_MS);

  return (
    <div className="touch">
      <div
        className="joystick"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="application"
        aria-label="Movement joystick"
      >
        <span className="joystick__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        className={`dash-btn${cooldown <= 0 ? " dash-btn--ready" : ""}`}
        style={{ background: `conic-gradient(var(--sun) ${progress * 360}deg, var(--ink-soft) 0deg)` }}
        onPointerDown={(e) => {
          e.preventDefault();
          inputController.requestDash();
        }}
        aria-label={cooldown <= 0 ? "Dash" : "Dash recharging"}
      >
        <span>Dash</span>
      </button>
    </div>
  );
}
