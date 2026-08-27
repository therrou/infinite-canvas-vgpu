import { describe, expect, it } from "vitest";
import {
  CELL_WIDTH,
  CELL_HEIGHT,
  PERIOD_WIDTH,
  PERIOD_HEIGHT,
  REPEAT_COLS,
  REPEAT_ROWS,
  INSTANCE_COLS,
  INSTANCE_ROWS,
  effectUnitOffset,
  wrapOffset,
  instanceLocalIndices,
  cardWorldPosition,
} from "./layout";

describe("layout constants", () => {
  it("derives period from cell size and repeat unit", () => {
    expect(PERIOD_WIDTH).toBeCloseTo(CELL_WIDTH * REPEAT_COLS);
    expect(PERIOD_HEIGHT).toBeCloseTo(CELL_HEIGHT * REPEAT_ROWS);
  });
});

describe("effectUnitOffset", () => {
  it("places all 6 effects on distinct cells within one repeat unit", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const { x, z } = effectUnitOffset(i);
      expect(x).toBeGreaterThanOrEqual(-PERIOD_WIDTH / 2);
      expect(x).toBeLessThan(PERIOD_WIDTH / 2);
      expect(z).toBeGreaterThanOrEqual(-PERIOD_HEIGHT / 2);
      expect(z).toBeLessThan(PERIOD_HEIGHT / 2);
      seen.add(`${x.toFixed(3)},${z.toFixed(3)}`);
    }
    expect(seen.size).toBe(6);
  });

  it("is periodic in effect index mod 6", () => {
    for (let i = 0; i < 6; i++) {
      expect(effectUnitOffset(i)).toEqual(effectUnitOffset(i + 6));
    }
  });
});

describe("wrapOffset", () => {
  it("stays within [0, period) for arbitrary large pan", () => {
    for (const pan of [0, 3.2, -3.2, 1000.7, -1000.7, 1e6]) {
      const wrapped = wrapOffset(pan, PERIOD_WIDTH);
      expect(wrapped).toBeGreaterThanOrEqual(0);
      expect(wrapped).toBeLessThan(PERIOD_WIDTH);
    }
  });

  it("is consistent with the period: wrapOffset(pan) === wrapOffset(pan + period)", () => {
    expect(wrapOffset(1.3, PERIOD_WIDTH)).toBeCloseTo(
      wrapOffset(1.3 + PERIOD_WIDTH, PERIOD_WIDTH)
    );
  });
});

describe("instanceLocalIndices", () => {
  it("decomposes instance_index into col/row within the fixed window", () => {
    expect(instanceLocalIndices(0)).toEqual({ col: 0, row: 0 });
    expect(instanceLocalIndices(1)).toEqual({ col: 1, row: 0 });
    expect(instanceLocalIndices(INSTANCE_COLS)).toEqual({ col: 0, row: 1 });
    expect(instanceLocalIndices(INSTANCE_COLS * INSTANCE_ROWS - 1)).toEqual({
      col: INSTANCE_COLS - 1,
      row: INSTANCE_ROWS - 1,
    });
  });
});

describe("cardWorldPosition", () => {
  it("moves opposite to increasing pan (dragging pans the world under a fixed camera)", () => {
    const a = cardWorldPosition(0, 40, 0, 0); // center-ish instance
    const b = cardWorldPosition(0, 40, CELL_WIDTH, 0);
    expect(b.x).toBeLessThan(a.x);
  });

  it("never produces NaN for extreme pan values", () => {
    const { x, z } = cardWorldPosition(3, 20, 1e8, -1e8);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });
});
