// src/canvas/effects/voronoi-cells.wgsl
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
  return vec4f(effectColor(uv, params.time), 1.0);
}
