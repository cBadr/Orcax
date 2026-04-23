import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

// Admin-side Orders + Exports listing (across all users).
export const adminOrdersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.ORDERS_VIEW));

  app.get('/', async (req) => {
    const q = z
      .object({
        userEmail: z.string().optional(),
        status: z.string().optional(),
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
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { email: true } } },
      }),
      prisma.order.count({ where }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        userEmail: o.user.email,
        userId: o.userId,
        totalCount: o.totalCount,
        totalPoints: o.totalPoints.toString(),
        status: o.status,
        createdAt: o.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const o = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { email: true } },
        reservation: { include: { items: { take: 200 } } },
      },
    });
    if (!o) throw notFound();
    return {
      id: o.id,
      userEmail: o.user.email,
      userId: o.userId,
      totalCount: o.totalCount,
      totalPoints: o.totalPoints.toString(),
      status: o.status,
      createdAt: o.createdAt,
      emailsCount: o.reservation.items.length,
    };
  });
};

export const adminExportsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.ORDERS_VIEW));

  app.get('/', async (req) => {
    const q = z
      .object({
        userEmail: z.string().optional(),
        status: z.string().optional(),
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
      prisma.exportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { email: true } } },
      }),
      prisma.exportJob.count({ where }),
    ]);
    return {
      items: items.map((e) => ({
        id: e.id,
        userEmail: e.user.email,
        orderId: e.orderId,
        format: e.format,
        status: e.status,
        totalCount: e.totalCount,
        fileSizeBytes: e.fileSizeBytes?.toString() ?? null,
        goFileUrl: e.goFileUrl,
        expiresAt: e.expiresAt,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt,
        finishedAt: e.finishedAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
};
