// scripts/render-effects-smoke.ts
import { fileURLToPath } from "node:url";
import { resolveShader } from "@vgpu/wgsl/runtime";
import { draw, frame, geometry, init, target } from "vgpu/node";
import { plane, perspectiveCamera } from "vgpu/scene";

import {
  CARD_WIDTH,
  CARD_HEIGHT,
  PERIOD_WIDTH,
  PERIOD_HEIGHT,
} from "../src/canvas/layout";
import { CARD_EFFECT_METADATA } from "../src/canvas/effects/metadata";

const WIDTH = 128;
const HEIGHT = 128;

async function main() {
  const gpu = await init();
  const output = target(gpu, { size: [WIDTH, HEIGHT] });
  const cardGeometry = geometry(gpu, plane({ width: CARD_WIDTH, height: CARD_HEIGHT }));
  const camera = perspectiveCamera({
    fov: 50,
    aspect: WIDTH / HEIGHT,
    position: [0, 5.6, 9],
    target: [0, 0, 0],
  });

  let failures = 0;

  for (const effect of CARD_EFFECT_METADATA) {
    try {
      const entry = fileURLToPath(new URL(`../src/canvas/effects/${effect.file}`, import.meta.url));
      const resolved = await resolveShader({ entry });

      const cardDraw = draw(gpu, { shader: resolved.wgsl, geometry: cardGeometry, instances: 1 });
      cardDraw.set({
        camera: { viewProjection: camera.viewProjection },
        params: {
          time: 1.7,
          localOffsetX: 0,
          localOffsetZ: 0,
          unitOffsetX: 0,
          unitOffsetZ: 0,
          periodWidth: PERIOD_WIDTH,
          periodHeight: PERIOD_HEIGHT,
          instanceCols: 1,
          instanceRows: 1,
          aberration: 0.01,
          bulgeStrength: 0.15,
          sheenIntensity: 0.22,
        },
      });

      frame(gpu, (currentFrame) => {
        currentFrame.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) => {
          pass.draw(cardDraw);
        });
      });
      const pixels = await output.read();
      const variance = computeVariance(pixels);
      if (variance < 1) {
        console.error(`[FAIL] ${effect.id} ${effect.title}: rendered a flat/constant frame (variance=${variance.toFixed(3)})`);
        failures++;
      } else {
        console.log(`[OK]   ${effect.id} ${effect.title}: variance=${variance.toFixed(1)}`);
      }
    } catch (error) {
      console.error(`[FAIL] ${effect.id} ${effect.title}: threw during setup/render`, error);
      failures++;
    }
  }

  gpu.dispose();

  if (failures > 0) {
    console.error(`\n${failures}/${CARD_EFFECT_METADATA.length} effects failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${CARD_EFFECT_METADATA.length} effects rendered non-trivial frames.`);
}

function computeVariance(pixels: Uint8Array | Uint8ClampedArray): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const luma = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    sum += luma;
    sumSq += luma * luma;
    count++;
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
