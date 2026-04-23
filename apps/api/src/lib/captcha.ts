import { request } from 'undici';
import { getSetting, SETTING_KEYS } from './settings.js';

// We use hCaptcha by default. Admin stores the secret in settings:
// `captcha_secret` (ideally via a dedicated key — added on demand).
const SECRET_KEY = 'captcha_secret';
const SITE_KEY = 'captcha_site_key';

export async function getCaptchaConfig(): Promise<{
  enabled: boolean;
  siteKey: string;
}> {
  const enabled = await getSetting<boolean>(SETTING_KEYS.CAPTCHA_ENABLED);
  const siteKey = (await getSetting<string>(SITE_KEY)) ?? '';
  return { enabled, siteKey };
}

// Returns true if captcha is disabled OR verification succeeds.
export async function verifyCaptcha(token: string | null | undefined, ip?: string): Promise<boolean> {
  const enabled = await getSetting<boolean>(SETTING_KEYS.CAPTCHA_ENABLED);
  if (!enabled) return true;
  const secret = (await getSetting<string>(SECRET_KEY)) ?? '';
  if (!secret) return true; // captcha on but not configured — fail open (admin's fault)
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  try {
    const res = await request('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = (await res.body.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}
