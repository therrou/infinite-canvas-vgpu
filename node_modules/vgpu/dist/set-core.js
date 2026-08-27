import { bindGroupLayoutMetadata, bindGroupMetadataFor } from "@vgpu/core";
import { identityKey } from "./bind-cache.js";
import { entryMetadata } from "./entry-metadata.js";
import { claimedGroupIncompatibleError, claimedGroupSetError, neverSetError, ownershipFlipError, unsupportedError } from "./errors.js";
import { isPlainObject, isPlainValue, normalizeResource } from "./set-resources.js";
import { writeLayoutValue } from "./set-packing.js";
/** Creates the per-Draw binding state machine used by Effect/Draw.set(). */
export function createSetCore(options) {
    const bindings = initializeBindings(options.reflection);
    const groups = [...options.bindGroupLayouts.keys()].sort((a, b) => a - b);
    const claimedGroups = new Map();
    function set(values) {
        const changes = [];
        for (const [name, value] of Object.entries(values))
            changes.push(...setNamedValue(name, value));
        return changes;
    }
    function bindingIsActive(state) {
        const layout = options.bindGroupLayouts.get(state.info.group);
        return !!layout && !!bindGroupLayoutMetadata(layout)?.entries.some((entry) => entry.binding === state.info.binding);
    }
    function setNamedValue(name, value) {
        const direct = bindings.get(name);
        if (direct)
            return setBinding(direct, name, value);
        const member = findMemberBinding(name, bindings, options.label);
        if (!member)
            throw unsupportedError(`${options.label}.set`, `Binding '${name}' does not exist in '${options.label}'.`);
        return setBindingMember(member, name, value);
    }
    function setBinding(state, name, value) {
        ensureGroupSettable(state.info.group);
        const ownership = ownershipFor(state.info, value);
        latchBindingOwnership(state, name, ownership);
        const before = identityString(state.identity);
        if (ownership === "lib")
            setLibOwned(state, mergeLibValue(state.libValue, value));
        else
            setUserOwned(state, value);
        return bindingIsActive(state) ? identityChangeFor(state, before) : [];
    }
    function setBindingMember(state, memberName, value) {
        ensureGroupSettable(state.info.group);
        const ownership = ownershipFor(state.info, value);
        latchBindingOwnership(state, memberName, ownership);
        latchMemberOwnership(state, memberName, ownership);
        if (ownership !== "lib")
            throw unsupportedError(`${options.label}.set`, `Member '${memberName}' needs a JS value; set resource '${state.info.name}' instead.`);
        const before = identityString(state.identity);
        setLibOwned(state, { ...objectValue(state.libValue), [memberName]: value });
        return bindingIsActive(state) ? identityChangeFor(state, before) : [];
    }
    function setLibOwned(state, value) {
        const layout = requiredLibLayout(state);
        state.libValue = value;
        const bytes = writeLayoutValue(layout, value);
        if (!state.buffer)
            createLibBuffer(state, layout.size);
        state.bytes = bytes;
        state.buffer.write(bytes, 0);
    }
    function resourceContext(binding) {
        const entry = bindGroupLayoutMetadata(options.bindGroupLayouts.get(binding.group))?.entries.find((item) => item.binding === binding.binding);
        const pair = options.reflection.entryPoints.flatMap((item) => entryMetadata(item, "samplingPairs", options.label)).find((item) => item.mode === "filtering" && item.texture.group === binding.group && item.texture.binding === binding.binding);
        const pairedSampler = pair && options.reflection.bindings.find((item) => item.group === pair.sampler.group && item.binding === pair.sampler.binding);
        return { sourceHint: options.label, filterableTexture: entry?.texture?.sampleType === "float", float32Filterable: options.device.features.has("float32-filterable"), pairedSampler };
    }
    function setUserOwned(state, value) {
        const normalized = normalizeResource(state.info, value, resourceContext(state.info));
        state.unsubscribe?.();
        state.unsubscribeRecreate?.();
        state.resource = normalized.resource;
        state.identity = normalized.identity;
        state.unsubscribe = normalized.unsubscribe?.(() => { if (state.identity)
            options.cache.evictIdentity(state.identity); });
        state.unsubscribeRecreate = normalized.onRecreate?.(() => rebindRecreatedResource(state, value));
    }
    function rebindRecreatedResource(state, value) {
        const beforeIdentity = identityString(state.identity);
        if (state.identity)
            options.cache.evictIdentity(state.identity);
        const normalized = normalizeResource(state.info, value, resourceContext(state.info));
        state.unsubscribe?.();
        state.unsubscribeRecreate?.();
        state.resource = normalized.resource;
        state.identity = normalized.identity;
        state.unsubscribe = normalized.unsubscribe?.(() => { if (state.identity)
            options.cache.evictIdentity(state.identity); });
        // Refresh the recreation subscription on every re-normalization so the lifecycle
        // stays explicit even if a future target signal implementation becomes one-shot.
        state.unsubscribeRecreate = normalized.onRecreate?.(() => rebindRecreatedResource(state, value));
        if (bindingIsActive(state))
            for (const change of identityChangeFor(state, beforeIdentity))
                options.onIdentityChange?.(change);
    }
    function claimGroup(group, bindGroup, expectedLayout) {
        layout(group);
        validateClaimedGroup(options.label, group, bindGroup, expectedLayout);
        const previousIdentity = claimedGroups.has(group) ? `claimed-group:${group}` : undefined;
        claimedGroups.set(group, bindGroup);
        return previousIdentity;
    }
    function layout(group) {
        const bgl = options.bindGroupLayouts.get(group);
        if (!bgl)
            throw unsupportedError(`${options.label}.layout`, `@group(${group}) does not exist in '${options.label}'.`);
        return bgl;
    }
    function bindGroups() {
        return groups.map(bindGroupFor);
    }
    function bindGroupFor(group) {
        const claimed = claimedGroups.get(group);
        if (claimed)
            return { group, bindGroup: claimed, offsets: [], claimValidation: rawClaimValidation(claimed, group) };
        const active = new Set(bindGroupLayoutMetadata(layout(group))?.entries.map((entry) => entry.binding));
        const groupBindings = options.reflection.bindings.filter((binding) => binding.group === group && active.has(binding.binding));
        const entries = bindGroupEntries(groupBindings);
        const identities = identitiesFor(groupBindings);
        const bindGroup = options.cache.getOrCreate(options.drawId, group, identities, () => options.device.gpu.createBindGroup({
            label: `${options.label}.group${group}`,
            layout: layout(group),
            entries,
        }));
        return { group, bindGroup, offsets: [] };
    }
    function rawClaimValidation(bindGroup, group) {
        return bindGroupMetadataFor(bindGroup) ? undefined : { label: options.label, group };
    }
    function bindGroupEntries(groupBindings) {
        return groupBindings.map((binding) => {
            const state = requiredState(binding);
            return { binding: binding.binding, resource: state.resource };
        });
    }
    function identitiesFor(groupBindings) {
        return groupBindings.map((binding) => requiredState(binding).identity);
    }
    function requiredState(binding) {
        const state = bindings.get(binding.name);
        if (!state?.resource || !state.identity)
            throw neverSetError(options.label, binding);
        return state;
    }
    function ensureGroupSettable(group) {
        if (claimedGroups.has(group))
            throw claimedGroupSetError(options.label, group);
    }
    function createLibBuffer(state, size) {
        state.buffer = options.device.createBuffer({ size, usage: ["uniform", "copy_dst"], label: `${options.label}.${state.info.name}` });
        state.resource = { buffer: state.buffer.gpu, offset: 0, size };
        state.identity = state.buffer.resourceIdentity;
        state.unsubscribe = state.buffer.onDestroy(() => options.cache.evictIdentity(state.buffer.resourceIdentity));
    }
    function requiredLibLayout(state) {
        if (state.info.kind !== "buffer" || !state.info.layout?.size)
            throw unsupportedError(`${options.label}.set`, `Binding '${state.info.name}' needs a compatible resource, not JS.`);
        return state.info.layout;
    }
    return {
        get groups() { return groups; },
        set,
        claimGroup,
        layout,
        bindGroups,
        bindingState(name) {
            const state = bindings.get(name);
            if (!state?.ownership || !state.resource || !state.identity)
                return undefined;
            return { info: state.info, ownership: state.ownership, resource: state.resource, identity: state.identity };
        },
    };
}
function initializeBindings(reflection) {
    return new Map(reflection.bindings.map((binding) => [binding.name, { info: binding, memberOwnership: new Map() }]));
}
function reflectedGroups(reflection) {
    return [...new Set(reflection.bindings.map((binding) => binding.group))].sort((a, b) => a - b);
}
function findMemberBinding(memberName, bindings, label) {
    let match;
    for (const state of bindings.values()) {
        if (!state.info.layout?.members?.some((member) => member.name === memberName))
            continue;
        if (match)
            throw unsupportedError(`${label}.set`, `Binding member '${memberName}' is ambiguous in '${label}'; set the complete binding.`);
        match = state;
    }
    return match;
}
function ownershipFor(binding, value) {
    return binding.bindingLayout?.kind === "buffer" && isPlainValue(value) ? "lib" : "user";
}
function latchBindingOwnership(state, name, ownership) {
    if (state.ownership && state.ownership !== ownership)
        throw ownershipFlipError(name, state.ownership);
    state.ownership ??= ownership;
}
function latchMemberOwnership(state, memberName, ownership) {
    const previous = state.memberOwnership.get(memberName);
    if (previous && previous !== ownership)
        throw ownershipFlipError(memberName, previous);
    state.memberOwnership.set(memberName, ownership);
}
function validateClaimedGroup(label, group, bindGroup, expectedLayout) {
    const claimedMetadata = bindGroupMetadataFor(bindGroup);
    if (!claimedMetadata)
        return;
    const expectedMetadata = bindGroupLayoutMetadata(expectedLayout);
    if (!expectedMetadata)
        return;
    const reason = layoutMismatchReason(expectedMetadata.entries, claimedMetadata.layout.entries);
    if (reason)
        throw claimedGroupIncompatibleError(label, group, reason);
}
function layoutMismatchReason(expected, claimed) {
    if (expected.length !== claimed.length)
        return `expected ${expected.length} bindings and received ${claimed.length}`;
    const expectedByBinding = entriesByBinding(expected);
    const claimedByBinding = entriesByBinding(claimed);
    for (const [binding, entry] of expectedByBinding) {
        const claimedEntry = claimedByBinding.get(binding);
        if (!claimedEntry)
            return `missing @binding(${binding})`;
        if (entrySignature(entry) !== entrySignature(claimedEntry))
            return `@binding(${binding}) does not match the reflected layout`;
    }
    return undefined;
}
function entriesByBinding(entries) {
    return new Map(entries.map((entry) => [entry.binding, entry]));
}
function entrySignature(entry) {
    return JSON.stringify({
        binding: entry.binding,
        visibility: entry.visibility,
        buffer: entry.buffer,
        sampler: entry.sampler,
        texture: entry.texture,
        storageTexture: entry.storageTexture,
        externalTexture: entry.externalTexture ? {} : undefined,
    });
}
function identityChangeFor(state, previousIdentity) {
    const nextIdentity = identityString(state.identity);
    if (!nextIdentity || previousIdentity === nextIdentity)
        return [];
    return [{
            group: state.info.group,
            binding: state.info.binding,
            bindingName: state.info.name,
            bindingKind: state.info.kind,
            previousIdentity,
            newIdentity: nextIdentity,
        }];
}
function identityString(identity) {
    return identity === undefined ? undefined : identityKey(identity);
}
function mergeLibValue(previous, value) {
    return isPlainObject(previous) && isPlainObject(value) ? { ...previous, ...value } : value;
}
function objectValue(value) {
    return isPlainObject(value) ? value : {};
}
export { bindGroupLayoutEntriesForGroup, bindGroupLayoutsForReflection, pipelineLayoutFor } from "./set-layouts.js";
export { writeLayoutValue } from "./set-packing.js";
//# sourceMappingURL=set-core.js.map