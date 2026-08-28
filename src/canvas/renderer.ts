// src/canvas/renderer.ts
import { clock, draw, frame, frameLoop, geometry, init, surface, type Draw, type Gpu, type Surface } from "vgpu";
import { plane } from "vgpu/scene";
import GUI from "lil-gui";

import { createCameraRig, DEFAULT_ROTATION_DEG, DEFAULT_TILT_DEG, type CameraRig } from "./cameraRig";
import { CARD_EFFECTS } from "./effects/registry";
import { createInputController, type InputController } from "./inputController";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  INSTANCE_COLS,
  INSTANCE_ROWS,
  INSTANCES_PER_EFFECT,
  PERIOD_HEIGHT,
  PERIOD_WIDTH,
  cardWorldPosition,
  effectUnitOffset,
  wrapOffset,
} from "./layout";

export interface VisibleCard {
  readonly key: string;
  readonly effectIndex: number;
  readonly worldX: number;
  readonly worldZ: number;
}

export interface InfiniteCanvasRenderer {
  readonly ready: Promise<void>;
  getViewProjection(): Float32Array | undefined;
  getVisibleCards(): readonly VisibleCard[];
  dispose(): void;
}

/** Generously covers the full reachable extent of the fixed instance window in both axes
 * — (INSTANCE_COLS-1)/2 and (INSTANCE_ROWS-1)/2 periods out from each effect's unit offset,
 * plus one extra period of margin — so the overlay's coarse pre-filter never excludes a card
 * that the GPU actually renders on screen, at any zoom level. The precise, per-frame visibility
 * check (actual projected screen position) still happens downstream in useCardOverlays.ts. */
const OVERLAY_WORLD_MARGIN = Math.max(
  ((INSTANCE_COLS - 1) / 2 + 1) * PERIOD_WIDTH,
  ((INSTANCE_ROWS - 1) / 2 + 1) * PERIOD_HEIGHT
);

export function createInfiniteCanvasRenderer(canvas: HTMLCanvasElement): InfiniteCanvasRenderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let cameraRig: CameraRig | undefined;
  let inputController: InputController | undefined;
  let detachInput: (() => void) | undefined;
  let loopHandle: { stop(): void } | undefined;
  let cardDraws: Draw[] = [];
  let lastPan = { x: 0, z: 0 };
  let cleanupResize: (() => void) | undefined;

  const tuning = {
    tiltDeg: DEFAULT_TILT_DEG,
    rotationDeg: DEFAULT_ROTATION_DEG,
    spacingScale: 1,
    bulgeStrength: 0.15,
    sheenIntensity: 0.22,
    aberration: 0.012,
  };
  let gui: GUI | undefined;

  const initialize = async () => {
    const nextGpu = await init();
    gpu = nextGpu;
    if (disposed) {
      nextGpu.dispose();
      return;
    }

    output = surface(gpu, canvas, { dpr: [1, 2] });
    cameraRig = createCameraRig(output.size[0] / output.size[1]);
    inputController = createInputController();
    detachInput = inputController.attach(canvas);

    const guiContainer = canvas.parentElement ?? undefined;
    if (guiContainer) {
      gui = new GUI({ title: "Scene Tuning", container: guiContainer, width: 240 });
      Object.assign(gui.domElement.style, { position: "absolute", top: "16px", right: "16px", zIndex: "10" });
      gui.add(tuning, "tiltDeg", 0, 60, 1).name("Tilt");
      gui.add(tuning, "rotationDeg", -45, 45, 1).name("Rotation");
      gui.add(tuning, "spacingScale", 0.5, 2.5, 0.05).name("Spacing");
      gui.add(tuning, "bulgeStrength", 0, 0.4, 0.01).name("Glass Bulge");
      gui.add(tuning, "sheenIntensity", 0, 0.6, 0.01).name("Glass Sheen");
      gui.add(tuning, "aberration", 0, 0.04, 0.001).name("Aberration");
    }

    const cardGeometry = geometry(gpu, plane({ width: CARD_WIDTH, height: CARD_HEIGHT }));

    cardDraws = CARD_EFFECTS.map((effect) => {
      const cardDraw = draw(gpu!, {
        shader: effect.shader,
        geometry: cardGeometry,
        instances: INSTANCES_PER_EFFECT,
      });
      return cardDraw;
    });

    const unsubscribeResize = output.onResize(({ width, height }) => {
      cameraRig?.setAspect(width / height);
    });

    const time = clock(gpu);
    let lastFrameTime = performance.now();

    loopHandle = frameLoop(gpu, (currentFrame) => {
      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 1 / 15);
      lastFrameTime = now;

      const input = inputController!.tick(dt);
      cameraRig!.setOrientation(tuning.tiltDeg, tuning.rotationDeg);
      cameraRig!.update(input.pointerNdcX, input.pointerNdcY, input.distance, dt);
      lastPan = { x: input.panX, z: input.panZ };

      const scaledPeriodWidth = PERIOD_WIDTH * tuning.spacingScale;
      const scaledPeriodHeight = PERIOD_HEIGHT * tuning.spacingScale;
      const localOffsetX = wrapOffset(input.panX, scaledPeriodWidth);
      const localOffsetZ = wrapOffset(input.panZ, scaledPeriodHeight);
      const viewProjection = cameraRig!.camera.viewProjection;

      for (const [index, effect] of CARD_EFFECTS.entries()) {
        const unit = effectUnitOffset(index);
        cardDraws[index].set({
          camera: { viewProjection },
          params: {
            time: time.time,
            localOffsetX,
            localOffsetZ,
            unitOffsetX: unit.x * tuning.spacingScale,
            unitOffsetZ: unit.z * tuning.spacingScale,
            periodWidth: scaledPeriodWidth,
            periodHeight: scaledPeriodHeight,
            instanceCols: INSTANCE_COLS,
            instanceRows: INSTANCE_ROWS,
            aberration: tuning.aberration,
            bulgeStrength: tuning.bulgeStrength,
            sheenIntensity: tuning.sheenIntensity,
          },
        });
      }

      currentFrame.pass({ target: output!, clear: [0.04, 0.045, 0.06, 1] }, (pass) => {
        for (const cardDraw of cardDraws) {
          pass.draw(cardDraw);
        }
      });
    });

    return () => {
      unsubscribeResize();
    };
  };

  const readyPromise = initialize().then((cleanup) => {
    cleanupResize = cleanup;
  });

  return {
    ready: readyPromise,
    getViewProjection() {
      return cameraRig?.camera.viewProjection;
    },
    getVisibleCards(): readonly VisibleCard[] {
      const cards: VisibleCard[] = [];
      for (let effectIndex = 0; effectIndex < CARD_EFFECTS.length; effectIndex++) {
        for (let instanceIndex = 0; instanceIndex < INSTANCES_PER_EFFECT; instanceIndex++) {
          const { x, z } = cardWorldPosition(effectIndex, instanceIndex, lastPan.x, lastPan.z, tuning.spacingScale);
          const scaledMargin = OVERLAY_WORLD_MARGIN * tuning.spacingScale;
          if (Math.abs(x) > scaledMargin || Math.abs(z) > scaledMargin) continue;
          cards.push({ key: `${effectIndex}:${instanceIndex}`, effectIndex, worldX: x, worldZ: z });
        }
      }
      return cards;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loopHandle?.stop();
      detachInput?.();
      cleanupResize?.();
      gui?.destroy();
      gpu?.dispose();
    },
  };
}
