/**
 * Boot screen (markup and styles inline in index.html). The bar shows real progress:
 * once the JavaScript runs it starts at 30%, then fills as the tasks below finish.
 * It disappears when everything is ready (or after a safety timeout).
 */
const START = 30;
const SAFETY_TIMEOUT_MS = 15_000;

const tasks = new Map<string, { weight: number; done: boolean }>();
let shown = 5;
let finished = false;
let frame = 0;

function target(): number {
  const total = [...tasks.values()].reduce((sum, t) => sum + t.weight, 0);
  const done = [...tasks.values()].filter((t) => t.done).reduce((sum, t) => sum + t.weight, 0);
  return total === 0 ? 100 : START + ((100 - START) * done) / total;
}

function render(): void {
  const root = document.getElementById("boot");
  if (!root) return;
  const goal = target();
  shown += (goal - shown) * 0.18 + (goal > shown ? 0.4 : 0);
  if (shown > goal) shown = goal;
  const value = Math.round(shown);
  const fill = root.querySelector<HTMLElement>(".boot__fill");
  const pct = root.querySelector<HTMLElement>(".boot__pct");
  if (fill) fill.style.width = `${value}%`;
  if (pct) pct.textContent = `${value}%`;
  root.setAttribute("aria-valuenow", String(value));

  if (value >= 100 && !finished) {
    finished = true;
    window.setTimeout(() => {
      root.classList.add("boot--done");
      window.setTimeout(() => root.remove(), 400);
    }, 200);
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
  shown = Math.max(shown, START);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
  window.setTimeout(() => {
    for (const task of tasks.values()) task.done = true;
  }, SAFETY_TIMEOUT_MS);
}
