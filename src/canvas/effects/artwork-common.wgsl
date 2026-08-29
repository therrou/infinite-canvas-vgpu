export struct ArtworkVertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

export fn artworkVertex(position: vec3f, uv: vec2f) -> ArtworkVertexOut {
  var out: ArtworkVertexOut;
  out.position = vec4f(position.x, position.z, 0.0, 1.0);
  out.uv = uv;
  return out;
}
