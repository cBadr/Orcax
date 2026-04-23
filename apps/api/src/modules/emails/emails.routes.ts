import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.EMAILS_VIEW));

  // Global email stats
  app.get('/stats', async () => {
    const [total, byStatus, domainsCount, foldersCount] = await Promise.all([
      prisma.email.count(),
      prisma.email.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.domain.count(),
      prisma.emailFolder.count(),
    ]);
    const stats: Record<string, number> = { available: 0, reserved: 0, sold: 0 };
    for (const row of byStatus) stats[row.status] = row._count._all;
    return { total, byStatus: stats, domainsCount, foldersCount };
  });

  // List/search emails (admin debugging)
  app.get('/', async (req) => {
    const q = z
      .object({
        domain: z.string().optional(),
        status: z.string().optional(),
        search: z.string().max(64).optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(200).default(50),
      })
      .parse(req.query);

    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.domain) {
      const d = await prisma.domain.findUnique({ where: { name: q.domain.toLowerCase() } });
      where.domainId = d?.id ?? -1;
    }
    if (q.search) where.localPart = { contains: q.search.toLowerCase() };

    const [items, total] = await Promise.all([
      prisma.email.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { domain: { select: { name: true } } },
      }),
      prisma.email.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id.toString(),
        email: e.email,
        status: e.status,
        domain: e.domain.name,
        reservedUntil: e.reservedUntil,
        availableAfter: e.availableAfter,
        createdAt: e.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // Bulk delete by domain
  app.delete('/by-domain/:domainId', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.EMAILS_DELETE)) {
      return { error: 'FORBIDDEN' };
    }
    const { domainId } = z
      .object({ domainId: z.coerce.number().int().positive() })
      .parse(req.params);
    const result = await prisma.email.deleteMany({ where: { domainId } });
    await prisma.domain.update({
      where: { id: domainId },
      data: { emailsCount: 0 },
    });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'emails.delete_by_domain',
      targetType: 'domain',
      targetId: domainId.toString(),
      diff: { deleted: result.count },
      ip: req.ip,
    });
    return { ok: true, deleted: result.count };
  });
};

export default routes;
