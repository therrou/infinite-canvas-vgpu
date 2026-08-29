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
  /** Add a local `/videos/...` URL when final footage is available. */
  readonly videoSrc?: string;
  /** Filename of the corresponding .wgsl shader, relative to this directory. */
  readonly file: string;
}

/** Order matters: index N here is drawn at layout.ts effectUnitOffset(N). */
export const CARD_EFFECT_METADATA: readonly CardEffectMetadata[] = [
  {
    id: "TLG-42",
    title: "Latent Space",
    category: "MODEL",
    tagline: "Where every embedding finds its neighbors.",
    videoSrc: "/videos/GuMYqYbagAIi9uM.mp4",
    file: "flow-field.wgsl",
  },
  {
    id: "TLG-38",
    title: "Cold Start",
    category: "INFRA",
    tagline: "Zero to warm in a single request.",
    videoSrc: "/videos/HG_XvC6bcAAy6K2.mp4",
    file: "domain-warp.wgsl",
  },
  {
    id: "TLG-36",
    title: "Edge Compute",
    category: "NETWORK",
    tagline: "The datacenter, dissolved into the world.",
    videoSrc: "/videos/HHFzMpCbgAA9LYJ.mp4",
    file: "raymarch-blob.wgsl",
  },
  {
    id: "TLG-44",
    title: "Async Queue",
    category: "SYSTEMS",
    tagline: "Work that waits for nothing.",
    videoSrc: "/videos/HHHQq0mbMAAWvcD.mp4",
    file: "wave-interference.wgsl",
  },
  {
    id: "TLG-45",
    title: "Sharded State",
    category: "DATABASE",
    tagline: "One truth, split a thousand ways.",
    videoSrc: "/videos/HHXkYEJaUAAZof7.mp4",
    file: "voronoi-cells.wgsl",
  },
  {
    id: "TLG-46",
    title: "Gradient Descent",
    category: "TRAINING",
    tagline: "Small steps toward a distant minimum.",
    videoSrc: "/videos/HHZl9_LWQAEcpdv.mp4",
    file: "particle-field.wgsl",
  },
  {
    id: "TLG-47",
    title: "Token Stream",
    category: "INFERENCE",
    tagline: "Meaning, assembled one piece at a time.",
    videoSrc: "/videos/HLv_ABrWkAAnA1v.mp4",
    file: "flow-field.wgsl",
  },
  {
    id: "TLG-48",
    title: "Merkle Proof",
    category: "PROTOCOL",
    tagline: "Trust, verified without asking twice.",
    videoSrc: "/videos/HLv-hRmX0AARJku.mp4",
    file: "domain-warp.wgsl",
  },
  {
    id: "TLG-49",
    title: "Kernel Trick",
    category: "COMPUTE",
    tagline: "Higher dimensions, the shortcut way.",
    videoSrc: "/videos/HLv-hS-W8AAciaE.mp4",
    file: "raymarch-blob.wgsl",
  },
  {
    id: "TLG-50",
    title: "Backpressure",
    category: "PIPELINE",
    tagline: "Slowing down so nothing breaks.",
    videoSrc: "/videos/HLxmMmnXwAAq03N.mp4",
    file: "wave-interference.wgsl",
  },
  {
    id: "TLG-51",
    title: "Cache Miss",
    category: "MEMORY",
    tagline: "The long way round, occasionally.",
    videoSrc: "/videos/HNBBtnvXAAA8TDI.mp4",
    file: "voronoi-cells.wgsl",
  },
  {
    id: "TLG-52",
    title: "Consensus",
    category: "DISTRIBUTED",
    tagline: "Many nodes, agreeing on one history.",
    videoSrc: "/videos/HPOhb5kWYAAfHyu.mp4",
    file: "particle-field.wgsl",
  },
  {
    id: "TLG-53",
    title: "Attention Head",
    category: "ARCHITECTURE",
    tagline: "Looking at everything, weighting what matters.",
    videoSrc: "/videos/HQgIO_1W8AAlGHh.mp4",
    file: "flow-field.wgsl",
  },
  {
    id: "TLG-54",
    title: "Rolling Deploy",
    category: "RELEASE",
    tagline: "Shipping without anyone noticing.",
    videoSrc: "/videos/HQJblT1a8AATz9O.mp4",
    file: "domain-warp.wgsl",
  },
] as const;
