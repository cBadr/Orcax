import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, ROLES } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.ADMIN_DASHBOARD_VIEW));

  // ===== Dashboard stats =====
  app.get('/stats/overview', async () => {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const d7 = new Date(now.getTime() - 7 * 86_400_000);

    const [
      totalUsers,
      newUsers30d,
      totalEmails,
      availableEmails,
      totalOrders,
      revenue30d,
      revenueAll,
      topDomains,
      revenueByDay,
      ordersByDay,
      pendingTickets,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: d30 } } }),
      prisma.email.count(),
      prisma.email.count({ where: { status: 'available' } }),
      prisma.order.count(),
      prisma.payment.aggregate({
        where: { status: 'confirmed', createdAt: { gte: d30 } },
        _sum: { amountUsd: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'confirmed' },
        _sum: { amountUsd: true },
      }),
      prisma.domain.findMany({
        orderBy: { emailsCount: 'desc' },
        take: 10,
        select: { name: true, emailsCount: true },
      }),
      prisma.$queryRaw<Array<{ day: Date; amount: number }>>`
        SELECT date_trunc('day', "createdAt") AS day,
               COALESCE(SUM("amountUsd"), 0)::float AS amount
        FROM "Payment"
        WHERE status = 'confirmed' AND "createdAt" >= ${d30}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Order"
        WHERE "createdAt" >= ${d30}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.ticket.count({ where: { status: 'open' } }),
    ]);

    return {
      users: { total: totalUsers, new30d: newUsers30d },
      emails: { total: totalEmails, available: availableEmails },
      orders: { total: totalOrders },
      revenue: {
        total: revenueAll._sum.amountUsd?.toString() ?? '0',
        last30d: revenue30d._sum.amountUsd?.toString() ?? '0',
      },
      topDomains: topDomains.map((d) => ({
        name: d.name,
        count: d.emailsCount.toString(),
      })),
      revenueByDay: revenueByDay.map((r) => ({
        day: r.day,
        amount: Number(r.amount),
      })),
      ordersByDay: ordersByDay.map((r) => ({
        day: r.day,
        count: Number(r.count),
      })),
      pendingTickets,
      _since: { d30, d7 },
    };
  });

  // Users management is in a dedicated module (users.routes.ts) to keep this file small.

  // ===== Roles management =====
  app.get('/roles', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.ROLES_MANAGE)) throw notFound();
    const roles = await prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { id: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      isSystem: r.isSystem,
      usersCount: r._count.users,
      permissions: r.permissions.map((rp) => rp.permission.key),
    }));
  });

  app.get('/permissions', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.ROLES_MANAGE)) throw notFound();
    return prisma.permission.findMany({ orderBy: { key: 'asc' } });
  });

  app.put('/roles/:id/permissions', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.ROLES_MANAGE)) throw notFound();
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = z.object({ permissions: z.array(z.string()) }).parse(req.body);
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw notFound();
    if (role.name === ROLES.SUPER_ADMIN) throw badRequest('Cannot modify super admin');

    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    for (const key of body.permissions) {
      const p = await prisma.permission.findUnique({ where: { key } });
      if (p) {
        await prisma.rolePermission.create({
          data: { roleId: id, permissionId: p.id },
        });
      }
    }
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'role.permissions.update',
      targetType: 'role',
      targetId: id.toString(),
      diff: body,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Audit log viewer =====
  app.get('/audit', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.AUDIT_VIEW)) throw notFound();
    const q = z
      .object({
        action: z.string().optional(),
        actorEmail: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(50),
      })
      .parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.action) where.action = { contains: q.action };
    if (q.actorEmail) {
      const u = await prisma.user.findUnique({
        where: { emailNormalized: q.actorEmail.toLowerCase() },
      });
      where.actorId = u?.id ?? '__none__';
    }
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map((a) => ({
        id: a.id.toString(),
        action: a.action,
        actorEmail: a.actor?.email ?? 'system',
        targetType: a.targetType,
        targetId: a.targetId,
        diff: a.diff,
        ip: a.ip,
        createdAt: a.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
};

export default routes;
