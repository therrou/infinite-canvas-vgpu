// src/canvas/effects/matcap-env.wgsl
//
// Static "studio softbox" matcap: a small texture sampled by the card-lens
// shader's bevel normal (not a real HDRI equirect) to stand in for the
// reflected-environment highlight a true physically-based glass material
// would pick up from an env map. Rendered once into a small target and
// reused every frame — it never changes at runtime.
import { ArtworkVertexOut, artworkVertex } from "./artwork-common.wgsl";

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> ArtworkVertexOut {
  return artworkVertex(position, uv);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Key light sits toward the upper-left, matching the light direction the
  // rest of the glass shading already assumes.
  let keyPos = vec2f(0.26, 0.22);
  let d = distance(uv, keyPos);
  let soft = exp(-d * d * 7.0);
  let hot = exp(-d * d * 46.0);
  let base = mix(vec3f(0.02, 0.024, 0.034), vec3f(0.1, 0.11, 0.14), uv.y);
  let color = base + vec3f(0.55) * soft + vec3f(1.4) * hot;
  return vec4f(color, 1.0);
}
