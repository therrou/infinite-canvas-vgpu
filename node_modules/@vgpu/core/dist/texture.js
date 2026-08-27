import { ValidationError } from "./errors.js";
import { textureUsageFlags } from "./gpu-constants.js";
import { isMockGPUTexture } from "./mock-gpu-storage.js";
import { decodeTextureFloats, readMockTextureBytes, textureReadbackFormat } from "./readback.js";
import { createResourceIdentity, DestroySignal } from "./resource-lifecycle.js";
const textureBrand = Symbol.for("vgpu/Texture");
const textureResizeLock = Symbol.for("vgpu/Texture/resizeLock");
export class Texture {
    device;
    ownership;
    [textureBrand] = true;
    destroySignal = new DestroySignal();
    identity = createResourceIdentity("texture");
    currentGpu;
    currentOptions;
    defaultView = null;
    resizeLock;
    destroyed = false;
    constructor(device, gpu, options, ownership = "owned") {
        this.device = device;
        this.ownership = ownership;
        this.currentGpu = gpu;
        this.currentOptions = options;
        Object.defineProperty(this, textureResizeLock, {
            value: (reason) => { this.resizeLock = reason; },
        });
    }
    get gpu() { return this.currentGpu; }
    get options() { return this.currentOptions; }
    get size() { return this.options.size; }
    get format() { return this.options.format; }
    get usage() { return this.options.usage; }
    get mipLevelCount() { return this.options.mipLevelCount ?? 1; }
    get sampleCount() { return this.options.sampleCount ?? 1; }
    get dimension() { return this.options.dimension ?? "2d"; }
    get viewFormats() { return this.options.viewFormats ?? []; }
    get label() { return this.options.label; }
    get resourceIdentity() { return this.identity; }
    onDestroy(cb) {
        return this.destroySignal.onDestroy(this, cb);
    }
    get view() {
        this.assertAlive();
        this.defaultView ??= this.createView();
        return this.defaultView;
    }
    createView(desc) {
        this.assertAlive("Texture.createView");
        return this.gpu.createView(desc);
    }
    resize(size) {
        this.assertAlive();
        if (this.ownership === "external") {
            throw new ValidationError({
                code: "VGPU-CORE-EXTERNAL-TEXTURE",
                message: "Texture wraps an externally owned GPUTexture and cannot be resized.",
                where: "Texture.resize",
            });
        }
        if (this.resizeLock) {
            throw new ValidationError({
                code: "VGPU-CORE-TEXTURE-RESIZE-LOCKED",
                message: this.resizeLock,
                where: "Texture.resize",
            });
        }
        const currentDepth = this.options.size[2] ?? 1;
        const nextDepth = size[2] ?? currentDepth;
        if (this.options.size[0] === size[0] && this.options.size[1] === size[1] && currentDepth === nextDepth)
            return false;
        const nextSize = size[2] === undefined && this.options.size[2] === undefined
            ? [size[0], size[1]]
            : [size[0], size[1], nextDepth];
        const nextOptions = { ...this.options, size: nextSize };
        const oldGpu = this.gpu;
        this.currentGpu = this.device.gpu.createTexture(toGPUTextureDescriptor(nextOptions));
        this.currentOptions = nextOptions;
        this.defaultView = null;
        oldGpu.destroy();
        return true;
    }
    /**
     * Raw, unpadded texel bytes in this texture's own format (row stride padding removed).
     * `byteLength` is `width * height * bytesPerPixel(format)`; `bgra*` bytes are swizzled to RGBA order.
     * Use `readFloats()` for float formats to get decoded component values.
     */
    async read() {
        this.assertAlive("Texture.read");
        // Validated before the mock branch: a mock device must reject the same formats a real one does.
        const info = textureReadbackFormat(this.options.format, "Texture.read");
        if (isMockGPUTexture(this.gpu))
            return readMockTextureBytes(this.gpu.__vgpuMockBytes, this.options.size, info);
        const result = await this.device.readback.readTexture(this.gpu, this.options.size, this.options.format);
        // Re-checked after the await: a retained external device can be destroyed mid-readback.
        this.assertAlive("Texture.read");
        return result;
    }
    /**
     * Texel components decoded to f32, row-major, `width * height * components(format)` long.
     * `float16`/`float32` formats keep their HDR values (no clamping); `unorm8` formats are
     * normalized to `[0, 1]` without srgb gamma conversion.
     */
    async readFloats() {
        // Validate before the copy so an unsupported format never allocates a staging buffer.
        textureReadbackFormat(this.options.format, "Texture.readFloats");
        return decodeTextureFloats(await this.read(), this.options.format);
    }
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.defaultView = null;
        this.destroySignal.emit(this);
        if (this.ownership === "external")
            return;
        if (!isMockGPUTexture(this.gpu))
            this.gpu.destroy();
    }
    dispose() {
        this.destroy();
    }
    assertAlive(where = "Texture") {
        if (this.destroyed)
            throw new ValidationError({ code: "VGPU-CORE-TEXTURE-DESTROYED", message: "Texture is destroyed", where });
        this.device.assertUsable?.(where);
    }
}
export function toGPUTextureDescriptor(opts) {
    const desc = {
        label: opts.label,
        size: { width: opts.size[0], height: opts.size[1], depthOrArrayLayers: opts.size[2] ?? 1 },
        format: opts.format,
        usage: textureUsageFlags(opts.usage),
    };
    if (opts.mipLevelCount !== undefined)
        desc.mipLevelCount = opts.mipLevelCount;
    if (opts.sampleCount !== undefined)
        desc.sampleCount = opts.sampleCount;
    if (opts.dimension !== undefined)
        desc.dimension = opts.dimension;
    if (opts.viewFormats !== undefined)
        desc.viewFormats = [...opts.viewFormats];
    return desc;
}
//# sourceMappingURL=texture.js.map