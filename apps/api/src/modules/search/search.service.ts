import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { enqueueExport } from '../../lib/queue.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { maskEmail } from '../../lib/mask.js';
import { getSetting, SETTING_KEYS } from '../../lib/settings.js';
import { resolvePointsPerEmail, resolveBulkDiscount } from '../pricing/pricing.service.js';
import type { Prisma } from '@prisma/client';

export interface SearchFilters {
  domains?: string[];
  countryIds?: number[];
  totalQty?: number;
  perDomainQty?: Record<string, number>;
  localPartContains?: string;
  localPartStartsWith?: string;
  localPartEndsWith?: string;
  localPartHasDigits?: boolean;
  minLocalLength?: number;
  maxLocalLength?: number;
  allowMixDomains?: boolean;
  randomize?: boolean;
}

export interface ResolvedDomain {
  id: number;
  name: string;
  tld: string;
  availableCount: number;
}

function filterHash(userId: string, filters: SearchFilters): string {
  const ordered = JSON.stringify(filters, Object.keys(filters).sort());
  return crypto.createHash('sha1').update(`${userId}:${ordered}`).digest('hex');
}

async function resolveDomains(filters: SearchFilters): Promise<ResolvedDomain[]> {
  const where: Prisma.DomainWhereInput = { isActive: true };
  if (filters.domains?.length) {
    where.name = { in: filters.domains.map((d) => d.toLowerCase()) };
  }
  if (filters.countryIds?.length) {
    where.countryId = { in: filters.countryIds };
  }
  const domains = await prisma.domain.findMany({
    where,
    select: { id: true, name: true, tld: true },
    orderBy: { emailsCount: 'desc' },
  });
  return domains.map((d) => ({ ...d, availableCount: 0 }));
}

// Count per-domain how many emails match filters (status=available, cooldown passed).
async function countAvailablePerDomain(
  domainIds: number[],
  filters: SearchFilters,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (domainIds.length === 0) return out;
  const now = new Date();

  const where = buildEmailWhere(domainIds, filters, now);
  const grouped = await prisma.email.groupBy({
    by: ['domainId'],
    where,
    _count: { _all: true },
  });
  for (const g of grouped) out.set(g.domainId, g._count._all);
  return out;
}

function buildEmailWhere(
  domainIds: number[],
  filters: SearchFilters,
  now: Date,
): Prisma.EmailWhereInput {
  const where: Prisma.EmailWhereInput = {
    domainId: { in: domainIds },
    status: 'available',
    OR: [{ availableAfter: null }, { availableAfter: { lte: now } }],
  };
  const localPart: Prisma.StringFilter = {};
  if (filters.localPartContains) localPart.contains = filters.localPartContains.toLowerCase();
  if (filters.localPartStartsWith) localPart.startsWith = filters.localPartStartsWith.toLowerCase();
  if (filters.localPartEndsWith) localPart.endsWith = filters.localPartEndsWith.toLowerCase();
  if (Object.keys(localPart).length > 0) where.localPart = localPart;
  return where;
}

export interface SearchSummary {
  searchId: string;
  totalFound: number;
  demoCount: number;
  perDomain: Array<{
    domainId: number;
    domain: string;
    available: number;
    requested: number;
    pointsPerEmail: number;
  }>;
  previewEmails: string[]; // masked demo
  estimatedPoints: string;
  estimatedDiscountPct: number;
  cacheHit: boolean;
}

const CACHE_TTL_SECONDS = 600;

