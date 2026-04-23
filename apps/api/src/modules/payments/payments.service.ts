import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { getSetting, SETTING_KEYS } from '../../lib/settings.js';
import {
  createInvoice,
  getInvoiceByPaymentId,
  type CpInvoiceStatus,
} from '../../lib/coinpayments.js';

// Convert USD -> points using current rate + any top-up bonus.
// Points per dollar is admin-configurable.
export async function calculatePoints(
  amountUsd: number,
  userId?: string,
): Promise<{
  basePoints: bigint;
  bonusPoints: bigint;
  resellerBonusPoints: bigint;
  totalPoints: bigint;
  bonusPct: number;
  resellerPct: number;
}> {
  const rate = await getSetting<number>(SETTING_KEYS.POINTS_PER_DOLLAR);
  const base = BigInt(Math.floor(amountUsd * rate));

  const bonuses = await prisma.topupBonus.findMany({
    where: { active: true, minUsd: { lte: amountUsd } },
    orderBy: { minUsd: 'desc' },
  });
  const bonusPct = bonuses[0]?.bonusPct ?? 0;
  const bonus = BigInt(Math.floor(Number(base) * (bonusPct / 100)));

  // Reseller tier discount = additional points bonus on top-ups
  let resellerPct = 0;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { resellerTier: true },
    });
    resellerPct = user?.resellerTier?.discountPct ?? 0;
  }
  const resellerBonus = BigInt(Math.floor(Number(base) * (resellerPct / 100)));

  return {
    basePoints: base,
    bonusPoints: bonus,
    resellerBonusPoints: resellerBonus,
    totalPoints: base + bonus + resellerBonus,
    bonusPct,
    resellerPct,
  };
}

export interface CreateTopupInput {
  userId: string;
  amountUsd: number;
  currency: string;
}

export async function createTopup(input: CreateTopupInput) {
  const min = await getSetting<number>(SETTING_KEYS.MIN_TOPUP_USD);
  const max = await getSetting<number>(SETTING_KEYS.MAX_TOPUP_USD);
  if (input.amountUsd < min) throw badRequest(`Minimum top-up is $${min}`);
  if (input.amountUsd > max) throw badRequest(`Maximum top-up is $${max}`);

  const { totalPoints } = await calculatePoints(input.amountUsd, input.userId);

  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      provider: 'coinpayments',
      amountUsd: new Prisma.Decimal(input.amountUsd.toFixed(8)),
      amountPoints: totalPoints,
      currency: input.currency,
      status: 'pending',
    },
  });

  try {
    const invoice = await createInvoice({
      amountUsd: input.amountUsd,
      currency: input.currency,
      userId: input.userId,
      paymentId: payment.id,
      description: `Platform top-up: ${input.amountUsd.toFixed(2)} USD`,
    });
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerId: invoice.invoiceId,
        ipnPayload: invoice.raw as Prisma.InputJsonValue,
      },
    });
    return {
      paymentId: updated.id,
      invoiceUrl: invoice.invoiceUrl,
      amountPoints: totalPoints.toString(),
    };
  } catch (err) {
    const message = (err as Error).message ?? 'Failed to create invoice';
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'failed',
        ipnPayload: { error: message } as Prisma.InputJsonValue,
      },
    });
    // Surface the real error to the client/admin
    throw badRequest(message, 'COINPAYMENTS_ERROR');
  }
}

export async function listUserPayments(userId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where: { userId } }),
  ]);
  return {
    items: items.map(serializePayment),
    total,
    page,
    pageSize,
  };
}

export async function getPayment(userId: string, id: string) {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p || p.userId !== userId) throw notFound();
  return serializePayment(p);
}

export function serializePayment(p: {
  id: string;
  userId: string;
  provider: string;
  providerId: string | null;
  amountUsd: Prisma.Decimal;
  amountPoints: bigint;
  currency: string;
  status: string;
  txid: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}) {
  return {
    id: p.id,
    userId: p.userId,
    provider: p.provider,
    providerId: p.providerId,
    amountUsd: p.amountUsd.toString(),
    amountPoints: p.amountPoints.toString(),
    currency: p.currency,
    status: p.status,
    txid: p.txid,
    createdAt: p.createdAt,
    confirmedAt: p.confirmedAt,
  };
}

