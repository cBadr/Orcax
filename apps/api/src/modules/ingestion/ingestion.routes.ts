import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS } from '@platform/shared';
import * as service from './ingestion.service.js';
import { recordAudit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.INGESTION_MANAGE));

  // List folders
  app.get('/folders', async () => {
    const folders = await prisma.emailFolder.findMany({ orderBy: { createdAt: 'desc' } });
    return folders.map((f) => ({
      ...f,
      emailsCount: f.emailsCount.toString(),
    }));
  });

  // Add folder
  app.post('/folders', async (req) => {
    const body = z
      .object({
        path: z.string().min(1),
        label: z.string().max(128).optional().nullable(),
      })
      .parse(req.body);
    const folder = await service.addFolder({ path: body.path, label: body.label ?? undefined });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'ingestion.folder.add',
      targetType: 'folder',
      targetId: folder.id.toString(),
      diff: { path: folder.path, label: folder.label },
      ip: req.ip,
    });
    return { ...folder, emailsCount: folder.emailsCount.toString() };
  });

  // Start scan
  app.post('/folders/:id/scan', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await service.startScan(id);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'ingestion.folder.scan',
      targetType: 'folder',
      targetId: id.toString(),
      ip: req.ip,
    });
    return { ok: true };
  });

  // Folder detail + stats
  app.get('/folders/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const { folder, byStatus } = await service.folderStats(id);
    return { ...folder, emailsCount: folder.emailsCount.toString(), byStatus };
  });

  // Files under a folder
  app.get('/folders/:id/files', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const q = z
      .object({
        status: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(200).default(50),
      })
      .parse(req.query);
    const where = { folderId: id, ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.emailFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.emailFile.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  // Rescan a file
  app.post('/files/:id/rescan', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await service.rescanFile(id);
    return { ok: true };
  });

  // Delete folder
  app.delete('/folders/:id', async (req) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const q = z
      .object({ deleteEmails: z.coerce.boolean().default(false) })
      .parse(req.query);
    await service.deleteFolder(id, q.deleteEmails);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'ingestion.folder.delete',
      targetType: 'folder',
      targetId: id.toString(),
      diff: { deleteEmails: q.deleteEmails },
      ip: req.ip,
    });
    return { ok: true };
  });
};

export default routes;
