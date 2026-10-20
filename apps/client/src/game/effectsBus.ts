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

/** The latest hit per player: when, how hard (m/s) and where (gameplay x, y), for the recoil. */
export const lastHit = new Map<string, { at: number; strength: number; x: number; y: number }>();
