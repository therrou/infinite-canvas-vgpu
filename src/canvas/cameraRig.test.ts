import { describe, expect, it } from "vitest";

import {
  cameraPose,
  DEFAULT_ROTATION_DEG,
  DEFAULT_TILT_DEG,
  DEFAULT_ZOOM,
  MIN_ZOOM,
} from "./cameraRig";

describe("editorial camera defaults", () => {
  it("starts close to a frontal, level view with reference-scale cards", () => {
    expect(DEFAULT_TILT_DEG).toBeGreaterThanOrEqual(75);
    expect(Math.abs(DEFAULT_ROTATION_DEG)).toBeLessThanOrEqual(2);
    expect(DEFAULT_ZOOM).toBeCloseTo(1.65);
    expect(MIN_ZOOM).toBeLessThan(DEFAULT_ZOOM);
  });

  it("keeps the camera up axis perpendicular to its view direction", () => {
    const { position, up } = cameraPose(DEFAULT_TILT_DEG, 0);
    const view = [-position[0], -position[1], -position[2]];
    const dot = view[0] * up[0] + view[1] * up[1] + view[2] * up[2];

    expect(dot).toBeCloseTo(0, 8);
    expect(up[2]).toBeLessThan(-0.95);
  });
});
