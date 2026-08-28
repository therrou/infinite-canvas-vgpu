import { orthographicCamera, type OrthographicCamera } from "vgpu/scene";

import { clamp, lerp } from "./math";

export const MIN_ZOOM = 2.2;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 3.2;

const NEAR = 0.1;
const FAR = 60;
/** Fixed camera position gives a shallow ~20 degree tilt angle — orthographic projection
 * means position magnitude doesn't affect apparent scale, only viewing direction/rotation. */
const CAMERA_HEIGHT = 3.4;
const CAMERA_DEPTH = 9.4;
/** How far (world units) the look-at target shifts at full pointer deflection. */
const TILT_RANGE = 2.2;
/** Per-second smoothing factor for tilt/zoom easing (higher = snappier). */
const SMOOTHING = 6;

export interface CameraRig {
  readonly camera: OrthographicCamera;
  setAspect(aspect: number): void;
  update(pointerNdcX: number, pointerNdcY: number, targetZoom: number, dt: number): void;
}

export function createCameraRig(aspect: number): CameraRig {
  let currentAspect = aspect;
  let smoothedZoom = DEFAULT_ZOOM;
  let smoothedTiltX = 0;
  let smoothedTiltZ = 0;

  const halfWidth = () => smoothedZoom * currentAspect;

  const camera = orthographicCamera({
    left: -halfWidth(),
    right: halfWidth(),
    bottom: -smoothedZoom,
    top: smoothedZoom,
    near: NEAR,
    far: FAR,
    position: [0, CAMERA_HEIGHT, CAMERA_DEPTH],
    target: [0, 0, 0],
  });

  return {
    camera,
    setAspect(nextAspect: number) {
      currentAspect = nextAspect;
      camera.set({ left: -halfWidth(), right: halfWidth(), bottom: -smoothedZoom, top: smoothedZoom });
    },
    update(pointerNdcX, pointerNdcY, targetZoom, dt) {
      const t = 1 - Math.exp(-SMOOTHING * dt);
      const clampedZoom = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
      smoothedZoom = lerp(smoothedZoom, clampedZoom, t);
      smoothedTiltX = lerp(smoothedTiltX, pointerNdcX * TILT_RANGE, t);
      smoothedTiltZ = lerp(smoothedTiltZ, pointerNdcY * TILT_RANGE, t);

      camera.set({ left: -halfWidth(), right: halfWidth(), bottom: -smoothedZoom, top: smoothedZoom });
      camera.lookAt([smoothedTiltX, 0, smoothedTiltZ]);
    },
  };
}
