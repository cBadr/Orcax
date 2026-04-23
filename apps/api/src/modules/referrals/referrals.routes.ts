import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { getSetting, SETTING_KEYS } from '../../lib/settings.js';

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/referrals', async (req) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.currentUser!.id },
      select: { referralCode: true },
    });

    const [totals, recent, count] = await Promise.all([
      prisma.referralEarning.aggregate({
        where: { referrerId: req.currentUser!.id },
        _sum: { earnedPoints: true },
        _count: { _all: true },
      }),
      prisma.referralEarning.findMany({
        where: { referrerId: req.currentUser!.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          referred: { select: { email: true } },
        },
      }),
      prisma.user.count({ where: { referredById: req.currentUser!.id } }),
    ]);

    const commissionPct = await getSetting<number>(SETTING_KEYS.REFERRAL_COMMISSION_PCT);
    const enabled = await getSetting<boolean>(SETTING_KEYS.REFERRAL_ENABLED);

    return {
      enabled,
      referralCode: user.referralCode,
      commissionPct,
      invitedCount: count,
      totalEarnedPoints: (totals._sum.earnedPoints ?? 0n).toString(),
      transactionCount: totals._count._all,
      recent: recent.map((r) => ({
        id: r.id.toString(),
        email: r.referred.email,
        earnedPoints: r.earnedPoints.toString(),
        createdAt: r.createdAt,
      })),
    };
  });
};

export default routes;
