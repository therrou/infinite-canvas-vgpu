# How This Scene Works (a beginner's tour)



Suggested reading order if you want to follow along in the code:
1. `src/CanvasScene.tsx` — the React entry point
2. `src/canvas/renderer.ts` — the actual scene, frame by frame
3. `src/canvas/layout.ts` — the grid math
4. `src/canvas/effects/card-common.wgsl` and `card-lens.wgsl` — the glass shader
5. `src/overlay/*` — the text you see on each card

---

## 1. The big picture

Two completely different rendering systems are stacked on top of each other:

- **The canvas** (`<canvas>` element) — everything you *see move and shade* —
  the cards, the video, the glass effect. This is drawn by the **GPU**
  directly, not by regular HTML/CSS. It never re-renders as React
  components; it's a continuous loop that redraws ~60 times a second.
- **An HTML layer on top** — just the title/tagline text for each card. This
  *is* normal React/DOM/CSS, positioned every frame to sit exactly on top of
  its matching GPU-drawn card.

Why split it this way? GPUs are extremely fast at drawing shapes and running
per-pixel math (shaders), but drawing *text* nicely (fonts, wrapping,
accessibility) is what the browser's normal HTML/CSS engine already does
well. So: GPU for the "3D glass" visuals, HTML for the words.

## 2. What is WebGPU, and what does `vgpu` add?

**WebGPU** is a browser API for talking directly to the graphics card. It's
the modern replacement for WebGL. Raw WebGPU is very verbose — you manually
describe buffers, bind groups, pipelines, etc. — so this project uses
[`vgpu`](https://www.npmjs.com/package/vgpu), a thin wrapper that gives you
friendlier building blocks:

| `vgpu` concept | What it means in plain terms |
|---|---|
| `init()` | "Ask the browser for a GPU device." Async because the browser/OS negotiates this. |
| `surface(gpu, canvas)` | "This `<canvas>` is where the final picture goes." |
| `geometry(gpu, plane(...))` | A flat rectangle mesh (two triangles) — the literal shape of one card. |
| `target(gpu, { size })` | An **offscreen texture** — a picture rendered into memory instead of onto the visible canvas, so it can be used as an input to another shader later. |
| `draw(gpu, { shader, geometry, instances })` | "Here's a shader + a shape; draw it, optionally many times (`instances`) in one call." |
| `frame(gpu, callback)` | Run the callback once. |
| `frameLoop(gpu, callback)` | Run the callback every frame, forever (your animation loop). |

Everything in `renderer.ts` is built from these seven pieces.

## 3. Shaders, in one paragraph

A **shader** is a small program that runs *on the GPU*, once per vertex
(**vertex shader**) or once per on-screen pixel (**fragment shader**), for
every pixel/vertex in parallel. This project writes shaders in **WGSL**
(WebGPU Shading Language) — the `.wgsl` files. A vertex shader answers "where
on screen does this point go?"; a fragment shader answers "what color is
this pixel?". Nearly every visual effect here — the glass bending, the
video, the animated backgrounds — is a fragment shader deciding a color.

## 4. How one "card" becomes thousands, cheaply — instancing

There are only **14 unique visuals** (`CARD_EFFECT_METADATA` in
`metadata.ts`) but the grid appears to repeat forever as you pan. The trick
is **instancing**: you tell the GPU "draw this exact same rectangle shape N
times", and inside the vertex shader you use a built-in counter
(`instance_index`, 0, 1, 2, ...) to nudge each copy to a different position.
So instead of creating new geometry as you pan (which would be unbounded and
slow), there's a **fixed window** of instances (9×7 = 63 per effect, see
`INSTANCE_COLS`/`INSTANCE_ROWS` in `layout.ts`) that's always big enough to
cover the visible viewport, and panning just changes an offset number fed
into that same fixed set of instances. `cardVertex()` in `card-common.wgsl`
is the function that does this math; `cardWorldPosition()` in `layout.ts` is
the *exact same math* written twice in TypeScript, so the HTML text overlay
can predict where the GPU actually drew each card without asking the GPU.

## 5. Where each card's picture comes from ("artwork")

Every card needs a source image to shade as "glass". There are two sources,
picked per-effect:

**A) Procedural (no video available yet, or reduced-motion)** — a small
WGSL fragment shader (`flow-field.wgsl`, `voronoi-cells.wgsl`, etc.) is
rendered once per frame into its own small offscreen `target(...)` texture —
basically "render this pattern into a hidden bitmap first". These shaders
just implement a function `effectColor(uv, time)` — given a screen
coordinate (`uv`, always 0..1) and the current time, return a color. Things
like noise, moving blobs, and cell patterns are all just math on `uv` and
`time` — no actual 3D geometry involved, purely 2D pattern generation.

**B) Real video** — for cards with footage
(`CARD_EFFECT_METADATA[i].videoSrc`), a normal (invisible) `<video>` element
plays in the DOM, and every frame its *currently decoded frame* is copied
into a GPU texture via `copyExternalImageToTexture()` — this is the bridge
between "video playing in the browser" and "picture the GPU shader can
sample". Once that texture exists, video-backed and procedural cards are
**indistinguishable** to the glass shader — both are just a texture called
`artwork`. That's deliberate: it means the glass/refraction effect never
needs a special "is this a video" branch.

Videos are also **loaded lazily** (see `ensureVideoForEffect` in
`renderer.ts`): a `<video>` isn't created/downloaded until its tile actually
scrolls into view, and it's `pause()`d (not destroyed) when it scrolls back
out, so re-entering the viewport resumes instantly without re-downloading.

## 6. The "liquid glass" shader, piece by piece

This is the fun part. `card-lens.wgsl` draws every card's final pixels.
Reading it top to bottom, in order:

