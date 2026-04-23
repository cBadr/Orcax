import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';

// Public: simple list for filter UI (names + ids, active only, counts)
export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.get('/', async (req) => {
    const q = z
      .object({
        search: z.string().max(64).optional(),
        countryId: z.coerce.number().int().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(500).default(200),
      })
      .parse(req.query);
    const where = {
      isActive: true,
      ...(q.search ? { name: { contains: q.search.toLowerCase() } } : {}),
      ...(q.countryId ? { countryId: q.countryId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.domain.findMany({
        where,
        orderBy: { emailsCount: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          name: true,
          tld: true,
          countryId: true,
          emailsCount: true,
        },
      }),
      prisma.domain.count({ where }),
    ]);
    return {
      items: items.map((d) => ({ ...d, emailsCount: d.emailsCount.toString() })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
};

// Admin CRUD
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.DOMAINS_MANAGE));

  app.get('/', async (req) => {
    const q = z
      .object({
        search: z.string().max(64).optional(),
        countryId: z.coerce.number().int().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(500).default(50),
      })
      .parse(req.query);
    const where = {
      ...(q.search ? { name: { contains: q.search.toLowerCase() } } : {}),
      ...(q.countryId ? { countryId: q.countryId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.domain.findMany({
        where,
        orderBy: { emailsCount: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { country: true, pricing: true },
      }),
      prisma.domain.count({ where }),
    ]);
    return {
      items: items.map((d) => ({ ...d, emailsCount: d.emailsCount.toString() })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.patch('/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z
      .object({
        countryId: z.number().int().positive().nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await prisma.domain.update({ where: { id }, data: body });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'domain.update',
      targetType: 'domain',
      targetId: id.toString(),
      diff: body,
      ip: req.ip,
    });
    return { ...updated, emailsCount: updated.emailsCount.toString() };
  });

  app.delete('/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    // This cascades to emails via foreign key? No — Email has no onDelete cascade.
    // Admin must first remove emails via the emails module.
    await prisma.domain.delete({ where: { id } });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'domain.delete',
      targetType: 'domain',
      targetId: id.toString(),
      ip: req.ip,
    });
    return { ok: true };
  });
};
