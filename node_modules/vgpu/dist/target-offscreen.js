import { createResourceIdentity, DestroySignal } from "@vgpu/core";
import { BUILT_IN_CLEAR_COLOR, colorAttachment, copyClearColor, colorSpecsFor, depthAttachment, depthFormatFor, sampleCountFor, sameSize, validateClearColor, validateTargetOptions } from "./target-utils.js";
import { liveKernel } from "./live-kernel.js";
/**
 * Offscreen render target: color attachments (plus optional depth and MSAA) sized in pixels.
 *
 * Its textures belong to the gpu's device, so `gpu.dispose()` releases them with the device; the
 * target is not registered as a separate kernel resource because there is nothing to tear down
 * ahead of the device — unlike a surface, which must unconfigure its canvas context first.
 */
export function target(gpu, opts) {
    return new OffscreenTarget(liveKernel(gpu, "target").device, opts);
}
/** Offscreen render target. MSAA targets render into sampleCount=4 attachments and resolve into `.color`. */
export class OffscreenTarget {
    device;
    options;
    resourceIdentity = createResourceIdentity("render-target");
    #destroySignal = new DestroySignal();
    #texturesRecreatedCallbacks = new Set();
    #currentSize;
    #currentColors;
    #currentMsaaColors;
    #currentDepth;
    #clearColor;
    constructor(device, options) {
        this.device = device;
        this.options = options;
        validateTargetOptions(options, device);
        this.#clearColor = options.clearColor === undefined ? BUILT_IN_CLEAR_COLOR : validateClearColor(options.clearColor, "target.clearColor");
        this.#currentSize = options.size;
        this.#currentColors = this.#createResolvedColors();
        this.#currentMsaaColors = this.sampleCount === 4 ? this.#createMsaaColors() : undefined;
        this.#currentDepth = this.#createDepth();
    }
    get gpu() { return this.color.gpu; }
    get size() { return this.#currentSize; }
    get texelSize() { return [1 / this.#currentSize[0], 1 / this.#currentSize[1]]; }
    /** Resolved, sampleable color texture. For MSAA targets, render passes resolve into this texture. */
    get color() { return this.#currentColors[0]; }
    /** Resolved, sampleable color textures. For MSAA targets, render passes resolve into these textures. */
    get colors() { return this.#currentColors; }
    get depth() { return this.#currentDepth; }
    get format() { return colorSpecsFor(this.options)[0]?.format ?? "rgba8unorm"; }
    /** Default clear color of this target; passes that clear without naming a color use it. */
    get clearColor() { return copyClearColor(this.#clearColor); }
    set clearColor(value) { this.#clearColor = validateClearColor(value, "target.clearColor"); }
    get sampleCount() { return sampleCountFor(this.options); }
    resize(size) {
        if (sameSize(this.#currentSize, size))
            return;
        this.#recreateTextures(size);
    }
    async read() { return this.color.read(); }
    async readFloats() { return this.color.readFloats(); }
    onDestroy(cb) { return this.#destroySignal.onDestroy(this, cb); }
    onTexturesRecreated(cb) { this.#texturesRecreatedCallbacks.add(cb); return () => { this.#texturesRecreatedCallbacks.delete(cb); }; }
    destroy() { this.#destroySignal.emit(this); this.#texturesRecreatedCallbacks.clear(); this.#destroyTextures(); }
    renderPassDescriptor(opts = {}) {
        const { clear = [0, 0, 0, 1], preserve, clearDepth, clearStencil, depthReadOnly } = opts;
        return {
            colorAttachments: this.#currentColors.map((resolved, index) => colorAttachment(resolved, this.#currentMsaaColors?.[index], clear, preserve)),
            depthStencilAttachment: this.#currentDepth ? depthAttachment(this.#currentDepth, preserve, clearDepth, clearStencil, depthReadOnly) : undefined,
        };
    }
    #recreateTextures(size) {
        this.#destroyTextures();
        this.#currentSize = [size[0], size[1]];
        this.#currentColors = this.#createResolvedColors();
        this.#currentMsaaColors = this.sampleCount === 4 ? this.#createMsaaColors() : undefined;
        this.#currentDepth = this.#createDepth();
        this.#emitTexturesRecreated();
    }
    #emitTexturesRecreated() {
        for (const cb of [...this.#texturesRecreatedCallbacks])
            cb();
    }
    #destroyTextures() {
        for (const texture of this.#currentColors)
            texture.destroy();
        for (const texture of this.#currentMsaaColors ?? [])
            texture.destroy();
        this.#currentDepth?.destroy();
    }
    #createResolvedColors() {
        return colorSpecsFor(this.options).map((spec, index) => this.device.createTexture({
            size: this.#currentSize,
            format: spec.format,
            usage: ["render_attachment", "texture_binding", "copy_src"],
            sampleCount: 1,
            label: this.options.label ? `${this.options.label}.color${index}.resolve` : undefined,
        }));
    }
    #createMsaaColors() {
        return colorSpecsFor(this.options).map((spec, index) => this.device.createTexture({
            size: this.#currentSize,
            format: spec.format,
            usage: ["render_attachment"],
            sampleCount: 4,
            label: this.options.label ? `${this.options.label}.color${index}` : undefined,
        }));
    }
    #createDepth() {
        const format = depthFormatFor(this.options);
        // texture_binding lets read-only depth passes bind `target.depth` as a sampled texture in the same pass.
        return format ? this.device.createTexture({
            size: this.#currentSize,
            format,
            usage: ["render_attachment", "texture_binding"],
            sampleCount: this.sampleCount,
            label: this.options.label ? `${this.options.label}.depth` : undefined,
        }) : undefined;
    }
}
//# sourceMappingURL=target-offscreen.js.map