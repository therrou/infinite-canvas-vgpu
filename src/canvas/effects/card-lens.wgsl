import {
  CardVertexOut,
  cardVertex,
  applyGlass,
  roundedRectDistance,
  roundedRectNormal,
} from "./card-common.wgsl";

struct Camera { viewProjection: mat4x4f }
struct Params {
  localOffsetX: f32, localOffsetZ: f32,
  unitOffsetX: f32, unitOffsetZ: f32,
  periodWidth: f32, periodHeight: f32,
  instanceCols: f32, instanceRows: f32,
  aberration: f32, aberrationStart: f32,
  bulgeStrength: f32, bulgeStart: f32,
  cornerRadius: f32,
  fresnelF0: f32, envIntensity: f32, envMaxMix: f32,
  rimWidth: f32, rimIntensity: f32,
  artworkCoverScaleX: f32, artworkCoverScaleY: f32,
  artworkCoverOffsetX: f32, artworkCoverOffsetY: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var artwork: texture_2d<f32>;
@group(0) @binding(3) var artworkSampler: sampler;
@group(0) @binding(4) var envMap: texture_2d<f32>;
@group(0) @binding(5) var envMapSampler: sampler;

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

// Object-fit: cover for the artwork texture: procedural effects leave scale
// at (1,1) and offset at (0,0) (a no-op), while video-backed cards remap uv
// into a centered sub-rectangle of the source frame so footage whose aspect
// ratio doesn't match the card fills it without stretching.
fn sampleArtwork(uv: vec2f) -> vec3f {
  let coverUv = uv * vec2f(params.artworkCoverScaleX, params.artworkCoverScaleY)
    + vec2f(params.artworkCoverOffsetX, params.artworkCoverOffsetY);
  return textureSampleLevel(
    artwork,
    artworkSampler,
    clamp(coverUv, vec2f(0.001), vec2f(0.999)),
    0.0,
  ).rgb;
}

// Wavelength-style weights for a 5-tap dispersion sweep: t=-1 is the
// short-wavelength (blue) end of the offset range, t=+1 the long-wavelength
// (red) end. Triangular weights are a cheap stand-in for a real spectral
// response curve — the reference site instead re-refracts the image through
// a per-wavelength IOR, but sweeping the same warped sample across a few
// offsets reads as the same smooth spectral fringe without a second
// refraction pass.
fn spectralWeight(t: f32) -> vec3f {
  return vec3f(
    clamp(1.0 - abs(t - 1.0), 0.0, 1.0),
    clamp(1.0 - abs(t) * 1.4, 0.0, 1.0),
    clamp(1.0 - abs(t + 1.0), 0.0, 1.0),
  );
}

fn sampleDispersion(uv: vec2f, direction: vec2f, amount: f32) -> vec3f {
  var accumulated = vec3f(0.0);
  var weightSum = vec3f(0.0);
  for (var i = 0; i < 5; i = i + 1) {
    let t = f32(i) / 4.0 * 2.0 - 1.0;
    let sampled = sampleArtwork(uv + direction * amount * t);
    let weight = spectralWeight(t);
    accumulated = accumulated + sampled * weight;
    weightSum = weightSum + weight;
  }
  return accumulated / max(weightSum, vec3f(0.0001));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let centered = uv * 2.0 - 1.0;
  let normal = roundedRectNormal(centered, params.cornerRadius);
  let bevelWidth = max((1.0 - params.bulgeStart) * 0.58, 0.04);
  let dist = roundedRectDistance(centered, params.cornerRadius);
  let edge = smoothstep(-bevelWidth, 0.0, dist);
  let aberrationEdge = smoothstep(params.aberrationStart, 1.0, edge);
  // A steeper (higher-power) falloff than a plain square concentrates the
  // bend right at the rim, reading as a thick rounded lens profile instead
  // of an even overall warp.
  let edgeCurve = pow(edge, 2.6);
  let refraction = params.bulgeStrength * 0.28 * edgeCurve;
  let warpedUv = uv - normal * refraction;
  let dispersionAmount = params.aberration * aberrationEdge;
  let refracted = sampleDispersion(warpedUv, normal, dispersionAmount);

  // Bulge the 2D bevel normal into a hemisphere-like 3D normal: flat (pointing
  // at camera, z near 1) at the card's center, tipping over toward the rim
  // (z near 0) in proportion to how curved the lens profile is there. This
  // stands in for the reference site's real per-pixel surface normal, both
  // for the matcap lookup and for the fresnel term in applyGlass.
  let bevelNormal3 = normalize(vec3f(normal * edgeCurve * 1.4, 1.0));
  let matcapUv = clamp(bevelNormal3.xy * 0.5 + 0.5, vec2f(0.02), vec2f(0.98));
  let envColor = textureSampleLevel(envMap, envMapSampler, matcapUv, 0.0).rgb;

  return applyGlass(
    refracted, uv,
    params.cornerRadius,
    params.fresnelF0, params.envIntensity, params.envMaxMix,
    params.rimWidth, params.rimIntensity,
    bevelNormal3.z, envColor,
  );
}
