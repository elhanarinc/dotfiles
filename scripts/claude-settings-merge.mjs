// Shared merge logic for Claude settings overlays (imported, never run directly).
// Objects merge recursively, arrays are unioned, and `autoMode` is replaced
// wholesale so stale rules never linger.
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function merge(target, overlay) {
  for (const [key, value] of Object.entries(overlay)) {
    if (Array.isArray(value) && Array.isArray(target[key])) {
      target[key] = [...target[key], ...value.filter((v) => !target[key].includes(v))];
    } else if (isObject(value) && isObject(target[key])) {
      merge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

// Merge `overlay` into `target` in memory and return `target`.
export function applyOverlay(target, overlay) {
  const { autoMode, ...rest } = overlay;
  merge(target, rest);
  if (autoMode) target.autoMode = autoMode;
  return target;
}
