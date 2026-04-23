import { DEFAULT_SETTINGS, SETTING_KEYS } from '@platform/shared';
import { prisma } from './prisma.js';
import { redis } from './redis.js';

const CACHE_KEY = 'settings:all';
const CACHE_TTL_SECONDS = 60;

type SettingsMap = Record<string, unknown>;

export async function getSettings(): Promise<SettingsMap> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const rows = await prisma.setting.findMany();
  const map: SettingsMap = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    map[row.key] = row.value;
  }

  await redis.set(CACHE_KEY, JSON.stringify(map), 'EX', CACHE_TTL_SECONDS);
  return map;
}

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const all = await getSettings();
  return (all[key] ?? (DEFAULT_SETTINGS as Record<string, unknown>)[key]) as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
  await redis.del(CACHE_KEY);
}

export async function setManySettings(entries: Record<string, unknown>): Promise<void> {
  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value as object },
        update: { value: value as object },
      }),
    ),
  );
  await redis.del(CACHE_KEY);
}

export { SETTING_KEYS };
