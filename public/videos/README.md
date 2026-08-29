# Local card footage

Place optimized, muted loop files in this directory, then set each card's
`videoSrc` in `src/canvas/effects/metadata.ts` to `/videos/<name>.mp4`.

Recommended delivery format:

- 4:3 crop at 960×720
- H.264 MP4, no audio
- 6–10 second seamless loop
- `faststart` enabled

When `videoSrc` is omitted, the existing WebGPU effect remains visible as the
card's procedural placeholder.
