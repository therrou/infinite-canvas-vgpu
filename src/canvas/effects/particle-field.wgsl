// src/canvas/effects/particle-field.wgsl
import { ArtworkVertexOut, artworkVertex } from "./artwork-common.wgsl";

struct Params { time: f32 }
@group(0) @binding(0) var<uniform> params: Params;

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> ArtworkVertexOut {
  return artworkVertex(position, uv);
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
  return vec4f(effectColor(uv, params.time), 1.0);
}