// Main search: explore, count, preview. Does NOT reserve.
export async function runSearch(userId: string, filters: SearchFilters): Promise<SearchSummary> {
  const cacheKey = `search:${filterHash(userId, filters)}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    return { ...parsed, cacheHit: true };
  }

  const demoCount = await getSetting<number>(SETTING_KEYS.DEMO_EMAILS_COUNT);
  const maxResults = await getSetting<number>(SETTING_KEYS.MAX_SEARCH_RESULTS);

  const domains = await resolveDomains(filters);
  if (domains.length === 0) {
    const empty: SearchSummary = {
      searchId: '',
      totalFound: 0,
      demoCount: 0,
      perDomain: [],
      previewEmails: [],
      estimatedPoints: '0',
      estimatedDiscountPct: 0,
      cacheHit: false,
    };
    return empty;
  }

  const counts = await countAvailablePerDomain(
    domains.map((d) => d.id),
    filters,
  );

  const priceCache = new Map<number, number>();
  const perDomain: SearchSummary['perDomain'] = [];
  let totalRequested = 0;
  let estimatedPoints = 0n;

  for (const d of domains) {
    const available = counts.get(d.id) ?? 0;
    if (available === 0) continue;
    const perDomainRequest =
      filters.perDomainQty?.[d.name] ?? filters.totalQty ?? available;
    const take = Math.min(perDomainRequest, available, maxResults);
    if (take === 0) continue;
    const pointsPerEmail = await resolvePointsPerEmail(d.id, d.name, d.tld, priceCache);
    perDomain.push({
      domainId: d.id,
      domain: d.name,
      available,
      requested: take,
      pointsPerEmail,
    });
    totalRequested += take;
    estimatedPoints += BigInt(pointsPerEmail) * BigInt(take);
  }

  // Apply bulk discount
  const discountPct = await resolveBulkDiscount(totalRequested);
  if (discountPct > 0) {
    estimatedPoints = BigInt(Math.floor(Number(estimatedPoints) * (1 - discountPct)));
  }

  // Persist search record
  const search = await prisma.search.create({
    data: {
      userId,
      filters: filters as unknown as Prisma.InputJsonValue,
      totalFound: totalRequested,
    },
  });

  // Preview: pull random demo emails across matching domains
  const previewEmails: string[] = [];
  if (totalRequested > 0 && demoCount > 0) {
    const perDomainDemo = Math.max(1, Math.ceil(demoCount / perDomain.length));
    const now = new Date();
    for (const d of perDomain) {
      // Use random sampling: pick a random offset within available
      const offset = Math.max(0, Math.floor(Math.random() * Math.max(1, d.available - perDomainDemo)));
      const rows = await prisma.email.findMany({
        where: buildEmailWhere([d.domainId], filters, now),
        select: { email: true },
        skip: offset,
        take: perDomainDemo,
      });
      for (const r of rows) previewEmails.push(maskEmail(r.email));
      if (previewEmails.length >= demoCount) break;
    }
  }

  const summary: SearchSummary = {
    searchId: search.id,
    totalFound: totalRequested,
    demoCount: previewEmails.length,
    perDomain,
    previewEmails: previewEmails.slice(0, demoCount),
    estimatedPoints: estimatedPoints.toString(),
    estimatedDiscountPct: discountPct * 100,
    cacheHit: false,
  };

  await redis.set(cacheKey, JSON.stringify(summary), 'EX', CACHE_TTL_SECONDS);
  return summary;
}

// Reserve: atomically lock emails for this user.
// Uses raw SQL UPDATE ... RETURNING to prevent race conditions.
export async function createReservation(
  userId: string,
  searchId: string | null,
  filters: SearchFilters,
): Promise<{ reservationId: string; totalCount: number; totalPoints: string }> {
  const reservationTtlMinutes = await getSetting<number>(SETTING_KEYS.RESERVATION_TTL_MINUTES);
  const maxResults = await getSetting<number>(SETTING_KEYS.MAX_SEARCH_RESULTS);

  // Auto-release any prior active reservations for this user
  await cancelActiveReservations(userId);

  const domains = await resolveDomains(filters);
  if (domains.length === 0) throw badRequest('No matching domains');

  const reservation = await prisma.reservation.create({
    data: {
      userId,
      searchId,
      status: 'active',
      expiresAt: new Date(Date.now() + reservationTtlMinutes * 60_000),
    },
  });

  const priceCache = new Map<number, number>();
  let totalCount = 0;
  let totalPoints = 0n;

  const now = new Date();
  const expiresAt = reservation.expiresAt;

  for (const d of domains) {
    const perDomainRequest =
      filters.perDomainQty?.[d.name] ?? filters.totalQty ?? Number.MAX_SAFE_INTEGER;
    if (totalCount >= maxResults) break;
    const remaining = Math.min(perDomainRequest, maxResults - totalCount);
    if (remaining <= 0) continue;

    const pointsPerEmail = await resolvePointsPerEmail(d.id, d.name, d.tld, priceCache);

    // Use CTE to pick available rows and update atomically.
    // Filters on local part are applied in the inner SELECT.
    const rows = await lockAvailableEmails(
      d.id,
      remaining,
      filters,
      userId,
      expiresAt,
      now,
    );
    if (rows.length === 0) continue;

    // Insert reservation items
    await prisma.reservationItem.createMany({
      data: rows.map((r) => ({
        reservationId: reservation.id,
        emailId: BigInt(r.id),
        domainId: d.id,
        pointsCost: pointsPerEmail,
      })),
    });

    totalCount += rows.length;
    totalPoints += BigInt(pointsPerEmail) * BigInt(rows.length);
  }

  if (totalCount === 0) {
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: 'canceled' },
    });
    throw badRequest('No emails matched your filters');
  }

  // Apply bulk discount
  const discountPct = await resolveBulkDiscount(totalCount);
  if (discountPct > 0) {
    totalPoints = BigInt(Math.floor(Number(totalPoints) * (1 - discountPct)));
  }

  const updated = await prisma.reservation.update({
    where: { id: reservation.id },
    data: { totalCount, totalPoints },
  });

  return {
    reservationId: updated.id,
    totalCount,
    totalPoints: totalPoints.toString(),
  };
}

// Raw SQL to atomically select + lock rows. Returns selected ids.
async function lockAvailableEmails(
  domainId: number,
  limit: number,
  filters: SearchFilters,
  userId: string,
  expiresAt: Date,
  now: Date,
): Promise<Array<{ id: bigint }>> {
  const conditions: string[] = [
    `"domainId" = $1`,
    `status = 'available'`,
    `("availableAfter" IS NULL OR "availableAfter" <= $2)`,
  ];
  const params: unknown[] = [domainId, now];

  if (filters.localPartContains) {
    params.push(`%${filters.localPartContains.toLowerCase()}%`);
    conditions.push(`"localPart" LIKE $${params.length}`);
  }
  if (filters.localPartStartsWith) {
    params.push(`${filters.localPartStartsWith.toLowerCase()}%`);
    conditions.push(`"localPart" LIKE $${params.length}`);
  }
  if (filters.localPartEndsWith) {
    params.push(`%${filters.localPartEndsWith.toLowerCase()}`);
    conditions.push(`"localPart" LIKE $${params.length}`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(userId);
  const userIdx = params.length;
  params.push(expiresAt);
  const expiresIdx = params.length;

  const sql = `
    WITH picked AS (
      SELECT id FROM "Email"
      WHERE ${conditions.join(' AND ')}
      ORDER BY random()
      LIMIT $${limitIdx}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "Email" e
    SET status = 'reserved',
        "reservedById" = $${userIdx},
        "reservedUntil" = $${expiresIdx}
    FROM picked
    WHERE e.id = picked.id
    RETURNING e.id
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: bigint }>>(sql, ...params);
  return rows;
}