1. **Shape the card** (`roundedRectDistance`) — a **signed distance
   function (SDF)**: given a point, it returns "how far outside this rounded
   rectangle is this point?" (negative = inside). This is how the card gets
   rounded corners without needing curved geometry — it's a mathematical
   description of the shape, evaluated per pixel.

2. **Fake refraction** (`applyBulge`-style math, inlined in `fs_main`) —
   real glass bends the light passing through it, especially near the
   edges. Instead of simulating actual light bending, the shader just
   *displaces which pixel of the artwork it samples* near the card's edges
   — pulling the sample point slightly toward the center. The visual result
   reads as "this thick lump of glass is bulging/warping what's underneath",
   even though it's really just "look at a different pixel than you'd
   expect."

3. **Chromatic aberration / rainbow fringe** (`sampleDispersion`) — real
   glass/lenses bend red, green, and blue light by very slightly different
   amounts (this is *dispersion* — why a prism splits white light into a
   rainbow). The shader fakes this cheaply: it samples the same warped
   position 5 times at slightly different offsets, and weights each sample
   toward red, green, or blue (`spectralWeight`) before blending them back
   together — a colored fringe appears right at the edges, without doing
   real physically-based light-splitting.

4. **Reflection / fresnel** (`applyGlass`) — look at a glass window
   straight-on and you mostly see through it; look at a grazing angle and it
   turns into a mirror. That's the **Fresnel effect**, and it's approximated
   with a classic formula (Schlick's approximation):
   `fresnelF0 + (1 - fresnelF0) * (1 - N·V)^5` — "reflectivity is low at
   `fresnelF0` in the center, and rises toward 1 near the curved edge". The
   shader mixes between the refracted picture and a small reflected
   "environment" texture (see next point) using that fresnel value, capped
   by `envMaxMix` so it never becomes a pure mirror.

5. **The "environment" being reflected** (`matcap-env.wgsl`) — a real 3D
   glass reflects its surroundings. There's no real 3D world here to
   reflect, so instead there's one small pre-rendered texture that looks
   like a soft studio light source (a **matcap** — "material capture", a
   common cheap trick in 3D art tools) and the shader looks up a pixel of it
   based on how "tipped over" the fake bevel normal is at that point on the
   card. Cheap, but reads convincingly as "reflecting a soft light".

6. **The rim line** — one thin bright line traced right along the card's
   silhouette (again using the SDF from step 1), added on top independent of
   everything else — this is what makes the edge of the glass pop visually
   against the background.

7. **Crisp, size-independent edges** (`fwidth()`) — instead of hand-picking
   "blur the edge over 2 pixels", the shader uses `fwidth()`, a built-in
   that tells you how fast a value changes between neighboring pixels on
   screen right now. Using that (instead of a fixed number) keeps the edge
   looking exactly 1 pixel soft whether the card is small or huge on screen.

None of this is "real" 3D refraction or lighting simulation — it's a set of
cheap, well-chosen approximations that *read* as glass to the eye. That's
normal for real-time graphics: convincing beats physically correct.

## 7. The camera

`cameraRig.ts` uses an **orthographic** camera rather than a **perspective**
one. Perspective is "things farther away look smaller" (how human eyes/real
cameras work — good for realism). Orthographic is "no size change with
distance" (flat, like a technical drawing or a 2D game). This project
deliberately picked orthographic: the "3D tilt" you see when you move the
pointer isn't the camera rotating — it's the camera's look-at target
sliding slightly, which keeps every card the same on-screen size no matter
where it sits, so cards never visually overlap or shrink oddly near the
edges.

## 8. Keeping the on-screen text glued to the right card

`projection.ts::worldCardToScreenFrame()` takes the camera's
`viewProjection` matrix (the same matrix multiplication the vertex shader
uses to place a card on screen) plus a card's world position, and computes
where that card lands in screen pixels — on the **CPU**, in TypeScript, not
on the GPU. `useCardOverlays.ts` runs this every animation frame and directly
sets each HTML element's `transform: translate(...)`, so the text tracks the
GPU-drawn card with no visible lag, without React re-rendering on every
pixel of camera movement (it only triggers a React state update when the
*set* of visible cards changes, e.g. a new one scrolls into view).

## Glossary

- **Shader** — a small program the GPU runs per-vertex or per-pixel.
- **WGSL** — WebGPU's shader language (this project's `.wgsl` files).
- **Texture** — an image living in GPU memory; can be a loaded image, a
  video frame, or the output of a previous shader pass.
- **Uniform** — a value passed into a shader that's the same for every pixel
  in one draw call (e.g. current time, a slider value from the debug panel).
- **UV coordinates** — a 0..1 × 0..1 coordinate system describing "where on
  this flat surface am I", independent of actual pixel resolution.
- **Instancing** — drawing the same shape many times in one GPU call, each
  copy distinguished only by an index number.
- **SDF (signed distance function)** — a formula that returns "how far is
  this point from the edge of a shape" instead of drawing the shape with
  polygons; great for crisp, resolution-independent rounded corners.
- **Fresnel effect** — real surfaces reflect more at grazing angles than
  head-on; the `pow(1 - N·V, 5)` formula is the standard cheap approximation
  (Schlick's approximation).
- **Matcap** — "material capture": a flat pre-rendered image standing in for
  a reflected environment, looked up by surface-normal direction instead of
  a full reflection ray.
- **Orthographic vs. perspective** — orthographic = no size change with
  distance (flat/technical look); perspective = farther things look smaller
  (how real cameras/eyes work).
- **`object-fit: cover`-style UV transform** — the same idea as CSS's
  `object-fit: cover`, but done manually in the shader (`sampleArtwork()`)
  because raw video textures don't automatically match the card's aspect
  ratio.
