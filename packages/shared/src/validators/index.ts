import { z } from 'zod';

export const emailSchema = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one number');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    country: z.string().min(2).max(2),
    telegram: z.string().max(64).optional().nullable(),
    referralCode: z.string().max(16).optional().nullable(),
    captchaToken: z.string().optional().nullable(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  captchaToken: z.string().optional().nullable(),
});

export const searchFiltersSchema = z.object({
  domains: z.array(z.string().min(1).max(255)).optional(),
  countryIds: z.array(z.number().int().positive()).optional(),
  totalQty: z.number().int().positive().max(1_000_000).optional(),
  perDomainQty: z.record(z.string(), z.number().int().positive()).optional(),
  localPartContains: z.string().max(64).optional(),
  localPartStartsWith: z.string().max(64).optional(),
  localPartEndsWith: z.string().max(64).optional(),
  localPartHasDigits: z.boolean().optional(),
  minLocalLength: z.number().int().positive().max(64).optional(),
  maxLocalLength: z.number().int().positive().max(64).optional(),
  allowMixDomains: z.boolean().optional(),
  randomize: z.boolean().optional().default(true),
});

export const topupSchema = z.object({
  amountUsd: z.number().positive().max(1_000_000),
  currency: z.string().min(2).max(20),
});

export const ticketCreateSchema = z.object({
  subject: z.string().min(3).max(255),
  message: z.string().min(5).max(10000),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export const ticketReplySchema = z.object({
  message: z.string().min(1).max(10000),
});
