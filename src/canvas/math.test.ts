import { describe, expect, it } from "vitest";
import * as math from "./math";
import { applyInertia, clamp, edgeAberrationOffset, glassLightDirection, lerp } from "./math";

describe("lerp", () => {
  it("interpolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe("clamp", () => {
  it("bounds a value into [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("applyInertia", () => {
  it("advances position by velocity * dt", () => {
    const next = applyInertia({ x: 0, z: 0, vx: 10, vz: 0 }, 0.1, 0.9);
    expect(next.x).toBeCloseTo(1, 5);
  });

  it("decays velocity toward zero every step, never flipping sign", () => {
    let state = { x: 0, z: 0, vx: 10, vz: -4 };
    for (let i = 0; i < 200; i++) {
      const next = applyInertia(state, 1 / 60, 0.9);
      expect(Math.abs(next.vx)).toBeLessThanOrEqual(Math.abs(state.vx) + 1e-9);
      expect(Math.sign(next.vx) === Math.sign(state.vx) || next.vx === 0).toBe(true);
      state = next;
    }
    expect(Math.abs(state.vx)).toBeLessThan(0.01);
    expect(Math.abs(state.vz)).toBeLessThan(0.01);
  });
});

describe("edgeAberrationOffset", () => {
  it("leaves the readable center free of chromatic separation", () => {
    expect(edgeAberrationOffset(0.5, 0.5, 0.02, 0.65)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("separates channels outward along the nearest card edge", () => {
    const right = edgeAberrationOffset(0.98, 0.5, 0.02, 0.65);
    const top = edgeAberrationOffset(0.5, 0.02, 0.02, 0.65);

    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBeCloseTo(0);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeLessThan(0);
  });
});

describe("glassLayerWeights", () => {
  it("separates a clear center, inset lens edge, and outer shell", () => {
    expect(math).toHaveProperty("glassLayerWeights");
    const glassLayerWeights = (
      math as typeof math & {
        glassLayerWeights(u: number, v: number, innerInset: number, edgeWidth: number): {
          shell: number;
          innerEdge: number;
          fresnel: number;
        };
      }
    ).glassLayerWeights;

    const center = glassLayerWeights(0.5, 0.5, 0.2, 0.08);
    const lensEdge = glassLayerWeights(0.9, 0.5, 0.2, 0.08);
    const outerEdge = glassLayerWeights(0.99, 0.5, 0.2, 0.08);

    expect(center).toEqual({ shell: 0, innerEdge: 0, fresnel: 0 });
    expect(lensEdge.innerEdge).toBeGreaterThan(0.9);
    expect(outerEdge.shell).toBeGreaterThan(0.9);
    expect(outerEdge.fresnel).toBeGreaterThan(0.8);
  });
});

describe("glassLightDirection", () => {
  it("keeps a normalized top-left key light while reacting subtly to the pointer", () => {
    const resting = glassLightDirection(0, 0);
    const moved = glassLightDirection(1, -1);

    expect(Math.hypot(resting.x, resting.y)).toBeCloseTo(1, 5);
    expect(Math.hypot(moved.x, moved.y)).toBeCloseTo(1, 5);
    expect(resting.x).toBeLessThan(0);
    expect(resting.y).toBeLessThan(0);
    expect(moved).not.toEqual(resting);
  });

  it("clamps pointer input so the highlight cannot flip sides", () => {
    expect(glassLightDirection(100, -100)).toEqual(glassLightDirection(1, -1));
  });
});
