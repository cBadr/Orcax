import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { customAlphabet } from 'nanoid';
import 'dotenv/config';
import {
  ROLES,
  PERMISSIONS,
  DEFAULT_SETTINGS,
} from '../../../packages/shared/src/constants.js';

const prisma = new PrismaClient();
const refCodeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

const ROLE_PERMS: Record<string, string[]> = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS), // all
  [ROLES.ADMIN]: Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.ROLES_MANAGE),
  [ROLES.MODERATOR]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.EMAILS_VIEW,
    PERMISSIONS.TICKETS_VIEW,
    PERMISSIONS.TICKETS_REPLY,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.ADMIN_DASHBOARD_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  [ROLES.RESELLER]: [],
  [ROLES.USER]: [],
};

const ROLE_DISPLAY: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: 'Super Admin',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.MODERATOR]: 'Moderator',
  [ROLES.RESELLER]: 'Reseller',
  [ROLES.USER]: 'User',
};

async function seedPermissions() {
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key },
      update: {},
    });
  }
}

async function seedRoles() {
  for (const roleName of Object.values(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: {
        name: roleName,
        displayName: ROLE_DISPLAY[roleName] ?? roleName,
        isSystem: true,
      },
      update: { isSystem: true, displayName: ROLE_DISPLAY[roleName] ?? roleName },
    });

    const perms = ROLE_PERMS[roleName] ?? [];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permKey of perms) {
      const permission = await prisma.permission.findUnique({ where: { key: permKey } });
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
}

async function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: {}, // don't overwrite existing
    });
  }
}

async function seedCountries() {
  const countries = [
    ['US', 'United States'],
    ['GB', 'United Kingdom'],
    ['DE', 'Germany'],
    ['FR', 'France'],
    ['IT', 'Italy'],
    ['ES', 'Spain'],
    ['CA', 'Canada'],
    ['AU', 'Australia'],
    ['JP', 'Japan'],
    ['BR', 'Brazil'],
    ['RU', 'Russia'],
    ['IN', 'India'],
    ['MX', 'Mexico'],
    ['NL', 'Netherlands'],
    ['SE', 'Sweden'],
    ['NO', 'Norway'],
    ['FI', 'Finland'],
    ['DK', 'Denmark'],
    ['PL', 'Poland'],
    ['TR', 'Turkey'],
    ['SA', 'Saudi Arabia'],
    ['AE', 'United Arab Emirates'],
    ['EG', 'Egypt'],
    ['ZA', 'South Africa'],
    ['CN', 'China'],
    ['KR', 'South Korea'],
    ['SG', 'Singapore'],
    ['MY', 'Malaysia'],
    ['ID', 'Indonesia'],
    ['TH', 'Thailand'],
    ['VN', 'Vietnam'],
    ['AR', 'Argentina'],
    ['CL', 'Chile'],
    ['CO', 'Colombia'],
    ['NG', 'Nigeria'],
    ['KE', 'Kenya'],
    ['IL', 'Israel'],
    ['IR', 'Iran'],
    ['PK', 'Pakistan'],
    ['BD', 'Bangladesh'],
    ['PH', 'Philippines'],
  ];
  for (const [code, name] of countries) {
    await prisma.country.upsert({
      where: { code: code! },
      create: { code: code!, name: name! },
      update: {},
    });
  }
}

async function seedPricingDefault() {
  const existing = await prisma.pricingDefault.findFirst();
  if (!existing) {
    await prisma.pricingDefault.create({ data: { pointsPerEmail: 1 } });
  }
}

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL!;
  const password = process.env.SUPER_ADMIN_PASSWORD!;
  if (!email || !password) {
    console.warn('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set; skipping admin seed');
    return;
  }
  const role = await prisma.role.findUnique({ where: { name: ROLES.SUPER_ADMIN } });
  if (!role) throw new Error('super_admin role missing');

  const existing = await prisma.user.findUnique({ where: { emailNormalized: email.toLowerCase() } });
  if (existing) {
    console.log(`Super admin ${email} already exists`);
    return;
  }
  const passwordHash = await argon2.hash(password);
  await prisma.user.create({
    data: {
      email,
      emailNormalized: email.toLowerCase(),
      passwordHash,
      country: 'US',
      status: 'active',
      emailVerifiedAt: new Date(),
      roleId: role.id,
      referralCode: refCodeGen(),
    },
  });
  console.log(`Created super admin: ${email}`);
}

const EMAIL_TEMPLATES: Array<{ key: string; subject: string; htmlBody: string }> = [
  {
    key: 'welcome',
    subject: 'Welcome to {{site_name}}',
    htmlBody: `<h1 style="color:#d4af37">Welcome to {{site_name}}</h1>
<p>Hi {{email}}, thanks for joining. Start exploring your dashboard and top up your balance to unlock premium email inventory.</p>`,
  },
  {
    key: 'payment_confirmed',
    subject: '{{site_name}}: Payment confirmed',
    htmlBody: `<h2 style="color:#d4af37">Payment confirmed</h2>
<p>Your top-up of <b>${{amountUsd}}</b> has been credited. You received <b>{{points}}</b> points.</p>
<p>New balance: <b>{{balance}}</b> points.</p>`,
  },
  {
    key: 'order_confirmed',
    subject: '{{site_name}}: Order confirmed',
    htmlBody: `<h2 style="color:#d4af37">Order confirmed</h2>
<p>Your order of <b>{{count}}</b> emails is complete. Preparing your export...</p>`,
  },
  {
    key: 'export_ready',
    subject: '{{site_name}}: Your export is ready',
    htmlBody: `<h2 style="color:#d4af37">Export ready</h2>
<p>Your export of <b>{{count}}</b> emails is ready.</p>
<p>{{cloudLink}}</p>`,
  },
  {
    key: 'ticket_reply',
    subject: '{{site_name}}: Support replied',
    htmlBody: `<h2 style="color:#d4af37">Support replied</h2>
<p>Your ticket <b>"{{subject}}"</b> has a new reply. Log in to view.</p>`,
  },
];

async function seedEmailTemplates() {
  for (const t of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      create: t,
      update: {}, // preserve admin edits
    });
  }
}

async function main() {
  console.log('Seeding permissions...');
  await seedPermissions();
  console.log('Seeding roles...');
  await seedRoles();
  console.log('Seeding settings...');
  await seedSettings();
  console.log('Seeding countries...');
  await seedCountries();
  console.log('Seeding pricing defaults...');
  await seedPricingDefault();
  console.log('Seeding email templates...');
  await seedEmailTemplates();
  console.log('Seeding super admin...');
  await seedSuperAdmin();
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
