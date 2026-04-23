import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, validators } from '@platform/shared';
import * as service from './payments.service.js';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';
import { verifyIpnSignature } from '../../lib/coinpayments.js';
import { notFound } from '../../lib/errors.js';

// User-facing (authed)
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/billing/payments', async (req) => {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(req.query);
    return service.listUserPayments(req.currentUser!.id, q.page, q.pageSize);
  });

  app.get('/billing/payments/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return service.getPayment(req.currentUser!.id, id);
  });

  // User can ask to re-check their own pending payment immediately.
  app.post('/billing/payments/:id/reconcile', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.userId !== req.currentUser!.id) {
      return { ok: false };
    }
    const r = await service.reconcilePayment(id);
    return r;
  });

  app.post('/billing/topup', async (req) => {
    const body = validators.topupSchema.parse(req.body);
    const res = await service.createTopup({
      userId: req.currentUser!.id,
      amountUsd: body.amountUsd,
      currency: body.currency,
    });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'billing.topup.create',
      targetType: 'payment',
      targetId: res.paymentId,
      diff: { amountUsd: body.amountUsd, currency: body.currency },
      ip: req.ip,
    });
    return res;
  });

  // Estimate (how many points for X USD?)
  app.post('/billing/estimate', async (req) => {
    const body = z.object({ amountUsd: z.number().positive() }).parse(req.body);
    const calc = await service.calculatePoints(body.amountUsd, req.currentUser!.id);
    return {
      basePoints: calc.basePoints.toString(),
      bonusPoints: calc.bonusPoints.toString(),
      resellerBonusPoints: calc.resellerBonusPoints.toString(),
      totalPoints: calc.totalPoints.toString(),
      bonusPct: calc.bonusPct,
      resellerPct: calc.resellerPct,
    };
  });
};

// IPN webhook (no auth, HMAC verified)
export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/coinpayments/ipn',
    {
      config: {
        // Opt into receiving the raw body string (see server plugin below).
        rawBody: true,
      },
    },
    async (req, reply) => {
      const rawBody =
        (req as unknown as { rawBody?: string }).rawBody ??
        (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

      const signature = (req.headers['x-coinpayments-signature'] ??
        req.headers['signature'] ??
        '') as string;
      const cpClient = (req.headers['x-coinpayments-client'] ?? '') as string;
      const cpTimestamp = (req.headers['x-coinpayments-timestamp'] ?? '') as string;
      const fullUrl = `${req.protocol}://${req.hostname}${req.url}`;

      const valid = await verifyIpnSignature(
        rawBody,
        signature,
        cpClient,
        cpTimestamp,
        req.method,
        fullUrl,
      );
      if (!valid) {
        req.log.warn('Invalid IPN signature');
        return reply.code(401).send({ error: 'INVALID_SIGNATURE' });
      }

      let parsed: {
        type?: string;
        invoice?: { id?: string; invoiceId?: string; metadata?: { paymentId?: string } };
        id?: string;
        txid?: string;
      };
      try {
        parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : (req.body as never);
      } catch {
        return reply.code(400).send({ error: 'INVALID_JSON' });
      }

      const paymentId =
        parsed.invoice?.metadata?.paymentId ??
        parsed.invoice?.invoiceId ??
        parsed.invoice?.id ??
        parsed.id;
      if (!paymentId) return reply.code(400).send({ error: 'MISSING_PAYMENT_ID' });

      const status = service.normalizeCpStatus(parsed.type ?? 'invoicePending');

      await service.applyIpn({
        paymentId,
        providerId: parsed.invoice?.id ?? parsed.id,
        status,
        txid: parsed.txid,
        rawPayload: parsed,
      });

      return reply.send({ ok: true });
    },
  );
};

// Admin
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.PAYMENTS_VIEW));

  app.get('/', async (req) => {
    const q = z
      .object({
        status: z.string().optional(),
        userEmail: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(30),
      })
      .parse(req.query);

    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.userEmail) {
      const u = await prisma.user.findUnique({
        where: { emailNormalized: q.userEmail.toLowerCase() },
      });
      where.userId = u?.id ?? '__none__';
    }

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { email: true } } },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        ...service.serializePayment(p),
        userEmail: p.user.email,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // Admin manual point adjust
  app.post('/adjust-balance', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_ADJUST_BALANCE)) {
      throw notFound();
    }
    const body = z
      .object({
        userId: z.string(),
        amountPoints: z.number().int(),
        note: z.string().max(500).default(''),
      })
      .parse(req.body);
    const res = await service.adminAdjustBalance({
      actorId: req.currentUser!.id,
      userId: body.userId,
      amountPoints: BigInt(body.amountPoints),
      note: body.note,
    });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'balance.adjust',
      targetType: 'user',
      targetId: body.userId,
      diff: body,
      ip: req.ip,
    });
    return res;
  });

  // Admin: re-check a pending payment against CoinPayments API
  app.post('/:id/reconcile', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.PAYMENTS_MANAGE)) {
      throw notFound();
    }
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const r = await service.reconcilePayment(id);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'payment.reconcile',
      targetType: 'payment',
      targetId: id,
      diff: r,
      ip: req.ip,
    });
    return r;
  });

  // Admin: force-confirm a stuck payment
  app.post('/:id/force-confirm', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.PAYMENTS_MANAGE)) {
      throw notFound();
    }
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await service.applyIpn({
      paymentId: id,
      status: 'confirmed',
      rawPayload: { manualForce: true, actor: req.currentUser!.id },
    });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'payment.force_confirm',
      targetType: 'payment',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });
};