// ---- IPN handling ----
// Called by the webhook route. Idempotent — re-running does not double-credit.
export async function applyIpn(event: {
  paymentId: string;
  providerId?: string;
  status: string; // normalized: pending | confirmed | failed | canceled
  txid?: string;
  rawPayload: unknown;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: event.paymentId } });
    if (!payment) return;

    // Update raw payload history (overwrite ok — we have audit log)
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerId: event.providerId ?? payment.providerId,
        txid: event.txid ?? payment.txid,
        ipnPayload: event.rawPayload as Prisma.InputJsonValue,
      },
    });

    // Only process once: idempotent credit.
    if (event.status === 'confirmed' && payment.status !== 'confirmed') {
      const user = await tx.user.findUniqueOrThrow({ where: { id: payment.userId } });
      const newBalance = user.balancePoints + payment.amountPoints;

      await tx.user.update({
        where: { id: payment.userId },
        data: { balancePoints: newBalance },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: payment.userId,
          amount: payment.amountPoints,
          type: 'topup',
          referenceId: payment.id,
          balanceAfter: newBalance,
          note: `Top-up of $${payment.amountUsd.toString()}`,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'confirmed', confirmedAt: new Date() },
      });

      // Referral commission (if enabled and user was referred)
      if (user.referredById) {
        const refEnabled = await getSetting<boolean>(SETTING_KEYS.REFERRAL_ENABLED);
        const commissionPct = await getSetting<number>(SETTING_KEYS.REFERRAL_COMMISSION_PCT);
        if (refEnabled && commissionPct > 0) {
          const earned = BigInt(
            Math.floor(Number(payment.amountPoints) * (commissionPct / 100)),
          );
          if (earned > 0n) {
            const referrer = await tx.user.findUnique({ where: { id: user.referredById } });
            if (referrer) {
              const refBalance = referrer.balancePoints + earned;
              await tx.user.update({
                where: { id: referrer.id },
                data: { balancePoints: refBalance },
              });
              await tx.ledgerEntry.create({
                data: {
                  userId: referrer.id,
                  amount: earned,
                  type: 'referral',
                  referenceId: payment.id,
                  balanceAfter: refBalance,
                  note: `Referral commission from ${user.email}`,
                },
              });
              await tx.referralEarning.create({
                data: {
                  referrerId: referrer.id,
                  referredId: user.id,
                  paymentId: payment.id,
                  earnedPoints: earned,
                },
              });
            }
          }
        }
      }
    } else if (
      (event.status === 'failed' || event.status === 'canceled') &&
      payment.status === 'pending'
    ) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: event.status },
      });
    }
  });
}

// Translate raw CoinPayments event type into our normalized status.
export function normalizeCpStatus(eventType: string): string {
  switch (eventType) {
    case 'invoicePaid':
    case 'invoiceCompleted':
      return 'confirmed';
    case 'invoiceCancelled':
      return 'canceled';
    case 'invoiceTimedOut':
      return 'failed';
    case 'invoiceCreated':
    case 'invoicePending':
    default:
      return 'pending';
  }
}

// Admin: manual point adjustment
export async function adminAdjustBalance(input: {
  actorId: string;
  userId: string;
  amountPoints: bigint;
  note: string;
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const newBalance = user.balancePoints + input.amountPoints;
    if (newBalance < 0n) throw badRequest('Resulting balance would be negative');
    await tx.user.update({
      where: { id: input.userId },
      data: { balancePoints: newBalance },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: input.userId,
        amount: input.amountPoints,
        type: 'admin_adjust',
        balanceAfter: newBalance,
        note: input.note || 'Admin adjustment',
      },
    });
    return { newBalance: newBalance.toString() };
  });
}

// Map CoinPayments status -> our normalized status.
export function normalizeCpInvoiceStatus(s: CpInvoiceStatus): string {
  if (s === 'paid' || s === 'confirmed' || s === 'completed') return 'confirmed';
  if (s === 'cancelled') return 'canceled';
  if (s === 'timedOut') return 'failed';
  return 'pending';
}

// Reconcile a single payment with CoinPayments. Returns the new status.
export async function reconcilePayment(paymentId: string): Promise<{
  previous: string;
  current: string;
  cpStatus: string | null;
}> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw notFound('Payment not found');

  if (payment.status !== 'pending') {
    return { previous: payment.status, current: payment.status, cpStatus: null };
  }

  const invoice = await getInvoiceByPaymentId(paymentId);
  if (!invoice) {
    return { previous: 'pending', current: 'pending', cpStatus: null };
  }

  const normalized = normalizeCpInvoiceStatus(invoice.status);
  if (normalized === payment.status) {
    return { previous: payment.status, current: payment.status, cpStatus: invoice.status };
  }

  await applyIpn({
    paymentId,
    providerId: invoice.id,
    status: normalized,
    txid: invoice.payments?.[0]?.paymentAddress ?? undefined,
    rawPayload: { source: 'reconcile', invoice },
  });

  return { previous: 'pending', current: normalized, cpStatus: invoice.status };
}

// Bulk reconcile recent pending payments (called by cron).
export async function reconcilePendingPayments(minutesAgo = 5, limit = 50): Promise<number> {
  const since = new Date(Date.now() - minutesAgo * 60_000);
  const pending = await prisma.payment.findMany({
    where: {
      provider: 'coinpayments',
      status: 'pending',
      createdAt: { lt: since },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  let updated = 0;
  for (const p of pending) {
    try {
      const r = await reconcilePayment(p.id);
      if (r.current !== r.previous) updated++;
    } catch {
      // skip and try next
    }
  }
  return updated;
}
