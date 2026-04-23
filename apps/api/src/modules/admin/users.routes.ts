import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { customAlphabet } from 'nanoid';
import { PERMISSIONS, ROLES } from '@platform/shared';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../../lib/audit.js';
import { invalidateUserCache } from '../../plugins/auth.js';
import { badRequest, notFound, forbidden } from '../../lib/errors.js';
import { env } from '../../config/env.js';

const refCodeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

// Prevent non-super-admins from touching super admins.
async function assertCanModify(actorRole: string, targetId: string) {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { role: true },
  });
  if (!target) throw notFound('User not found');
  if (target.role.name === ROLES.SUPER_ADMIN && actorRole !== ROLES.SUPER_ADMIN) {
    throw forbidden('Cannot modify a super admin');
  }
  return target;
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.USERS_VIEW));

  // ===== List =====
  app.get('/', async (req) => {
    const q = z
      .object({
        search: z.string().max(128).optional(),
        roleId: z.coerce.number().int().optional(),
        status: z.string().optional(),
        country: z.string().length(2).optional(),
        resellerTierId: z.coerce.number().int().optional(),
        hasBalance: z.enum(['yes', 'no']).optional(),
        sortBy: z.enum(['createdAt', 'lastLoginAt', 'balancePoints', 'email']).default('createdAt'),
        sortDir: z.enum(['asc', 'desc']).default('desc'),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(200).default(30),
      })
      .parse(req.query);

    const where: Record<string, unknown> = {};
    if (q.search) where.emailNormalized = { contains: q.search.toLowerCase() };
    if (q.roleId) where.roleId = q.roleId;
    if (q.status) where.status = q.status;
    if (q.country) where.country = q.country.toUpperCase();
    if (q.resellerTierId) where.resellerTierId = q.resellerTierId;
    if (q.hasBalance === 'yes') where.balancePoints = { gt: 0 };
    if (q.hasBalance === 'no') where.balancePoints = 0;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          role: true,
          resellerTier: true,
          _count: { select: { orders: true, payments: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        country: u.country,
        telegram: u.telegram,
        status: u.status,
        role: u.role.name,
        roleId: u.roleId,
        roleDisplayName: u.role.displayName,
        resellerTier: u.resellerTier?.name ?? null,
        resellerTierId: u.resellerTierId,
        balancePoints: u.balancePoints.toString(),
        frozenBalancePoints: u.frozenBalancePoints.toString(),
        referralCode: u.referralCode,
        emailVerifiedAt: u.emailVerifiedAt,
        twoFaEnabled: u.twoFaEnabled,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        lastLoginIp: u.lastLoginIp,
        ordersCount: u._count.orders,
        paymentsCount: u._count.payments,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // CSV export of the current filter
  app.get('/export.csv', async (req, reply) => {
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50_000,
      include: { role: true, resellerTier: true },
    });
    const header = 'email,country,status,role,resellerTier,balance,telegram,createdAt,lastLoginAt\n';
    const body = rows
      .map((u) =>
        [
          u.email,
          u.country,
          u.status,
          u.role.name,
          u.resellerTier?.name ?? '',
          u.balancePoints.toString(),
          u.telegram ?? '',
          u.createdAt.toISOString(),
          u.lastLoginAt?.toISOString() ?? '',
        ].join(','),
      )
      .join('\n');
    reply.header('content-type', 'text/csv');
    reply.header('content-disposition', 'attachment; filename="users.csv"');
    return header + body;
  });

  // ===== Detail (rich) =====
  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const u = await prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        resellerTier: true,
        referredBy: { select: { id: true, email: true, referralCode: true } },
        _count: {
          select: {
            orders: true,
            payments: true,
            tickets: true,
            referrals: true,
            sessions: true,
            exports: true,
          },
        },
      },
    });
    if (!u) throw notFound();

    // Aggregates
    const [
      totalSpent,
      totalToppedUp,
      activeReservation,
      recentLoginAttempts,
      lastPayment,
      totalReferralEarnings,
    ] = await Promise.all([
      prisma.ledgerEntry.aggregate({
        where: { userId: id, type: 'purchase' },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { userId: id, status: 'confirmed' },
        _sum: { amountUsd: true },
      }),
      prisma.reservation.findFirst({
        where: { userId: id, status: 'active' },
      }),
      prisma.loginAttempt.findMany({
        where: { userId: id },
        orderBy: { attemptedAt: 'desc' },
        take: 10,
      }),
      prisma.payment.findFirst({
        where: { userId: id, status: 'confirmed' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.referralEarning.aggregate({
        where: { referrerId: id },
        _sum: { earnedPoints: true },
      }),
    ]);

    return {
      id: u.id,
      email: u.email,
      country: u.country,
      telegram: u.telegram,
      status: u.status,
      role: u.role.name,
      roleId: u.roleId,
      roleDisplayName: u.role.displayName,
      resellerTier: u.resellerTier
        ? { id: u.resellerTier.id, name: u.resellerTier.name, discountPct: u.resellerTier.discountPct }
        : null,
      balancePoints: u.balancePoints.toString(),
      frozenBalancePoints: u.frozenBalancePoints.toString(),
      referralCode: u.referralCode,
      referredBy: u.referredBy,
      emailVerifiedAt: u.emailVerifiedAt,
      twoFaEnabled: u.twoFaEnabled,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      counts: u._count,
      stats: {
        totalSpentPoints: (totalSpent._sum.amount ?? 0n).toString(),
        totalToppedUpUsd: totalToppedUp._sum.amountUsd?.toString() ?? '0',
        lastPaymentAt: lastPayment?.createdAt ?? null,
        totalReferralEarnings: (totalReferralEarnings._sum.earnedPoints ?? 0n).toString(),
        activeReservationId: activeReservation?.id ?? null,
      },
      recentLoginAttempts: recentLoginAttempts.map((a) => ({
        id: a.id.toString(),
        success: a.success,
        ip: a.ip,
        attemptedAt: a.attemptedAt,
      })),
    };
  });

  // ===== Create =====
  app.post('/', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        country: z.string().length(2).default('US'),
        telegram: z.string().max(64).optional().nullable(),
        roleId: z.number().int().positive().optional(),
        status: z.enum(['active', 'suspended', 'banned', 'pending_verification']).default('active'),
        resellerTierId: z.number().int().positive().nullable().optional(),
        initialBalance: z.number().int().nonnegative().default(0),
        emailVerified: z.boolean().default(true),
      })
      .parse(req.body);

    const normalized = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { emailNormalized: normalized } });
    if (existing) throw badRequest('Email already registered');

    const role = body.roleId
      ? await prisma.role.findUnique({ where: { id: body.roleId } })
      : await prisma.role.findUnique({ where: { name: ROLES.USER } });
    if (!role) throw badRequest('Invalid role');

    // Super-admin role only creatable by super admin
    if (role.name === ROLES.SUPER_ADMIN && req.currentUser!.role !== ROLES.SUPER_ADMIN) {
      throw forbidden('Only super admins can create super admins');
    }

    const passwordHash = await argon2.hash(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        emailNormalized: normalized,
        passwordHash,
        country: body.country.toUpperCase(),
        telegram: body.telegram ?? null,
        roleId: role.id,
        resellerTierId: body.resellerTierId ?? null,
        status: body.status,
        emailVerifiedAt: body.emailVerified ? new Date() : null,
        balancePoints: BigInt(body.initialBalance),
        referralCode: refCodeGen(),
      },
    });

    if (body.initialBalance > 0) {
      await prisma.ledgerEntry.create({
        data: {
          userId: user.id,
          amount: BigInt(body.initialBalance),
          type: 'admin_adjust',
          balanceAfter: BigInt(body.initialBalance),
          note: 'Initial balance on account creation',
        },
      });
    }

    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.create',
      targetType: 'user',
      targetId: user.id,
      diff: { email: user.email, role: role.name, status: user.status },
      ip: req.ip,
    });

    return { id: user.id, email: user.email };
  });

  // ===== Edit =====
  app.patch('/:id', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        email: z.string().email().optional(),
        country: z.string().length(2).optional(),
        telegram: z.string().max(64).nullable().optional(),
        status: z.enum(['active', 'suspended', 'banned', 'pending_verification']).optional(),
        roleId: z.number().int().positive().optional(),
        resellerTierId: z.number().int().positive().nullable().optional(),
      })
      .parse(req.body);

    await assertCanModify(req.currentUser!.role, id);

    // Role elevation guardrail: only super admin can assign super admin role
    if (body.roleId) {
      const newRole = await prisma.role.findUnique({ where: { id: body.roleId } });
      if (
        newRole?.name === ROLES.SUPER_ADMIN &&
        req.currentUser!.role !== ROLES.SUPER_ADMIN
      ) {
        throw forbidden('Only super admin can assign super admin role');
      }
    }

    const data: Record<string, unknown> = { ...body };
    if (body.email) {
      const normalized = body.email.toLowerCase();
      const exists = await prisma.user.findUnique({ where: { emailNormalized: normalized } });
      if (exists && exists.id !== id) throw badRequest('Email already in use');
      data.emailNormalized = normalized;
    }
    if (body.country) data.country = body.country.toUpperCase();

    const updated = await prisma.user.update({ where: { id }, data });
    await invalidateUserCache(id);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.update',
      targetType: 'user',
      targetId: id,
      diff: body,
      ip: req.ip,
    });
    return { ok: true, user: { id: updated.id, email: updated.email, status: updated.status } };
  });

  // ===== Delete =====
  app.delete('/:id', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_DELETE)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertCanModify(req.currentUser!.role, id);
    if (id === req.currentUser!.id) throw badRequest('Cannot delete yourself');
    await prisma.user.delete({ where: { id } });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Reset password =====
  app.post('/:id/password', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ password: z.string().min(8) }).parse(req.body);
    await assertCanModify(req.currentUser!.role, id);
    const hash = await argon2.hash(body.password);
    await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
    // Revoke all refresh tokens — force re-login everywhere
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await invalidateUserCache(id);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Verify email manually =====
  app.post('/:id/verify-email', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertCanModify(req.currentUser!.role, id);
    await prisma.user.update({
      where: { id },
      data: { emailVerifiedAt: new Date(), status: 'active' },
    });
    await invalidateUserCache(id);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.verify_email',
      targetType: 'user',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Force disable 2FA =====
  app.post('/:id/disable-2fa', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertCanModify(req.currentUser!.role, id);
    await prisma.user.update({
      where: { id },
      data: { twoFaEnabled: false, twoFaSecret: null },
    });
    await invalidateUserCache(id);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.disable_2fa',
      targetType: 'user',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Force logout everywhere =====
  app.post('/:id/logout-all', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertCanModify(req.currentUser!.role, id);
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.session.deleteMany({ where: { userId: id } });
    await invalidateUserCache(id);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.logout_all',
      targetType: 'user',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Lift lockout (clear failed login attempts) =====
  app.post('/:id/lift-lockout', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertCanModify(req.currentUser!.role, id);
    await prisma.loginAttempt.deleteMany({ where: { userId: id, success: false } });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.lift_lockout',
      targetType: 'user',
      targetId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Send in-app notification =====
  app.post('/:id/notify', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        title: z.string().min(1).max(255),
        body: z.string().min(1).max(2000),
      })
      .parse(req.body);
    await prisma.notification.create({
      data: {
        userId: id,
        type: 'admin_message',
        title: body.title,
        body: body.body,
      },
    });
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.notify',
      targetType: 'user',
      targetId: id,
      diff: body,
      ip: req.ip,
    });
    return { ok: true };
  });

  // ===== Impersonate (super admin only) =====
  app.post('/:id/impersonate', async (req) => {
    if (req.currentUser!.role !== ROLES.SUPER_ADMIN) throw forbidden('Super admin only');
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const target = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: { role: true },
    });
    const accessToken = app.jwt.sign(
      { sub: target.id, email: target.email, role: target.role.name },
      { expiresIn: env.JWT_ACCESS_TTL },
    );
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'user.impersonate',
      targetType: 'user',
      targetId: id,
      ip: req.ip,
    });
    return { accessToken, user: { id: target.id, email: target.email, role: target.role.name } };
  });

  // ===== Bulk actions =====
  app.post('/bulk', async (req) => {
    if (!req.currentUser!.permissions.has(PERMISSIONS.USERS_EDIT)) throw forbidden();
    const body = z
      .object({
        userIds: z.array(z.string()).min(1).max(500),
        action: z.enum(['ban', 'suspend', 'activate', 'notify']),
        title: z.string().optional(),
        body: z.string().optional(),
      })
      .parse(req.body);

    // Protect super admins
    const targets = await prisma.user.findMany({
      where: { id: { in: body.userIds } },
      include: { role: true },
    });
    const safeIds = targets
      .filter(
        (u) =>
          u.role.name !== ROLES.SUPER_ADMIN ||
          req.currentUser!.role === ROLES.SUPER_ADMIN,
      )
      .map((u) => u.id);

    let affected = 0;
    if (body.action === 'ban') {
      const r = await prisma.user.updateMany({
        where: { id: { in: safeIds } },
        data: { status: 'banned' },
      });
      affected = r.count;
    } else if (body.action === 'suspend') {
      const r = await prisma.user.updateMany({
        where: { id: { in: safeIds } },
        data: { status: 'suspended' },
      });
      affected = r.count;
    } else if (body.action === 'activate') {
      const r = await prisma.user.updateMany({
        where: { id: { in: safeIds } },
        data: { status: 'active' },
      });
      affected = r.count;
    } else if (body.action === 'notify') {
      if (!body.title || !body.body) throw badRequest('title and body required');
      await prisma.notification.createMany({
        data: safeIds.map((id) => ({
          userId: id,
          type: 'admin_message',
          title: body.title!,
          body: body.body!,
        })),
      });
      affected = safeIds.length;
    }

    for (const id of safeIds) await invalidateUserCache(id);

    await recordAudit({
      actorId: req.currentUser!.id,
      action: `user.bulk.${body.action}`,
      diff: { count: affected, userIds: safeIds },
      ip: req.ip,
    });
    return { ok: true, affected };
  });

  // ===== Related data endpoints =====
  const pageParams = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  });

  app.get('/:id/orders', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = pageParams.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.order.count({ where: { userId: id } }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        totalCount: o.totalCount,
        totalPoints: o.totalPoints.toString(),
        status: o.status,
        createdAt: o.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get('/:id/payments', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = pageParams.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.payment.count({ where: { userId: id } }),
    ]);
    return {
      items: items.map((p) => ({
        id: p.id,
        amountUsd: p.amountUsd.toString(),
        amountPoints: p.amountPoints.toString(),
        currency: p.currency,
        status: p.status,
        txid: p.txid,
        createdAt: p.createdAt,
        confirmedAt: p.confirmedAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get('/:id/ledger', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = pageParams.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.ledgerEntry.count({ where: { userId: id } }),
    ]);
    return {
      items: items.map((l) => ({
        id: l.id.toString(),
        amount: l.amount.toString(),
        type: l.type,
        balanceAfter: l.balanceAfter.toString(),
        note: l.note,
        createdAt: l.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get('/:id/tickets', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const rows = await prisma.ticket.findMany({
      where: { userId: id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { _count: { select: { messages: true } } },
    });
    return rows;
  });

  app.get('/:id/referrals', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const [invited, earnings] = await Promise.all([
      prisma.user.findMany({
        where: { referredById: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, email: true, createdAt: true, balancePoints: true },
      }),
      prisma.referralEarning.findMany({
        where: { referrerId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { referred: { select: { email: true } } },
      }),
    ]);
    return {
      invited: invited.map((u) => ({
        id: u.id,
        email: u.email,
        createdAt: u.createdAt,
        balancePoints: u.balancePoints.toString(),
      })),
      earnings: earnings.map((e) => ({
        id: e.id.toString(),
        referredEmail: e.referred.email,
        earnedPoints: e.earnedPoints.toString(),
        createdAt: e.createdAt,
      })),
    };
  });

  app.get('/:id/sessions', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const [active, refreshTokens] = await Promise.all([
      prisma.session.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.refreshToken.findMany({
        where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      sessions: active,
      refreshTokens: refreshTokens.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      })),
    };
  });

  app.get('/:id/exports', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = pageParams.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.exportJob.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.exportJob.count({ where: { userId: id } }),
    ]);
    return {
      items: items.map((e) => ({
        id: e.id,
        format: e.format,
        status: e.status,
        totalCount: e.totalCount,
        goFileUrl: e.goFileUrl,
        fileSizeBytes: e.fileSizeBytes?.toString() ?? null,
        createdAt: e.createdAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
};

export default routes;
