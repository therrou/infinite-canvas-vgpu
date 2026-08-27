# Infinite vgpu Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an infinite, draggable, zoomable WebGPU canvas in `~/vgpu-3d-viz` showing a wrap-tiled 2×3 grid of cards, each running a distinct procedural WGSL shader with a stylized glass/chromatic-aberration look, a global cursor-driven camera tilt, and HTML-overlay metadata synced to each card's screen position.

**Architecture:** All visual rendering (grid, effects, glass look, camera/tilt) is one WebGPU scene driven by `vgpu`, drawn in a single render pass with a perspective camera (no offscreen depth target — the grid is a flat, non-self-occluding plane). Infinite panning is achieved by wrapping a small **fixed instance window** per effect (not literal infinite geometry): each of the 6 `Draw` pipelines renders a bounded 9×7 instance grid whose world position is computed in the vertex shader from `instance_index` plus a wrapped pan offset, so GPU cost never grows with how far the user has panned. Metadata labels are plain React/DOM elements, repositioned every frame by projecting each visible card's world position through the camera's `viewProjection` matrix.

**Tech Stack:** `vgpu` (WebGPU), React 18 + TypeScript, Vite (`@vgpu/wgsl` Vite loader already configured), Vitest for pure-logic unit tests, `vgpu/node` for headless shader smoke tests.

**Spec:** `docs/superpowers/plans/2026-08-27-infinite-vgpu-canvas-spec.md`

## Global Constraints

- Reuse the existing `~/vgpu-3d-viz` project (Vite + React + TS + `vgpu` already installed) — do not scaffold a new project.
- Maximize use of the `vgpu` API surface (`draw`, `geometry`, `perspectiveCamera`, `frameLoop`, `.set()`) rather than hand-rolled WebGPU calls.
- Uniform grid, 2×3 repeat unit, 6 distinct WGSL effects — no varied card sizes, no per-card hover state (see spec §4–6).
- Single render pass, no offscreen depth target (see spec §12).
- No video files or external media downloads — all card content is procedural WGSL (spec §6).
- Card metadata is HTML overlay, copy describes the real effect running in that card (spec §11).
- This project directory (`~/vgpu-3d-viz`) is not yet a git repository — Task 1 initializes it.

---

## File Structure

```
~/vgpu-3d-viz/
  package.json                      # add vitest, test script
  vitest.config.ts                  # new
  src/
    main.tsx                        # replaced: mounts App
    App.tsx                         # new: mounts CanvasScene
    wgsl-env.d.ts                   # existing, unchanged
    canvas/
      layout.ts                     # new: grid/period constants + pure position math
      layout.test.ts                # new
      math.ts                       # new: lerp/clamp/inertia pure functions
      math.test.ts                  # new
      projection.ts                 # new: world->screen projection math
      projection.test.ts            # new
      cameraRig.ts                  # new: perspectiveCamera wrapper + tilt/zoom smoothing
      inputController.ts            # new: pointer drag+inertia+wheel/pinch zoom
      renderer.ts                   # new: vgpu setup, 6 Draw pipelines, frameLoop
      effects/
        card-common.wgsl            # new: shared vertex math + glass helper (binding-free)
        flow-field.wgsl             # new
        domain-warp.wgsl            # new
        raymarch-blob.wgsl          # new
        wave-interference.wgsl      # new
        voronoi-cells.wgsl          # new
        particle-field.wgsl         # new
        registry.ts                 # new: id/title/category/tagline/shader per effect
    overlay/
      useCardOverlays.ts            # new: per-frame visible-card projection hook
      CardOverlay.tsx               # new: one metadata label
      CardOverlay.css               # new
    CanvasScene.tsx                 # new: wires renderer + input + overlay together
  scripts/
    render-effects-smoke.ts         # new: headless vgpu/node shader sanity check
  # removed (superseded by the above):
  src/index.tsx, src/renderer.ts, src/scene-pipeline.ts, src/scene.wgsl, src/blit.wgsl
```

---

### Task 1: Project setup — git init, remove starter example, add test tooling

**Files:**
- Delete: `src/index.tsx`, `src/renderer.ts`, `src/scene-pipeline.ts`, `src/scene.wgsl`, `src/blit.wgsl`
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm run test` (vitest run), `npm run test:watch` (vitest watch) — later tasks' `.test.ts` files run through this.

- [ ] **Step 1: Initialize git and commit the current scaffold**

```bash
cd ~/vgpu-3d-viz
git init
git add -A
git commit -m "chore: initial vgpu-3d-viz scaffold from vgpu examples pull"
```

- [ ] **Step 2: Remove the pulled `instanced-rendering` example files (superseded by this plan)**

```bash
git rm src/index.tsx src/renderer.ts src/scene-pipeline.ts src/scene.wgsl src/blit.wgsl
```

- [ ] **Step 3: Add Vitest as a dev dependency and wire test scripts**

Edit `package.json` — add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

Add to `"devDependencies"`:

```json
    "vitest": "^2.1.8"
```

- [ ] **Step 4: Add Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Install and verify the test runner boots with zero tests**

```bash
npm install
npm run test
```

Expected: Vitest runs and reports "no test files found" (or passes with 0 files) — no errors. This confirms the runner is wired before any real tests exist.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove starter example, add vitest"
```

---

### Task 2: Grid layout math (`canvas/layout.ts`)

**Files:**
- Create: `src/canvas/layout.ts`
- Test: `src/canvas/layout.test.ts`

**Interfaces:**
- Produces:
  - `export const CARD_WIDTH: number`, `export const CARD_HEIGHT: number`
  - `export const CELL_WIDTH: number`, `export const CELL_HEIGHT: number`
  - `export const REPEAT_COLS = 2`, `export const REPEAT_ROWS = 3`
  - `export const PERIOD_WIDTH: number`, `export const PERIOD_HEIGHT: number`
  - `export const INSTANCE_COLS = 9`, `export const INSTANCE_ROWS = 7`
  - `export const INSTANCES_PER_EFFECT = INSTANCE_COLS * INSTANCE_ROWS`
  - `export function effectUnitOffset(effectIndex: number): { x: number; z: number }`
  - `export function wrapOffset(pan: number, period: number): number`
  - `export function instanceLocalIndices(instanceIndex: number): { col: number; row: number }`
  - `export function cardWorldPosition(effectIndex: number, instanceIndex: number, panX: number, panZ: number): { x: number; z: number }`
- Consumes: nothing (pure module, no vgpu import).

- [ ] **Step 1: Write the failing tests**

