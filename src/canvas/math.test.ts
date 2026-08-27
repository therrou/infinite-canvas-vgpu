import { describe, expect, it } from "vitest";
import { applyInertia, clamp, lerp } from "./math";

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
