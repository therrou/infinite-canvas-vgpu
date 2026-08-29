export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function edgeAberrationOffset(
  u: number,
  v: number,
  amount: number,
  edgeStart: number
): { x: number; y: number } {
  const x = u * 2 - 1;
  const y = v * 2 - 1;
  const edgeDistance = Math.max(Math.abs(x), Math.abs(y));
  const linear = clamp((edgeDistance - edgeStart) / (1 - edgeStart), 0, 1);
  const weight = linear * linear * (3 - 2 * linear);
  const length = Math.hypot(x, y);
  if (length === 0 || weight === 0) return { x: 0, y: 0 };
  return {
    x: (x / length) * amount * weight,
    y: (y / length) * amount * weight,
  };
}

export function glassLayerWeights(
  u: number,
  v: number,
  innerInset: number,
  edgeWidth: number
): { shell: number; innerEdge: number; fresnel: number } {
  const edgeDistance = Math.max(Math.abs(u * 2 - 1), Math.abs(v * 2 - 1));
  const smoothstep = (start: number, end: number, value: number) => {
    const t = clamp((value - start) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const shell = smoothstep(1 - edgeWidth * 1.5, 1, edgeDistance);
  const innerBoundary = 1 - innerInset;
  const innerEdge =
    1 - smoothstep(0, Math.max(edgeWidth * 0.5, 0.0001), Math.abs(edgeDistance - innerBoundary));

  return { shell, innerEdge, fresnel: shell * shell };
}

export function glassLightDirection(
  pointerNdcX: number,
  pointerNdcY: number
): { x: number; y: number } {
  const pointerX = clamp(pointerNdcX, -1, 1);
  const pointerY = clamp(pointerNdcY, -1, 1);
  const x = -0.82 + pointerX * 0.14;
  const y = -0.42 + pointerY * 0.1;
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
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
