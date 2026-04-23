# Platform

Email search & distribution platform with crypto top-ups, search reservations, cloud exports, and multi-tenant branding.

## Stack

- **Backend:** Fastify + TypeScript + Prisma (PostgreSQL 16)
- **Frontend:** Next.js 14 App Router + TailwindCSS + Framer Motion
- **Cache/Queue:** Redis + BullMQ
- **Payments:** CoinPayments
- **Cloud Storage:** GoFile

## Prerequisites (Windows)

Install separately (XAMPP not required):

1. **Node.js 20+** — https://nodejs.org
2. **PostgreSQL 16** — https://www.postgresql.org/download/windows/
3. **Redis for Windows** — Memurai (https://www.memurai.com/) or Redis via WSL
4. **pnpm** — `npm install -g pnpm`

## Quick Start

```bash
pnpm install
cp apps/api/.env.example apps/api/.env    # fill in values
cp apps/web/.env.example apps/web/.env    # fill in values
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- API: http://localhost:4000
- Web: http://localhost:3000

## Workspace

- `apps/api` — Fastify backend
- `apps/web` — Next.js frontend
- `packages/shared` — shared types & zod validators

## Scripts

- `pnpm dev` — run api + web in parallel
- `pnpm db:migrate` — apply Prisma migrations
- `pnpm db:seed` — seed default roles, permissions, settings
- `pnpm db:studio` — Prisma Studio
