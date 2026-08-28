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
