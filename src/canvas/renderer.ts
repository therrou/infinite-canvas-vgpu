// src/canvas/renderer.ts
import {
  clock,
  draw,
  frame,
  frameLoop,
  geometry,
  init,
  sampler,
  surface,
  target,
  type Draw,
  type Gpu,
  type Surface,
  type Target,
  type Texture,
} from "vgpu";
import { plane } from "vgpu/scene";
import GUI from "lil-gui";

import {
  createCameraRig,
  DEFAULT_ROTATION_DEG,
  DEFAULT_TILT_DEG,
  DEFAULT_ZOOM,
  type CameraRig,
} from "./cameraRig";
import { CARD_EFFECTS, CARD_LENS_SHADER, MATCAP_ENV_SHADER } from "./effects/registry";
import { createInputController, type InputController } from "./inputController";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  INSTANCE_COLS,
  INSTANCE_ROWS,
  INSTANCES_PER_EFFECT,
  PERIOD_HEIGHT,
  PERIOD_WIDTH,
  cardCandidatesInView,
  effectUnitOffset,
  wrapOffset,
} from "./layout";

export interface VisibleCard {
  readonly key: string;
  readonly effectIndex: number;
  readonly worldX: number;
  readonly worldZ: number;
}

export interface InfiniteCanvasRenderer {
  readonly ready: Promise<void>;
  getViewProjection(): Float32Array | undefined;
  getVisibleCards(): readonly VisibleCard[];
  dispose(): void;
}

/**
 * object-fit: cover, expressed as a UV scale+offset: shrinks the sampled UV
 * range toward the center on whichever axis the video is relatively wider
 * (or taller) than the card, so footage fills the card without stretching.
 */
function coverUvTransform(cardAspect: number, mediaAspect: number) {
  if (mediaAspect > cardAspect) {
    const scaleX = cardAspect / mediaAspect;
    return { scaleX, scaleY: 1, offsetX: (1 - scaleX) / 2, offsetY: 0 };
  }
  const scaleY = mediaAspect / cardAspect;
  return { scaleX: 1, scaleY, offsetX: 0, offsetY: (1 - scaleY) / 2 };
}

function responsiveZoomForViewport(width: number, height: number): number {
  const safeWidth = Math.max(width, 1);
  const densityProgress = Math.min(Math.max((safeWidth - 700) / 500, 0), 1);
  const tilesAcross = 1.3 + densityProgress * 1.1;
  return (CARD_WIDTH * Math.max(height, 1) * tilesAcross) / (2 * safeWidth);
}

