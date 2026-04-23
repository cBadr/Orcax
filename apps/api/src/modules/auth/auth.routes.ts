import type { FastifyPluginAsync } from 'fastify';
import * as OTPAuth from 'otpauth';
import { validators } from '@platform/shared';
import * as service from './auth.service.js';
import { env } from '../../config/env.js';
import { badRequest, forbidden } from '../../lib/errors.js';
import { getSetting, SETTING_KEYS } from '../../lib/settings.js';
import { verifyCaptcha, getCaptchaConfig } from '../../lib/captcha.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/captcha', async () => getCaptchaConfig());

  app.post('/register', async (req, reply) => {
    const body = validators.registerSchema.parse(req.body);
    const ok = await verifyCaptcha(body.captchaToken, req.ip);
    if (!ok) throw badRequest('Captcha verification failed', 'CAPTCHA_FAILED');
    const user = await service.register({
      email: body.email,
      password: body.password,
      country: body.country,
      telegram: body.telegram ?? null,
      referralCode: body.referralCode ?? null,
      ip: req.ip,
    });
    return reply.code(201).send({
      id: user.id,
      email: user.email,
      status: user.status,
      referralCode: user.referralCode,
    });
  });

  app.post('/login', async (req, reply) => {
    const body = validators.loginSchema
      .extend({ twoFaCode: (await import('zod')).z.string().length(6).optional() })
      .parse(req.body);
    const captchaOk = await verifyCaptcha(body.captchaToken, req.ip);
    if (!captchaOk) throw badRequest('Captcha verification failed', 'CAPTCHA_FAILED');
    const user = await service.login({
      email: body.email,
      password: body.password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // 2FA check
    if (user.twoFaEnabled && user.twoFaSecret) {
      if (!body.twoFaCode) {
        return reply.code(401).send({
          error: 'TWO_FA_REQUIRED',
          message: 'Two-factor code required',
        });
      }
      const siteName = (await getSetting<string>(SETTING_KEYS.SITE_NAME)) || 'Platform';
      const totp = new OTPAuth.TOTP({
        issuer: siteName,
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.twoFaSecret),
      });
      if (totp.validate({ token: body.twoFaCode, window: 1 }) === null) {
        throw forbidden('Invalid 2FA code', 'INVALID_2FA');
      }
    }

    const role = await app.prisma.role.findUnique({ where: { id: user.roleId } });
    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email, role: role?.name ?? 'user' },
      { expiresIn: env.JWT_ACCESS_TTL },
    );
    const refreshToken = await service.issueRefreshToken(user.id);

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: role?.name ?? 'user',
        balancePoints: user.balancePoints.toString(),
        referralCode: user.referralCode,
      },
    });
  });

  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) return reply.code(400).send({ error: 'MISSING_REFRESH' });
    const { userId, newToken } = await service.rotateRefreshToken(refreshToken);

    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true },
    });
    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email, role: user.role.name },
      { expiresIn: env.JWT_ACCESS_TTL },
    );
    return reply.send({ accessToken, refreshToken: newToken });
  });

  app.post('/logout', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) await service.revokeRefreshToken(refreshToken);
    return reply.send({ success: true });
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    const u = await app.prisma.user.findUniqueOrThrow({
      where: { id: req.currentUser!.id },
      include: { role: true, resellerTier: true },
    });
    return {
      id: u.id,
      email: u.email,
      country: u.country,
      telegram: u.telegram,
      status: u.status,
      role: u.role.name,
      resellerTier: u.resellerTier?.name ?? null,
      balancePoints: u.balancePoints.toString(),
      frozenBalancePoints: u.frozenBalancePoints.toString(),
      referralCode: u.referralCode,
      emailVerifiedAt: u.emailVerifiedAt,
      twoFaEnabled: u.twoFaEnabled,
      createdAt: u.createdAt,
    };
  });
};

export default authRoutes;
