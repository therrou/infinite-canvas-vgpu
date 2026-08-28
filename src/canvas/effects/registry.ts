// src/canvas/effects/registry.ts
import type { ShaderSource } from "@vgpu/wgsl";

import { CARD_EFFECT_METADATA } from "./metadata";
import flowFieldShader from "./flow-field.wgsl";
import domainWarpShader from "./domain-warp.wgsl";
import raymarchBlobShader from "./raymarch-blob.wgsl";
import waveInterferenceShader from "./wave-interference.wgsl";
import voronoiCellsShader from "./voronoi-cells.wgsl";
import particleFieldShader from "./particle-field.wgsl";

export interface CardEffectDefinition {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly tagline: string;
  readonly shader: ShaderSource;
}

const SHADERS_BY_FILE: Record<string, ShaderSource> = {
  "flow-field.wgsl": flowFieldShader,
  "domain-warp.wgsl": domainWarpShader,
  "raymarch-blob.wgsl": raymarchBlobShader,
  "wave-interference.wgsl": waveInterferenceShader,
  "voronoi-cells.wgsl": voronoiCellsShader,
  "particle-field.wgsl": particleFieldShader,
};

/** Order matters: index N here is drawn at layout.ts effectUnitOffset(N). */
export const CARD_EFFECTS: readonly CardEffectDefinition[] = CARD_EFFECT_METADATA.map(
  (metadata) => ({
    id: metadata.id,
    title: metadata.title,
    category: metadata.category,
    tagline: metadata.tagline,
    shader: SHADERS_BY_FILE[metadata.file],
  }),
);
