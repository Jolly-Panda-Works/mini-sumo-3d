type Listener<T> = (event: T) => void;

class Emitter<T> {
  private listeners = new Set<Listener<T>>();
  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(event: T): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

/** Cosmetic, client-only effect events. Positions are in gameplay (x, y) world units. */
export const impactBus = new Emitter<{ x: number; y: number; strength: number }>();
export const dustBus = new Emitter<{ x: number; y: number; count: number; speed: number }>();
export const shakeBus = new Emitter<number>();

/** performance.now() of the latest impact per player, used for squash-and-stretch. */
export const lastHitAt = new Map<string, number>();

/** Camera punch on strong hits (0–1): the camera dips toward the ring for a moment. */
export const punchBus = new Emitter<number>();

/**
 * Hit-stop: on a strong hit the wrestlers freeze for a split second (performance.now() until
 * which they're frozen). A classic trick to make a hit feel heavy.
 */
export const hitStop = { until: 0 };

/** The latest hit per player: when, how hard (m/s) and where (gameplay x, y), for the recoil. */
export const lastHit = new Map<string, { at: number; strength: number; x: number; y: number }>();

/**
 * Slow motion (display only, for the bout-deciding ring-out): from `from` until `until`
 * (performance.now()) the scene runs at `factor` speed, easing back to normal at the end.
 */
export const slowMo = { from: 0, until: 0, factor: 1 };

/** Display time scale right now (1 = normal). */
export function timeScale(now = performance.now()): number {
  if (now >= slowMo.until || now < slowMo.from) return 1;
  // The last 30 % eases back to full speed.
  const t = (now - slowMo.from) / Math.max(1, slowMo.until - slowMo.from);
  const ease = t < 0.7 ? 0 : (t - 0.7) / 0.3;
  return slowMo.factor + (1 - slowMo.factor) * ease * ease;
}

/** Camera focus: zoom toward a spot (gameplay x, y) for `ms`, `zoom` 0–1 of the way in. */
export const focusBus = new Emitter<{ x: number; y: number; ms: number; zoom: number }>();

/** Floating words over the ring ("COUNTER!", "x3", "SAVED!"). `follow` keeps it over a wrestler. */
export interface Callout {
  text: string;
  x: number;
  y: number;
  color: string;
  /** World height of the text (default 0.7). */
  size?: number;
  follow?: string;
}
export const calloutBus = new Emitter<Callout>();

/** A big word across the screen ("OSHIDASHI!"), with an optional white flash. */
export const bannerBus = new Emitter<{ text: string; tone: "out" | "warn"; flash?: boolean }>();

/** A coloured ring that spreads over the floor (dash ready, a counter). */
export const pulseBus = new Emitter<{ x: number; y: number; color: string; size: number }>();

/** performance.now() of each wrestler's latest dash (the squash before the stretch). */
export const lastDashAt = new Map<string, number>();
