// src/canvas/effects/domain-warp.wgsl
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
  let warpedUv = applyBulge(uv, params.bulgeStrength);
  let aberr = params.aberration * length(warpedUv * 2.0 - 1.0);
  let r = effectColor(warpedUv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(warpedUv, params.time).g;
  let b = effectColor(warpedUv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time, params.sheenIntensity);
}
