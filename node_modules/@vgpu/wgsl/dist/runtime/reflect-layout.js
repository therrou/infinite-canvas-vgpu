import { arrayLengthError, boolHostShareableError, unknownTypeError, unsupportedTypeError } from "./diagnostics.js";
import { DEFAULT_LAYOUT_MODE } from "./reflect-types.js";
import { resolveAliasesDeep, unwrapAlias } from "./reflect-symbols.js";
import { isLiteralArrayCount, roundUp, scalarSize } from "./reflect-utils.js";
import { typeName } from "./reflect-token-utils.js";
/**
 * Calculates naga-standard host-shareable layout metadata for uniform/storage values.
 * `bool` is rejected because WGSL booleans are not host-shareable, and runtime arrays report
 * `runtimeSized` with no fixed byte size so callers can provide the final binding size manually.
 */
export function layoutOf(type, addressSpace, name = typeName(type), mangledName = name, registry) {
    const resolved = registry ? resolveAliasesDeep(type, registry) : type;
    return layoutResolvedType(resolved, addressSpace, name, mangledName, registry);
}
function layoutResolvedType(type, addressSpace, name, mangledName, registry) {
    switch (type.kind) {
        case "scalar":
            return layoutScalar(type, addressSpace, name, mangledName);
        case "atomic":
            return layoutAtomic(type, addressSpace, name, mangledName);
        case "vector":
            return layoutVector(type, addressSpace, name, mangledName, registry);
        case "matrix":
            return layoutMatrix(type, addressSpace, name, mangledName, registry);
        case "array":
            return layoutArray(type, addressSpace, name, mangledName, registry);
        case "identifier":
            return layoutStruct(type, addressSpace, name, mangledName, registry);
        default:
            throw unsupportedTypeError(typeName(type));
    }
}
function layoutScalar(type, addressSpace, name, mangledName) {
    const size = scalarSize(type.name);
    if (type.name === "bool")
        throw boolHostShareableError();
    return { name, mangledName, addressSpace, layoutMode: DEFAULT_LAYOUT_MODE, type, align: size, size };
}
function layoutAtomic(type, addressSpace, name, mangledName) {
    return { name, mangledName, addressSpace, layoutMode: DEFAULT_LAYOUT_MODE, type, align: 4, size: 4 };
}
function layoutVector(type, addressSpace, name, mangledName, registry) {
    const element = layoutOf(type.element, addressSpace, name, mangledName, registry);
    const scalar = element.size ?? 4;
    const align = type.width === 2 ? scalar * 2 : scalar * 4;
    return { name, mangledName, addressSpace, layoutMode: DEFAULT_LAYOUT_MODE, type, align, size: scalar * type.width };
}
function layoutMatrix(type, addressSpace, name, mangledName, registry) {
    const column = { kind: "vector", width: type.rows, element: type.element };
    const columnLayout = layoutOf(column, addressSpace, `${name}[]`, `${mangledName}[]`, registry);
    const stride = roundUp(columnLayout.align, columnLayout.size ?? 0);
    return { name, mangledName, addressSpace, layoutMode: DEFAULT_LAYOUT_MODE, type, align: columnLayout.align, size: stride * type.columns, stride, element: columnLayout };
}
function layoutArray(type, addressSpace, name, mangledName, registry) {
    validateArrayCount(type.countExpression);
    const element = layoutOf(type.element, addressSpace, `${name}[]`, `${mangledName}[]`, registry);
    const stride = roundUp(requiredAlign(type.element, addressSpace, registry), element.size ?? 0);
    return {
        name,
        mangledName,
        addressSpace,
        layoutMode: DEFAULT_LAYOUT_MODE,
        type,
        align: requiredAlign(type, addressSpace, registry),
        size: type.count === undefined ? undefined : stride * type.count,
        stride,
        element,
        runtimeSized: type.count === undefined,
    };
}
function validateArrayCount(countExpression) {
    if (countExpression !== undefined && !isLiteralArrayCount(countExpression)) {
        throw arrayLengthError();
    }
}
function layoutStruct(type, addressSpace, name, mangledName, registry) {
    if (!registry)
        throw unknownTypeError(type.name, "<unknown>");
    const struct = registry.structs.get(type.mangledName ?? type.name);
    if (!struct)
        throw unknownTypeError(type.name, "<unknown>");
    const members = [];
    let offset = 0;
    let maxAlign = 1;
    for (const member of struct.members) {
        const laidOut = layoutStructMember(member, addressSpace, offset, registry);
        members.push(laidOut.member);
        offset = advanceStructOffset(addressSpace, member.type, laidOut.offset, laidOut.member.size ?? 0, registry);
        maxAlign = Math.max(maxAlign, laidOut.member.align);
    }
    const align = structAlign(addressSpace, maxAlign);
    return { name, mangledName, addressSpace, layoutMode: DEFAULT_LAYOUT_MODE, type, align, size: roundUp(align, offset), members };
}
function layoutStructMember(member, addressSpace, currentOffset, registry) {
    const memberLayout = layoutOf(member.type, addressSpace, member.name, member.name, registry);
    const align = Math.max(requiredAlign(member.type, addressSpace, registry), member.align ?? 1);
    const size = Math.max(memberLayout.size ?? 0, member.size ?? 0);
    const offset = roundUp(align, currentOffset);
    return {
        member: { name: member.name, offset, align, size, type: member.type, layout: memberLayout, explicitAlign: member.align, explicitSize: member.size },
        offset,
    };
}
function advanceStructOffset(addressSpace, memberType, offset, size, registry) {
    // WGSL uniform structs add 16-byte trailing padding after nested struct members.
    return offset + (addressSpace === "uniform" && isStructType(memberType, registry) ? roundUp(16, size) : size);
}
function isStructType(type, registry) {
    const unwrapped = unwrapAlias(type, registry);
    return unwrapped.kind === "identifier" && registry.structs.has(unwrapped.mangledName ?? unwrapped.name);
}
function structAlign(addressSpace, maxNaturalAlign) {
    return addressSpace === "uniform" ? roundUp(16, maxNaturalAlign) : maxNaturalAlign;
}
function requiredAlign(type, addressSpace, registry) {
    const resolved = registry ? unwrapAlias(type, registry) : type;
    const natural = naturalAlign(resolved, addressSpace, registry);
    return addressSpace === "uniform" && requiresUniformSixteenByteAlign(resolved, registry) ? roundUp(16, natural) : natural;
}
function requiresUniformSixteenByteAlign(type, registry) {
    return type.kind === "array" || (type.kind === "identifier" && !!registry?.structs.get(type.mangledName ?? type.name));
}
function naturalAlign(type, addressSpace, registry) {
    const resolved = registry ? unwrapAlias(type, registry) : type;
    switch (resolved.kind) {
        case "scalar":
            return naturalScalarAlign(resolved.name);
        case "atomic":
            return 4;
        case "vector":
            return resolved.width === 2 ? naturalAlign(resolved.element, addressSpace, registry) * 2 : naturalAlign(resolved.element, addressSpace, registry) * 4;
        case "matrix":
            return naturalAlign({ kind: "vector", width: resolved.rows, element: resolved.element }, addressSpace, registry);
        case "array":
            return requiredAlign(resolved.element, addressSpace, registry);
        case "identifier":
            return naturalStructAlign(resolved, addressSpace, registry);
        default:
            throw unsupportedTypeError(typeName(resolved));
    }
}
function naturalScalarAlign(name) {
    if (name === "bool")
        throw boolHostShareableError();
    return scalarSize(name);
}
function naturalStructAlign(type, addressSpace, registry) {
    const struct = registry?.structs.get(type.mangledName ?? type.name);
    if (!struct)
        throw unknownTypeError(type.name, "<unknown>");
    return Math.max(1, ...struct.members.map((member) => Math.max(requiredAlign(member.type, addressSpace, registry), member.align ?? 1)));
}
//# sourceMappingURL=reflect-layout.js.map