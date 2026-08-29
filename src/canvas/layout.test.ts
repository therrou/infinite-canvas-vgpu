import { describe, expect, it } from "vitest";
import { DEFAULT_ZOOM } from "./cameraRig";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
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
  cardCandidatesInView,
} from "./layout";

describe("layout constants", () => {
  it("derives period from cell size and repeat unit", () => {
    expect(PERIOD_WIDTH).toBeCloseTo(CELL_WIDTH * REPEAT_COLS);
    expect(PERIOD_HEIGHT).toBeCloseTo(CELL_HEIGHT * REPEAT_ROWS);
  });

  it("uses a wide 7 by 2 repeat unit for editorial viewport density", () => {
    expect(REPEAT_COLS).toBe(7);
    expect(REPEAT_ROWS).toBe(2);
  });

  it("uses near-3:4 portrait cards with narrow gutters", () => {
    expect(CARD_WIDTH / CARD_HEIGHT).toBeCloseTo(3 / 4, 1);
    expect((CELL_WIDTH - CARD_WIDTH) / CARD_WIDTH).toBeLessThan(0.06);
    expect((CELL_HEIGHT - CARD_HEIGHT) / CARD_HEIGHT).toBeLessThan(0.06);
  });
});

describe("effectUnitOffset", () => {
  it("places all 14 effects on distinct cells within one repeat unit", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 14; i++) {
      const { x, z } = effectUnitOffset(i);
      expect(x).toBeGreaterThanOrEqual(-PERIOD_WIDTH / 2);
      expect(x).toBeLessThan(PERIOD_WIDTH / 2);
      expect(z).toBeGreaterThanOrEqual(-PERIOD_HEIGHT / 2);
      expect(z).toBeLessThan(PERIOD_HEIGHT / 2);
      seen.add(`${x.toFixed(3)},${z.toFixed(3)}`);
    }
    expect(seen.size).toBe(14);
  });

  it("is periodic in effect index mod 14", () => {
    for (let i = 0; i < 14; i++) {
      expect(effectUnitOffset(i)).toEqual(effectUnitOffset(i + 14));
    }
  });

  it("staggers the second row by half a cell", () => {
    expect(effectUnitOffset(REPEAT_COLS).x - effectUnitOffset(0).x).toBeCloseTo(
      CELL_WIDTH / 2
    );
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

  it("scales the whole grid uniformly when a scale factor is given, and defaults to 1", () => {
    const unscaled = cardWorldPosition(1, 30, 2, -1);
    const explicit1 = cardWorldPosition(1, 30, 2, -1, 1);
    expect(explicit1).toEqual(unscaled);

    const doubled = cardWorldPosition(1, 30, 4, -2, 2);
    // Doubling pan AND scale together should double every world coordinate.
    expect(doubled.x).toBeCloseTo(unscaled.x * 2, 5);
    expect(doubled.z).toBeCloseTo(unscaled.z * 2, 5);
  });
});

describe("cardCandidatesInView", () => {
  it("returns only cards near the default viewport instead of every instance", () => {
    const halfHeight = DEFAULT_ZOOM;
    const halfWidth = halfHeight * (1024 / 489);
    const cards = cardCandidatesInView(0, 0, 1, halfWidth, halfHeight);

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(12);
    for (const card of cards) {
      expect(Math.abs(card.x)).toBeLessThanOrEqual(halfWidth + CARD_WIDTH / 2);
      expect(Math.abs(card.z)).toBeLessThanOrEqual(halfHeight + CARD_HEIGHT / 2);
    }
  });
});
