export function pingPong(device, opts) {
    if (isBufferOptions(opts))
        return createBufferPingPong(device, opts);
    return createTexturePingPong(device, opts);
}
function isBufferOptions(opts) {
    return typeof opts.size === "number";
}
function createTexturePingPong(device, opts) {
    let size = cloneTextureSize(opts.size);
    let readIsPing = true;
    let destroyed = false;
    let ping = device.createTexture(textureOptions(opts, size, "ping"));
    let pong = device.createTexture(textureOptions(opts, size, "pong"));
    const destroy = () => {
        if (destroyed)
            return;
        destroyed = true;
        ping.destroy();
        pong.destroy();
    };
    return {
        get read() { return readIsPing ? ping : pong; },
        get write() { return readIsPing ? pong : ping; },
        get size() { return cloneTextureSize(size); },
        swap() { readIsPing = !readIsPing; },
        reset() { readIsPing = true; },
        resize(nextSize) {
            if (destroyed)
                throw new Error("PingPong is destroyed");
            if (sameTextureSize(size, nextSize))
                return false;
            ping.destroy();
            pong.destroy();
            size = cloneTextureSize(nextSize);
            ping = device.createTexture(textureOptions(opts, size, "ping"));
            pong = device.createTexture(textureOptions(opts, size, "pong"));
            readIsPing = true;
            return true;
        },
        destroy,
        [Symbol.dispose]: destroy,
    };
}
function createBufferPingPong(device, opts) {
    let size = opts.size;
    let readIsPing = true;
    let destroyed = false;
    let ping = device.createBuffer(bufferOptions(opts, size, "ping"));
    let pong = device.createBuffer(bufferOptions(opts, size, "pong"));
    const destroy = () => {
        if (destroyed)
            return;
        destroyed = true;
        ping.destroy();
        pong.destroy();
    };
    return {
        get read() { return readIsPing ? ping : pong; },
        get write() { return readIsPing ? pong : ping; },
        get size() { return size; },
        swap() { readIsPing = !readIsPing; },
        reset() { readIsPing = true; },
        resize(nextSize) {
            if (destroyed)
                throw new Error("PingPong is destroyed");
            if (size === nextSize)
                return false;
            ping.destroy();
            pong.destroy();
            size = nextSize;
            ping = device.createBuffer(bufferOptions(opts, size, "ping"));
            pong = device.createBuffer(bufferOptions(opts, size, "pong"));
            readIsPing = true;
            return true;
        },
        destroy,
        [Symbol.dispose]: destroy,
    };
}
function textureOptions(opts, size, half) {
    return { ...opts, size: cloneTextureSize(size), label: label(opts.label, half) };
}
function bufferOptions(opts, size, half) {
    return { ...opts, size, label: label(opts.label, half) };
}
function label(base, half) {
    return base === undefined ? undefined : `${base}.${half}`;
}
function cloneTextureSize(size) {
    return size[2] === undefined ? [size[0], size[1]] : [size[0], size[1], size[2]];
}
function sameTextureSize(a, b) {
    return a[0] === b[0] && a[1] === b[1] && (a[2] ?? 1) === (b[2] ?? 1);
}
//# sourceMappingURL=ping-pong.js.map