```ts
// src/canvas/layout.test.ts
import { describe, expect, it } from "vitest";
import {
  CELL_WIDTH,
  CELL_HEIGHT,
  PERIOD_WIDTH,
  PERIOD_HEIGHT,
  REPEAT_COLS,
  REPEAT_ROWS,
  INSTANCE_COLS,
  INSTANCE_ROWS,
  effectUnitOffset,
  wrapOffset,
  instanceLocalIndices,
  cardWorldPosition,
} from "./layout";

describe("layout constants", () => {
  it("derives period from cell size and repeat unit", () => {
    expect(PERIOD_WIDTH).toBeCloseTo(CELL_WIDTH * REPEAT_COLS);
    expect(PERIOD_HEIGHT).toBeCloseTo(CELL_HEIGHT * REPEAT_ROWS);
  });
});

describe("effectUnitOffset", () => {
  it("places all 6 effects on distinct cells within one repeat unit", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const { x, z } = effectUnitOffset(i);
      expect(x).toBeGreaterThanOrEqual(-PERIOD_WIDTH / 2);
      expect(x).toBeLessThan(PERIOD_WIDTH / 2);
      expect(z).toBeGreaterThanOrEqual(-PERIOD_HEIGHT / 2);
      expect(z).toBeLessThan(PERIOD_HEIGHT / 2);
      seen.add(`${x.toFixed(3)},${z.toFixed(3)}`);
    }
    expect(seen.size).toBe(6);
  });

  it("is periodic in effect index mod 6", () => {
    for (let i = 0; i < 6; i++) {
      expect(effectUnitOffset(i)).toEqual(effectUnitOffset(i + 6));
    }
  });
});

describe("wrapOffset", () => {
  it("stays within [0, period) for arbitrary large pan", () => {
    for (const pan of [0, 3.2, -3.2, 1000.7, -1000.7, 1e6]) {
      const wrapped = wrapOffset(pan, PERIOD_WIDTH);
      expect(wrapped).toBeGreaterThanOrEqual(0);
      expect(wrapped).toBeLessThan(PERIOD_WIDTH);
    }
  });

  it("is consistent with the period: wrapOffset(pan) === wrapOffset(pan + period)", () => {
    expect(wrapOffset(1.3, PERIOD_WIDTH)).toBeCloseTo(
      wrapOffset(1.3 + PERIOD_WIDTH, PERIOD_WIDTH)
    );
  });
});

describe("instanceLocalIndices", () => {
  it("decomposes instance_index into col/row within the fixed window", () => {
    expect(instanceLocalIndices(0)).toEqual({ col: 0, row: 0 });
    expect(instanceLocalIndices(1)).toEqual({ col: 1, row: 0 });
    expect(instanceLocalIndices(INSTANCE_COLS)).toEqual({ col: 0, row: 1 });
    expect(instanceLocalIndices(INSTANCE_COLS * INSTANCE_ROWS - 1)).toEqual({
      col: INSTANCE_COLS - 1,
      row: INSTANCE_ROWS - 1,
    });
  });
});

describe("cardWorldPosition", () => {
  it("moves opposite to increasing pan (dragging pans the world under a fixed camera)", () => {
    const a = cardWorldPosition(0, 40, 0, 0); // center-ish instance
    const b = cardWorldPosition(0, 40, CELL_WIDTH, 0);
    expect(b.x).toBeLessThan(a.x);
  });

  it("never produces NaN for extreme pan values", () => {
    const { x, z } = cardWorldPosition(3, 20, 1e8, -1e8);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `src/canvas/layout.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/canvas/layout.ts

/** World-space extent of a single card's visible plane. */
export const CARD_WIDTH = 2.1;
export const CARD_HEIGHT = 1.3;

/** World-space spacing between card centers (leaves a gutter around CARD_WIDTH/HEIGHT). */
export const CELL_WIDTH = 2.6;
export const CELL_HEIGHT = 1.7;

/** The unique-card repeat unit: 2 columns x 3 rows = 6 distinct effects. */
export const REPEAT_COLS = 2;
export const REPEAT_ROWS = 3;

export const PERIOD_WIDTH = CELL_WIDTH * REPEAT_COLS;
export const PERIOD_HEIGHT = CELL_HEIGHT * REPEAT_ROWS;

/**
 * Fixed instance window per effect. Large enough to cover the world at the
 * maximum camera zoom-out distance (see cameraRig.ts MAX_DISTANCE) with margin,
 * so panning/zooming never needs to grow instance counts.
 */
export const INSTANCE_COLS = 9; // covers +/- 4 periods
export const INSTANCE_ROWS = 7; // covers +/- 3 periods
export const INSTANCES_PER_EFFECT = INSTANCE_COLS * INSTANCE_ROWS;

/** Where effect `effectIndex` (0..5) sits within one repeat unit, centered on the unit. */
export function effectUnitOffset(effectIndex: number): { x: number; z: number } {
  const normalized = ((effectIndex % 6) + 6) % 6;
  const col = normalized % REPEAT_COLS;
  const row = Math.floor(normalized / REPEAT_COLS);
  return {
    x: (col - (REPEAT_COLS - 1) / 2) * CELL_WIDTH,
    z: (row - (REPEAT_ROWS - 1) / 2) * CELL_HEIGHT,
  };
}

