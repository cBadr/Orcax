import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, SETTING_KEYS } from '@platform/shared';
import { getSettings, setManySettings } from '../../lib/settings.js';
import { recordAudit } from '../../lib/audit.js';

// Keys that are safe to expose publicly (branding + toggles)
const PUBLIC_KEYS = new Set<string>([
  SETTING_KEYS.SITE_NAME,
  SETTING_KEYS.SITE_TAGLINE,
  SETTING_KEYS.LOGO_URL,
  SETTING_KEYS.FAVICON_URL,
  SETTING_KEYS.PRIMARY_COLOR,
  SETTING_KEYS.ACCENT_COLOR,
  SETTING_KEYS.SUPPORT_TELEGRAM,
  SETTING_KEYS.CAPTCHA_ENABLED,
  SETTING_KEYS.GOOGLE_OAUTH_ENABLED,
  SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED,
  SETTING_KEYS.MIN_TOPUP_USD,
  SETTING_KEYS.MAX_TOPUP_USD,
  SETTING_KEYS.COINPAYMENTS_CURRENCIES,
  SETTING_KEYS.DEMO_EMAILS_COUNT,
  SETTING_KEYS.REFERRAL_ENABLED,
]);

const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/public', async () => {
    const all = await getSettings();
    const out: Record<string, unknown> = {};
    for (const k of PUBLIC_KEYS) out[k] = all[k];
    return out;
  });
};

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requirePermission(PERMISSIONS.SETTINGS_MANAGE));

  app.get('/', async () => getSettings());

  const updateSchema = z.record(z.string(), z.unknown());
  app.put('/', async (req) => {
    const body = updateSchema.parse(req.body);
    await setManySettings(body);
    await recordAudit({
      actorId: req.currentUser!.id,
      action: 'settings.update',
      diff: body,
      ip: req.ip,
    });
    return { success: true };
  });
};

export { publicRoutes, adminRoutes };
