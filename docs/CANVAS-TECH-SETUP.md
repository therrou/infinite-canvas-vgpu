# Infinite Glass Canvas — Technical Setup

## Summary

This project renders an infinite, pannable/zoomable grid of "glass" cards
entirely on the GPU via [`vgpu`](https://www.npmjs.com/package/vgpu) (a
low-level WebGPU wrapper), with real video and procedural content refracted
through a physically-inspired glass shader. Text metadata (title, tagline,
kicker labels) is the only DOM layer, positioned every frame to track each
card's on-screen projection.

Stack: Vite + React + TypeScript, `vgpu` for WebGPU, hand-written WGSL for
every visual effect, `lil-gui` for live shader tuning.

```
Pointer/scroll → InputController → CameraRig (orthographic, tilt+pan+zoom)
                                         │
                                         ▼
                              renderer.ts (per-frame loop)
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
          procedural artwork      video → GPU texture     matcap env
          shaders (6 effects)     (copyExternalImage)      (rendered once)
                    └────────────────────┬────────────────────┘
                                         ▼
                              card-lens.wgsl (glass shader)
                         reads "artwork" + env map → glass card
                                         ▼
                              WebGPU canvas (all cards, 1 pass)
                                         │
                                         ▼ (screen-space projection, same math)
                              HTML overlay (title/tagline/kicker only)
```

## Architecture

### 1. Infinite grid via a fixed instance window, not infinite geometry

`canvas/layout.ts` defines a **repeat unit** — a 3×2 staggered block of 6
distinct cards, each running a different effect. Panning doesn't move
geometry into existence; instead:

- A **fixed instance window** (`INSTANCE_COLS × INSTANCE_ROWS`, currently
  9×7) is large enough to always cover the viewport at max zoom-out, however
  far the user has panned.
- Each frame, the raw pan distance is wrapped into `[0, period)` via
  `wrapOffset()`, and that small wrapped offset — not the ever-growing raw
  pan — is what's uploaded to the GPU as `localOffsetX/Z`.
- The vertex shader (`cardVertex` in `card-common.wgsl`) places
  `instance_index` on a grid centered at each effect's fixed unit offset,
  spaced by one full repeat period per step, then shifts the whole window by
  that wrapped offset.

Cost is therefore **constant** regardless of how far the user pans — always
the same fixed instance count, never literal infinite geometry.

### 2. One shared vertex/glass module, six interchangeable effect shaders

`card-common.wgsl` holds everything effect-agnostic: the grid vertex math
above, rounded-rect SDF helpers, and `applyGlass()` (the actual glass
shading — see below). Each of the 6 procedural effects
(`flow-field.wgsl`, `domain-warp.wgsl`, `raymarch-blob.wgsl`,
`wave-interference.wgsl`, `voronoi-cells.wgsl`, `particle-field.wgsl`) is a
tiny full-screen-quad shader that only defines `effectColor(uv, time)` —
noise fields, domain warping, raymarched SDFs, interference patterns, etc.
Each is rendered into its own small offscreen `Target` once per frame.

`card-lens.wgsl` is the actual card shader drawn to the visible canvas: it
samples whichever texture is that effect's current "artwork" (procedural
target or video — see §4), bends the UV to fake refraction, and hands the
result to `applyGlass()` for the final composite. Swapping an effect's
`artworkShader` never touches the glass code, and swapping the glass
algorithm (which happened twice — see Breakthroughs) never touches the
effects.

### 3. HTML overlay stays in sync via the same projection math twice

Card titles/taglines are real DOM elements (`CardOverlay.tsx`) — cheap text
layout, accessible, no bespoke GPU text rendering. They track the GPU-drawn
cards via `canvas/projection.ts::worldCardToScreenFrame()`, which takes the
camera's `viewProjection` matrix plus a card's world position and produces
screen-space center/size/rotation — the *same* matrix the vertex shader
used, computed twice (once on GPU for pixels, once on CPU for the overlay)
so they can never visually drift apart. `useCardOverlays.ts` runs this every
`requestAnimationFrame`, mutating each element's `transform` directly for
performance and only pushing a React state update when the *set* of visible
cards changes (not on every pixel of movement).

### 4. Video and procedural content share one shader pipeline

Initially, video-backed cards rendered a real `<video>` DOM element with a
separate flat CSS "glass" gradient on top — visually inconsistent with the
GPU-shaded procedural cards, and not real refraction. This was later
replaced (§ Breakthroughs) so **all** cards, video or procedural, feed the
identical `card-lens.wgsl`:

- `renderer.ts` creates one hidden `<video>` element per video-backed
  effect, decodes its current frame into a GPU texture every frame via
  `device.queue.copyExternalImageToTexture()`, and binds that texture as
  `artwork` — precisely the same binding procedural effects fill with their
  own offscreen render target.
- Real footage doesn't share the card's 4:3 aspect ratio, so an
  object-fit-`cover`-style UV transform (`artworkCoverScale/Offset`,
  computed once per video from its decoded `videoWidth/videoHeight`) is
  applied inside `sampleArtwork()` before any refraction math runs — footage
  fills the card without stretching, exactly mirroring a `coverScale`/
  `coverOffset` uniform pair found in the reference site's own material (see
  below).
- Until a video's `loadedmetadata` fires, that card transparently falls back
  to rendering its procedural effect — no loading-state shader branch needed.

### 5. Orthographic camera + pointer-driven micro-tilt

