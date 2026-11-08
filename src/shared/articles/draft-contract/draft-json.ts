// Match JSONB text size for JSON-safe integer inputs; key order does not affect size.
// This is a bounded walk, not JSON.stringify(untrustedObject), which may invoke toJSON.
export function draftJsonbByteLength(
  value: unknown,
  maxBytes = 1100000,
): number | null {
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [
    { value, depth: 0 },
  ];
  // Track only the active ancestry: cycles are invalid, but reusing an object in
  // separate branches is valid JSON serialization. Exit markers release each ancestor.
  const active = new Set<object>();
  const encoder = new TextEncoder();
  let bytes = 0;
  let visited = 0;
  const stringBytes = (text: string): number | null => {
    if (
      /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        text,
      )
    )
      return null;
    return encoder.encode(JSON.stringify(text)).length;
  };
  while (stack.length) {
    const item = stack.pop()!;
    const current = item.value;
    if (item.exit) {
      active.delete(current as object);
      continue;
    }
    if (item.depth > 64 || ++visited > 100000) return null;
    if (current === null) bytes += 4;
    else if (typeof current === "string") {
      if (current.length > maxBytes) return null;
      const length = stringBytes(current);
      if (length === null) return null;
      bytes += length;
    } else if (typeof current === "boolean") bytes += current ? 4 : 5;
    else if (typeof current === "number" && Number.isSafeInteger(current))
      bytes += String(current).length;
    else if (typeof current === "object") {
      if (active.has(current)) return null;
      active.add(current);
      stack.push({ ...item, exit: true });
      if (Array.isArray(current)) {
        if (
          current.length > 100000 ||
          Object.keys(current).length !== current.length
        )
          return null;
        // JSONB text uses comma-space separators; compact JSON.stringify is smaller.
        bytes += 2 + Math.max(0, current.length - 1) * 2;
        for (const child of current)
          stack.push({ value: child, depth: item.depth + 1 });
      } else {
        if (
          Object.getPrototypeOf(current) !== Object.prototype &&
          Object.getPrototypeOf(current) !== null
        )
          return null;
        const keys = Reflect.ownKeys(current);
        if (keys.length > 100000) return null;
        bytes += 2 + Math.max(0, keys.length - 1) * 2;
        for (const key of keys) {
          if (typeof key !== "string") return null;
          // Reject accessors before reading values; validation must not invoke getters.
          const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
          if (!descriptor.enumerable || !("value" in descriptor)) return null;
          const length = stringBytes(key);
          if (length === null) return null;
          bytes += length + 2;
          stack.push({ value: descriptor.value, depth: item.depth + 1 });
        }
      }
    } else return null;
    if (bytes > maxBytes) return null;
  }
  return bytes;
}
