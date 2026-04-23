import { prisma } from '../../lib/prisma.js';

// Resolve points-per-email for a domain: domain-specific > TLD group > default.
// Cached in-memory for one invocation via a passed Map (caller-controlled).
export async function resolvePointsPerEmail(
  domainId: number,
  domainName: string,
  tld: string,
  cache?: Map<number, number>,
): Promise<number> {
  if (cache?.has(domainId)) return cache.get(domainId)!;

  const domainPricing = await prisma.pricingDomain.findUnique({ where: { domainId } });
  if (domainPricing) {
    cache?.set(domainId, domainPricing.pointsPerEmail);
    return domainPricing.pointsPerEmail;
  }

  const tldGroups = await prisma.pricingTldGroup.findMany({ orderBy: { priority: 'asc' } });
  for (const g of tldGroups) {
    if (g.tlds.includes(tld)) {
      cache?.set(domainId, g.pointsPerEmail);
      return g.pointsPerEmail;
    }
  }

  const def = await prisma.pricingDefault.findFirst();
  const fallback = def?.pointsPerEmail ?? 1;
  cache?.set(domainId, fallback);
  return fallback;
}

// Bulk discount: returns discount percentage (0..1) for a total count.
export async function resolveBulkDiscount(totalCount: number): Promise<number> {
  const rules = await prisma.bulkDiscount.findMany({
    where: { active: true, minQuantity: { lte: totalCount } },
    orderBy: { minQuantity: 'desc' },
  });
  const top = rules[0];
  if (!top) return 0;
  return top.discountPct / 100;
}
