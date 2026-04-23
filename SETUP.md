# Setup — Phase 1 (Windows)

## 1. Install prerequisites

1. **Node.js 20+**: https://nodejs.org
2. **pnpm**: `npm install -g pnpm`
3. **PostgreSQL 16**: https://www.postgresql.org/download/windows/
   - Create a database: `CREATE DATABASE platform;`
4. **Redis** for Windows: install **Memurai** (https://www.memurai.com/) — runs as a Windows service on port 6379.

> XAMPP is not required. If it's already running, make sure Apache isn't binding port 80/443 you need.

## 2. Install dependencies

```bash
cd d:\Clode\01-Shop
pnpm install
```

## 3. Configure env

```bash
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
```

Edit `apps/api/.env` and set `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`.

## 4. Run migrations + seed

```bash
pnpm --filter @platform/api db:generate
pnpm --filter @platform/api db:migrate -- --name init
pnpm --filter @platform/api db:seed
```

Then apply PostgreSQL-only optimizations:

```bash
psql -U postgres -d platform -f apps/api/prisma/sql/post-migrate.sql
```

## 5. Run dev

```bash
pnpm dev
```

- API: http://localhost:4000/health
- Web: http://localhost:3000

Log in with the super admin credentials from `.env`. You'll be redirected to `/admin`.

## What's done in Phase 1

- ✅ Monorepo scaffolding (pnpm + TS)
- ✅ Prisma schema (users, roles, permissions, emails, pricing, payments, exports, tickets, audit, announcements, settings, referrals, resellers, etc.)
- ✅ Auth: register, login (lockout after N fails), JWT access + refresh rotation, `/auth/me`
- ✅ Roles & Permissions (seeded: super_admin, admin, moderator, reseller, user)
- ✅ Settings + Branding (admin-editable, cached in Redis, public subset endpoint)
- ✅ Next.js 14 app with dark-navy + gold theme, Framer Motion, Tailwind
- ✅ User dashboard shell (nav + top bar)
- ✅ Admin dashboard shell (nav + top bar + Branding page)

## Next: Phase 2 — Email Core (ingestion)

- Folder management + ingestion worker (streaming, dedup, mixed-file splitting)
- Partitioned emails table (raw SQL migration)
- Domains + Countries admin UIs