export function createInfiniteCanvasRenderer(canvas: HTMLCanvasElement): InfiniteCanvasRenderer {
  let disposed = false;
  let gpu: Gpu | undefined;
  let output: Surface | undefined;
  let cameraRig: CameraRig | undefined;
  let inputController: InputController | undefined;
  let detachInput: (() => void) | undefined;
  let loopHandle: { stop(): void } | undefined;
  let artworkDraws: Draw[] = [];
  let artworkTargets: Target[] = [];
  let lensDraws: Draw[] = [];
  let videoElements: (HTMLVideoElement | undefined)[] = [];
  let videoTextures: (Texture | undefined)[] = [];
  let videoCovers: { scaleX: number; scaleY: number; offsetX: number; offsetY: number }[] = [];
  let lastPan = { x: 0, z: 0 };
  let lastZoom = DEFAULT_ZOOM;
  let lastAspect = 1;
  let responsiveZoom = DEFAULT_ZOOM;
  let cleanupResize: (() => void) | undefined;

  const tuning = {
    zoomFactor: 1,
    tiltDeg: DEFAULT_TILT_DEG,
    rotationDeg: DEFAULT_ROTATION_DEG,
    spacingScale: 1,
    bulgeStrength: 0.5,
    bulgeStart: 0.58,
    aberration: 0.045,
    aberrationStart: 0.6,
    cornerRadius: 0.3,
    // Values below mirror the reference site's real glass material defaults
    // (fresnelF0/envIntensity/envMaxMix) where our approximation shares the
    // same role; rimWidth/rimIntensity are re-tuned for our normalized
    // (-1..1) distance-field units instead of their world-space plane size.
    fresnelF0: 0.045,
    envIntensity: 3,
    envMaxMix: 0.5,
    rimWidth: 0.035,
    rimIntensity: 0.2,
  };
  let gui: GUI | undefined;

  const initialize = async () => {
    const nextGpu = await init();
    gpu = nextGpu;
    if (disposed) {
      nextGpu.dispose();
      return;
    }

    output = surface(gpu, canvas, { dpr: [1, 2] });
    lastAspect = output.size[0] / output.size[1];
    responsiveZoom = responsiveZoomForViewport(canvas.clientWidth, canvas.clientHeight);
    cameraRig = createCameraRig(lastAspect, responsiveZoom);
    inputController = createInputController();
    detachInput = inputController.attach(canvas);

    const guiContainer = canvas.parentElement ?? undefined;
    const debugPanelEnabled = new URLSearchParams(window.location.search).get("debugpanel") === "1";
    if (guiContainer && debugPanelEnabled) {
      gui = new GUI({ title: "Liquid Glass Lab", container: guiContainer, width: 280 });
      gui.domElement.style.setProperty("--width", "min(280px, calc(100vw - 24px))");
      Object.assign(gui.domElement.style, {
        position: "absolute",
        top: "clamp(8px, 2vw, 16px)",
        right: "clamp(8px, 2vw, 16px)",
        left: "auto",
        maxWidth: "calc(100vw - 16px)",
        margin: "0",
        zIndex: "10",
      });
      const glass = gui.addFolder("Liquid Glass");
      glass.add(tuning, "bulgeStrength", 0, 0.6, 0.005).name("Refraction");
      glass.add(tuning, "bulgeStart", 0.2, 0.95, 0.01).name("Refraction Start");
      glass.add(tuning, "aberration", 0, 0.08, 0.001).name("Aberration");
      glass.add(tuning, "aberrationStart", 0.2, 0.95, 0.01).name("Aberration Start");
      glass.add(tuning, "cornerRadius", 0.05, 0.5, 0.01).name("Corner Radius");
      glass.add(tuning, "fresnelF0", 0, 0.3, 0.005).name("Fresnel F0");
      glass.add(tuning, "envIntensity", 0, 6, 0.05).name("Env Intensity");
      glass.add(tuning, "envMaxMix", 0, 1, 0.01).name("Env Max Mix");
      glass.add(tuning, "rimWidth", 0, 0.15, 0.002).name("Rim Width");
      glass.add(tuning, "rimIntensity", 0, 1, 0.01).name("Rim Intensity");
      const scene = gui.addFolder("Scene");
      scene.add(tuning, "zoomFactor", 0.7, 1.5, 0.01).name("Zoom");
      scene.add(tuning, "tiltDeg", 65, 90, 1).name("Tilt");
      scene.add(tuning, "rotationDeg", -12, 12, 1).name("Rotation");
      scene.add(tuning, "spacingScale", 0.5, 2.5, 0.05).name("Spacing");
      scene.close();
      if (window.matchMedia("(max-width: 600px)").matches) {
        gui.close();
      }
    }

    const artworkGeometry = geometry(gpu, plane({ width: 2, height: 2 }));
    const cardGeometry = geometry(gpu, plane({ width: CARD_WIDTH, height: CARD_HEIGHT }));
    const artworkSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
    });

    artworkTargets = CARD_EFFECTS.map(() =>
      target(gpu!, { size: [768, 530] })
    );
    artworkDraws = CARD_EFFECTS.map((effect) =>
      draw(gpu!, {
        shader: effect.artworkShader,
        geometry: artworkGeometry,
      })
    );

    // For cards with real footage, the video's decoded frames are copied into a GPU texture
    // each frame and fed into the same card-lens shader as the "artwork" input the procedural
    // effects use — so real footage gets the exact same refraction/dispersion/reflection
    // treatment instead of sitting on top as a separate flat DOM overlay.
    //
    // Videos are NOT created/loaded up front: with 10+ clips at several MB each, downloading
    // and decoding all of them at init would dominate load time for effects nobody has
    // scrolled to yet. Instead `ensureVideoForEffect` lazily creates+plays a video the first
    // time its effect becomes visible (see the frameLoop below), and exited effects are only
    // paused (buffered data kept) so re-entering the viewport resumes instantly.
    const cardAspect = CARD_WIDTH / CARD_HEIGHT;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    videoCovers = CARD_EFFECTS.map(() => ({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }));
    videoTextures = CARD_EFFECTS.map(() => undefined);
    videoElements = CARD_EFFECTS.map(() => undefined);

    const ensureVideoForEffect = (index: number) => {
      if (videoElements[index]) return;
      if (prefersReducedMotion) return;
      const effect = CARD_EFFECTS[index];
      if (!effect.videoSrc) return;

      const video = document.createElement("video");
      video.src = effect.videoSrc;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.style.display = "none";
      video.addEventListener("loadedmetadata", () => {
        if (disposed) return;
        videoTextures[index] = gpu!.device.createTexture({
          size: [video.videoWidth, video.videoHeight],
          format: "rgba8unorm",
          usage: ["texture_binding", "copy_dst", "render_attachment"],
          label: `video-artwork-${index}`,
        });
        videoCovers[index] = coverUvTransform(cardAspect, video.videoWidth / video.videoHeight);
      });
      document.body.appendChild(video);
      video.play().catch(() => {});
      videoElements[index] = video;
    };

    // Rendered once: a static "studio softbox" matcap sampled by the glass
    // shader's bevel normal to stand in for a real environment reflection.
    const envMapTarget = target(gpu, { size: [128, 128] });
    const envMapDraw = draw(gpu, {
      shader: MATCAP_ENV_SHADER,
      geometry: artworkGeometry,
    });
    const envMapSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
    });
    frame(gpu, (currentFrame) => {
      currentFrame.pass({ target: envMapTarget, clear: [0, 0, 0, 1] }, (pass) => {
        pass.draw(envMapDraw);
      });
    });
    lensDraws = CARD_EFFECTS.map(() => {
      const lensDraw = draw(gpu!, {
        shader: CARD_LENS_SHADER,
        geometry: cardGeometry,
        instances: INSTANCES_PER_EFFECT,
        // applyGlass() outputs premultiplied alpha so the rim can fade to reveal
        // whatever is behind the card instead of the edge looking painted opaque.
        blend: "premultiplied",
      });
      return lensDraw;
    });

    const unsubscribeResize = output.onResize(({ width, height }) => {
      lastAspect = width / height;
      responsiveZoom = responsiveZoomForViewport(canvas.clientWidth, canvas.clientHeight);
      cameraRig?.setAspect(lastAspect);
    });

    const time = clock(gpu);
    let lastFrameTime = performance.now();
    let previousVisibleEffectIndexes = new Set<number>();

    loopHandle = frameLoop(gpu, (currentFrame) => {
      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 1 / 15);
      lastFrameTime = now;

      const targetZoom = responsiveZoom * tuning.zoomFactor;
      inputController!.setZoom(targetZoom);
      const input = inputController!.tick(dt);
      cameraRig!.setOrientation(tuning.tiltDeg, tuning.rotationDeg);
      cameraRig!.update(input.pointerNdcX, input.pointerNdcY, targetZoom, dt);
      lastPan = { x: input.panX, z: input.panZ };
      lastZoom = targetZoom;

      const scaledPeriodWidth = PERIOD_WIDTH * tuning.spacingScale;
      const scaledPeriodHeight = PERIOD_HEIGHT * tuning.spacingScale;
      const localOffsetX = wrapOffset(input.panX, scaledPeriodWidth);
      const localOffsetZ = wrapOffset(input.panZ, scaledPeriodHeight);
      const viewProjection = cameraRig!.camera.viewProjection;

      const visibleEffectIndexes = new Set(
        cardCandidatesInView(
          input.panX,
          input.panZ,
          tuning.spacingScale,
          targetZoom * lastAspect,
          targetZoom
        ).map((card) => card.effectIndex)
      );
      for (const index of visibleEffectIndexes) {
        ensureVideoForEffect(index);
      }
      for (const index of previousVisibleEffectIndexes) {
        if (visibleEffectIndexes.has(index)) continue;
        videoElements[index]?.pause();
      }
      for (const index of visibleEffectIndexes) {
        const video = videoElements[index];
        if (video?.paused) video.play().catch(() => {});
      }
      previousVisibleEffectIndexes = visibleEffectIndexes;

      for (const [index] of CARD_EFFECTS.entries()) {
        const video = videoElements[index];
        const videoTexture = videoTextures[index];
        const videoReady = video !== undefined && videoTexture !== undefined && video.readyState >= 2;

        if (videoReady) {
          gpu!.device.gpu.queue.copyExternalImageToTexture(
            { source: video },
            { texture: videoTexture.gpu },
            [video.videoWidth, video.videoHeight],
          );
        } else {
          artworkDraws[index].set({
            params: { time: time.time },
          });
          currentFrame.pass(
            { target: artworkTargets[index], clear: [0, 0, 0, 1] },
            (pass) => {
              pass.draw(artworkDraws[index]);
            }
          );
        }

        const cover = videoCovers[index];
        const unit = effectUnitOffset(index);
        lensDraws[index].set({
          camera: { viewProjection },
          artwork: videoReady ? videoTexture : artworkTargets[index],
          artworkSampler,
          envMap: envMapTarget,
          envMapSampler,
          params: {
            localOffsetX,
            localOffsetZ,
            artworkCoverScaleX: cover.scaleX,
            artworkCoverScaleY: cover.scaleY,
            artworkCoverOffsetX: cover.offsetX,
            artworkCoverOffsetY: cover.offsetY,
            unitOffsetX: unit.x * tuning.spacingScale,
            unitOffsetZ: unit.z * tuning.spacingScale,
            periodWidth: scaledPeriodWidth,
            periodHeight: scaledPeriodHeight,
            instanceCols: INSTANCE_COLS,
            instanceRows: INSTANCE_ROWS,
            aberration: tuning.aberration,
            aberrationStart: tuning.aberrationStart,
            bulgeStrength: tuning.bulgeStrength,
            bulgeStart: tuning.bulgeStart,
            cornerRadius: tuning.cornerRadius,
            fresnelF0: tuning.fresnelF0,
            envIntensity: tuning.envIntensity,
            envMaxMix: tuning.envMaxMix,
            rimWidth: tuning.rimWidth,
            rimIntensity: tuning.rimIntensity,
          },
        });
      }

      currentFrame.pass({ target: output!, clear: [0.004, 0.006, 0.016, 1] }, (pass) => {
        for (const lensDraw of lensDraws) {
          pass.draw(lensDraw);
        }
      });
    });

    return () => {
      unsubscribeResize();
    };
  };

  const readyPromise = initialize().then((cleanup) => {
    cleanupResize = cleanup;
  });

  return {
    ready: readyPromise,
    getViewProjection() {
      return cameraRig?.camera.viewProjection;
    },
    getVisibleCards(): readonly VisibleCard[] {
      return cardCandidatesInView(
        lastPan.x,
        lastPan.z,
        tuning.spacingScale,
        lastZoom * lastAspect,
        lastZoom
      ).map(({ effectIndex, instanceIndex, x, z }) => ({
        key: `${effectIndex}:${instanceIndex}`,
        effectIndex,
        worldX: x,
        worldZ: z,
      }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loopHandle?.stop();
      detachInput?.();
      cleanupResize?.();
      gui?.destroy();
      for (const video of videoElements) {
        if (!video) continue;
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      }
      for (const texture of videoTextures) {
        texture?.dispose();
      }
      gpu?.dispose();
    },
  };
}
