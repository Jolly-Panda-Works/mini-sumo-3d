import { Phase } from "@mini-sumo/shared";
import { gameStore, roomManager } from "../network/RoomManager";
import { uiStore } from "../uiStore";

const KEY_VECTORS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/**
 * Collects keyboard + touch input and sends a normalized direction to the server.
 * Only direction and dash requests leave the client; never positions.
 * Screen up (W) is -y in world space, which the camera shows as "away from you".
 */
class InputController {
  private keys = new Set<string>();
  private touch = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private lastSentAt = 0;
  private lastDashAt = 0;
  private timer = 0;
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.clear);
    this.timer = window.setInterval(this.tick, 1000 / 30);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("visibilitychange", this.clear);
    window.clearInterval(this.timer);
    this.clear();
  }

  setTouchVector(x: number, y: number): void {
    this.touch.x = x;
    this.touch.y = y;
  }

  requestDash(): void {
    const now = performance.now();
    if (now - this.lastDashAt < 150) return; // client-side debounce; the server enforces cooldown
    if (gameStore.get().phase !== Phase.Playing || uiStore.get().settingsOpen) return;
    this.lastDashAt = now;
    roomManager.dash();
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    if (event.code in KEY_VECTORS) {
      this.keys.add(event.code);
      event.preventDefault();
    } else if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) this.requestDash();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private clear = (): void => {
    this.keys.clear();
    this.touch.x = 0;
    this.touch.y = 0;
  };

  private tick = (): void => {
    if (!roomManager.room) return;
    const phase = gameStore.get().phase;
    const active = (phase === Phase.Countdown || phase === Phase.Playing) && !uiStore.get().settingsOpen;

    let x = 0;
    let y = 0;
    if (active) {
      for (const code of this.keys) {
        const v = KEY_VECTORS[code];
        if (v) {
          x += v[0];
          y += v[1];
        }
      }
      x = Math.max(-1, Math.min(1, x)) + this.touch.x;
      y = Math.max(-1, Math.min(1, y)) + this.touch.y;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
    }

    const now = performance.now();
    const changed = Math.abs(x - this.last.x) > 0.02 || Math.abs(y - this.last.y) > 0.02;
    const keepAlive = (x !== 0 || y !== 0) && now - this.lastSentAt > 500;
    if (!changed && !keepAlive) return;
    // Only talk to the server while a bout is starting or running (plus one final zero).
    if (!active && this.last.x === 0 && this.last.y === 0) return;

    this.last.x = x;
    this.last.y = y;
    this.lastSentAt = now;
    roomManager.sendInput(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000);
  };
}

export const inputController = new InputController();
