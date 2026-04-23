import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { enqueueExport } from '../../lib/queue.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { recordAudit } from '../../lib/audit.js';
import { getSetting, SETTING_KEYS } from '../../lib/settings.js';

export async function createExportJob(userId: string, orderId: string, format: 'txt' | 'csv') {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw notFound('Order not found');

  const maxExport = await getSetting<number>(SETTING_KEYS.MAX_EXPORT_SIZE);
  if (order.totalCount > maxExport) {
    throw badRequest(`Order exceeds max export size (${maxExport}).`);
  }

  const job = await prisma.exportJob.create({
    data: {
      userId,
      orderId,
      format,
      totalCount: order.totalCount,
      status: 'queued',
    },
  });
  await enqueueExport(job.id);
  return job;
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/exports', async (req) => {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(req.query);
    const [items, total] = await Promise.all([
      prisma.exportJob.findMany({
        where: { userId: req.currentUser!.id },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.exportJob.count({ where: { userId: req.currentUser!.id } }),
    ]);
    return {
      items: items.map((e) => ({
        ...e,
        fileSizeBytes: e.fileSizeBytes?.toString() ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get('/exports/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const e = await prisma.exportJob.findUnique({ where: { id } });
    if (!e || e.userId !== req.currentUser!.id) throw notFound();
    return { ...e, fileSizeBytes: e.fileSizeBytes?.toString() ?? null };
  });

  app.post('/orders/:orderId/export', async (req) => {
    const { orderId } = z.object({ orderId: z.string() }).parse(req.params);
    const body = z.object({ format: z.enum(['txt', 'csv']).default('txt') }).parse(req.body ?? {});
    const job = await createExportJob(req.currentUser!.id, orderId, body.format);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'export.create',
      targetType: 'order',
      targetId: orderId,
      diff: { format: body.format },
      ip: req.ip,
    });
    return {
      id: job.id,
      status: job.status,
      format: job.format,
      totalCount: job.totalCount,
    };
  });

  // Download a local export file. Once the retention expires the file is gone;
  // the GoFile link still works.
  app.get('/exports/:id/download', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const e = await prisma.exportJob.findUnique({ where: { id } });
    if (!e || e.userId !== req.currentUser!.id) throw notFound();
    if (e.status !== 'done') throw badRequest('Export not ready');
    if (!e.filePath || !fs.existsSync(e.filePath)) {
      if (e.goFileUrl) {
        return reply.redirect(e.goFileUrl);
      }
      throw notFound('Export file no longer available locally');
    }
    const filename = `export-${e.id}.${e.format}`;
    reply.header('content-disposition', `attachment; filename="${filename}"`);
    reply.header('content-type', e.format === 'csv' ? 'text/csv' : 'text/plain');
    return reply.send(fs.createReadStream(e.filePath));
  });
};

export default routes;
