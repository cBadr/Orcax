import fs from 'node:fs';
import { Worker, Queue } from 'bullmq';
import { bullConnection } from '../lib/redis.js';
import { QUEUES } from '../lib/queue.js';
import { expireOldReservations } from '../modules/search/search.service.js';
import { reconcilePendingPayments } from '../modules/payments/payments.service.js';
import { prisma } from '../lib/prisma.js';

// Recurring every 1 minute — release expired reservations, make cooled-down
// sold emails available again.
export function startCleanupWorker() {
  const queue = new Queue(QUEUES.CLEANUP, { connection: bullConnection });

  queue.add(
    'tick',
    {},
    {
      repeat: { every: 60_000 },
      jobId: 'cleanup-tick',
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  const worker = new Worker(
    QUEUES.CLEANUP,
    async () => {
      const released = await expireOldReservations();
      if (released > 0) console.log(`[cleanup] released ${released} expired emails`);

      // Revive cooled-down sold emails: sold -> available when availableAfter <= now
      const now = new Date();
      const revived = await prisma.email.updateMany({
        where: {
          status: 'sold',
          availableAfter: { lte: now, not: null },
        },
        data: {
          status: 'available',
          soldAt: null,
          availableAfter: null,
        },
      });
      if (revived.count > 0) console.log(`[cleanup] revived ${revived.count} cooled-down emails`);

      // Delete expired local export files (keep DB row + cloud link)
      const expiredExports = await prisma.exportJob.findMany({
        where: {
          status: 'done',
          expiresAt: { lt: now, not: null },
          filePath: { not: null },
        },
        take: 100,
      });
      for (const e of expiredExports) {
        if (e.filePath && fs.existsSync(e.filePath)) {
          try {
            await fs.promises.unlink(e.filePath);
          } catch {
            // ignore
          }
        }
        await prisma.exportJob.update({
          where: { id: e.id },
          data: { filePath: null },
        });
      }
      if (expiredExports.length > 0) {
        console.log(`[cleanup] purged ${expiredExports.length} expired export files`);
      }

      // Reconcile pending CoinPayments invoices (IPN fallback).
      // Only payments older than 2 minutes — avoid racing the initial IPN.
      try {
        const reconciled = await reconcilePendingPayments(2, 50);
        if (reconciled > 0) console.log(`[cleanup] reconciled ${reconciled} payments`);
      } catch (err) {
        console.error('[cleanup] reconcile failed:', (err as Error).message);
      }
    },
    { connection: bullConnection },
  );

  worker.on('failed', (_job, err) => {
    console.error('[cleanup] failed:', err.message);
  });

  return worker;
}
