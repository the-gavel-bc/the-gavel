// Same whitespace/control set as the SQL validator, including ECMAScript BOM whitespace.
const UNSAFE =
  /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff\\]/u;
export function isValidDraftLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    Array.from(value).length > 2048 ||
    UNSAFE.test(value)
  )
    return false;
  const match = /^(?:http|https):\/\/([^/?#]+)(?:[/?#].*)?$/u.exec(value);
  if (!match || /[^\x21-\x7e]|@/u.test(match[1])) return false;
  const authority = /^(\[[0-9a-fA-F:.]+\]|[a-zA-Z0-9.-]+)(?::([0-9]+))?$/u.exec(
    match[1],
  );
  if (
    !authority ||
    (authority[2] !== undefined &&
      (authority[2].length > 5 || Number(authority[2]) > 65535))
  )
    return false;
  const host = authority[1];
  if (!host.startsWith("[")) {
    const name = host.endsWith(".") ? host.slice(0, -1) : host;
    if (
      !name ||
      name.length > 253 ||
      name
        .split(".")
        .some(
          (label) =>
            /^xn--/iu.test(label) ||
            !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/u.test(label),
        )
    )
      return false;
    // Reject WHATWG legacy numeric hosts (hex, shorthand, octal) rather than normalizing them.
    if (
      /^[0-9]+$/u.test(name.split(".").at(-1)!) ||
      /^(?:0x[0-9a-f]+)$/iu.test(name.split(".").at(-1)!)
    ) {
      if (
        !/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/u.test(name) ||
        name.split(".").some((part) => Number(part) > 255)
      )
        return false;
    }
  }
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
