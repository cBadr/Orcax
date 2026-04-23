// Worker bootstrap. Run with: `pnpm --filter @platform/api dev:workers`
// Workers are kept in their own process so API latency is unaffected by
// heavy background jobs (ingestion, exports, cleanup).
import { startIngestionWorker } from './ingestion.worker.js';
import { startCleanupWorker } from './cleanup.worker.js';
import { startExportWorker } from './export.worker.js';

const workers = [startIngestionWorker(), startCleanupWorker(), startExportWorker()];

console.log(`Started ${workers.length} worker(s): ingestion, cleanup, export`);

process.on('SIGINT', async () => {
  console.log('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});