// Cancel any active reservations, releasing emails back to available.
export async function cancelActiveReservations(userId: string): Promise<number> {
  const active = await prisma.reservation.findMany({
    where: { userId, status: 'active' },
    select: { id: true },
  });
  let released = 0;
  for (const r of active) {
    const n = await releaseReservation(r.id);
    released += n;
  }
  return released;
}

export async function cancelReservation(userId: string, reservationId: string): Promise<void> {
  const r = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!r || r.userId !== userId) throw notFound('Reservation not found');
  if (r.status !== 'active') return;
  await releaseReservation(reservationId);
}

async function releaseReservation(reservationId: string): Promise<number> {
  const items = await prisma.reservationItem.findMany({
    where: { reservationId },
    select: { emailId: true },
  });
  if (items.length === 0) {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'canceled' },
    });
    return 0;
  }
  const ids = items.map((i) => i.emailId);
  const result = await prisma.email.updateMany({
    where: { id: { in: ids }, status: 'reserved' },
    data: { status: 'available', reservedById: null, reservedUntil: null },
  });
  await prisma.reservation.update({
    where: { id: reservationId },
    data: { status: 'canceled' },
  });
  return result.count;
}

export async function expireOldReservations(): Promise<number> {
  const now = new Date();
  const expired = await prisma.reservation.findMany({
    where: { status: 'active', expiresAt: { lt: now } },
    select: { id: true },
  });
  let total = 0;
  for (const r of expired) {
    const n = await releaseReservation(r.id);
    total += n;
    await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'expired' },
    });
  }
  return total;
}

