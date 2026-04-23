import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Worker, type Job } from 'bullmq';
import { bullConnection } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { QUEUES, enqueueFileProcess, type IngestionJob } from '../lib/queue.js';
import { parseEmail } from '../lib/email-utils.js';

const BATCH_SIZE = 2000;
const DOMAIN_CACHE = new Map<string, number>();

async function getOrCreateDomain(name: string): Promise<number> {
  const cached = DOMAIN_CACHE.get(name);
  if (cached) return cached;
  const tld = name.slice(name.lastIndexOf('.') + 1);
  const domain = await prisma.domain.upsert({
    where: { name },
    create: { name, tld },
    update: {},
  });
  DOMAIN_CACHE.set(name, domain.id);
  return domain.id;
}

// ----- scan_folder -----
// Walk the folder, register any new files in DB (status=pending), enqueue them.
async function scanFolder(folderId: number, log: (s: string) => void) {
  const folder = await prisma.emailFolder.findUnique({ where: { id: folderId } });
  if (!folder) return;
  log(`Scanning ${folder.path}`);

  const entries = fs.readdirSync(folder.path, { withFileTypes: true });
  let newFiles = 0;
  let totalFiles = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(txt|csv|lst|list)$/i.test(entry.name)) continue;
    totalFiles++;

    const fullPath = path.join(folder.path, entry.name);
    const existing = await prisma.emailFile.findUnique({
      where: { folderId_filename: { folderId, filename: entry.name } },
    });
    if (existing) continue;

    // Infer a primary domain from filename (e.g. gmail.com.txt -> gmail.com)
    const base = entry.name.replace(/\.(txt|csv|lst|list)$/i, '');
    let domainId: number | null = null;
    if (/^[a-z0-9.\-]+\.[a-z]{2,}$/i.test(base)) {
      domainId = await getOrCreateDomain(base.toLowerCase());
    }

    await prisma.emailFile.create({
      data: {
        folderId,
        filename: entry.name,
        fullPath,
        domainId,
        status: 'pending',
      },
    });
    newFiles++;
  }

  await prisma.emailFolder.update({
    where: { id: folderId },
    data: {
      status: 'processing',
      filesCount: totalFiles,
      lastScannedAt: new Date(),
    },
  });

  // Enqueue all pending files
  const pending = await prisma.emailFile.findMany({
    where: { folderId, status: 'pending' },
    select: { id: true },
  });
  for (const f of pending) {
    await enqueueFileProcess(f.id);
  }
  log(`Scan done. New files: ${newFiles}, Pending: ${pending.length}`);

  // If nothing to process, set back to idle
  if (pending.length === 0) {
    await prisma.emailFolder.update({
      where: { id: folderId },
      data: { status: 'idle' },
    });
  }
}

// ----- process_file -----
// Stream a file line-by-line; batch-insert emails with conflict-ignore on hash.
async function processFile(fileId: number, log: (s: string) => void) {
  const file = await prisma.emailFile.findUnique({ where: { id: fileId } });
  if (!file) return;

  await prisma.emailFile.update({
    where: { id: fileId },
    data: { status: 'processing', errorMessage: null },
  });

  log(`Processing ${file.fullPath}`);

  let linesCount = 0;
  let ingested = 0;
  let duplicates = 0;
  let invalid = 0;

  // Buffer rows per domain for batch insert
  const buffers = new Map<
    number,
    Array<{
      email: string;
      localPart: string;
      hash: string;
      partitionKey: number;
      sourceFileId: number;
    }>
  >();

  async function flushDomain(domainId: number) {
    const rows = buffers.get(domainId);
    if (!rows || rows.length === 0) return;
    buffers.set(domainId, []);

    // Use createMany with skipDuplicates (which uses INSERT ... ON CONFLICT DO NOTHING on pg)
    const result = await prisma.email.createMany({
      data: rows.map((r) => ({
        email: r.email,
        localPart: r.localPart,
        domainId,
        hash: r.hash,
        partitionKey: r.partitionKey,
        sourceFileId: r.sourceFileId,
      })),
      skipDuplicates: true,
    });
    ingested += result.count;
    duplicates += rows.length - result.count;

    await prisma.domain.update({
      where: { id: domainId },
      data: { emailsCount: { increment: BigInt(result.count) } },
    });
  }

  async function flushAll() {
    for (const domainId of Array.from(buffers.keys())) {
      await flushDomain(domainId);
    }
  }

  try {
    const stream = fs.createReadStream(file.fullPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const rawLine of rl) {
      linesCount++;
      const line = rawLine.trim();
      if (!line) continue;

      const parsed = parseEmail(line);
      if (!parsed) {
        invalid++;
        continue;
      }

      const domainId = await getOrCreateDomain(parsed.domain);
      const buf = buffers.get(domainId) ?? [];
      buf.push({
        email: parsed.email,
        localPart: parsed.localPart,
        hash: parsed.hash,
        partitionKey: parsed.partitionKey,
        sourceFileId: file.id,
      });
      buffers.set(domainId, buf);

      if (buf.length >= BATCH_SIZE) await flushDomain(domainId);
    }

    await flushAll();

    await prisma.emailFile.update({
      where: { id: fileId },
      data: {
        status: 'done',
        linesCount,
        ingestedCount: ingested,
        duplicatesCount: duplicates,
        invalidCount: invalid,
        processedAt: new Date(),
      },
    });

    // Update folder counts
    await prisma.emailFolder.update({
      where: { id: file.folderId },
      data: { emailsCount: { increment: BigInt(ingested) } },
    });

    log(
      `Done ${file.filename}: lines=${linesCount} ingested=${ingested} dup=${duplicates} invalid=${invalid}`,
    );

    // If this was the last pending file in its folder, mark folder idle
    const remaining = await prisma.emailFile.count({
      where: { folderId: file.folderId, status: { in: ['pending', 'processing'] } },
    });
    if (remaining === 0) {
      await prisma.emailFolder.update({
        where: { id: file.folderId },
        data: { status: 'idle' },
      });
    }
  } catch (err) {
    const message = (err as Error).message;
    await prisma.emailFile.update({
      where: { id: fileId },
      data: { status: 'error', errorMessage: message },
    });
    throw err;
  }
}

export function startIngestionWorker() {
  const worker = new Worker<IngestionJob>(
    QUEUES.INGESTION,
    async (job: Job<IngestionJob>) => {
      const log = (s: string) => job.log(s);
      if (job.data.type === 'scan_folder') {
        await scanFolder(job.data.folderId, log);
      } else if (job.data.type === 'process_file') {
        await processFile(job.data.fileId, log);
      }
    },
    {
      connection: bullConnection,
      concurrency: 2,
      lockDuration: 10 * 60_000,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[ingestion] job ${job?.id} failed:`, err.message);
  });
  worker.on('completed', (job) => {
    console.log(`[ingestion] job ${job.id} completed`);
  });

  return worker;
}
