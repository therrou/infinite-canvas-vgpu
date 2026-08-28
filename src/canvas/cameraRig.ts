import { perspectiveCamera, type PerspectiveCamera } from "vgpu/scene";

import { clamp, lerp } from "./math";

export const MIN_DISTANCE = 5;
export const MAX_DISTANCE = 16;
export const DEFAULT_DISTANCE = 9;

const FOV_DEGREES = 50;
const NEAR = 0.1;
const FAR = 60;
/** Downward look angle: position.y / position.z ratio, ~32 degrees off the horizon. */
const HEIGHT_RATIO = 0.62;
/** How far (world units) the look-at target shifts at full pointer deflection. */
const TILT_RANGE = 3.0;
/** Per-second smoothing factor for tilt/zoom easing (higher = snappier). */
const SMOOTHING = 6;

export interface CameraRig {
  readonly camera: PerspectiveCamera;
  setAspect(aspect: number): void;
  update(pointerNdcX: number, pointerNdcY: number, targetDistance: number, dt: number): void;
}

export function createCameraRig(aspect: number): CameraRig {
  const camera = perspectiveCamera({
    fov: FOV_DEGREES,
    aspect,
    near: NEAR,
    far: FAR,
    position: [0, DEFAULT_DISTANCE * HEIGHT_RATIO, DEFAULT_DISTANCE],
    target: [0, 0, 0],
  });

  let smoothedTiltX = 0;
  let smoothedTiltZ = 0;
  let smoothedDistance = DEFAULT_DISTANCE;

  return {
    camera,
    setAspect(nextAspect: number) {
      camera.set({ aspect: nextAspect });
    },
    update(pointerNdcX, pointerNdcY, targetDistance, dt) {
      const t = 1 - Math.exp(-SMOOTHING * dt);
      const clampedDistance = clamp(targetDistance, MIN_DISTANCE, MAX_DISTANCE);
      smoothedDistance = lerp(smoothedDistance, clampedDistance, t);
      smoothedTiltX = lerp(smoothedTiltX, pointerNdcX * TILT_RANGE, t);
      smoothedTiltZ = lerp(smoothedTiltZ, pointerNdcY * TILT_RANGE, t);

      camera.set({ position: [0, smoothedDistance * HEIGHT_RATIO, smoothedDistance] });
      camera.lookAt([smoothedTiltX, 0, smoothedTiltZ]);
    },
  };
}
