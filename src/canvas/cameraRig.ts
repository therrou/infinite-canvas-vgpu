import { orthographicCamera, type OrthographicCamera } from "vgpu/scene";

import { clamp, lerp } from "./math";

export const MIN_ZOOM = 2.2;
export const MAX_ZOOM = 8;
export const DEFAULT_ZOOM = 3.2;

export const DEFAULT_TILT_DEG = 20;
export const DEFAULT_ROTATION_DEG = 8;

const NEAR = 0.1;
const FAR = 60;
/** Fixed camera radius; tilt/rotation only change viewing direction, not apparent scale
 * (orthographic projection has no perspective-driven scale-with-distance). */
const CAMERA_RADIUS = 10;
/** How far (world units) the look-at target shifts at full pointer deflection. */
const TILT_RANGE = 2.2;
/** Per-second smoothing factor for zoom/pointer-tilt easing (higher = snappier). */
const SMOOTHING = 6;

export interface CameraRig {
  readonly camera: OrthographicCamera;
  setAspect(aspect: number): void;
  /** Sets the base camera orientation (independent of the pointer-driven micro-tilt below). */
  setOrientation(tiltDeg: number, rotationDeg: number): void;
  update(pointerNdcX: number, pointerNdcY: number, targetZoom: number, dt: number): void;
}

export function createCameraRig(aspect: number): CameraRig {
  let currentAspect = aspect;
  let smoothedZoom = DEFAULT_ZOOM;
  let smoothedTiltX = 0;
  let smoothedTiltZ = 0;
  let tiltDeg = DEFAULT_TILT_DEG;
  let rotationDeg = DEFAULT_ROTATION_DEG;

  const halfWidth = () => smoothedZoom * currentAspect;

  const camera = orthographicCamera({
    left: -halfWidth(),
    right: halfWidth(),
    bottom: -smoothedZoom,
    top: smoothedZoom,
    near: NEAR,
    far: FAR,
    position: [0, 0, CAMERA_RADIUS],
    target: [0, 0, 0],
  });

  const applyOrientation = (targetX: number, targetZ: number) => {
    const tiltRad = (tiltDeg * Math.PI) / 180;
    const rotationRad = (rotationDeg * Math.PI) / 180;
    const position: [number, number, number] = [
      0,
      Math.sin(tiltRad) * CAMERA_RADIUS,
      Math.cos(tiltRad) * CAMERA_RADIUS,
    ];
    const up: [number, number, number] = [Math.sin(rotationRad), Math.cos(rotationRad), 0];
    camera.set({ position });
    camera.lookAt([targetX, 0, targetZ], up);
  };

  applyOrientation(0, 0);

  return {
    camera,
    setAspect(nextAspect: number) {
      currentAspect = nextAspect;
      camera.set({ left: -halfWidth(), right: halfWidth(), bottom: -smoothedZoom, top: smoothedZoom });
    },
    setOrientation(nextTiltDeg: number, nextRotationDeg: number) {
      tiltDeg = nextTiltDeg;
      rotationDeg = nextRotationDeg;
    },
    update(pointerNdcX, pointerNdcY, targetZoom, dt) {
      const t = 1 - Math.exp(-SMOOTHING * dt);
      const clampedZoom = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
      smoothedZoom = lerp(smoothedZoom, clampedZoom, t);
      smoothedTiltX = lerp(smoothedTiltX, pointerNdcX * TILT_RANGE, t);
      smoothedTiltZ = lerp(smoothedTiltZ, pointerNdcY * TILT_RANGE, t);

      camera.set({ left: -halfWidth(), right: halfWidth(), bottom: -smoothedZoom, top: smoothedZoom });
      applyOrientation(smoothedTiltX, smoothedTiltZ);
    },
  };
}
