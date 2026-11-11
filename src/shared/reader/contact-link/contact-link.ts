// Receives an already validated ASCII mailbox. Escape local-part data once,
// keeping the addr-spec @ delimiter literal (RFC 6068 section 2).
export function contactMailto(email: string): string {
  const at = email.lastIndexOf("@");
  return `mailto:${encodeURIComponent(email.slice(0, at))}@${email.slice(at + 1)}`;
}
