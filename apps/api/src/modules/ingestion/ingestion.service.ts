import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma.js';
import { enqueueFileProcess, enqueueFolderScan } from '../../lib/queue.js';
import { badRequest, notFound } from '../../lib/errors.js';

export interface AddFolderInput {
  path: string;
  label?: string;
}

export async function addFolder(input: AddFolderInput) {
  const abs = path.resolve(input.path);
  if (!fs.existsSync(abs)) throw badRequest(`Folder does not exist: ${abs}`);
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) throw badRequest(`Not a directory: ${abs}`);

  const existing = await prisma.emailFolder.findUnique({ where: { path: abs } });
  if (existing) throw badRequest('Folder already registered');

  const folder = await prisma.emailFolder.create({
    data: { path: abs, label: input.label ?? null, status: 'idle' },
  });
  return folder;
}

export async function startScan(folderId: number) {
  const folder = await prisma.emailFolder.findUnique({ where: { id: folderId } });
  if (!folder) throw notFound('Folder not found');
  if (folder.status === 'scanning' || folder.status === 'processing') {
    throw badRequest('Folder is already being processed');
  }
  await prisma.emailFolder.update({
    where: { id: folderId },
    data: { status: 'scanning' },
  });
  await enqueueFolderScan(folderId);
  return { ok: true };
}

export async function rescanFile(fileId: number) {
  const file = await prisma.emailFile.findUnique({ where: { id: fileId } });
  if (!file) throw notFound('File not found');
  await prisma.emailFile.update({
    where: { id: fileId },
    data: { status: 'pending', errorMessage: null },
  });
  await enqueueFileProcess(fileId);
  return { ok: true };
}

export async function deleteFolder(folderId: number, deleteEmails: boolean) {
  const folder = await prisma.emailFolder.findUnique({ where: { id: folderId } });
  if (!folder) throw notFound('Folder not found');

  if (deleteEmails) {
    const files = await prisma.emailFile.findMany({
      where: { folderId },
      select: { id: true },
    });
    const fileIds = files.map((f) => f.id);
    if (fileIds.length > 0) {
      await prisma.email.deleteMany({ where: { sourceFileId: { in: fileIds } } });
    }
  }
  await prisma.emailFolder.delete({ where: { id: folderId } });
  return { ok: true };
}

export async function folderStats(folderId: number) {
  const folder = await prisma.emailFolder.findUniqueOrThrow({ where: { id: folderId } });
  const agg = await prisma.emailFile.groupBy({
    by: ['status'],
    where: { folderId },
    _count: { _all: true },
  });
  const byStatus: Record<string, number> = { pending: 0, processing: 0, done: 0, error: 0 };
  for (const row of agg) byStatus[row.status] = row._count._all;
  return { folder, byStatus };
}
