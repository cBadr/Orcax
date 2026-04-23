// Hide a random contiguous slice of the local part with asterisks.
// Default: 3 chars, capped at 6, but never consuming the first/last char or
// leaving the local part too short. Domain is always kept intact.
export function maskEmail(email: string, minChars = 3, maxChars = 6): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);

  // Not enough room to mask while preserving first/last
  if (local.length < minChars + 2) {
    const len = Math.max(2, local.length - 2);
    return local[0] + '*'.repeat(len) + (local[local.length - 1] ?? '') + domain;
  }

  const maxSpan = Math.min(maxChars, local.length - 2);
  const span = Math.floor(Math.random() * (maxSpan - minChars + 1)) + minChars;
  const startMin = 1;
  const startMax = local.length - 1 - span;
  const start = Math.floor(Math.random() * (startMax - startMin + 1)) + startMin;

  return local.slice(0, start) + '*'.repeat(span) + local.slice(start + span) + domain;
}
