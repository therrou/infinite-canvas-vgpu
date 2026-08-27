import { Buffer, Texture } from "@vgpu/core";
import { incompatibleResourceError, textureFilterabilityError } from "./errors.js";
import { assertBufferUsable } from "./lifecycle.js";
import { BINDING_RESOURCE, bindingResourceOf } from "./draw-protocols.js";
let nextSyntheticResourceId = 1;
const syntheticIds = new WeakMap();
export function isPlainValue(value) {
    if (value === null)
        return true;
    if (typeof value !== "object")
        return true;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || Array.isArray(value))
        return true;
    if (value instanceof Buffer || value instanceof Texture)
        return false;
    return !hasAnyResourceShape(value);
}
export function isPlainObject(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
        return false;
    if (value instanceof Buffer || value instanceof Texture)
        return false;
    return !hasAnyResourceShape(value);
}
/** Normalizes resources for the reflected binding kind and rejects incompatible values with vgpu fix-its. */
export function normalizeResource(binding, value, context) {
    switch (binding.bindingLayout?.kind) {
        case "buffer": return normalizeBufferResource(binding, value, context);
        case "texture": return normalizeTextureResource(binding, value, context);
        case "sampler": return normalizeSamplerResource(binding, value);
        case "storageTexture": throw incompatibleResourceError(binding, "storage texture", "Pass a storage-compatible texture.");
        case "externalTexture": throw incompatibleResourceError(binding, "external texture", "Pass a compatible GPUExternalTexture.");
        default: throw incompatibleResourceError(binding, "reflected resource", "Fix shader reflection bindingLayout.");
    }
}
function normalizeBufferResource(binding, value, context) {
    // Nominal protocol, not an instanceof: recognizing a shared uniforms block must not link it.
    const provider = bindingResourceOf(value);
    if (provider)
        return provider[BINDING_RESOURCE](binding, context.sourceHint);
    if (value instanceof Buffer) {
        assertBufferUsable(value, `${context.sourceHint}.set`);
        validateBufferUsage(binding, value.options.usage);
        return { resource: { buffer: value.gpu }, identity: value.resourceIdentity, unsubscribe: (cb) => value.onDestroy(cb) };
    }
    if (isUniformLike(value)) {
        assertBufferUsable(value.buffer, `${context.sourceHint}.set`);
        return { resource: { buffer: value.gpu, offset: 0, size: value.size }, identity: value.buffer.resourceIdentity, unsubscribe: (cb) => value.buffer.onDestroy(cb) };
    }
    if (isGPUBufferBinding(value))
        return { resource: value, identity: syntheticIdentity(value.buffer) };
    if (isRawGPUBuffer(value))
        return { resource: { buffer: value }, identity: syntheticIdentity(value) };
    throw incompatibleResourceError(binding, "buffer", `Pass a compatible Buffer/Uniform: ${binding.name}.set({ ${binding.name}: gpu.device.createBuffer(...) }).`);
}
function normalizeTextureResource(binding, value, context) {
    const target = asTarget(value);
    if (target) {
        const color = target.color;
        validateTextureFilterability(binding, color, context);
        const onTexturesRecreated = target.onTexturesRecreated?.bind(target);
        return { resource: color.createView(), identity: color.resourceIdentity, unsubscribe: (cb) => target.onDestroy(cb), onRecreate: onTexturesRecreated ? (cb) => onTexturesRecreated(cb) : undefined };
    }
    if (value instanceof Texture) {
        validateTextureUsage(binding, value.usage);
        validateTextureFilterability(binding, value, context);
        return { resource: value.createView(), identity: value.resourceIdentity, unsubscribe: (cb) => value.onDestroy(cb) };
    }
    if (isTextureLike(value))
        return { resource: value.createView(), identity: value.resourceIdentity ?? syntheticIdentity(value) };
    if (typeof value === "object" && value !== null)
        return { resource: value, identity: syntheticIdentity(value) };
    throw incompatibleResourceError(binding, "texture/target", `Pass a Texture or Target: ${binding.name}.set({ ${binding.name}: scene.color }) or set({ ${binding.name}: scene }).`);
}
function normalizeSamplerResource(binding, value) {
    if (isSamplerLike(value))
        return { resource: value, identity: syntheticIdentity(value) };
    throw incompatibleResourceError(binding, "sampler", `Use the cached sampler: set({ ${binding.name}: sampler(gpu) }).`);
}
function isSamplerLike(value) {
    if (typeof value !== "object" || value === null)
        return false;
    if (value instanceof Buffer || value instanceof Texture)
        return false;
    return !isRawGPUBuffer(value) && !isGPUBufferBinding(value) && !isTextureLike(value) && !asTarget(value);
}
function validateBufferUsage(binding, usage) {
    const expected = binding.bindingLayout?.kind === "buffer" ? binding.bindingLayout.buffer.type : undefined;
    if (expected === "uniform" && !usage.includes("uniform"))
        throw incompatibleResourceError(binding, "uniform buffer", "Create with usage: ['uniform','copy_dst'].");
    if ((expected === "storage" || expected === "read-only-storage") && !usage.includes("storage"))
        throw incompatibleResourceError(binding, "storage buffer", "Create with usage: ['storage','copy_dst'].");
}
function validateTextureUsage(binding, usage) {
    if (!usage.includes("texture_binding") && !usage.includes("render_attachment")) {
        throw incompatibleResourceError(binding, "sampled texture", "Use texture_binding usage or a sampleable Target.");
    }
}
function validateTextureFilterability(binding, texture, context) {
    if (!context.filterableTexture || context.float32Filterable)
        return;
    if (texture.format === "r32float" || texture.format === "rg32float" || texture.format === "rgba32float") {
        throw textureFilterabilityError(context.sourceHint, binding, texture.format, texture.label ?? "texture", context.pairedSampler);
    }
}
function asTarget(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const record = value;
    if (!record.resourceIdentity || !record.color || typeof record.onDestroy !== "function")
        return undefined;
    return record;
}
function hasAnyResourceShape(value) {
    const record = value;
    return "gpu" in record || "bindGroup" in record || "createView" in record || "resourceIdentity" in record;
}
function syntheticIdentity(value) {
    if (typeof value !== "object" || value === null)
        return `value:${String(value)}`;
    let id = syntheticIds.get(value);
    if (!id) {
        id = { kind: "external", id: nextSyntheticResourceId++ };
        syntheticIds.set(value, id);
    }
    return id;
}
function isUniformLike(value) {
    return typeof value === "object" && value !== null && "gpu" in value && "size" in value && "buffer" in value && value.buffer instanceof Buffer;
}
function isTextureLike(value) {
    return typeof value === "object" && value !== null && typeof value.createView === "function";
}
function isGPUBufferBinding(value) {
    return typeof value === "object" && value !== null && "buffer" in value && isRawGPUBuffer(value.buffer);
}
function isRawGPUBuffer(value) {
    return typeof value === "object" && value !== null && "size" in value && "usage" in value && typeof value.destroy === "function";
}
//# sourceMappingURL=set-resources.js.map