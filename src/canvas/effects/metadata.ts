// src/canvas/effects/metadata.ts
//
// Plain data describing each card effect. This module intentionally has NO
// `.wgsl` imports so it can be loaded both by Vite (via registry.ts) and by
// plain Node/tsx runtimes (via scripts/render-effects-smoke.ts), which cannot
// resolve Vite's `.wgsl` module form.

export interface CardEffectMetadata {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly tagline: string;
  /** Filename of the corresponding .wgsl shader, relative to this directory. */
  readonly file: string;
}

/** Order matters: index N here is drawn at layout.ts effectUnitOffset(N). */
export const CARD_EFFECT_METADATA: readonly CardEffectMetadata[] = [
  {
    id: "VGPU-01",
    title: "Flow Field",
    category: "NOISE",
    tagline: "Hashed cell directions blended into a drifting vector flow.",
    file: "flow-field.wgsl",
  },
  {
    id: "VGPU-02",
    title: "Domain Warp",
    category: "PLASMA",
    tagline: "Value noise displaces its own sampling domain before shading.",
    file: "domain-warp.wgsl",
  },
  {
    id: "VGPU-03",
    title: "Raymarched Blob",
    category: "SDF",
    tagline: "Two smooth-unioned spheres raymarched per fragment with normals.",
    file: "raymarch-blob.wgsl",
  },
  {
    id: "VGPU-04",
    title: "Wave Interference",
    category: "SIMULATION",
    tagline: "Three radial wave sources summed into an interference pattern.",
    file: "wave-interference.wgsl",
  },
  {
    id: "VGPU-05",
    title: "Voronoi Cells",
    category: "CELLULAR",
    tagline: "Animated jittered-grid Voronoi distance field.",
    file: "voronoi-cells.wgsl",
  },
  {
    id: "VGPU-06",
    title: "Particle Field",
    category: "PARTICLES",
    tagline: "40 zero-buffer particles spawned from instance-free vertex math.",
    file: "particle-field.wgsl",
  },
] as const;
