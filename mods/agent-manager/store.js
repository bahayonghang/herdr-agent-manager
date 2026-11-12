import { KEY, fresh, clone, validate } from "./model.js";
// Same-client stale-edit protection, not a cross-process database transaction.
export function createStore(api) {
  return {
    read() { const raw = api.shared(KEY); return raw == null ? fresh() : validate(raw); },
    change(transform, expectedRevision) {
      const current = this.read();
      if (expectedRevision !== undefined && current.revision !== expectedRevision)
        throw new Error("Settings changed in another view. Reopen this editor before saving.");
      const next = validate(transform(clone(current)));
      next.revision = current.revision + 1;
      api.setShared(KEY, next); return next;
    },
    replace(value, expectedRevision) {
      const next = validate(value), previous = this.read();
      if (expectedRevision !== undefined && previous.revision !== expectedRevision) throw new Error("Settings changed. Review the import again.");
      api.setShared(`${KEY}.backup`, previous);
      return this.change(() => ({ ...next, confirmRisk: true }), previous.revision);
    },
    restore() {
      const value = api.shared(`${KEY}.backup`);
      if (!value) throw new Error("No configuration backup is available");
      return this.replace(value);
    }
  };
}
