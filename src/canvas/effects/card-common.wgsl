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
 * Convex-lens sampling distortion: displaces `uv` toward/away from the card center based on
 * radial distance, so the procedural content sampled at the returned uv reads as if refracted
 * through curved glass. `strength` 0 = no distortion (flat glass), higher = stronger bulge.
 * Call this BEFORE sampling effectColor(); it operates on the sampling coordinate, not the
 * output color, so it works on any procedural content with no extra texture/render pass.
 */
export fn applyBulge(uv: vec2f, strength: f32, edgeStart: f32) -> vec2f {
  let centered = uv * 2.0 - 1.0;
  let edgeX = smoothstep(edgeStart, 1.0, abs(centered.x));
  let edgeY = smoothstep(edgeStart, 1.0, abs(centered.y));
  let edgeRefraction = max(edgeX, edgeY);
  let cornerBoost = edgeX * edgeY;
  let compression = strength
    * edgeRefraction * edgeRefraction
    * (1.0 + cornerBoost * 0.45);
  let displaced = centered * (1.0 - compression);
  return displaced * 0.5 + 0.5;
}

export fn chromaticOffset(
  uv: vec2f,
  amount: f32,
  edgeStart: f32,
) -> vec2f {
  let centered = uv * 2.0 - 1.0;
  let edgeDistance = max(abs(centered.x), abs(centered.y));
  let weight = smoothstep(edgeStart, 1.0, edgeDistance);
  let direction = centered / max(length(centered), 0.00001);
  return direction * amount * weight;
}

export fn roundedRectDistance(point: vec2f, radius: f32) -> f32 {
  let q = abs(point) - (vec2f(1.0) - vec2f(radius));
  return length(max(q, vec2f(0.0)))
    + min(max(q.x, q.y), 0.0)
    - radius;
}

export fn roundedRectNormal(point: vec2f, radius: f32) -> vec2f {
  let epsilon = 0.002;
  let gradient = vec2f(
    roundedRectDistance(point + vec2f(epsilon, 0.0), radius)
      - roundedRectDistance(point - vec2f(epsilon, 0.0), radius),
    roundedRectDistance(point + vec2f(0.0, epsilon), radius)
      - roundedRectDistance(point - vec2f(0.0, epsilon), radius),
  );
  return gradient / max(length(gradient), 0.00001);
}

/**
 * Glass look applied on top of a card's own (already-sampled/refracted) procedural color.
 * Ported from the reference site's actual TSL glass material rather than hand-tuned: the body
 * is a straight mix between the refracted image and a reflected-environment sample — never
 * darkened — driven by a Schlick fresnel off the bevel's surface tilt, capped at `envMaxMix` so
 * reflection never fully replaces the image even at grazing angles. A separate thin additive
 * rim line rides the exact silhouette, independent of that mix. `uv` here must be the card's
 * own untouched UV (not the bulge-displaced sampling coordinate) since the silhouette/rim
 * describe the card's physical shape, not its optical content.
 *
 * The edge itself is antialiased with `fwidth()` (screen-space derivative), not a hand-tuned
 * smoothstep band, so the silhouette stays a crisp cut regardless of how big the card is on
 * screen — that crispness is what reads as "glass" instead of "soft grey halo".
 */
export fn applyGlass(
  refracted: vec3f,
  uv: vec2f,
  cornerRadius: f32,
  fresnelF0: f32,
  envIntensity: f32,
  envMaxMix: f32,
  rimWidth: f32,
  rimIntensity: f32,
  bevelNormalZ: f32,
  envColor: vec3f,
) -> vec4f {
  let centered = uv * 2.0 - 1.0; // -1..1
  let dist = roundedRectDistance(centered, cornerRadius);

  let aa = max(fwidth(dist) * 0.5, 0.0001);
  let alpha = 1.0 - smoothstep(-aa, aa, dist);
  if (alpha <= 0.0) {
    discard;
  }

  // Schlick fresnel off how far the bevel has tipped away from facing the camera: ~fresnelF0 at
  // the flat center (bevelNormalZ near 1), rising toward 1 at the curved rim (bevelNormalZ near 0).
  let fresnel = fresnelF0 + (1.0 - fresnelF0) * pow(clamp(1.0 - bevelNormalZ, 0.0, 1.0), 5.0);
  let envMix = min(clamp(fresnel * envIntensity, 0.0, 1.0), envMaxMix);
  let body = mix(refracted, envColor, envMix);

  let rim = smoothstep(-rimWidth, 0.0, dist) * rimIntensity;
  let color = (body + vec3f(rim)) * alpha;
  return vec4f(color, alpha);
}
