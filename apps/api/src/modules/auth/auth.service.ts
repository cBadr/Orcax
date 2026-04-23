import argon2 from 'argon2';
import crypto from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { prisma } from '../../lib/prisma.js';
import { badRequest, unauthorized, conflict, forbidden } from '../../lib/errors.js';
import { recordAudit } from '../../lib/audit.js';
import { getSetting, SETTING_KEYS } from '../../lib/settings.js';
import { ROLES } from '@platform/shared';

const refCodeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

export interface RegisterInput {
  email: string;
  password: string;
  country: string;
  telegram?: string | null;
  referralCode?: string | null;
  ip?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = refCodeGen();
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error('Failed to generate referral code');
}

export async function register(input: RegisterInput) {
  const normalizedEmail = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { emailNormalized: normalizedEmail } });
  if (existing) throw conflict('Email already registered', 'EMAIL_TAKEN');

  const emailVerificationRequired = await getSetting<boolean>(
    SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED,
  );

  const passwordHash = await argon2.hash(input.password);

  const userRole = await prisma.role.findUnique({ where: { name: ROLES.USER } });
  if (!userRole) throw new Error('Default user role not seeded');

  let referredById: string | null = null;
  if (input.referralCode) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: input.referralCode.toUpperCase() },
    });
    if (referrer) referredById = referrer.id;
  }

  const referralCode = await uniqueReferralCode();

  const user = await prisma.user.create({
    data: {
      email: input.email,
      emailNormalized: normalizedEmail,
      passwordHash,
      country: input.country.toUpperCase(),
      telegram: input.telegram ?? null,
      status: emailVerificationRequired ? 'pending_verification' : 'active',
      emailVerifiedAt: emailVerificationRequired ? null : new Date(),
      roleId: userRole.id,
      referralCode,
      referredById,
    },
  });

  await recordAudit({
    actorId: user.id,
    action: 'user.register',
    targetType: 'user',
    targetId: user.id,
    ip: input.ip,
  });

  return user;
}

export async function login(input: LoginInput) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const maxAttempts = await getSetting<number>(SETTING_KEYS.MAX_LOGIN_ATTEMPTS);
  const lockoutMinutes = await getSetting<number>(SETTING_KEYS.LOCKOUT_MINUTES);

  // Count recent failed attempts
  const since = new Date(Date.now() - lockoutMinutes * 60_000);
  const failCount = await prisma.loginAttempt.count({
    where: {
      email: normalizedEmail,
      success: false,
      attemptedAt: { gte: since },
    },
  });
  if (failCount >= maxAttempts) {
    throw forbidden(
      `Account locked. Try again in ${lockoutMinutes} minutes.`,
      'ACCOUNT_LOCKED',
    );
  }

  const user = await prisma.user.findUnique({ where: { emailNormalized: normalizedEmail } });

  const ok =
    user && user.passwordHash && (await argon2.verify(user.passwordHash, input.password));

  await prisma.loginAttempt.create({
    data: {
      userId: user?.id ?? null,
      email: normalizedEmail,
      ip: input.ip ?? null,
      success: !!ok,
    },
  });

  if (!user || !ok) throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  if (user.status === 'banned') throw forbidden('Account banned', 'BANNED');
  if (user.status === 'suspended') throw forbidden('Account suspended', 'SUSPENDED');
  if (user.status === 'pending_verification') {
    throw forbidden('Email not verified', 'EMAIL_NOT_VERIFIED');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: input.ip ?? null },
  });

  return user;
}

export async function issueRefreshToken(userId: string, ttlDays = 30): Promise<string> {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      expiresAt,
    },
  });
  return raw;
}

export async function rotateRefreshToken(rawToken: string): Promise<{ userId: string; newToken: string }> {
  const hash = sha256(rawToken);
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  if (!token || token.revokedAt || token.expiresAt < new Date()) {
    throw unauthorized('Invalid refresh token', 'INVALID_REFRESH');
  }
  await prisma.refreshToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  });
  const newToken = await issueRefreshToken(token.userId);
  return { userId: token.userId, newToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const hash = sha256(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export { sha256 };
