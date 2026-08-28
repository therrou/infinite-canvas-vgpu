import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from "./cameraRig";
import { applyInertia, clamp, type InertiaState } from "./math";

export interface InputSnapshot {
  readonly panX: number;
  readonly panZ: number;
  readonly distance: number;
  readonly pointerNdcX: number;
  readonly pointerNdcY: number;
}

export interface InputController {
  attach(element: HTMLElement): () => void;
  tick(dt: number): InputSnapshot;
}

const FRICTION = 0.95; // fraction of velocity lost per second — matches canvas/math.ts's applyInertia contract: decay = (1-friction)^dt
const ZOOM_SPEED = 0.01; // world units of distance per wheel-delta unit

export function createInputController(): InputController {
  let panX = 0;
  let panZ = 0;
  let inertia: InertiaState = { x: 0, z: 0, vx: 0, vz: 0 };
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastMoveTime = performance.now();
  let distance = DEFAULT_ZOOM;
  let pointerNdcX = 0;
  let pointerNdcY = 0;

  function worldPerPixel(element: HTMLElement): number {
    // Orthographic camera: `distance` is the view box's half-height in world units,
    // so world-units-per-pixel is a direct linear ratio — no FOV/perspective term needed.
    return (2 * distance) / element.clientHeight;
  }

  function updatePointerNdc(element: HTMLElement, clientX: number, clientY: number) {
    const rect = element.getBoundingClientRect();
    pointerNdcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdcY = ((clientY - rect.top) / rect.height) * 2 - 1;
  }

  function attach(element: HTMLElement): () => void {
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      inertia = { x: 0, z: 0, vx: 0, vz: 0 };
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastMoveTime = performance.now();
      element.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      updatePointerNdc(element, event.clientX, event.clientY);
      if (!dragging) return;

      const now = performance.now();
      const dtMs = Math.max(now - lastMoveTime, 1);
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      const worldScale = worldPerPixel(element);

      panX -= dx * worldScale;
      panZ -= dy * worldScale;

      inertia = {
        x: 0,
        z: 0,
        vx: (-dx * worldScale) / (dtMs / 1000),
        vz: (-dy * worldScale) / (dtMs / 1000),
      };

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastMoveTime = now;
    };

    const endDrag = () => {
      dragging = false;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      distance = clamp(distance + event.deltaY * ZOOM_SPEED, MIN_ZOOM, MAX_ZOOM);
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", endDrag);
      element.removeEventListener("pointercancel", endDrag);
      element.removeEventListener("wheel", onWheel);
    };
  }

  function tick(dt: number): InputSnapshot {
    if (!dragging) {
      inertia = applyInertia(inertia, dt, FRICTION);
      panX += inertia.vx * dt;
      panZ += inertia.vz * dt;
    }
    return { panX, panZ, distance, pointerNdcX, pointerNdcY };
  }

  return { attach, tick };
}
