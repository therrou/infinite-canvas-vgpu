import { bufferUsageFlags } from "./gpu-constants.js";
import { isMockGPUBuffer, isMockGPUTexture } from "./mock-gpu-storage.js";
import { textureReadbackFormat } from "./readback.js";
const mockInstrumentationKey = "__vgpuMockInstrumentation";
export function createMockGPUDevice(options = {}) {
    const instrumentation = createMockGPUDeviceInstrumentation();
    const device = {
        [mockInstrumentationKey]: instrumentation,
        limits: createMockSupportedLimits(),
        features: createMockSupportedFeatures(options.features),
        createBuffer(desc) {
            instrumentation.calls.createBuffer += 1;
            instrumentation.createBufferDescriptors.push(desc);
            return createMockBuffer(desc);
        },
        createTexture(desc) {
            const size = textureSize(desc.size);
            // Sized by the real format and layer count (layer-major, mip 0 only) so Texture.read()/readFloats()
            // see the same byte layout as a real device and a write to layer N cannot clobber layer 0.
            const bytes = new Uint8Array(size.width * size.height * size.depthOrArrayLayers * mockBytesPerPixel(desc.format));
            return {
                __vgpuMockBytes: bytes,
                label: desc.label ?? "",
                width: size.width,
                height: size.height,
                depthOrArrayLayers: size.depthOrArrayLayers,
                mipLevelCount: desc.mipLevelCount ?? 1,
                sampleCount: desc.sampleCount ?? 1,
                dimension: desc.dimension ?? "2d",
                format: desc.format,
                usage: desc.usage,
                createView: () => ({}),
                destroy() { },
                // Mock WebGPU texture: only fields touched by core/render tests are implemented.
            };
        },
        createShaderModule() {
            instrumentation.calls.createShaderModule += 1;
            return {};
        },
        createBindGroupLayout(desc) {
            instrumentation.calls.createBindGroupLayout += 1;
            instrumentation.createBindGroupLayoutDescriptors.push(desc);
            return {};
        },
        createPipelineLayout: () => ({}),
        createBindGroup(desc) {
            instrumentation.calls.createBindGroup += 1;
            instrumentation.createBindGroupDescriptors.push(desc);
            return {};
        },
        createSampler: () => ({}),
        createRenderPipeline(desc) {
            instrumentation.calls.createRenderPipeline += 1;
            instrumentation.createRenderPipelineDescriptors.push(desc);
            return {};
        },
        async createRenderPipelineAsync(desc) {
            instrumentation.calls.createRenderPipelineAsync += 1;
            instrumentation.createRenderPipelineAsyncDescriptors.push(desc);
            return {};
        },
        createComputePipeline(desc) {
            instrumentation.calls.createComputePipeline += 1;
            instrumentation.createComputePipelineDescriptors.push(desc);
            return {
                label: desc.label ?? "",
                getBindGroupLayout: (_groupIndex) => ({}),
            };
        },
        createRenderBundleEncoder(desc) {
            instrumentation.calls.createRenderBundleEncoder += 1;
            instrumentation.createRenderBundleEncoderDescriptors.push(desc);
            return {
                setPipeline() { },
                setBindGroup() { },
                setVertexBuffer() { },
                setIndexBuffer() { },
                draw() { },
                drawIndexed() { },
                drawIndirect() { },
                drawIndexedIndirect() { },
                finish: () => ({}),
                // Mock render bundle encoder: only state/draw/finish methods used by render tests are implemented.
            };
        },
        createQuerySet(desc) {
            instrumentation.calls.createQuerySet += 1;
            instrumentation.createQuerySetDescriptors.push(desc);
            return {
                label: desc.label ?? "",
                type: desc.type,
                count: desc.count,
                destroy() { },
                // Mock query set: type/count/label/destroy are enough for timestampWrites and resolveQuerySet paths.
            };
        },
        createCommandEncoder(desc = {}) {
            instrumentation.calls.createCommandEncoder += 1;
            instrumentation.createCommandEncoderDescriptors.push(desc);
            return {
                copyBufferToBuffer(source, sourceOffset, destination, destinationOffset, size) {
                    if (!isMockGPUBuffer(source) || !isMockGPUBuffer(destination))
                        return;
                    const bytes = size ?? source.__vgpuMockBytes.length - sourceOffset;
                    destination.__vgpuMockBytes.set(source.__vgpuMockBytes.subarray(sourceOffset, sourceOffset + bytes), destinationOffset);
                },
                resolveQuerySet(querySet, firstQuery, queryCount, destination, destinationOffset) {
                    if (!isMockGPUBuffer(destination))
                        return;
                    // Deterministic fake query values so map/decode paths are testable end-to-end without a GPU:
                    // query index i resolves to the u64 i * i * 1e6. Read as timestamp ns ticks, a begin/end pair
                    // at indices (2k, 2k + 1) yields a positive, per-pair-distinct delta of (4k + 1) * 1e6 ns = (4k + 1) ms.
                    // Read as occlusion sample counts (zero vs non-zero), index 0 decodes to "hidden" (0) and every
                    // other index to "visible" (non-zero), covering both decode paths.
                    const view = new DataView(destination.__vgpuMockBytes.buffer, destination.__vgpuMockBytes.byteOffset, destination.__vgpuMockBytes.byteLength);
                    for (let i = 0; i < queryCount; i++) {
                        const index = BigInt(firstQuery + i);
                        view.setBigUint64(destinationOffset + i * 8, index * index * 1000000n, true);
                    }
                },
                copyTextureToBuffer() { },
                copyTextureToTexture() { },
                beginComputePass: () => ({ setPipeline() { }, setBindGroup() { }, dispatchWorkgroups() { }, dispatchWorkgroupsIndirect() { }, end() { } }),
                // Mock render pass encoder: only binding/pipeline/draw/bundle/query/end methods used by tests are implemented.
                // setBlendConstant/setStencilReference/setViewport/setScissorRect and beginOcclusionQuery/endOcclusionQuery are deliberately absent from the mock render bundle encoder above, matching WebGPU (drawIndirect/drawIndexedIndirect are present there, also matching WebGPU).
                beginRenderPass: () => ({
                    setBindGroup() { }, setVertexBuffer() { }, setIndexBuffer() { }, setPipeline() { }, setBlendConstant() { }, setStencilReference() { }, setViewport() { }, setScissorRect() { }, executeBundles() { }, draw() { }, drawIndexed() { }, drawIndirect() { }, drawIndexedIndirect() { },
                    // Instrumented no-ops so occlusion scope shape (indices + begin/end pairing) is assertable.
                    beginOcclusionQuery(queryIndex) { instrumentation.occlusionQueryOps.push(["begin", queryIndex]); },
                    endOcclusionQuery() { instrumentation.occlusionQueryOps.push(["end"]); },
                    end() { },
                }),
                finish: () => ({}),
                // Mock command encoder: only copy/render/finish methods used by core/render are implemented.
            };
        },
        destroy() { },
        queue: {
            submit() { },
            writeBuffer(buffer, offset, data, dataOffset = 0, size) {
                if (isMockGPUBuffer(buffer))
                    buffer.__vgpuMockBytes.set(bytesFrom(data).subarray(dataOffset, size ? dataOffset + size : undefined), offset);
            },
            // Row-by-row upload into the mock texel storage, so writeTexture + Texture.read() round-trips
            // on the mock adapter exactly as it does on a real device (bytesPerRow/rowsPerImage padding,
            // origin and array layers included).
            writeTexture(destination, data, dataLayout, size) {
                const texture = destination.texture;
                if (!isMockGPUTexture(texture))
                    return;
                // The mock only stores mip 0; writing another level would silently corrupt it, so say so instead.
                if (destination.mipLevel)
                    throw new Error("createMockGPUDevice: queue.writeTexture only supports mipLevel 0, the mock stores mip 0 only");
                const bytesPerPixel = mockBytesPerPixel(texture.format);
                const extent = textureSize(size);
                const origin = textureOrigin(destination.origin);
                const source = bytesFrom(data);
                const offset = Number(dataLayout.offset ?? 0);
                const rowBytes = extent.width * bytesPerPixel;
                const bytesPerRow = dataLayout.bytesPerRow ?? rowBytes;
                const rowsPerImage = dataLayout.rowsPerImage ?? extent.height;
                const layerBytes = texture.width * texture.height * bytesPerPixel;
                for (let z = 0; z < extent.depthOrArrayLayers; z++) {
                    for (let y = 0; y < extent.height; y++) {
                        const src = offset + (z * rowsPerImage + y) * bytesPerRow;
                        const dst = (origin.z + z) * layerBytes + ((origin.y + y) * texture.width + origin.x) * bytesPerPixel;
                        texture.__vgpuMockBytes.set(source.subarray(src, src + rowBytes), dst);
                    }
                }
            },
            onSubmittedWorkDone: async () => undefined,
        },
        // Mock device: shape is intentionally partial but covers every member used by adapters/tests.
    };
    return device;
}
export function getMockGPUDeviceInstrumentation(device) {
    const instrumentation = device[mockInstrumentationKey];
    if (!instrumentation) {
        throw new Error("GPUDevice was not created by createMockGPUDevice()");
    }
    return instrumentation;
}
export function mockBufferDescriptor(size) {
    return { size, usage: bufferUsageFlags(["copy_src", "copy_dst"]) };
}
function createMockGPUDeviceInstrumentation() {
    return {
        calls: {
            createBuffer: 0,
            createBindGroupLayout: 0,
            createBindGroup: 0,
            createCommandEncoder: 0,
            createRenderBundleEncoder: 0,
            createShaderModule: 0,
            createRenderPipeline: 0,
            createRenderPipelineAsync: 0,
            createComputePipeline: 0,
            createQuerySet: 0,
        },
        createBufferDescriptors: [],
        createBindGroupLayoutDescriptors: [],
        createBindGroupDescriptors: [],
        createCommandEncoderDescriptors: [],
        createRenderBundleEncoderDescriptors: [],
        createRenderPipelineDescriptors: [],
        createRenderPipelineAsyncDescriptors: [],
        createComputePipelineDescriptors: [],
        createQuerySetDescriptors: [],
        occlusionQueryOps: [],
    };
}
function createMockSupportedLimits() {
    return {
        maxTextureDimension1D: 8192,
        maxTextureDimension2D: 8192,
        maxTextureDimension3D: 2048,
        maxTextureArrayLayers: 256,
        maxBindGroups: 4,
        maxBindGroupsPlusVertexBuffers: 24,
        maxBindingsPerBindGroup: 1000,
        maxDynamicUniformBuffersPerPipelineLayout: 8,
        maxDynamicStorageBuffersPerPipelineLayout: 4,
        maxSampledTexturesPerShaderStage: 16,
        maxSamplersPerShaderStage: 16,
        maxStorageBuffersPerShaderStage: 8,
        maxStorageTexturesPerShaderStage: 4,
        maxUniformBuffersPerShaderStage: 12,
        maxUniformBufferBindingSize: 65536,
        maxStorageBufferBindingSize: 134217728,
        minUniformBufferOffsetAlignment: 256,
        minStorageBufferOffsetAlignment: 256,
        maxVertexBuffers: 8,
        maxBufferSize: 268435456,
        maxVertexAttributes: 16,
        maxVertexBufferArrayStride: 2048,
        maxInterStageShaderComponents: 60,
        maxInterStageShaderVariables: 16,
        maxColorAttachments: 8,
        maxColorAttachmentBytesPerSample: 32,
        maxComputeWorkgroupStorageSize: 16384,
        maxComputeInvocationsPerWorkgroup: 256,
        maxComputeWorkgroupSizeX: 256,
        maxComputeWorkgroupSizeY: 256,
        maxComputeWorkgroupSizeZ: 64,
        maxComputeWorkgroupsPerDimension: 65535,
    };
}
function createMockSupportedFeatures(features = []) {
    return new Set(features);
}
function createMockBuffer(desc) {
    const bytes = new Uint8Array(Number(desc.size));
    return {
        __vgpuMockBytes: bytes,
        label: desc.label ?? "",
        size: desc.size,
        usage: desc.usage,
        mapState: "unmapped",
        destroy() { },
        getMappedRange: () => bytes.buffer,
        mapAsync: async () => undefined,
        unmap() { },
        // Mock WebGPU buffer: byte storage plus map/destroy methods are enough for read/write tests.
    };
}
function textureSize(size) {
    if (Array.isArray(size))
        return { width: size[0], height: size[1] ?? 1, depthOrArrayLayers: size[2] ?? 1 };
    const dict = size;
    return { width: dict.width, height: dict.height ?? 1, depthOrArrayLayers: dict.depthOrArrayLayers ?? 1 };
}
function textureOrigin(origin) {
    if (!origin)
        return { x: 0, y: 0, z: 0 };
    if (Array.isArray(origin))
        return { x: origin[0] ?? 0, y: origin[1] ?? 0, z: origin[2] ?? 0 };
    const dict = origin;
    return { x: dict.x ?? 0, y: dict.y ?? 0, z: dict.z ?? 0 };
}
/** Mock texel storage size. Formats without a readback layout (depth/stencil, packed) fall back to 4 bytes. */
function mockBytesPerPixel(format) {
    try {
        return textureReadbackFormat(format, "createMockGPUDevice.createTexture").bytesPerPixel;
    }
    catch {
        return 4;
    }
}
function bytesFrom(data) {
    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
//# sourceMappingURL=mock-gpu.js.map