import { Queue, QueueEvents } from 'bullmq';
import { bullConnection } from './redis.js';

export const QUEUES = {
  INGESTION: 'ingestion',
  EXPORT: 'export',
  GOFILE: 'gofile',
  EMAIL: 'email',
  CLEANUP: 'cleanup',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

const queues: Record<string, Queue> = {};

export function getQueue(name: QueueName): Queue {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: bullConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000, age: 86400 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queues[name]!;
}

export interface IngestionScanJob {
  type: 'scan_folder';
  folderId: number;
}

export interface IngestionFileJob {
  type: 'process_file';
  fileId: number;
}

export type IngestionJob = IngestionScanJob | IngestionFileJob;

export async function enqueueFolderScan(folderId: number) {
  return getQueue(QUEUES.INGESTION).add(
    'scan_folder',
    { type: 'scan_folder', folderId } satisfies IngestionScanJob,
    { jobId: `scan-${folderId}` },
  );
}

export async function enqueueFileProcess(fileId: number) {
  return getQueue(QUEUES.INGESTION).add(
    'process_file',
    { type: 'process_file', fileId } satisfies IngestionFileJob,
    { jobId: `file-${fileId}` },
  );
}

export interface ExportJobInput {
  exportId: string;
}

export async function enqueueExport(exportId: string) {
  return getQueue(QUEUES.EXPORT).add(
    'run_export',
    { exportId } satisfies ExportJobInput,
    { jobId: `export-${exportId}` },
  );
}
