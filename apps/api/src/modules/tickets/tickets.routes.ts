import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, validators } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { notFound, forbidden } from '../../lib/errors.js';
import { recordAudit } from '../../lib/audit.js';

async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: object,
) {
  try {
    await prisma.notification.create({
      data: { userId, type, title, body, data: data as object },
    });
  } catch {
    // ignore
  }
}

// User-facing
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/tickets', async (req) => {
    const rows = await prisma.ticket.findMany({
      where: { userId: req.currentUser!.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    return rows;
  });

  app.get('/tickets/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const t = await prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { email: true, role: { select: { name: true } } } } },
        },
      },
    });
    if (!t || t.userId !== req.currentUser!.id) throw notFound();
    return {
      ...t,
      messages: t.messages.map((m) => ({
        id: m.id.toString(),
        body: m.body,
        authorType: m.authorType,
        authorEmail: m.author.email,
        authorRole: m.author.role.name,
        createdAt: m.createdAt,
      })),
    };
  });

  app.post('/tickets', async (req) => {
    const body = validators.ticketCreateSchema.parse(req.body);
    const t = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          userId: req.currentUser!.id,
          subject: body.subject,
          priority: body.priority,
          status: 'open',
        },
      });
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: req.currentUser!.id,
          authorType: 'user',
          body: body.message,
        },
      });
      return ticket;
    });
    return t;
  });

  app.post('/tickets/:id/reply', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = validators.ticketReplySchema.parse(req.body);
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t || t.userId !== req.currentUser!.id) throw notFound();
    if (t.status === 'closed') throw forbidden('Ticket is closed');

    await prisma.$transaction([
      prisma.ticketMessage.create({
        data: {
          ticketId: id,
          authorId: req.currentUser!.id,
          authorType: 'user',
          body: body.message,
        },
      }),
      prisma.ticket.update({ where: { id }, data: { status: 'open', updatedAt: new Date() } }),
    ]);
    return { ok: true };
  });

  app.post('/tickets/:id/close', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t || t.userId !== req.currentUser!.id) throw notFound();
    await prisma.ticket.update({ where: { id }, data: { status: 'closed' } });
    return { ok: true };
  });
};

// Admin
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.TICKETS_VIEW));

  app.get('/', async (req) => {
    const q = z
      .object({
        status: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(30),
      })
      .parse(req.query);
    const where = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          user: { select: { email: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);
    return {
      items: items.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        userEmail: t.user.email,
        messagesCount: t._count.messages,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const t = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user: { select: { email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { email: true, role: { select: { name: true } } } } },
        },
      },
    });
    if (!t) throw notFound();
    return {
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      userEmail: t.user.email,
      userId: t.userId,
      createdAt: t.createdAt,
      messages: t.messages.map((m) => ({
        id: m.id.toString(),
        body: m.body,
        authorType: m.authorType,
        authorEmail: m.author.email,
        authorRole: m.author.role.name,
        createdAt: m.createdAt,
      })),
    };
  });

  app.post('/:id/reply', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.TICKETS_REPLY)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = validators.ticketReplySchema.parse(req.body);
    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw notFound();

    await prisma.$transaction([
      prisma.ticketMessage.create({
        data: {
          ticketId: id,
          authorId: req.currentUser!.id,
          authorType: 'staff',
          body: body.message,
        },
      }),
      prisma.ticket.update({
        where: { id },
        data: { status: 'answered', updatedAt: new Date() },
      }),
    ]);

    await createNotification(
      ticket.userId,
      'ticket_reply',
      'Support replied to your ticket',
      ticket.subject,
      { ticketId: id },
    );

    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'ticket.reply',
      targetType: 'ticket',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  app.post('/:id/status', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.TICKETS_REPLY)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ status: z.enum(['open', 'answered', 'closed']) }).parse(req.body);
    await prisma.ticket.update({ where: { id }, data: { status: body.status } });
    return { ok: true };
  });
};
