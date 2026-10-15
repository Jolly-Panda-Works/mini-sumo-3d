/** Plain, framework-free physics body used by every simulation system. */
export interface SimBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Facing angle in radians (atan2(y, x) convention). */
  angle: number;
  /** Last validated input direction, length <= 1. */
  inputX: number;
  inputY: number;
  alive: boolean;
  /** Simulation time (ms) at which the current dash ends. */
  dashEndsAt: number;
  /** Simulation time (ms) at which the next dash is allowed. */
  dashReadyAt: number;
  /** Simulation time (ms) of elimination, -1 while alive. */
  eliminatedAt: number;
}

export function createBody(id: string, x = 0, y = 0, angle = 0): SimBody {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    inputX: 0,
    inputY: 0,
    alive: true,
    dashEndsAt: 0,
    dashReadyAt: 0,
    eliminatedAt: -1,
  };
}
