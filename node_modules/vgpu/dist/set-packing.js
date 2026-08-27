import { unsupportedError } from "./errors.js";
/** Packs JS values into the frozen ReflectionFacade host-shareable layout bytes. */
export function writeLayoutValue(layout, value) {
    ensureStaticLayoutSize(layout);
    const bytes = new ArrayBuffer(layout.size);
    writeValue(new DataView(bytes), layout, 0, value);
    return bytes;
}
function ensureStaticLayoutSize(layout) {
    if (layout.size === undefined)
        throw unsupportedError("set", `No se puede inferir byteLength para layout runtime-sized '${layout.name}'.`);
}
function writeValue(view, layout, offset, value) {
    if (layout.members)
        return writeStruct(view, layout.members, offset, value);
    writeLeafValue(view, layout, offset, value);
}
function writeStruct(view, members, base, value) {
    const object = value;
    for (const member of members)
        writeValue(view, member.layout, base + member.offset, object?.[member.name]);
}
function writeLeafValue(view, layout, offset, value) {
    switch (layout.type.kind) {
        case "scalar": return writeScalar(view, offset, layout.type.name, value);
        case "vector": return writeVector(view, offset, layout.type, value);
        case "matrix": return writeMatrix(view, layout, offset, value);
        case "array": return writeArray(view, layout, offset, value);
        default: throw unsupportedError("set", `No hay writer para layout ${layout.type.kind}.`);
    }
}
function writeScalar(view, offset, type, value) {
    if (type === "f32")
        view.setFloat32(offset, Number(value ?? 0), true);
    else if (type === "i32")
        view.setInt32(offset, Number(value ?? 0), true);
    else if (type === "u32" || type === "bool")
        view.setUint32(offset, type === "bool" ? (value ? 1 : 0) : Number(value ?? 0), true);
    else
        view.setUint16(offset, float32ToFloat16(Number(value ?? 0)), true);
}
function writeVector(view, offset, type, value) {
    const values = value;
    const stride = scalarByteSize(type.element);
    for (let i = 0; i < type.width; i++)
        writeScalar(view, offset + i * stride, scalarName(type.element), values?.[i] ?? 0);
}
function writeMatrix(view, layout, offset, value) {
    const matrix = layout.type;
    const values = value;
    const scalar = scalarByteSize(matrix.element);
    const stride = layout.stride ?? 16;
    for (let c = 0; c < matrix.columns; c++)
        for (let r = 0; r < matrix.rows; r++)
            writeScalar(view, offset + c * stride + r * scalar, scalarName(matrix.element), values?.[c * matrix.rows + r] ?? 0);
}
function writeArray(view, layout, offset, value) {
    const values = value;
    const stride = layout.stride ?? layout.element?.size ?? 0;
    if (!layout.element)
        throw unsupportedError("set", "Array layout sin element layout.");
    for (let i = 0; i < (values?.length ?? 0); i++)
        writeValue(view, layout.element, offset + i * stride, values[i]);
}
function scalarByteSize(type) { return scalarName(type) === "f16" ? 2 : 4; }
function scalarName(type) { if (type.kind !== "scalar")
    throw unsupportedError("set", `Expected scalar, got ${type.kind}`); return type.name; }
function float32ToFloat16(value) {
    const float = new Float32Array(1), int = new Uint32Array(float.buffer);
    float[0] = value;
    const x = int[0];
    const sign = (x >> 16) & 0x8000, mantissa = x & 0x007fffff, exponent = (x >> 23) & 0xff;
    if (exponent === 0xff)
        return sign | (mantissa ? 0x7e00 : 0x7c00);
    const halfExponent = exponent - 127 + 15;
    if (halfExponent >= 0x1f)
        return sign | 0x7c00;
    if (halfExponent <= 0)
        return halfExponent < -10 ? sign : sign | ((mantissa | 0x00800000) >> (1 - halfExponent + 13));
    return sign | (halfExponent << 10) | (mantissa >> 13);
}
//# sourceMappingURL=set-packing.js.map