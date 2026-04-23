import { prisma } from './prisma.js';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  diff?: unknown;
  ip?: string;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        diff: (input.diff as object) ?? undefined,
        ip: input.ip ?? null,
      },
    });
  } catch {
    // Never let audit failures break business logic.
  }
}
