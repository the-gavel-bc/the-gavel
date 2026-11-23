// The SQL staff validator also reserves U+0892, which Node 22 classifies as unassigned.
export function hasUnsupportedDisplayCharacter(value: string | null): boolean {
  return value !== null && /[\p{Cf}\u0892\u2800\u3164]/u.test(value);
}
