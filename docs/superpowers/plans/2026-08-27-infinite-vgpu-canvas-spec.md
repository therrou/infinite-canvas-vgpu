# Infinite vgpu Canvas — Spec

Aligned with the user via `/grill-me` on 2026-08-27. This is the source of truth for scope; the implementation plan argues from these decisions and should not re-litigate them.

## Decisions

1. **Project:** build inside the existing `~/vgpu-3d-viz` project (Vite + React + TS + `vgpu`). Maximize use of the `vgpu` WebGPU API — this is the point of the exercise, not just the visual result.
2. **Rendering:** cards are rendered by WebGPU via `vgpu`, not DOM/CSS. Each card is a GPU quad running a real WGSL shader.
3. **Infinite canvas:** true wrap/tiling. A fixed, small set of unique cards repeats seamlessly forever in every direction. Only cards near the current viewport are ever drawn — cost is constant regardless of how far the user has panned (viewport-culled / fixed instance window, not literal infinite geometry).
4. **Grid:** uniform grid — every card is the same size. No varied card sizes.
5. **Repeat unit:** 2 columns × 3 rows = 6 unique cards, each running one of 6 distinct procedural WGSL effects. Effects: flow-field noise, domain-warped plasma, raymarched blob, wave interference, Voronoi cells, particle-like field.
6. **Content:** no video files. Card content is pure procedural WGSL, animated and looping forever. No per-card hover state — all cards animate continuously regardless of pointer position.
7. **Card look:** stylized "glass" shader per card — specular highlight sheen, chromatic aberration (RGB channel split), rounded-corner clip, edge vignette. No real refraction of background/neighboring content (no offscreen scene texture needed for this).
8. **Global tilt:** the whole scene's camera/perspective tilts to track cursor position across the viewport (not per-card) — moving the mouse toward a corner skews the whole plane toward it.
9. **Pan:** drag-to-pan with momentum/inertia (velocity tracked while dragging, decays after release).
10. **Zoom:** scroll wheel / pinch zoom is supported, smoothed, clamped to a min/max distance.
11. **Text metadata:** rendered as real HTML overlay elements (not baked into the GPU scene), positioned/transformed every frame to track each visible card's screen-space projection. Copy describes the actual shader effect running in that card (id code, category, effect name, one-line technique description, "SELECTED WORK" style tag) — not fictional agency copy.
12. **Depth/passes:** single render pass, no offscreen depth target. Justification: all cards live on one flat plane and never occlude each other in world space, so WebGPU's `two-pass-rendering` recipe (needed only when 3D geometry can self-occlude) does not apply here. This keeps the whole scene to one `frame.pass(canvasSurface, ...)`.

## Non-goals (explicitly out of scope for this plan)

- No real video/media assets.
- No per-card hover interaction (video-on-hover, per-card aberration boost) — rejected in favor of the global cursor-tilt.
- No real glass refraction of scene content behind a card.
- No varied card sizes / masonry layout.
