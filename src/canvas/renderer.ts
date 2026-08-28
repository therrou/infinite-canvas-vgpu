// src/canvas/renderer.ts
import { clock, draw, frame, frameLoop, geometry, init, surface, type Draw, type Gpu, type Surface } from "vgpu";
import { plane } from "vgpu/scene";

import { createCameraRig, type CameraRig } from "./cameraRig";
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

/** Cards whose screen-space position is more than this many world units outside the
 * nominal camera range are skipped when building the HTML overlay list, so labels never
 * appear for the handful of instance-window cards that sit far off-screen. */
const OVERLAY_WORLD_MARGIN = 1.5 * Math.max(PERIOD_WIDTH, PERIOD_HEIGHT);

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
      cameraRig!.update(input.pointerNdcX, input.pointerNdcY, input.distance, dt);
      lastPan = { x: input.panX, z: input.panZ };

      const localOffsetX = wrapOffset(input.panX, PERIOD_WIDTH);
      const localOffsetZ = wrapOffset(input.panZ, PERIOD_HEIGHT);
      const viewProjection = cameraRig!.camera.viewProjection;

      for (const [index, effect] of CARD_EFFECTS.entries()) {
        const unit = effectUnitOffset(index);
        cardDraws[index].set({
          camera: { viewProjection },
          params: {
            time: time.time,
            localOffsetX,
            localOffsetZ,
            unitOffsetX: unit.x,
            unitOffsetZ: unit.z,
            periodWidth: PERIOD_WIDTH,
            periodHeight: PERIOD_HEIGHT,
            instanceCols: INSTANCE_COLS,
            instanceRows: INSTANCE_ROWS,
            aberration: 0.012,
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
          const { x, z } = cardWorldPosition(effectIndex, instanceIndex, lastPan.x, lastPan.z);
          if (Math.abs(x) > OVERLAY_WORLD_MARGIN || Math.abs(z) > OVERLAY_WORLD_MARGIN) continue;
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
      gpu?.dispose();
    },
  };
}
