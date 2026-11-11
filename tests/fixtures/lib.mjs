/** Helpers for handmade fixtures: pick a captured sample, copy it exactly. */

export function sample(mod, label) {
  const found = mod.samples.find((s) => s.label === label);
  if (!found)
    throw new Error(`no captured sample "${label}" in ${mod.meta.method}`);
  return found.value;
}

/** A deep copy that keeps BigInt, Map and undefined keys. */
export const copy = (value) => structuredClone(value);

/** `copy(value)`, then `edit(clone)`; returns the clone. */
export function variant(value, edit) {
  const clone = copy(value);
  edit(clone);
  return clone;
}

export const U64_MAX = 2n ** 64n - 1n;
export const I64_MIN = -(2n ** 63n);
export const SAFE_LIMIT = 2n ** 53n;
