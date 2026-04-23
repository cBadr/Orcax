import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/notifications', async (req) => {
    const q = z
      .object({
        limit: z.coerce.number().int().positive().max(100).default(30),
        onlyUnread: z.coerce.boolean().default(false),
      })
      .parse(req.query);
    const where: Record<string, unknown> = { userId: req.currentUser!.id };
    if (q.onlyUnread) where.readAt = null;
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
      }),
      prisma.notification.count({
        where: { userId: req.currentUser!.id, readAt: null },
      }),
    ]);
    return {
      unreadCount,
      items: items.map((n) => ({
        id: n.id.toString(),
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    };
  });

  app.post('/notifications/:id/read', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const n = await prisma.notification.findUnique({ where: { id: BigInt(id) } });
    if (!n || n.userId !== req.currentUser!.id) throw notFound();
    await prisma.notification.update({
      where: { id: BigInt(id) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.post('/notifications/read-all', async (req) => {
    await prisma.notification.updateMany({
      where: { userId: req.currentUser!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
};

export default routes;