`cameraRig.ts` uses an **orthographic** (not perspective) camera so zoom
never distorts card scale with distance, and the whole scene "tilts" by
moving the look-at target a small amount toward the pointer (`TILT_RANGE`)
rather than rotating the camera itself — this reads as a subtle parallax
skew without ever letting cards overlap/duplicate at grazing angles, which a
perspective camera did in an earlier iteration (see Breakthroughs).

## Technical breakthroughs

### Reverse-engineering the real glass material from a minified bundle

The single biggest lever on visual quality wasn't shader tuning — it was
finding and porting the *actual* algorithm the design reference uses,
extracted from a Turbopack/Next.js production bundle (`mimified-1.js`,
~87k lines, bundling three.js + hls.js + the site's own code inline). Rather
than reading the whole file, the approach was to grep for **identifiers
unlikely to appear in a generic library** — `cornerRadius`, `bevelWidth`,
`refractStrength`, `dispersion`, `envMaxMix` — which led straight to the
site's actual TSL (Three Shading Language) glass material and its literal
default uniform values (`cornerRadius: .163, bevelWidth: .192, ior: 2.3,
dispersion: .32, envIntensity: 1.93, envMaxMix: .27, rimWidth: 10,
rimIntensity: .11, …`), then to the node-graph function building the
material itself.

That revealed the key structural fact our hand-rolled shader was getting
wrong: **their glass never darkens the transmitted image.** The final color
is a straight

```
color = mix(refractedImage, envReflection, min(saturate(fresnel · envIntensity), envMaxMix))
      + rimColor · smoothstep(-rimWidth, 0, sdf) · rimIntensity
```

— an interpolation between two full-brightness sources (the refracted
picture and a reflected environment sample), never a subtraction. Our
original `applyGlass()` did the opposite: it *subtracted* brightness across
a wide band (`fresnelDarkness`, `innerEdgeIntensity`, a "groove" term) and
added a flat specular glow back on top — which is exactly what reads as a
grey, foggy border instead of glass. Porting the real mix-based formula,
plus their Schlick fresnel (`fresnelF0 + (1-fresnelF0)·(1-N·V)⁵`) and their
**screen-derivative (`fwidth()`) edge antialiasing** instead of a hand-tuned
`smoothstep` band, is what took the card silhouette from "soft blurred
halo" to "crisp cut glass edge" — a rewrite, not a re-tune.

Two intentional simplifications stand in for parts we didn't port 1:1
(documented in the shader comments themselves, not left as silent gaps):

- **Matcap instead of a real HDRI equirect environment.** The reference
  reflects an actual environment map off the true 3D bevel normal. We don't
  have real per-pixel 3D geometry, so a 2D "bevel normal" is bulged into a
  pseudo-3D normal (`normalize(vec3(normal · edgeCurve · k, 1))`) and used
  to sample a small procedurally-generated "studio softbox" texture
  (`matcap-env.wgsl`, rendered once at startup) the same way a matcap
  shader would — same visual role (a directional reflected highlight), far
  cheaper than a real cubemap/equirect + reflect-vector pipeline.
- **5-tap spectral sweep instead of true per-wavelength refraction.** The
  reference re-refracts the image through `ior + dispersion·wavelengthOffset`
  for each of several sample wavelengths — a second real refraction pass
  per tap. We instead sample the same already-warped UV at 5 offsets along
  the bevel normal and blend them with triangular RGB weights
  (`spectralWeight()`), which produces the same smooth rainbow fringe
  without a second refraction evaluation.

### Diagnosing "grey border" back to premultiplied-alpha math, not a texture bug

When the border first looked like a flat grey ring rather than glass, the
instinct was to suspect the artwork texture or blur radius. The actual cause
only became clear by hand-expanding the `applyGlass()` arithmetic term by
term: with `fresnelDarkness=0.26` and `innerEdgeIntensity=0.32` stacked
across a widened `edgeWidth` band, the transmitted artwork brightness was
being multiplied down to roughly 24% of its original value in that band,
while an unscaled whitish `chrome` term was added on top — under
premultiplied-alpha compositing over a near-black canvas, "dim colored
artwork + flat additive white glow at partial alpha" composites as exactly
the grey haze reported. Confirming this analytically (rather than guessing
at more slider tweaks) is what pointed at the real fix: stop darkening the
base color at all, matching the reference's own mix-based approach above.

### Keeping the DOM overlay and the GPU scene provably in sync

Because the infinite grid's "world position" involves wrapped pan offsets,
a repeat period, and per-effect unit placement, it would be easy for the
CPU-side overlay math to drift from what the vertex shader actually draws.
`cardWorldPosition()` in `layout.ts` is written to mirror `cardVertex()` in
`card-common.wgsl` line-for-line (same offset/period/wrap arithmetic, same
order of operations), with a code comment cross-referencing the two, so any
future change to one is a visible diff away from breaking the other.

### Orthographic camera to eliminate card duplication/overlap

An earlier perspective-camera iteration caused cards near the viewport edge
to visually overlap or appear to duplicate as the camera tilted, because
perspective foreshortening changes a card's apparent screen size with its
distance from the camera — inconsistent with the flat, uniform grid the
layout math assumes. Switching to an orthographic projection (camera "tilt"
now just moves the look-at target, not the projection type) removed the
distortion entirely: apparent card size is now independent of tilt, so the
grid math and the rendered result can't disagree.
