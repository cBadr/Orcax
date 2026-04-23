import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, ROLES } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';
import { invalidateUserCache } from '../../plugins/auth.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.RESELLERS_MANAGE));

  // Tiers
  app.get('/tiers', async () => {
    const tiers = await prisma.resellerTier.findMany({
      orderBy: { discountPct: 'desc' },
      include: { _count: { select: { users: true } } },
    });
    return tiers;
  });

  app.post('/tiers', async (req) => {
    const body = z
      .object({
        name: z.string().min(1).max(64),
        discountPct: z.number().min(0).max(100),
        description: z.string().max(500).optional(),
      })
      .parse(req.body);
    const t = await prisma.resellerTier.create({ data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'reseller.tier.create',
      targetId: t.id.toString(),
      diff: body,
      ip: req.ip,
    });
    return t;
  });

  app.patch('/tiers/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z
      .object({
        name: z.string().optional(),
        discountPct: z.number().min(0).max(100).optional(),
        description: z.string().optional(),
      })
      .parse(req.body);
    const t = await prisma.resellerTier.update({ where: { id }, data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'reseller.tier.update',
      targetId: id.toString(),
      diff: body,
      ip: req.ip,
    });
    return t;
  });

  app.delete('/tiers/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    // Unassign users first
    await prisma.user.updateMany({ where: { resellerTierId: id }, data: { resellerTierId: null } });
    await prisma.resellerTier.delete({ where: { id } });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'reseller.tier.delete',
      targetId: id.toString(),
      ip: req.ip,
    });
    return { ok: true };
  });

  // Assign user
  app.post('/assign', async (req) => {
    const body = z
      .object({
        userId: z.string(),
        tierId: z.number().int().positive().nullable(),
      })
      .parse(req.body);

    const resellerRole = await prisma.role.findUnique({ where: { name: ROLES.RESELLER } });
    const userRole = await prisma.role.findUnique({ where: { name: ROLES.USER } });

    await prisma.user.update({
      where: { id: body.userId },
      data: {
        resellerTierId: body.tierId,
        // Promote to reseller role when tier assigned; back to user if removed.
        roleId: body.tierId ? resellerRole?.id ?? undefined : userRole?.id ?? undefined,
      },
    });
    await invalidateUserCache(body.userId);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'reseller.assign',
      targetType: 'user',
      targetId: body.userId,
      diff: body,
      ip: req.ip,
    });
    return { ok: true };
  });

  // List resellers (users with tier)
  app.get('/users', async () => {
    const users = await prisma.user.findMany({
      where: { resellerTierId: { not: null } },
      include: { resellerTier: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      tier: u.resellerTier?.name,
      discountPct: u.resellerTier?.discountPct,
      balancePoints: u.balancePoints.toString(),
      createdAt: u.createdAt,
    }));
  });
};

export default routes;
