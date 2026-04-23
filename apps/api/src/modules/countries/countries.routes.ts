import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';

// Public (for user-facing filter dropdowns)
export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => {
    const countries = await prisma.country.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return countries;
  });
};

// Admin CRUD
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.COUNTRIES_MANAGE));

  app.get('/', async () => {
    return prisma.country.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { domains: true } } },
    });
  });

  app.post('/', async (req) => {
    const body = z
      .object({
        code: z.string().length(2).toUpperCase(),
        name: z.string().min(1).max(64),
        isActive: z.boolean().default(true),
      })
      .parse(req.body);
    const country = await prisma.country.create({ data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'country.create',
      targetType: 'country',
      targetId: country.id.toString(),
      diff: body,
      ip: req.ip,
    });
    return country;
  });

  app.patch('/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).max(64).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const existing = await prisma.country.findUnique({ where: { id } });
    if (!existing) throw notFound();
    const updated = await prisma.country.update({ where: { id }, data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'country.update',
      targetType: 'country',
      targetId: id.toString(),
      diff: body,
      ip: req.ip,
    });
    return updated;
  });

  app.delete('/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    // Unlink domains first (set countryId null)
    await prisma.domain.updateMany({ where: { countryId: id }, data: { countryId: null } });
    await prisma.country.delete({ where: { id } });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'country.delete',
      targetType: 'country',
      targetId: id.toString(),
      ip: req.ip,
    });
    return { ok: true };
  });
};
