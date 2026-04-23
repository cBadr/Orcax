import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.PRICING_MANAGE));

  // Default
  app.get('/default', async () => {
    const def = await prisma.pricingDefault.findFirst();
    return def ?? { pointsPerEmail: 1 };
  });
  app.put('/default', async (req) => {
    const body = z.object({ pointsPerEmail: z.number().int().positive() }).parse(req.body);
    const existing = await prisma.pricingDefault.findFirst();
    const updated = existing
      ? await prisma.pricingDefault.update({ where: { id: existing.id }, data: body })
      : await prisma.pricingDefault.create({ data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'pricing.default.update',
      diff: body,
      ip: req.ip,
    });
    return updated;
  });

  // TLD groups
  app.get('/tld-groups', async () => prisma.pricingTldGroup.findMany({ orderBy: { priority: 'asc' } }));
  app.post('/tld-groups', async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        tlds: z.array(z.string().min(1)),
        pointsPerEmail: z.number().int().positive(),
        priority: z.number().int().default(100),
      })
      .parse(req.body);
    const row = await prisma.pricingTldGroup.create({ data: body });
    await recordAudit({ actorId: req.currentUser!.id, action: 'pricing.tld.create', diff: body, ip: req.ip });
    return row;
  });
  app.patch('/tld-groups/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z
      .object({
        name: z.string().optional(),
        tlds: z.array(z.string()).optional(),
        pointsPerEmail: z.number().int().positive().optional(),
        priority: z.number().int().optional(),
      })
      .parse(req.body);
    const row = await prisma.pricingTldGroup.update({ where: { id }, data: body });
    await recordAudit({ actorId: req.currentUser!.id, action: 'pricing.tld.update', targetId: id.toString(), diff: body, ip: req.ip });
    return row;
  });
  app.delete('/tld-groups/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await prisma.pricingTldGroup.delete({ where: { id } });
    await recordAudit({ actorId: req.currentUser!.id, action: 'pricing.tld.delete', targetId: id.toString(), ip: req.ip });
    return { ok: true };
  });

  // Domain-specific
  app.get('/domains', async () => {
    const rows = await prisma.pricingDomain.findMany({
      include: { domain: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  });
  app.post('/domains', async (req) => {
    const body = z
      .object({
        domainId: z.number().int().positive(),
        pointsPerEmail: z.number().int().positive(),
      })
      .parse(req.body);
    const row = await prisma.pricingDomain.upsert({
      where: { domainId: body.domainId },
      create: body,
      update: { pointsPerEmail: body.pointsPerEmail },
    });
    await recordAudit({ actorId: req.currentUser!.id, action: 'pricing.domain.upsert', diff: body, ip: req.ip });
    return row;
  });
  app.delete('/domains/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await prisma.pricingDomain.delete({ where: { id } });
    return { ok: true };
  });

  // Bulk discounts
  app.get('/bulk-discounts', async () => prisma.bulkDiscount.findMany({ orderBy: { minQuantity: 'asc' } }));
  app.post('/bulk-discounts', async (req) => {
    const body = z
      .object({
        minQuantity: z.number().int().positive(),
        discountPct: z.number().min(0).max(100),
        active: z.boolean().default(true),
      })
      .parse(req.body);
    return prisma.bulkDiscount.create({ data: body });
  });
  app.delete('/bulk-discounts/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await prisma.bulkDiscount.delete({ where: { id } });
    return { ok: true };
  });

  // Top-up bonuses
  app.get('/topup-bonuses', async () => prisma.topupBonus.findMany({ orderBy: { minUsd: 'asc' } }));
  app.post('/topup-bonuses', async (req) => {
    const body = z
      .object({
        minUsd: z.number().positive(),
        bonusPct: z.number().min(0).max(500),
        active: z.boolean().default(true),
      })
      .parse(req.body);
    return prisma.topupBonus.create({ data: body });
  });
  app.delete('/topup-bonuses/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await prisma.topupBonus.delete({ where: { id } });
    return { ok: true };
  });
};

export default routes;
