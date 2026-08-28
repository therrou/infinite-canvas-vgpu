// src/canvas/effects/wave-interference.wgsl
import { CardVertexOut, cardVertex, applyBulge, applyGlass } from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  time: f32, localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32, bulgeStrength: f32, sheenIntensity: f32,
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
  let warpedUv = applyBulge(uv, params.bulgeStrength);
  let aberr = params.aberration * length(warpedUv * 2.0 - 1.0);
  let r = effectColor(warpedUv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(warpedUv, params.time).g;
  let b = effectColor(warpedUv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time, params.sheenIntensity);
}
