import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as OTPAuth from 'otpauth';
import qrcode from 'qrcode';
import argon2 from 'argon2';
import { prisma } from '../../lib/prisma.js';
import { badRequest } from '../../lib/errors.js';
import { getSetting, SETTING_KEYS } from '../../lib/settings.js';
import { invalidateUserCache } from '../../plugins/auth.js';

function buildTotp(secret: string, email: string, issuer: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // Generate new secret + QR (does not enable yet)
  app.post('/setup', async (req) => {
    const siteName = (await getSetting<string>(SETTING_KEYS.SITE_NAME)) || 'Platform';
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });

    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const totp = buildTotp(secret, user.email, siteName);
    const uri = totp.toString();
    const qrDataUrl = await qrcode.toDataURL(uri);

    // Store provisional secret; user must verify to enable
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFaSecret: secret, twoFaEnabled: false },
    });

    return {
      secret,
      uri,
      qrDataUrl,
    };
  });

  // Verify + enable
  app.post('/enable', async (req) => {
    const body = z.object({ code: z.string().length(6) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });
    if (!user.twoFaSecret) throw badRequest('Run /setup first');
    const siteName = (await getSetting<string>(SETTING_KEYS.SITE_NAME)) || 'Platform';
    const totp = buildTotp(user.twoFaSecret, user.email, siteName);
    const delta = totp.validate({ token: body.code, window: 1 });
    if (delta === null) throw badRequest('Invalid code');

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFaEnabled: true },
    });
    await invalidateUserCache(user.id);
    return { ok: true };
  });

  // Disable (requires current password for safety)
  app.post('/disable', async (req) => {
    const body = z.object({ password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.currentUser!.id } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, body.password))) {
      throw badRequest('Wrong password');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFaEnabled: false, twoFaSecret: null },
    });
    await invalidateUserCache(user.id);
    return { ok: true };
  });
};

export default routes;
