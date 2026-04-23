import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { getSettings } from './settings.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(opts: SendMailOptions): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    });
    return true;
  } catch (err) {
    console.error('[email] failed:', (err as Error).message);
    return false;
  }
}

// Render a template with simple {{var}} interpolation.
function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

export async function sendTemplate(
  key: string,
  to: string,
  vars: Record<string, string>,
): Promise<boolean> {
  const tpl = await prisma.emailTemplate.findUnique({ where: { key } });
  const settings = await getSettings();
  const allVars = {
    ...vars,
    site_name: (settings.site_name as string) ?? 'Platform',
  };
  if (!tpl) return false;
  return sendMail({
    to,
    subject: renderTemplate(tpl.subject, allVars),
    html: renderTemplate(tpl.htmlBody, allVars),
  });
}
