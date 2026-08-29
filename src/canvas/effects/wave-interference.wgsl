// src/canvas/effects/wave-interference.wgsl
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
  return vec4f(effectColor(uv, params.time), 1.0);
}
