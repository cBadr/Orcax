import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';

// Public (authenticated users only) — returns active announcements.
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.get('/announcements', async () => {
    const now = new Date();
    return prisma.announcement.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  });
};

// Admin CRUD
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE));

  app.get('/', async () => prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } }));

  app.post('/', async (req) => {
    const body = z
      .object({
        title: z.string().min(1),
        body: z.string().min(1),
        type: z.enum(['info', 'warning', 'success']).default('info'),
        active: z.boolean().default(true),
        startsAt: z.coerce.date().nullable().optional(),
        endsAt: z.coerce.date().nullable().optional(),
      })
      .parse(req.body);
    const a = await prisma.announcement.create({ data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'announcement.create',
      targetId: a.id.toString(),
      diff: body,
      ip: req.ip,
    });
    return a;
  });

  app.patch('/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z
      .object({
        title: z.string().optional(),
        body: z.string().optional(),
        type: z.enum(['info', 'warning', 'success']).optional(),
        active: z.boolean().optional(),
        startsAt: z.coerce.date().nullable().optional(),
        endsAt: z.coerce.date().nullable().optional(),
      })
      .parse(req.body);
    const a = await prisma.announcement.update({ where: { id }, data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'announcement.update',
      targetId: id.toString(),
      diff: body,
      ip: req.ip,
    });
    return a;
  });

  app.delete('/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await prisma.announcement.delete({ where: { id } });
    return { ok: true };
  });
};
