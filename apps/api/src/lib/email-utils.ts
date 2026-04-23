import crypto from 'node:crypto';

const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

export interface ParsedEmail {
  email: string;
  localPart: string;
  domain: string;
  tld: string;
  hash: string;
  partitionKey: number;
}

export function parseEmail(raw: string): ParsedEmail | null {
  if (!raw) return null;
  // Handle lines like email:password or email:password:extra
  const firstField = raw.split(/[\s,;:|\t]/)[0]?.trim();
  if (!firstField) return null;
  const lower = firstField.toLowerCase();
  if (!EMAIL_RE.test(lower)) return null;
  if (lower.length > 254) return null;

  const atIdx = lower.lastIndexOf('@');
  const localPart = lower.slice(0, atIdx);
  const domain = lower.slice(atIdx + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot >= 0 ? domain.slice(dot + 1) : '';
  if (!tld) return null;

  const hash = crypto.createHash('sha256').update(lower).digest('hex');
  const partitionKey = partitionBucket(domain);

  return { email: lower, localPart, domain, tld, hash, partitionKey };
}

// Stable domain-based bucket (0..31). Hash domain instead of using domainId
// so the bucket is deterministic even before the domain row exists.
export function partitionBucket(domain: string): number {
  const h = crypto.createHash('md5').update(domain).digest();
  return h.readUInt32BE(0) % 32;
}
