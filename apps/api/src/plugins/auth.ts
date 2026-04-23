import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: {
      id: string;
      email: string;
      role: string;
      permissions: Set<string>;
    };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    requirePermission: (perm: string) => (req: FastifyRequest) => Promise<void>;
    requireRole: (...roles: string[]) => (req: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: string };
    user: { sub: string; email: string; role: string };
  }
}

const USER_CACHE_PREFIX = 'user:perms:';
const USER_CACHE_TTL = 60;

async function loadUser(userId: string) {
  const cached = await redis.get(USER_CACHE_PREFIX + userId);
  if (cached) return JSON.parse(cached);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!user) return null;

  const data = {
    id: user.id,
    email: user.email,
    status: user.status,
    role: user.role.name,
    permissions: user.role.permissions.map((rp) => rp.permission.key),
  };

  await redis.set(USER_CACHE_PREFIX + userId, JSON.stringify(data), 'EX', USER_CACHE_TTL);
  return data;
}

export async function invalidateUserCache(userId: string): Promise<void> {
  await redis.del(USER_CACHE_PREFIX + userId);
}

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const payload = req.user as { sub: string };
    const user = await loadUser(payload.sub);
    if (!user) throw unauthorized('User not found');
    if (user.status === 'banned') throw forbidden('Account banned');
    if (user.status === 'suspended') throw forbidden('Account suspended');

    req.currentUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: new Set(user.permissions),
    };
  });

  app.decorate('requirePermission', (perm: string) => async (req: FastifyRequest) => {
    if (!req.currentUser) throw unauthorized();
    if (req.currentUser.role === 'super_admin') return;
    if (!req.currentUser.permissions.has(perm)) {
      throw forbidden(`Missing permission: ${perm}`);
    }
  });

  app.decorate(
    'requireRole',
    (...roles: string[]) =>
      async (req: FastifyRequest) => {
        if (!req.currentUser) throw unauthorized();
        if (!roles.includes(req.currentUser.role)) throw forbidden();
      },
  );
};

export default fp(plugin, { name: 'auth' });
