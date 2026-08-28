// src/canvas/effects/registry.ts
import type { ShaderSource } from "@vgpu/wgsl";

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

/** Order matters: index N here is drawn at layout.ts effectUnitOffset(N). */
export const CARD_EFFECTS: readonly CardEffectDefinition[] = [
  {
    id: "VGPU-01",
    title: "Flow Field",
    category: "NOISE",
    tagline: "Hashed cell directions blended into a drifting vector flow.",
    shader: flowFieldShader,
  },
  {
    id: "VGPU-02",
    title: "Domain Warp",
    category: "PLASMA",
    tagline: "Value noise displaces its own sampling domain before shading.",
    shader: domainWarpShader,
  },
  {
    id: "VGPU-03",
    title: "Raymarched Blob",
    category: "SDF",
    tagline: "Two smooth-unioned spheres raymarched per fragment with normals.",
    shader: raymarchBlobShader,
  },
  {
    id: "VGPU-04",
    title: "Wave Interference",
    category: "SIMULATION",
    tagline: "Three radial wave sources summed into an interference pattern.",
    shader: waveInterferenceShader,
  },
  {
    id: "VGPU-05",
    title: "Voronoi Cells",
    category: "CELLULAR",
    tagline: "Animated jittered-grid Voronoi distance field.",
    shader: voronoiCellsShader,
  },
  {
    id: "VGPU-06",
    title: "Particle Field",
    category: "PARTICLES",
    tagline: "40 zero-buffer particles spawned from instance-free vertex math.",
    shader: particleFieldShader,
  },
] as const;
