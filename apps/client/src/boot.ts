/**
 * Boot screen (markup and styles inline in index.html). The bar shows real progress:
 * once the JavaScript runs it starts at 30%, then fills as the tasks below finish.
 * It disappears when everything is ready (or after a safety timeout).
 */
/** Real progress maps onto 30–100 % (the first part is the app download). */
const START = 30;
/** The studio card covers the first 2.4 s; the bar then fills on screen, 1 → 100 %. */
const STUDIO_MS = 2400;
/** Shortest time for the bar to go from 1 % to 100 % once it's visible. */
const FILL_MS = 1400;
const SAFETY_TIMEOUT_MS = 15_000;

const tasks = new Map<string, { weight: number; done: boolean }>();
let shown = 1;
let finished = false;
let frame = 0;

/** Real progress of the loading tasks (30–100). */
function target(): number {
  const total = [...tasks.values()].reduce((sum, t) => sum + t.weight, 0);
  const done = [...tasks.values()].filter((t) => t.done).reduce((sum, t) => sum + t.weight, 0);
  return total === 0 ? 100 : START + ((100 - START) * done) / total;
}

/** Never ahead of the on-screen fill time, so the bar visibly grows from 1 to 100. */
function visibleCap(): number {
  const t = (performance.now() - STUDIO_MS) / FILL_MS;
  return Math.max(1, Math.min(100, 1 + 99 * t));
}

function render(): void {
  const root = document.getElementById("boot");
  if (!root) return;
  const goal = Math.min(target(), visibleCap());
  shown += (goal - shown) * 0.2;
  if (Math.abs(goal - shown) < 0.3) shown = goal;
  const value = Math.max(1, Math.min(100, Math.round(shown)));
  const fill = root.querySelector<HTMLElement>(".boot__fill");
  const runner = root.querySelector<HTMLElement>(".boot__runner");
  const pct = root.querySelector<HTMLElement>(".boot__pct");
  // Progress bar: the fill covers exactly `value` percent of the track.
  if (fill) fill.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
  if (runner) runner.style.left = `${value}%`;
  if (pct) pct.textContent = `${value}%`;
  root.setAttribute("aria-valuenow", String(value));

  if (value >= 100 && !finished) {
    finished = true;
    window.setTimeout(() => {
      root.classList.add("boot--done");
      window.dispatchEvent(new Event("boot:done"));
      window.setTimeout(() => root.remove(), 400);
    }, 250);
    return;
  }
  if (!finished) frame = requestAnimationFrame(render);
}

/** Registers a loading task with a relative weight. */
export function bootTask(name: string, weight: number): void {
  if (!tasks.has(name)) tasks.set(name, { weight, done: false });
}

export function bootDone(name: string): void {
  const task = tasks.get(name);
  if (task) task.done = true;
}

/** Marks a task done when the promise settles (success or failure: never block the game). */
export function bootTrack(name: string, weight: number, promise: Promise<unknown>): void {
  bootTask(name, weight);
  void promise.then(
    () => bootDone(name),
    () => bootDone(name),
  );
}

export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

export function startBoot(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
  window.setTimeout(() => {
    for (const task of tasks.values()) task.done = true;
  }, SAFETY_TIMEOUT_MS);
}
