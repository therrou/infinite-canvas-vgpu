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
