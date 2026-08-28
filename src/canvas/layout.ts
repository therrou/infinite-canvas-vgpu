/** World-space extent of a single card's visible plane. */
export const CARD_WIDTH = 2.1;
export const CARD_HEIGHT = 1.3;

/** World-space spacing between card centers (leaves a gutter around CARD_WIDTH/HEIGHT). */
export const CELL_WIDTH = 2.3;
export const CELL_HEIGHT = 1.45;

/** The unique-card repeat unit: 2 columns x 3 rows = 6 distinct effects. */
export const REPEAT_COLS = 2;
export const REPEAT_ROWS = 3;

export const PERIOD_WIDTH = CELL_WIDTH * REPEAT_COLS;
export const PERIOD_HEIGHT = CELL_HEIGHT * REPEAT_ROWS;

/**
 * Fixed instance window per effect. Large enough to cover the world at the
 * maximum camera zoom-out distance (see cameraRig.ts MAX_ZOOM) with margin,
 * so panning/zooming never needs to grow instance counts.
 */
export const INSTANCE_COLS = 9; // covers +/- 4 periods
export const INSTANCE_ROWS = 7; // covers +/- 3 periods
export const INSTANCES_PER_EFFECT = INSTANCE_COLS * INSTANCE_ROWS;

/** Where effect `effectIndex` (0..5) sits within one repeat unit, centered on the unit. */
export function effectUnitOffset(effectIndex: number): { x: number; z: number } {
  const normalized = ((effectIndex % 6) + 6) % 6;
  const col = normalized % REPEAT_COLS;
  const row = Math.floor(normalized / REPEAT_COLS);
  return {
    x: (col - (REPEAT_COLS - 1) / 2) * CELL_WIDTH,
    z: (row - (REPEAT_ROWS - 1) / 2) * CELL_HEIGHT,
  };
}

/** Wraps `pan` into [0, period) — keeps GPU-bound offsets small regardless of total pan distance. */
export function wrapOffset(pan: number, period: number): number {
  const wrapped = pan % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

/** Decomposes a flat instance index into its (col, row) position in the fixed instance window. */
export function instanceLocalIndices(instanceIndex: number): { col: number; row: number } {
  return {
    col: instanceIndex % INSTANCE_COLS,
    row: Math.floor(instanceIndex / INSTANCE_COLS),
  };
}

/**
 * World position of one card instance, given the effect it belongs to, its slot in the
 * fixed instance window, and the current (unwrapped, arbitrarily large) pan distance.
 * Mirrors the vertex-shader math in card-common.wgsl exactly, for the HTML overlay to
 * project the same positions the GPU actually draws.
 */
export function cardWorldPosition(
  effectIndex: number,
  instanceIndex: number,
  panX: number,
  panZ: number
): { x: number; z: number } {
  const unit = effectUnitOffset(effectIndex);
  const { col, row } = instanceLocalIndices(instanceIndex);
  const i = col - (INSTANCE_COLS - 1) / 2;
  const j = row - (INSTANCE_ROWS - 1) / 2;
  const localOffsetX = wrapOffset(panX, PERIOD_WIDTH);
  const localOffsetZ = wrapOffset(panZ, PERIOD_HEIGHT);
  return {
    x: unit.x + i * PERIOD_WIDTH - localOffsetX,
    z: unit.z + j * PERIOD_HEIGHT - localOffsetZ,
  };
}
