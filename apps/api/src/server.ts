import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';

import { env } from './config/env.js';
import { redis } from './lib/redis.js';

import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import rawBodyPlugin from './plugins/rawBody.js';

import authRoutes from './modules/auth/auth.routes.js';
import { publicRoutes as settingsPublic, adminRoutes as settingsAdmin } from './modules/settings/settings.routes.js';
import ingestionRoutes from './modules/ingestion/ingestion.routes.js';
import { publicRoutes as countriesPublic, adminRoutes as countriesAdmin } from './modules/countries/countries.routes.js';
import { publicRoutes as domainsPublic, adminRoutes as domainsAdmin } from './modules/domains/domains.routes.js';
import emailsRoutes from './modules/emails/emails.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import pricingRoutes from './modules/pricing/pricing.routes.js';
import {
  userRoutes as paymentsUser,
  adminRoutes as paymentsAdmin,
  webhookRoutes as paymentsWebhook,
} from './modules/payments/payments.routes.js';
import exportsRoutes from './modules/exports/exports.routes.js';
import resellersRoutes from './modules/resellers/resellers.routes.js';
import referralsRoutes from './modules/referrals/referrals.routes.js';
import {
  userRoutes as ticketsUser,
  adminRoutes as ticketsAdmin,
} from './modules/tickets/tickets.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import {
  userRoutes as announcementsUser,
  adminRoutes as announcementsAdmin,
} from './modules/announcements/announcements.routes.js';
import twofaRoutes from './modules/twofa/twofa.routes.js';
import adminRoutesModule from './modules/admin/admin.routes.js';
import adminUsersRoutes from './modules/admin/users.routes.js';
import {
  adminOrdersRoutes,
  adminExportsRoutes,
} from './modules/admin/orders-exports.routes.js';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
        : undefined,
  },
  trustProxy: true,
  bodyLimit: 5 * 1024 * 1024,
});

async function bootstrap() {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.WEB_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => req.ip,
  });

  // Core plugins
  await app.register(errorHandlerPlugin);
  await app.register(rawBodyPlugin);
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // Health
  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  // Public
  await app.register(settingsPublic, { prefix: '/settings' });
  await app.register(countriesPublic, { prefix: '/countries' });
  await app.register(domainsPublic, { prefix: '/domains' });

  // Auth
  await app.register(authRoutes, { prefix: '/auth' });

  // User-authenticated (search, reservations, orders, ledger)
  await app.register(searchRoutes);
  await app.register(paymentsUser);
  await app.register(exportsRoutes);
  await app.register(referralsRoutes);
  await app.register(ticketsUser);
  await app.register(notificationsRoutes);
  await app.register(announcementsUser);
  await app.register(twofaRoutes, { prefix: '/2fa' });

  // Webhooks (no auth)
  await app.register(paymentsWebhook, { prefix: '/webhooks' });

  // Admin
  await app.register(
    async (admin) => {
      await admin.register(settingsAdmin, { prefix: '/settings' });
      await admin.register(ingestionRoutes, { prefix: '/ingestion' });
      await admin.register(countriesAdmin, { prefix: '/countries' });
      await admin.register(domainsAdmin, { prefix: '/domains' });
      await admin.register(emailsRoutes, { prefix: '/emails' });
      await admin.register(pricingRoutes, { prefix: '/pricing' });
      await admin.register(paymentsAdmin, { prefix: '/payments' });
      await admin.register(resellersRoutes, { prefix: '/resellers' });
      await admin.register(ticketsAdmin, { prefix: '/tickets' });
      await admin.register(announcementsAdmin, { prefix: '/announcements' });
      await admin.register(adminOrdersRoutes, { prefix: '/orders' });
      await admin.register(adminExportsRoutes, { prefix: '/exports' });
      await admin.register(adminUsersRoutes, { prefix: '/users' });
      await admin.register(adminRoutesModule);
    },
    { prefix: '/admin' },
  );

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`API listening on http://${env.HOST}:${env.PORT}`);
}

bootstrap().catch((err) => {
  app.log.error(err, 'Failed to bootstrap');
  process.exit(1);
});

process.on('SIGINT', async () => {
  app.log.info('SIGINT received; shutting down');
  await app.close();
  await redis.quit();
  process.exit(0);
});