/** Wraps `pan` into [0, period) — keeps GPU-bound offsets small regardless of total pan distance. */
export function wrapOffset(pan: number, period: number): number {
  const wrapped = pan % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

/** Decomposes a flat instance index into its (col, row) position in the fixed instance window. */
export function instanceLocalIndices(instanceIndex: number): { col: number; row: number } {
  return {
    col: instanceIndex % INSTANCE_COLS,
    row: Math.floor(instanceIndex / INSTANCE_COLS),
  };
}

/**
 * World position of one card instance, given the effect it belongs to, its slot in the
 * fixed instance window, and the current (unwrapped, arbitrarily large) pan distance.
 * Mirrors the vertex-shader math in card-common.wgsl exactly, for the HTML overlay to
 * project the same positions the GPU actually draws.
 */
export function cardWorldPosition(
  effectIndex: number,
  instanceIndex: number,
  panX: number,
  panZ: number
): { x: number; z: number } {
  const unit = effectUnitOffset(effectIndex);
  const { col, row } = instanceLocalIndices(instanceIndex);
  const i = col - (INSTANCE_COLS - 1) / 2;
  const j = row - (INSTANCE_ROWS - 1) / 2;
  const localOffsetX = wrapOffset(panX, PERIOD_WIDTH);
  const localOffsetZ = wrapOffset(panZ, PERIOD_HEIGHT);
  return {
    x: unit.x + i * PERIOD_WIDTH - localOffsetX,
    z: unit.z + j * PERIOD_HEIGHT - localOffsetZ,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS — all `layout.test.ts` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/layout.ts src/canvas/layout.test.ts
git commit -m "feat: pure grid/wrap layout math for the infinite card grid"
```

---

### Task 3: Math utilities — lerp/clamp/inertia (`canvas/math.ts`)

**Files:**
- Create: `src/canvas/math.ts`
- Test: `src/canvas/math.test.ts`

**Interfaces:**
- Produces:
  - `export function lerp(a: number, b: number, t: number): number`
  - `export function clamp(value: number, min: number, max: number): number`
  - `export interface InertiaState { x: number; z: number; vx: number; vz: number }`
  - `export function applyInertia(state: InertiaState, dt: number, friction: number): InertiaState`

- [ ] **Step 1: Write the failing tests**

```ts
// src/canvas/math.test.ts
import { describe, expect, it } from "vitest";
import { applyInertia, clamp, lerp } from "./math";

describe("lerp", () => {
  it("interpolates linearly", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe("clamp", () => {
  it("bounds a value into [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("applyInertia", () => {
  it("advances position by velocity * dt", () => {
    const next = applyInertia({ x: 0, z: 0, vx: 10, vz: 0 }, 0.1, 0.9);
    expect(next.x).toBeCloseTo(1, 5);
  });

  it("decays velocity toward zero every step, never flipping sign", () => {
    let state = { x: 0, z: 0, vx: 10, vz: -4 };
    for (let i = 0; i < 200; i++) {
      const next = applyInertia(state, 1 / 60, 0.9);
      expect(Math.abs(next.vx)).toBeLessThanOrEqual(Math.abs(state.vx) + 1e-9);
      expect(Math.sign(next.vx) === Math.sign(state.vx) || next.vx === 0).toBe(true);
      state = next;
    }
    expect(Math.abs(state.vx)).toBeLessThan(0.01);
    expect(Math.abs(state.vz)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `src/canvas/math.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/canvas/math.ts

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface InertiaState {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
}

/**
 * Advances a 2D position by its velocity, then decays velocity exponentially.
 * `friction` is the fraction of velocity retained after one second (0..1);
 * per-step decay is friction^dt so behavior stays consistent at any frame rate.
 */
export function applyInertia(state: InertiaState, dt: number, friction: number): InertiaState {
  const x = state.x + state.vx * dt;
  const z = state.z + state.vz * dt;
  const decay = Math.pow(friction, dt);
  const vx = Math.abs(state.vx) < 1e-4 ? 0 : state.vx * decay;
  const vz = Math.abs(state.vz) < 1e-4 ? 0 : state.vz * decay;
  return { x, z, vx, vz };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/math.ts src/canvas/math.test.ts
git commit -m "feat: pure lerp/clamp/inertia math helpers"
```

---

### Task 4: Screen-space projection (`canvas/projection.ts`)

**Files:**
- Create: `src/canvas/projection.ts`
- Test: `src/canvas/projection.test.ts`

**Interfaces:**
- Consumes: nothing beyond a plain `Float32Array` (column-major 4x4, the same layout `PerspectiveCamera.viewProjection` from `vgpu/scene` returns).
- Produces:
  - `export function transformPoint(matrix: Float32Array, x: number, y: number, z: number): { x: number; y: number; z: number; w: number }`
  - `export function worldToScreen(viewProjection: Float32Array, worldX: number, worldZ: number, screenWidth: number, screenHeight: number): { x: number; y: number; visible: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/canvas/projection.test.ts
import { describe, expect, it } from "vitest";
import { transformPoint, worldToScreen } from "./projection";

// Column-major identity matrix (m[col*4+row]).
const IDENTITY = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

describe("transformPoint", () => {
  it("passes points through unchanged with the identity matrix", () => {
    const p = transformPoint(IDENTITY, 1, 2, 3);
    expect(p).toEqual({ x: 1, y: 2, z: 3, w: 1 });
  });

  it("applies translation stored in the last column", () => {
    const translate = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      5, -2, 0, 1,
    ]);
    const p = transformPoint(translate, 0, 0, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(-2);
  });
});

describe("worldToScreen", () => {
  it("maps NDC center (identity matrix, world origin) to the screen center", () => {
    // Identity view-projection puts world (0,0,z=0) at clip (0,0,0,1) -> NDC (0,0) -> screen center.
    const { x, y, visible } = worldToScreen(IDENTITY, 0, 0, 800, 600);
    expect(visible).toBe(true);
    expect(x).toBeCloseTo(400, 0);
    expect(y).toBeCloseTo(300, 0);
  });

  it("flags points behind the camera (w <= 0) as not visible", () => {
    const behindCamera = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, -1, // forces w = -1 for any input point
    ]);
    const { visible } = worldToScreen(behindCamera, 0, 0, 800, 600);
    expect(visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `src/canvas/projection.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/canvas/projection.ts

/**
 * Multiplies a column-major 4x4 matrix (the layout vgpu/scene cameras use,
 * m[col * 4 + row]) by a homogeneous point (x, y, z, 1).
 */
export function transformPoint(
  matrix: Float32Array,
  x: number,
  y: number,
  z: number
): { x: number; y: number; z: number; w: number } {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  };
}

/**
 * Projects a world-space point on the ground plane (y = 0) through a camera's
 * viewProjection matrix into CSS pixel coordinates, matching the card position
 * math in canvas/layout.ts and the WGSL vertex shader in card-common.wgsl.
 */
export function worldToScreen(
  viewProjection: Float32Array,
  worldX: number,
  worldZ: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number; visible: boolean } {
  const clip = transformPoint(viewProjection, worldX, 0, worldZ);
  if (clip.w <= 0) return { x: 0, y: 0, visible: false };
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  return {
    x: (ndcX * 0.5 + 0.5) * screenWidth,
    y: (1 - (ndcY * 0.5 + 0.5)) * screenHeight,
    visible: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/projection.ts src/canvas/projection.test.ts
git commit -m "feat: world-to-screen projection math for HTML overlay sync"
```

---

### Task 5: Shared WGSL vertex/glass module + 6 procedural effect shaders

**Files:**
- Create: `src/canvas/effects/card-common.wgsl`
- Create: `src/canvas/effects/flow-field.wgsl`
- Create: `src/canvas/effects/domain-warp.wgsl`
- Create: `src/canvas/effects/raymarch-blob.wgsl`
- Create: `src/canvas/effects/wave-interference.wgsl`
- Create: `src/canvas/effects/voronoi-cells.wgsl`
- Create: `src/canvas/effects/particle-field.wgsl`
- Create: `src/canvas/effects/registry.ts`

**Interfaces:**
- Consumes: `layout.ts` constants (`PERIOD_WIDTH`, `PERIOD_HEIGHT`, `INSTANCE_COLS`, `INSTANCE_ROWS`, `CARD_WIDTH`, `CARD_HEIGHT`) only as documentation for the uniform values the renderer must supply — the WGSL files take these as runtime uniforms, not compile-time constants.
- Produces: `export interface CardEffectDefinition { id: string; title: string; category: string; tagline: string; shader: ShaderSource }` and `export const CARD_EFFECTS: readonly CardEffectDefinition[]` (length 6, index order matches `effectUnitOffset` in `layout.ts`) from `registry.ts`. Later tasks (renderer, overlay) import `CARD_EFFECTS`.
- Every effect shader exposes uniform group(0): `binding(0) camera: Camera { viewProjection: mat4x4f }`, `binding(1) params: Params { time: f32, localOffsetX: f32, localOffsetZ: f32, unitOffsetX: f32, unitOffsetZ: f32, periodWidth: f32, periodHeight: f32, instanceCols: f32, instanceRows: f32, aberration: f32 }`. `vs_main` and `fs_main` entry points, vertex inputs `@location(0) position: vec3f`, `@location(1) normal: vec3f` (unused, present because `plane()` pins it), `@location(2) uv: vec2f`.

- [ ] **Step 1: Write the shared binding-free WGSL module**

```wgsl
// src/canvas/effects/card-common.wgsl

export struct CardVertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

/**
 * Shared vertex math for every card effect: places instance `idx` (0..instanceCols*instanceRows-1)
 * on a fixed grid centered at (unitOffsetX, unitOffsetZ), spaced by one full repeat period per
 * step, then shifts the whole window by the wrapped pan offset. Mirrors canvas/layout.ts
 * cardWorldPosition() exactly — the HTML overlay projects the same positions this produces.
 */
export fn cardVertex(
  position: vec3f,
  uv: vec2f,
  viewProjection: mat4x4f,
  idx: u32,
  instanceCols: f32,
  instanceRows: f32,
  unitOffsetX: f32,
  unitOffsetZ: f32,
  periodWidth: f32,
  periodHeight: f32,
  localOffsetX: f32,
  localOffsetZ: f32,
) -> CardVertexOut {
  let cols = u32(instanceCols);
  let col = f32(idx % cols);
  let row = f32(idx / cols);
  let i = col - (instanceCols - 1.0) * 0.5;
  let j = row - (instanceRows - 1.0) * 0.5;

  let worldX = unitOffsetX + i * periodWidth - localOffsetX;
  let worldZ = unitOffsetZ + j * periodHeight - localOffsetZ;

  let world = vec3f(position.x + worldX, position.y, position.z + worldZ);

  var out: CardVertexOut;
  out.position = viewProjection * vec4f(world, 1.0);
  out.uv = uv;
  return out;
}

/**
 * Stylized glass look applied on top of a card's own procedural color: a rounded-rect
 * clip (discards outside the card), an edge vignette, and a diagonal specular sheen that
 * drifts over time. Does not sample or bend anything behind the card (no real refraction).
 */
export fn applyGlass(baseColor: vec3f, uv: vec2f, time: f32) -> vec4f {
  let centered = uv * 2.0 - 1.0; // -1..1
  let cornerRadius = 0.12;
  let halfExtent = vec2f(1.0, 1.0) - vec2f(cornerRadius);
  let q = abs(centered) - halfExtent;
  let outsideDist = length(max(q, vec2f(0.0))) - cornerRadius;
  if (outsideDist > 0.0) {
    discard;
  }

  let vignette = 1.0 - 0.35 * smoothstep(0.55, 1.0, length(centered));

  let sheenAxis = (centered.x + centered.y) * 0.5;
  let sheenPos = fract(time * 0.05) * 3.0 - 1.0;
  let sheen = smoothstep(0.08, 0.0, abs(sheenAxis - sheenPos)) * 0.35;

  let edgeFade = smoothstep(0.0, -0.03, outsideDist);
  let color = baseColor * vignette + vec3f(sheen);
  return vec4f(color, edgeFade);
}
```

- [ ] **Step 2: Write the six effect shaders**

Each file follows the same shape: declare bindings, import the shared helpers, write a pure `effectColor(uv, time, seed)` function, sample it three times with a small per-channel offset for chromatic aberration, then composite with `applyGlass`.

```wgsl
// src/canvas/effects/flow-field.wgsl
import { CardVertexOut, cardVertex, applyGlass } from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  time: f32, localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;

@vertex fn vs_main(
  @builtin(instance_index) idx: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> CardVertexOut {
  return cardVertex(
    position, uv, camera.viewProjection, idx,
    params.instanceCols, params.instanceRows,
    params.unitOffsetX, params.unitOffsetZ,
    params.periodWidth, params.periodHeight,
    params.localOffsetX, params.localOffsetZ,
  );
}

fn hash2(p: vec2f) -> vec2f {
  let x = dot(p, vec2f(127.1, 311.7));
  let y = dot(p, vec2f(269.5, 183.3));
  return fract(sin(vec2f(x, y)) * 43758.5453) * 2.0 - 1.0;
}

fn flowNoise(uv: vec2f, time: f32) -> f32 {
  let scaled = uv * 4.0;
  let cell = floor(scaled);
  let f = fract(scaled);
  var value = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let offset = vec2f(f32(x), f32(y));
      let dir = hash2(cell + offset) * 0.5 + vec2f(0.5, 0.5);
      let angle = dir.x * 6.2831853 + time * 0.6;
      let flow = vec2f(cos(angle), sin(angle)) * 0.35;
      let d = f - offset - flow;
      value = value + exp(-dot(d, d) * 6.0);
    }
  }
  return clamp(value, 0.0, 1.0);
}

fn effectColor(uv: vec2f, time: f32) -> vec3f {
  let n = flowNoise(uv, time);
  let base = vec3f(0.10, 0.55, 0.75);
  let hot = vec3f(0.85, 0.95, 1.0);
  return mix(base * 0.3, hot, n);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aberr = params.aberration * length(uv * 2.0 - 1.0);
  let r = effectColor(uv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(uv, params.time).g;
  let b = effectColor(uv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time);
}
```

```wgsl
// src/canvas/effects/domain-warp.wgsl
import { CardVertexOut, cardVertex, applyGlass } from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  time: f32, localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;

@vertex fn vs_main(
  @builtin(instance_index) idx: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> CardVertexOut {
  return cardVertex(
    position, uv, camera.viewProjection, idx,
    params.instanceCols, params.instanceRows,
    params.unitOffsetX, params.unitOffsetZ,
    params.periodWidth, params.periodHeight,
    params.localOffsetX, params.localOffsetZ,
  );
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(41.3, 289.1))) * 43758.5453);
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn effectColor(uv: vec2f, time: f32) -> vec3f {
  var p = uv * 3.0;
  let warpA = vec2f(valueNoise(p + vec2f(time * 0.15, 0.0)), valueNoise(p + vec2f(0.0, time * 0.15)));
  p = p + warpA * 1.4;
  let n = valueNoise(p * 1.7);
  let plasma = 0.5 + 0.5 * sin(n * 6.2831853 + time * 0.4);
  let colorA = vec3f(0.9, 0.25, 0.55);
  let colorB = vec3f(0.25, 0.35, 0.95);
  return mix(colorA, colorB, plasma);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aberr = params.aberration * length(uv * 2.0 - 1.0);
  let r = effectColor(uv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(uv, params.time).g;
  let b = effectColor(uv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time);
}
```

```wgsl
// src/canvas/effects/raymarch-blob.wgsl
import { CardVertexOut, cardVertex, applyGlass } from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  time: f32, localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;

@vertex fn vs_main(
  @builtin(instance_index) idx: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> CardVertexOut {
  return cardVertex(
    position, uv, camera.viewProjection, idx,
    params.instanceCols, params.instanceRows,
    params.unitOffsetX, params.unitOffsetZ,
    params.periodWidth, params.periodHeight,
    params.localOffsetX, params.localOffsetZ,
  );
}

fn sdSphere(p: vec3f, r: f32) -> f32 {
  return length(p) - r;
}

fn scene(p: vec3f, time: f32) -> f32 {
  let a = sdSphere(p - vec3f(sin(time * 0.6) * 0.3, cos(time * 0.5) * 0.2, 0.0), 0.55);
  let b = sdSphere(p - vec3f(-sin(time * 0.4) * 0.35, sin(time * 0.7) * 0.25, 0.1), 0.4);
  let k = 0.4;
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn effectColor(uv: vec2f, time: f32) -> vec3f {
  let centered = uv * 2.0 - 1.0;
  let rayOrigin = vec3f(0.0, 0.0, -2.2);
  let rayDir = normalize(vec3f(centered, 1.4));
  var t = 0.0;
  var hit = false;
  for (var step = 0; step < 48; step = step + 1) {
    let p = rayOrigin + rayDir * t;
    let d = scene(p, time);
    if (d < 0.001) { hit = true; break; }
    t = t + d;
    if (t > 6.0) { break; }
  }
  if (!hit) {
    return vec3f(0.02, 0.02, 0.05);
  }
  let p = rayOrigin + rayDir * t;
  let eps = 0.001;
  let normal = normalize(vec3f(
    scene(p + vec3f(eps, 0.0, 0.0), time) - scene(p - vec3f(eps, 0.0, 0.0), time),
    scene(p + vec3f(0.0, eps, 0.0), time) - scene(p - vec3f(0.0, eps, 0.0), time),
    scene(p + vec3f(0.0, 0.0, eps), time) - scene(p - vec3f(0.0, 0.0, eps), time),
  ));
  let light = max(dot(normal, normalize(vec3f(0.6, 0.7, -0.4))), 0.1);
  return vec3f(0.6, 0.75, 0.95) * light;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aberr = params.aberration * length(uv * 2.0 - 1.0);
  let r = effectColor(uv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(uv, params.time).g;
  let b = effectColor(uv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time);
}
```

```wgsl
// src/canvas/effects/wave-interference.wgsl
import { CardVertexOut, cardVertex, applyGlass } from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  time: f32, localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;

@vertex fn vs_main(
  @builtin(instance_index) idx: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> CardVertexOut {
  return cardVertex(
    position, uv, camera.viewProjection, idx,
    params.instanceCols, params.instanceRows,
    params.unitOffsetX, params.unitOffsetZ,
    params.periodWidth, params.periodHeight,
    params.localOffsetX, params.localOffsetZ,
  );
}

fn wave(p: vec2f, center: vec2f, time: f32, speed: f32) -> f32 {
  let d = length(p - center);
  return sin(d * 14.0 - time * speed) / (1.0 + d * 4.0);
}

fn effectColor(uv: vec2f, time: f32) -> vec3f {
  let p = uv * 2.0 - 1.0;
  let a = wave(p, vec2f(-0.4, 0.3), time, 4.0);
  let b = wave(p, vec2f(0.5, -0.2), time, 3.2);
  let c = wave(p, vec2f(0.0, 0.6), time, 3.6);
  let sum = (a + b + c) / 3.0;
  let intensity = sum * 0.5 + 0.5;
  return mix(vec3f(0.02, 0.08, 0.15), vec3f(0.4, 0.85, 0.9), intensity);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aberr = params.aberration * length(uv * 2.0 - 1.0);
  let r = effectColor(uv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(uv, params.time).g;
  let b = effectColor(uv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time);
}
```

```wgsl
// src/canvas/effects/voronoi-cells.wgsl
import { CardVertexOut, cardVertex, applyGlass } from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  time: f32, localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;

@vertex fn vs_main(
  @builtin(instance_index) idx: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> CardVertexOut {
  return cardVertex(
    position, uv, camera.viewProjection, idx,
    params.instanceCols, params.instanceRows,
    params.unitOffsetX, params.unitOffsetZ,
    params.periodWidth, params.periodHeight,
    params.localOffsetX, params.localOffsetZ,
  );
}

fn hash2(p: vec2f) -> vec2f {
  let x = dot(p, vec2f(127.1, 311.7));
  let y = dot(p, vec2f(269.5, 183.3));
  return fract(sin(vec2f(x, y)) * 43758.5453);
}

fn voronoi(p: vec2f, time: f32) -> f32 {
  let cell = floor(p);
  let f = fract(p);
  var minDist = 8.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let neighbor = vec2f(f32(x), f32(y));
      let point = hash2(cell + neighbor);
      let animated = 0.5 + 0.5 * sin(time * 0.8 + point * 6.2831853);
      let diff = neighbor + animated - f;
      minDist = min(minDist, dot(diff, diff));
    }
  }
  return sqrt(minDist);
}

fn effectColor(uv: vec2f, time: f32) -> vec3f {
  let d = voronoi(uv * 5.0, time);
  let edge = smoothstep(0.0, 0.08, d);
  let cellColor = mix(vec3f(0.95, 0.55, 0.15), vec3f(0.15, 0.05, 0.02), d);
  return mix(vec3f(0.0), cellColor, edge);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aberr = params.aberration * length(uv * 2.0 - 1.0);
  let r = effectColor(uv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(uv, params.time).g;
  let b = effectColor(uv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time);
}
```

```wgsl
// src/canvas/effects/particle-field.wgsl
import { CardVertexOut, cardVertex, applyGlass } from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  time: f32, localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;

@vertex fn vs_main(
  @builtin(instance_index) idx: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> CardVertexOut {
  return cardVertex(
    position, uv, camera.viewProjection, idx,
    params.instanceCols, params.instanceRows,
    params.unitOffsetX, params.unitOffsetZ,
    params.periodWidth, params.periodHeight,
    params.localOffsetX, params.localOffsetZ,
  );
}

fn hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453);
}

fn effectColor(uv: vec2f, time: f32) -> vec3f {
  var accum = 0.0;
  for (var i = 0; i < 40; i = i + 1) {
    let n = f32(i);
    let seed = hash(n * 12.9898);
    let speed = 0.05 + hash(n * 78.233) * 0.15;
    let life = fract(seed + time * speed);
    let angle = seed * 6.2831853 + n;
    let radius = life * 0.9;
    let center = vec2f(cos(angle), sin(angle)) * radius * 0.5 + vec2f(0.5, 0.5);
    let d = distance(uv, center);
    let size = 0.01 + (1.0 - life) * 0.02;
    accum = accum + smoothstep(size, 0.0, d) * (1.0 - life);
  }
  let color = mix(vec3f(0.02, 0.02, 0.06), vec3f(1.0, 0.9, 0.7), clamp(accum, 0.0, 1.0));
  return color;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aberr = params.aberration * length(uv * 2.0 - 1.0);
  let r = effectColor(uv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(uv, params.time).g;
  let b = effectColor(uv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time);
}
```

- [ ] **Step 3: Write the effect registry**

```ts
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
```

- [ ] **Step 4: No automated check yet for this task** — shader compilation is verified in Task 6's headless smoke test, which imports these exact files. Do not run `npm run dev` yet; proceed to Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/effects
git commit -m "feat: six procedural WGSL card effects + shared vertex/glass module"
```

---

### Task 6: Headless shader smoke test (`scripts/render-effects-smoke.ts`)

**Files:**
- Create: `scripts/render-effects-smoke.ts`
- Modify: `package.json` (add `"smoke": "tsx scripts/render-effects-smoke.ts"` script + `tsx` devDependency)

**Interfaces:**
- Consumes: `CARD_EFFECTS` from `src/canvas/effects/registry.ts`, `vgpu/node`.
- Produces: a CLI script that exits non-zero if any effect fails to compile or renders a flat/constant frame — this is the plan's substitute for a browser test, following vgpu's own "validate with static renders" methodology (`getting-started.docs.md`).

- [ ] **Step 1: Add `tsx` and the smoke script to `package.json`**

```json
    "smoke": "tsx scripts/render-effects-smoke.ts"
```

```json
    "tsx": "^4.19.2"
```

```bash
npm install
```

- [ ] **Step 2: Write the smoke test script**

```ts
// scripts/render-effects-smoke.ts
import { draw, frame, geometry, init, target } from "vgpu/node";
import { plane, perspectiveCamera } from "vgpu/scene";

import { CARD_EFFECTS } from "../src/canvas/effects/registry";
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  PERIOD_WIDTH,
  PERIOD_HEIGHT,
  INSTANCE_COLS,
  INSTANCE_ROWS,
} from "../src/canvas/layout";

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

  for (const [index, effect] of CARD_EFFECTS.entries()) {
    const cardDraw = draw(gpu, { shader: effect.shader, geometry: cardGeometry, instances: 1 });
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
        instanceCols: INSTANCE_COLS,
        instanceRows: INSTANCE_ROWS,
        aberration: 0.01,
      },
    });

    try {
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
      console.error(`[FAIL] ${effect.id} ${effect.title}: threw during render`, error);
      failures++;
    }
  }

  gpu.dispose();

  if (failures > 0) {
    console.error(`\n${failures}/${CARD_EFFECTS.length} effects failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${CARD_EFFECTS.length} effects rendered non-trivial frames.`);
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
```

- [ ] **Step 3: Run the smoke test**

Run: `npm run smoke`
Expected: `[OK]` for all 6 effects, ending with "All 6 effects rendered non-trivial frames." If a shader fails to compile, the error names the exact `VGPU-*` code and file — fix the shader in Task 5's files and rerun before continuing.

- [ ] **Step 4: Commit**

```bash
git add scripts/render-effects-smoke.ts package.json package-lock.json
git commit -m "test: headless vgpu/node smoke test for all 6 card effects"
```

---

### Task 7: Camera rig (`canvas/cameraRig.ts`)

**Files:**
- Create: `src/canvas/cameraRig.ts`

**Interfaces:**
- Consumes: `perspectiveCamera` from `vgpu/scene`; `lerp`, `clamp` from `canvas/math.ts`.
- Produces:
  - `export const MIN_DISTANCE = 5`, `export const MAX_DISTANCE = 16`, `export const DEFAULT_DISTANCE = 9`
  - `export interface CameraRig { readonly camera: import("vgpu/scene").PerspectiveCamera; setAspect(aspect: number): void; update(pointerNdcX: number, pointerNdcY: number, targetDistance: number, dt: number): void; }`
  - `export function createCameraRig(aspect: number): CameraRig`

- [ ] **Step 1: Implement**

No unit test for this task — it's a thin, stateful wrapper over `vgpu/scene`'s `PerspectiveCamera` (a live GPU-adjacent object), which is exercised end-to-end by the manual verification in Task 11 and indirectly by the renderer wiring in Task 9. The pure smoothing math it uses (`lerp`, `clamp`) is already unit-tested in Task 3.

```ts
// src/canvas/cameraRig.ts
import { perspectiveCamera, type PerspectiveCamera } from "vgpu/scene";

import { clamp, lerp } from "./math";

export const MIN_DISTANCE = 5;
export const MAX_DISTANCE = 16;
export const DEFAULT_DISTANCE = 9;

const FOV_DEGREES = 50;
const NEAR = 0.1;
const FAR = 60;
/** Downward look angle: position.y / position.z ratio, ~32 degrees off the horizon. */
const HEIGHT_RATIO = 0.62;
/** How far (world units) the look-at target shifts at full pointer deflection. */
const TILT_RANGE = 3.0;
/** Per-second smoothing factor for tilt/zoom easing (higher = snappier). */
const SMOOTHING = 6;

export interface CameraRig {
  readonly camera: PerspectiveCamera;
  setAspect(aspect: number): void;
  update(pointerNdcX: number, pointerNdcY: number, targetDistance: number, dt: number): void;
}

export function createCameraRig(aspect: number): CameraRig {
  const camera = perspectiveCamera({
    fov: FOV_DEGREES,
    aspect,
    near: NEAR,
    far: FAR,
    position: [0, DEFAULT_DISTANCE * HEIGHT_RATIO, DEFAULT_DISTANCE],
    target: [0, 0, 0],
  });

  let smoothedTiltX = 0;
  let smoothedTiltZ = 0;
  let smoothedDistance = DEFAULT_DISTANCE;

  return {
    camera,
    setAspect(nextAspect: number) {
      camera.set({ aspect: nextAspect });
    },
    update(pointerNdcX, pointerNdcY, targetDistance, dt) {
      const t = 1 - Math.exp(-SMOOTHING * dt);
      const clampedDistance = clamp(targetDistance, MIN_DISTANCE, MAX_DISTANCE);
      smoothedDistance = lerp(smoothedDistance, clampedDistance, t);
      smoothedTiltX = lerp(smoothedTiltX, pointerNdcX * TILT_RANGE, t);
      smoothedTiltZ = lerp(smoothedTiltZ, pointerNdcY * TILT_RANGE, t);

      camera.set({ position: [0, smoothedDistance * HEIGHT_RATIO, smoothedDistance] });
      camera.lookAt([smoothedTiltX, 0, smoothedTiltZ]);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/cameraRig.ts
git commit -m "feat: perspective camera rig with cursor-driven tilt and smoothed zoom"
```

---

### Task 8: Input controller (`canvas/inputController.ts`)

**Files:**
- Create: `src/canvas/inputController.ts`

**Interfaces:**
- Consumes: `applyInertia`, `clamp`, `lerp` from `canvas/math.ts`; `MIN_DISTANCE`, `MAX_DISTANCE`, `DEFAULT_DISTANCE` from `canvas/cameraRig.ts`.
- Produces:
  - `export interface InputSnapshot { panX: number; panZ: number; distance: number; pointerNdcX: number; pointerNdcY: number }`
  - `export interface InputController { attach(element: HTMLElement): () => void; tick(dt: number): InputSnapshot; }`
  - `export function createInputController(): InputController`

- [ ] **Step 1: Implement**

Input handling reads real DOM pointer/wheel events, so it is verified manually in Task 11 rather than unit-tested; its numeric core (`applyInertia`, `clamp`) is already covered by Task 3's tests.

```ts
// src/canvas/inputController.ts
import { DEFAULT_DISTANCE, MAX_DISTANCE, MIN_DISTANCE } from "./cameraRig";
import { applyInertia, clamp, type InertiaState } from "./math";

export interface InputSnapshot {
  readonly panX: number;
  readonly panZ: number;
  readonly distance: number;
  readonly pointerNdcX: number;
  readonly pointerNdcY: number;
}

export interface InputController {
  attach(element: HTMLElement): () => void;
  tick(dt: number): InputSnapshot;
}

const FRICTION = 0.05; // fraction of velocity retained after 1s of no input
const ZOOM_SPEED = 0.01; // world units of distance per wheel-delta unit

export function createInputController(): InputController {
  let panX = 0;
  let panZ = 0;
  let inertia: InertiaState = { x: 0, z: 0, vx: 0, vz: 0 };
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastMoveTime = performance.now();
  let distance = DEFAULT_DISTANCE;
  let pointerNdcX = 0;
  let pointerNdcY = 0;

  function worldPerPixel(element: HTMLElement): number {
    // Approximates perspective-correct drag: closer camera -> less world moves per pixel.
    const fovRadians = (50 * Math.PI) / 180;
    return (2 * distance * Math.tan(fovRadians / 2)) / element.clientHeight;
  }

  function updatePointerNdc(element: HTMLElement, clientX: number, clientY: number) {
    const rect = element.getBoundingClientRect();
    pointerNdcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdcY = ((clientY - rect.top) / rect.height) * 2 - 1;
  }

  function attach(element: HTMLElement): () => void {
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      inertia = { x: 0, z: 0, vx: 0, vz: 0 };
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastMoveTime = performance.now();
      element.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      updatePointerNdc(element, event.clientX, event.clientY);
      if (!dragging) return;

      const now = performance.now();
      const dtMs = Math.max(now - lastMoveTime, 1);
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      const worldScale = worldPerPixel(element);

      panX -= dx * worldScale;
      panZ -= dy * worldScale;

      inertia = {
        x: 0,
        z: 0,
        vx: (-dx * worldScale) / (dtMs / 1000),
        vz: (-dy * worldScale) / (dtMs / 1000),
      };

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      lastMoveTime = now;
    };

    const endDrag = () => {
      dragging = false;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      distance = clamp(distance + event.deltaY * ZOOM_SPEED, MIN_DISTANCE, MAX_DISTANCE);
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", endDrag);
      element.removeEventListener("pointercancel", endDrag);
      element.removeEventListener("wheel", onWheel);
    };
  }

  function tick(dt: number): InputSnapshot {
    if (!dragging) {
      inertia = applyInertia(inertia, dt, FRICTION);
      panX += inertia.vx * dt;
      panZ += inertia.vz * dt;
    }
    return { panX, panZ, distance, pointerNdcX, pointerNdcY };
  }

  return { attach, tick };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/canvas/inputController.ts
git commit -m "feat: pointer drag+inertia and wheel-zoom input controller"
```

---

### Task 9: Renderer (`canvas/renderer.ts`)

**Files:**
- Create: `src/canvas/renderer.ts`

**Interfaces:**
- Consumes: `CARD_EFFECTS` (Task 5), `layout.ts` constants + `cardWorldPosition` (Task 2), `createCameraRig` (Task 7), `createInputController` (Task 8), `init`, `draw`, `geometry`, `frame`, `frameLoop`, `surface`, `clock` from `vgpu`, `plane` from `vgpu/scene`.
- Produces:
  - `export interface VisibleCard { readonly key: string; readonly effectIndex: number; readonly worldX: number; readonly worldZ: number }`
  - `export interface InfiniteCanvasRenderer { readonly ready: Promise<void>; getViewProjection(): Float32Array | undefined; getVisibleCards(): readonly VisibleCard[]; dispose(): void; }`
  - `export function createInfiniteCanvasRenderer(canvas: HTMLCanvasElement): InfiniteCanvasRenderer`
- This is the integration point later consumed by `CanvasScene.tsx` (Task 10) and `useCardOverlays.ts` (Task 10).

- [ ] **Step 1: Implement**

```ts
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

  const readyPromise = initialize().then(() => undefined);

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
      gpu?.dispose();
    },
  };
}
```

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. This is the first point where `renderer.ts`'s types against `vgpu`'s real exports get checked — fix any signature mismatches against the docs referenced in Tasks 5–9 before continuing (do not guess; re-run `npx vgpu docs find <symbol>` for the exact export if the compiler disagrees).

- [ ] **Step 3: Commit**

```bash
git add src/canvas/renderer.ts
git commit -m "feat: vgpu renderer wiring camera, input, and the 6 card effects into one frame loop"
```

---

### Task 10: React integration — overlay + scene + app

**Files:**
- Create: `src/overlay/useCardOverlays.ts`
- Create: `src/overlay/CardOverlay.tsx`
- Create: `src/overlay/CardOverlay.css`
- Create: `src/CanvasScene.tsx`
- Modify: `src/App.tsx` (new file — create it)
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `createInfiniteCanvasRenderer`, `VisibleCard` (Task 9); `worldToScreen` (Task 4); `CARD_EFFECTS` (Task 5).
- Produces: `App` mounted by `main.tsx`; no further consumers.

- [ ] **Step 1: Write the overlay projection hook**

```ts
// src/overlay/useCardOverlays.ts
import { useEffect, useRef, useState } from "react";

import type { InfiniteCanvasRenderer, VisibleCard } from "../canvas/renderer";
import { worldToScreen } from "../canvas/projection";

export interface ProjectedCard extends VisibleCard {
  readonly screenX: number;
  readonly screenY: number;
}

export function useCardOverlays(
  renderer: InfiniteCanvasRenderer | undefined,
  containerRef: React.RefObject<HTMLElement>
): readonly ProjectedCard[] {
  const [projected, setProjected] = useState<readonly ProjectedCard[]>([]);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (!renderer) return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const container = containerRef.current;
      const viewProjection = renderer.getViewProjection();
      if (container && viewProjection) {
        const { width, height } = container.getBoundingClientRect();
        const next = renderer
          .getVisibleCards()
          .map((card) => {
            const screen = worldToScreen(viewProjection, card.worldX, card.worldZ, width, height);
            return { ...card, screenX: screen.x, screenY: screen.y, visible: screen.visible };
          })
          .filter((card) => card.visible && card.screenX > -200 && card.screenX < width + 200 && card.screenY > -200 && card.screenY < height + 200);
        setProjected(next);
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [renderer, containerRef]);

  return projected;
}
```

- [ ] **Step 2: Write the card overlay component and styles**

```tsx
// src/overlay/CardOverlay.tsx
import { CARD_EFFECTS } from "../canvas/effects/registry";
import type { ProjectedCard } from "./useCardOverlays";

import "./CardOverlay.css";

export function CardOverlay({ card }: { card: ProjectedCard }) {
  const effect = CARD_EFFECTS[card.effectIndex];
  return (
    <div
      className="card-overlay"
      style={{ transform: `translate(${card.screenX}px, ${card.screenY}px)` }}
    >
      <div className="card-overlay__kicker">
        <span className="card-overlay__id">{effect.id}</span>
        <span className="card-overlay__category">{effect.category}</span>
        <span className="card-overlay__tag">WEBGPU · 2026</span>
      </div>
      <div className="card-overlay__title">{effect.title}</div>
      <div className="card-overlay__tagline">{effect.tagline}</div>
    </div>
  );
}
```

```css
/* src/overlay/CardOverlay.css */
.card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 260px;
  height: 160px;
  margin-left: -130px;
  margin-top: -80px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px 16px;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
}

.card-overlay__kicker {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.card-overlay__id {
  color: #7dd3fc;
}

.card-overlay__title {
  font-size: 22px;
  font-weight: 700;
}

.card-overlay__tagline {
  font-size: 12px;
  opacity: 0.85;
}
```

- [ ] **Step 3: Write the canvas scene component**

```tsx
// src/CanvasScene.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { createInfiniteCanvasRenderer, type InfiniteCanvasRenderer } from "./canvas/renderer";
import { CardOverlay } from "./overlay/CardOverlay";
import { useCardOverlays } from "./overlay/useCardOverlays";

export function CanvasScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<InfiniteCanvasRenderer>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const nextRenderer = createInfiniteCanvasRenderer(canvas);
    setRenderer(nextRenderer);
    return () => nextRenderer.dispose();
  }, []);

  const projectedCards = useCardOverlays(renderer, containerRef);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      {projectedCards.map((card) => (
        <CardOverlay key={card.key} card={card} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `App.tsx` and update `main.tsx`**

```tsx
// src/App.tsx
import { CanvasScene } from "./CanvasScene";

export function App() {
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <CanvasScene />
    </div>
  );
}
```

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/overlay src/CanvasScene.tsx src/App.tsx src/main.tsx
git commit -m "feat: wire renderer, camera/input, and HTML overlay into the React app"
```

---

### Task 11: Manual verification and final polish

**Files:** none (verification only; fixes go back into the files touched by Tasks 5–10).

- [ ] **Step 1: Run the full automated check suite**

```bash
npm run test
npm run smoke
npx tsc --noEmit -p tsconfig.json
```

Expected: all three pass. If `smoke` reports a flat frame for any effect, fix that effect's `.wgsl` file (Task 5) before proceeding.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: prints a `Local: http://localhost:5173/` URL with no errors in the terminal.

- [ ] **Step 3: Manual browser verification checklist**

Open the printed URL in a browser and confirm each item (this plan cannot browser-test itself — if Claude's browser automation is unavailable in the executing session, hand this checklist to the user and wait for their confirmation before considering the task done):

- [ ] Six visibly different animated patterns are on screen (noise flow, plasma warp, raymarched blob, wave rings, Voronoi cells, particle field), each inside a rounded glass-look card with a visible RGB-fringe at the edges and a drifting specular streak.
- [ ] Dragging with the mouse pans the grid; releasing mid-drag continues panning briefly and decelerates smoothly (inertia).
- [ ] Panning in any direction for an extended distance never shows a seam, pop-in, or the grid running out — new cards continuously appear at the edges (wrap/tiling).
- [ ] Scrolling (or pinching on trackpad) zooms in/out, clamped so the grid never zooms through itself or vanishes.
- [ ] Moving the mouse across the viewport without dragging visibly tilts the whole grid toward the cursor, not just the card under it.
- [ ] Each visible card has a readable HTML label (id, category, title, tagline) that stays aligned with its card as you pan/zoom, matching `card.title`/`card.tagline` text set in `registry.ts`.
- [ ] Open the browser console: no errors, no `VGPU-*` warnings.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "docs: infinite vgpu canvas complete, verified end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (existing project) — Task 1. §2 (WebGPU rendering) — Tasks 5, 9. §3 (wrap/tiling, constant cost) — Tasks 2, 5, 9 (`INSTANCES_PER_EFFECT` is fixed regardless of pan). §4–5 (uniform grid, 2×3 repeat unit, 6 effects) — Tasks 2, 5. §6 (procedural, no video, no hover state) — Task 5 (effects always animate from `time`, no hover uniform exists). §7 (stylized glass) — Task 5 `applyGlass`. §8 (global cursor tilt) — Task 7. §9 (inertia pan) — Task 8. §10 (zoom) — Tasks 7, 8. §11 (HTML overlay, real copy) — Tasks 4, 10. §12 (single pass, no depth target) — Task 9 uses one `frame.pass` on the canvas surface only.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact command with an expected result.
- **Type consistency:** `VisibleCard`/`ProjectedCard`/`CardEffectDefinition` field names are used identically across Tasks 5, 9, and 10 (`effectIndex`, `worldX`, `worldZ`, `key`, `id`, `title`, `category`, `tagline`). `cardWorldPosition` (Task 2) and the WGSL `cardVertex` function (Task 5) implement the same formula so overlay and GPU positions never diverge — verified by inspection of both, not just by name.
