// src/canvas/effects/raymarch-blob.wgsl
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
  let warpedUv = applyBulge(uv, params.bulgeStrength);
  let aberr = params.aberration * length(warpedUv * 2.0 - 1.0);
  let r = effectColor(warpedUv + vec2f(aberr, 0.0), params.time).r;
  let g = effectColor(warpedUv, params.time).g;
  let b = effectColor(warpedUv - vec2f(aberr, 0.0), params.time).b;
  return applyGlass(vec3f(r, g, b), uv, params.time, params.sheenIntensity);
}