// Get reservation details (with masked preview for display)
export async function getReservation(userId: string, reservationId: string) {
  const r = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      items: {
        take: 50,
        include: { /* no includes */ },
      },
    },
  });
  if (!r || r.userId !== userId) throw notFound();
  return {
    id: r.id,
    status: r.status,
    expiresAt: r.expiresAt,
    totalCount: r.totalCount,
    totalPoints: r.totalPoints.toString(),
    createdAt: r.createdAt,
  };
}

// Confirm reservation: deduct points, mark emails sold, create order.
export async function confirmReservation(userId: string, reservationId: string) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { items: true },
    });
    if (!reservation || reservation.userId !== userId) throw notFound();
    if (reservation.status !== 'active') throw badRequest('Reservation is not active');
    if (reservation.expiresAt < new Date()) throw badRequest('Reservation has expired');

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.balancePoints < reservation.totalPoints) {
      throw badRequest('Insufficient balance');
    }

    const cooldownDays = (await getSetting<number>(SETTING_KEYS.COOLDOWN_DAYS_AFTER_SALE)) ?? 90;
    const availableAfter = new Date(Date.now() + cooldownDays * 86_400_000);

    // Mark emails sold
    const emailIds = reservation.items.map((i) => i.emailId);
    await tx.email.updateMany({
      where: { id: { in: emailIds } },
      data: {
        status: 'sold',
        soldAt: new Date(),
        availableAfter,
        reservedUntil: null,
        reservedById: null,
      },
    });

    // Deduct balance
    const newBalance = user.balancePoints - reservation.totalPoints;
    await tx.user.update({
      where: { id: userId },
      data: { balancePoints: newBalance },
    });

    // Ledger entry (negative = purchase)
    await tx.ledgerEntry.create({
      data: {
        userId,
        amount: -reservation.totalPoints,
        type: 'purchase',
        referenceId: reservation.id,
        balanceAfter: newBalance,
        note: `Order of ${reservation.totalCount} emails`,
      },
    });

    // Create order
    const order = await tx.order.create({
      data: {
        userId,
        reservationId: reservation.id,
        totalCount: reservation.totalCount,
        totalPoints: reservation.totalPoints,
        status: 'completed',
      },
    });

    // Update reservation
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });

    return {
      orderId: order.id,
      totalCount: order.totalCount,
      totalPoints: order.totalPoints.toString(),
      newBalance: newBalance.toString(),
    };
  }).then(async (result) => {
    // Auto-create export job so the user gets a cloud link without extra clicks.
    const autoUpload = await getSetting<boolean>(SETTING_KEYS.AUTO_UPLOAD_TO_GOFILE);
    if (autoUpload) {
      const job = await prisma.exportJob.create({
        data: {
          userId,
          orderId: result.orderId,
          format: 'txt',
          totalCount: result.totalCount,
          status: 'queued',
        },
      });
      await enqueueExport(job.id);
    }
    return result;
  });
}
