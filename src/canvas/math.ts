export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface InertiaState {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
}

/**
 * Advances a 2D position by its velocity, then decays velocity exponentially.
 * `friction` is the fraction of velocity lost after one second (0..1);
 * per-step decay is (1-friction)^dt so behavior stays consistent at any frame rate.
 */
export function applyInertia(state: InertiaState, dt: number, friction: number): InertiaState {
  const x = state.x + state.vx * dt;
  const z = state.z + state.vz * dt;
  const decay = Math.pow(1 - friction, dt);
  const vx = Math.abs(state.vx) < 1e-4 ? 0 : state.vx * decay;
  const vz = Math.abs(state.vz) < 1e-4 ? 0 : state.vz * decay;
  return { x, z, vx, vz };
}
