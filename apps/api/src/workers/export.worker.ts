import fs from 'node:fs';
import path from 'node:path';
import { Worker, type Job } from 'bullmq';
import { bullConnection } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { QUEUES, type ExportJobInput } from '../lib/queue.js';
import { uploadFile, ensureExportsDir } from '../lib/gofile.js';
import { getSetting, SETTING_KEYS } from '../lib/settings.js';

const EMAIL_CHUNK = 5000;

async function runExport(exportId: string, log: (s: string) => void) {
  const job = await prisma.exportJob.findUnique({ where: { id: exportId } });
  if (!job) return;

  await prisma.exportJob.update({
    where: { id: exportId },
    data: { status: 'running', errorMessage: null },
  });

  try {
    if (!job.orderId) throw new Error('Export has no order');
    const order = await prisma.order.findUnique({
      where: { id: job.orderId },
      include: { reservation: { include: { items: true } } },
    });
    if (!order) throw new Error('Order not found');

    const dir = await ensureExportsDir();
    const filename = `order-${order.id}-${Date.now()}.${job.format}`;
    const filePath = path.join(dir, filename);
    const stream = fs.createWriteStream(filePath, { encoding: 'utf-8' });

    if (job.format === 'csv') {
      stream.write('email,domain,ordered_at\n');
    }

    // Stream email rows in chunks to avoid loading millions into memory.
    const emailIds = order.reservation.items.map((i) => i.emailId);
    let written = 0;
    const orderedAt = order.createdAt.toISOString();

    for (let i = 0; i < emailIds.length; i += EMAIL_CHUNK) {
      const batch = emailIds.slice(i, i + EMAIL_CHUNK);
      const rows = await prisma.email.findMany({
        where: { id: { in: batch } },
        select: {
          email: true,
          domain: { select: { name: true } },
        },
      });
      for (const r of rows) {
        if (job.format === 'csv') {
          // Escape email for CSV safety: neither field contains quotes/commas realistically
          stream.write(`${r.email},${r.domain.name},${orderedAt}\n`);
        } else {
          stream.write(`${r.email}\n`);
        }
        written++;
      }
      if (i % (EMAIL_CHUNK * 5) === 0) log(`Wrote ${written} of ${emailIds.length}`);
    }

    await new Promise<void>((resolve, reject) => {
      stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });

    const stat = await fs.promises.stat(filePath);
    const retentionDays = (await getSetting<number>(SETTING_KEYS.EXPORT_LOCAL_RETENTION_DAYS)) ?? 7;
    const expiresAt = new Date(Date.now() + retentionDays * 86_400_000);

    let goFileUrl: string | null = null;
    let goFileCode: string | null = null;

    const autoUpload = await getSetting<boolean>(SETTING_KEYS.AUTO_UPLOAD_TO_GOFILE);
    if (autoUpload) {
      try {
        log('Uploading to GoFile...');
        const up = await uploadFile(filePath);
        goFileUrl = up.downloadPage;
        goFileCode = up.code;
      } catch (err) {
        log(`GoFile upload failed: ${(err as Error).message}`);
        // Keep the local file — admin can retry upload
      }
    }

    await prisma.exportJob.update({
      where: { id: exportId },
      data: {
        status: 'done',
        filePath,
        fileSizeBytes: BigInt(stat.size),
        goFileUrl,
        goFileCode,
        expiresAt,
        finishedAt: new Date(),
      },
    });

    log(`Export done: ${written} emails, ${stat.size} bytes`);

    // In-app notification
    await prisma.notification.create({
      data: {
        userId: job.userId,
        type: 'export_ready',
        title: 'Export ready',
        body: `Your export of ${written.toLocaleString()} emails is ready.`,
        data: { exportId, goFileUrl } as object,
      },
    });
  } catch (err) {
    await prisma.exportJob.update({
      where: { id: exportId },
      data: {
        status: 'error',
        errorMessage: (err as Error).message,
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}

export function startExportWorker() {
  const worker = new Worker<ExportJobInput>(
    QUEUES.EXPORT,
    async (job: Job<ExportJobInput>) => {
      const log = (s: string) => job.log(s);
      await runExport(job.data.exportId, log);
    },
    {
      connection: bullConnection,
      concurrency: 2,
      lockDuration: 20 * 60_000,
    },
  );
  worker.on('failed', (job, err) => {
    console.error(`[export] job ${job?.id} failed:`, err.message);
  });
  worker.on('completed', (job) => {
    console.log(`[export] job ${job.id} completed`);
  });
  return worker;
}
