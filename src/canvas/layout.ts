/** World-space extent of a single card's visible plane. */
export const CARD_WIDTH = 2.7;
export const CARD_ASPECT_RATIO = 4 / 3;
export const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT_RATIO;

/** World-space spacing between card centers (leaves a gutter around CARD_WIDTH/HEIGHT). */
export const CARD_GAP = 0.12;
export const CELL_WIDTH = CARD_WIDTH + CARD_GAP;
export const CELL_HEIGHT = CARD_HEIGHT + CARD_GAP;

/** The unique-card repeat unit: 7 columns x 2 staggered rows = 14 distinct cards. */
export const REPEAT_COLS = 7;
export const REPEAT_ROWS = 2;
const REPEAT_UNIT_SIZE = REPEAT_COLS * REPEAT_ROWS;

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

/** Where effect `effectIndex` (0..REPEAT_COLS*REPEAT_ROWS-1) sits within one repeat unit, centered on the unit. */
export function effectUnitOffset(effectIndex: number): { x: number; z: number } {
  const normalized = ((effectIndex % REPEAT_UNIT_SIZE) + REPEAT_UNIT_SIZE) % REPEAT_UNIT_SIZE;
  const col = normalized % REPEAT_COLS;
  const row = Math.floor(normalized / REPEAT_COLS);
  const rowStagger = (row % 2 === 0 ? -0.25 : 0.25) * CELL_WIDTH;
  return {
    x: (col - (REPEAT_COLS - 1) / 2) * CELL_WIDTH + rowStagger,
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
  panZ: number,
  scale: number = 1
): { x: number; z: number } {
  const unit = effectUnitOffset(effectIndex);
  const { col, row } = instanceLocalIndices(instanceIndex);
  const i = col - (INSTANCE_COLS - 1) / 2;
  const j = row - (INSTANCE_ROWS - 1) / 2;
  const scaledPeriodWidth = PERIOD_WIDTH * scale;
  const scaledPeriodHeight = PERIOD_HEIGHT * scale;
  const localOffsetX = wrapOffset(panX, scaledPeriodWidth);
  const localOffsetZ = wrapOffset(panZ, scaledPeriodHeight);
  return {
    x: unit.x * scale + i * scaledPeriodWidth - localOffsetX,
    z: unit.z * scale + j * scaledPeriodHeight - localOffsetZ,
  };
}

export interface CardCandidate {
  readonly effectIndex: number;
  readonly instanceIndex: number;
  readonly x: number;
  readonly z: number;
}

export function cardCandidatesInView(
  panX: number,
  panZ: number,
  scale: number,
  halfViewWidth: number,
  halfViewHeight: number
): readonly CardCandidate[] {
  const cards: CardCandidate[] = [];
  const maxX = halfViewWidth + CARD_WIDTH / 2;
  const maxZ = halfViewHeight + CARD_HEIGHT / 2;

  for (let effectIndex = 0; effectIndex < REPEAT_COLS * REPEAT_ROWS; effectIndex++) {
    for (let instanceIndex = 0; instanceIndex < INSTANCES_PER_EFFECT; instanceIndex++) {
      const { x, z } = cardWorldPosition(
        effectIndex,
        instanceIndex,
        panX,
        panZ,
        scale
      );
      if (Math.abs(x) <= maxX && Math.abs(z) <= maxZ) {
        cards.push({ effectIndex, instanceIndex, x, z });
      }
    }
  }

  return cards;
}
