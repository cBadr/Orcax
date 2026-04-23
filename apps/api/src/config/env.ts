import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  SUPER_ADMIN_EMAIL: z.string().email(),
  SUPER_ADMIN_PASSWORD: z.string().min(8),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),

  EXPORTS_DIR: z.string().default('./data/exports'),
  UPLOADS_DIR: z.string().default('./data/uploads'),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().optional().default(''),

  COINPAYMENTS_API_URL: z.string().default('https://a-api.coinpayments.net'),
  COINPAYMENTS_CLIENT_ID: z.string().optional().default(''),
  COINPAYMENTS_CLIENT_SECRET: z.string().optional().default(''),
  COINPAYMENTS_WEBHOOK_SECRET: z.string().optional().default(''),

  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
