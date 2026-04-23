import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validators } from '@platform/shared';
import * as service from './search.service.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // Run a search (free; returns preview + estimated cost)
  app.post('/search', async (req) => {
    const body = validators.searchFiltersSchema.parse(req.body);
    return service.runSearch(req.currentUser!.id, body);
  });

  // Create reservation from filters (locks emails for TTL minutes)
  app.post('/reservations', async (req) => {
    const body = z
      .object({
        searchId: z.string().optional().nullable(),
        filters: validators.searchFiltersSchema,
      })
      .parse(req.body);
    const res = await service.createReservation(
      req.currentUser!.id,
      body.searchId ?? null,
      body.filters,
    );
    return res;
  });

  // Get reservation details
  app.get('/reservations/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return service.getReservation(req.currentUser!.id, id);
  });

  // Cancel reservation
  app.delete('/reservations/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await service.cancelReservation(req.currentUser!.id, id);
    return { ok: true };
  });

  // Confirm reservation -> deduct points, create order
  app.post('/reservations/:id/confirm', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return service.confirmReservation(req.currentUser!.id, id);
  });

  // Search history (last 50)
  app.get('/search/history', async (req) => {
    const rows = await prisma.search.findMany({
      where: { userId: req.currentUser!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows;
  });

  // User orders
  app.get('/orders', async (req) => {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(req.query);
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.currentUser!.id },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.order.count({ where: { userId: req.currentUser!.id } }),
    ]);
    return {
      items: items.map((o) => ({ ...o, totalPoints: o.totalPoints.toString() })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // Order detail (with emails — only for the order owner)
  app.get('/orders/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        reservation: {
          include: {
            items: {
              take: 500,
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    });
    if (!order || order.userId !== req.currentUser!.id) throw notFound();

    // Fetch actual emails
    const emailIds = order.reservation.items.map((i) => i.emailId);
    const emails = emailIds.length
      ? await prisma.email.findMany({
          where: { id: { in: emailIds } },
          select: { id: true, email: true, domain: { select: { name: true } } },
        })
      : [];

    return {
      id: order.id,
      status: order.status,
      totalCount: order.totalCount,
      totalPoints: order.totalPoints.toString(),
      createdAt: order.createdAt,
      emailsPreview: emails.slice(0, 100).map((e) => e.email),
      emailsCountReturned: emails.length,
    };
  });

  // User ledger
  app.get('/me/ledger', async (req) => {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(req.query);
    const [items, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { userId: req.currentUser!.id },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.ledgerEntry.count({ where: { userId: req.currentUser!.id } }),
    ]);
    return {
      items: items.map((l) => ({
        ...l,
        id: l.id.toString(),
        amount: l.amount.toString(),
        balanceAfter: l.balanceAfter.toString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
};

export default routes;
