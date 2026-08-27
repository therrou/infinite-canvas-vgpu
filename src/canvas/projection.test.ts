import { describe, expect, it } from "vitest";
import { transformPoint, worldToScreen } from "./projection";

// Column-major identity matrix (m[col*4+row]).
const IDENTITY = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

describe("transformPoint", () => {
  it("passes points through unchanged with the identity matrix", () => {
    const p = transformPoint(IDENTITY, 1, 2, 3);
    expect(p).toEqual({ x: 1, y: 2, z: 3, w: 1 });
  });

  it("applies translation stored in the last column", () => {
    const translate = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      5, -2, 0, 1,
    ]);
    const p = transformPoint(translate, 0, 0, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(-2);
  });
});

describe("worldToScreen", () => {
  it("maps NDC center (identity matrix, world origin) to the screen center", () => {
    // Identity view-projection puts world (0,0,z=0) at clip (0,0,0,1) -> NDC (0,0) -> screen center.
    const { x, y, visible } = worldToScreen(IDENTITY, 0, 0, 800, 600);
    expect(visible).toBe(true);
    expect(x).toBeCloseTo(400, 0);
    expect(y).toBeCloseTo(300, 0);
  });

  it("flags points behind the camera (w <= 0) as not visible", () => {
    const behindCamera = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, -1, // forces w = -1 for any input point
    ]);
    const { visible } = worldToScreen(behindCamera, 0, 0, 800, 600);
    expect(visible).toBe(false);
  });
});
