/**
 * Lossless text form of rgb-lib-wasm values, for fixtures (ADR-0002 step 0).
 *
 * serde-wasm-bindgen builds plain objects, arrays, `Map`s (for `HashMap`
 * keys that are not strings), `bigint` (u64, i64) and `undefined` (an absent
 * Option in some types). JSON loses three of these, so fixtures are ES
 * modules: `toSource(value)` is a JS expression that evaluates back to an
 * equal value, keys with `undefined` included.
 *
 * Used by the e2e capture page (bundled) and by the Node tests.
 */

/** A JS expression for `value`. Throws on a value it cannot keep exactly. */
export function toSource(value, indent = '') {
  const next = `${indent}  `;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  switch (typeof value) {
    case 'bigint':
      return `${value}n`;
    case 'number':
      if (Object.is(value, -0)) return '-0';
      if (Number.isNaN(value)) return 'NaN';
      if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
      return String(value);
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return String(value);
    default:
      break;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => `${next}${toSource(v, next)},`).join('\n')}\n${indent}]`;
  }
  if (value instanceof Map) {
    if (value.size === 0) return 'new Map()';
    const entries = [...value].map(
      ([k, v]) => `${next}[${toSource(k, next)}, ${toSource(v, next)}],`
    );
    return `new Map([\n${entries.join('\n')}\n${indent}])`;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(
        `toSource: ${proto?.constructor?.name ?? 'an object'} is not a plain value`
      );
    }
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const fields = keys.map(
      (k) =>
        `${next}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${toSource(value[k], next)},`
    );
    return `{\n${fields.join('\n')}\n${indent}}`;
  }
  throw new TypeError(`toSource: cannot keep a ${typeof value}`);
}

/** The kind of one value: what JSON would blur. */
export function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Map) return 'map';
  return typeof value;
}

/**
 * Every path in `value` with its kind, for example
 * `{ '$': 'object', '$.vanilla.settled': 'bigint' }`. Array items are `[i]`,
 * Map entries `<key>` for the key and `{key}` for the value.
 */
export function describeTypes(value, path = '$', out = {}) {
  out[path] = kindOf(value);
  if (Array.isArray(value)) {
    value.forEach((v, i) => describeTypes(v, `${path}[${i}]`, out));
  } else if (value instanceof Map) {
    let i = 0;
    for (const [k, v] of value) {
      describeTypes(k, `${path}<${i}>`, out);
      describeTypes(v, `${path}{${i}}`, out);
      i += 1;
    }
  } else if (value !== null && typeof value === 'object') {
    for (const k of Object.keys(value))
      describeTypes(value[k], `${path}.${k}`, out);
  }
  return out;
}
