let nextResourceId = 1;
export function createResourceIdentity(kind) {
    return Object.freeze({ kind, id: nextResourceId++ });
}
export class DestroySignal {
    callbacks = new Set();
    destroyed = false;
    onDestroy(resource, cb) {
        if (this.destroyed) {
            cb(resource);
            return () => undefined;
        }
        this.callbacks.add(cb);
        return () => { this.callbacks.delete(cb); };
    }
    emit(resource) {
        if (this.destroyed)
            return false;
        this.destroyed = true;
        const callbacks = [...this.callbacks];
        this.callbacks.clear();
        for (const cb of callbacks)
            cb(resource);
        return true;
    }
}
//# sourceMappingURL=resource-lifecycle.js.map