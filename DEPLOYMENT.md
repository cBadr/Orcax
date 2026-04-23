# Deployment Guide (Windows Server, no Docker)

This guide gets the platform running in production on a Windows server.

---

## 1. Prerequisites (one-time install)

```powershell
# Node.js 20 LTS
winget install OpenJS.NodeJS.LTS

# pnpm + PM2 + Windows startup service
npm install -g pnpm@10 pm2 pm2-windows-startup

# Ensure pm2 starts at boot (installs a Windows service)
pm2-startup install
```

Install these separately:
- **PostgreSQL 16** — https://www.postgresql.org/download/windows/  (add `C:\Program Files\PostgreSQL\16\bin` to PATH so `psql` works)
- **Memurai (Redis for Windows)** — https://www.memurai.com/get-memurai (auto-runs as a Windows service on port 6379)

Verify each:
```powershell
node -v          # v20+
pnpm -v
psql --version
Get-Service Memurai
pm2 -v
```

---

## 2. Database

```powershell
psql -U postgres
```
```sql
CREATE USER platform WITH PASSWORD 'strong_password_here';
CREATE DATABASE platform OWNER platform;
\q
```

---

## 3. Project setup

```powershell
# Clone (or copy) the repo
cd D:\
git clone <your-repo-url> platform
cd D:\platform
```

Copy the production env templates:
```powershell
Copy-Item apps\api\.env.production.example apps\api\.env
Copy-Item apps\web\.env.production.example apps\web\.env
```

Open both files and fill in real values. Essentials:

**`apps/api/.env`**
- `DATABASE_URL` — match the user/password you created
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — long random strings
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` — your first login
- `WEB_ORIGIN=https://yourdomain.com`
- `PUBLIC_API_URL=https://api.yourdomain.com`
- `PUBLIC_WEB_URL=https://yourdomain.com`

**`apps/web/.env`**
- `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`

---

## 4. One-shot deploy

```powershell
pwsh -File scripts\deploy.ps1
```

This runs, in order:
1. `pnpm install --frozen-lockfile`
2. `prisma generate` + `prisma migrate deploy`
3. Applies `apps/api/prisma/sql/post-migrate.sql` (indexes, pg_trgm)
4. Seeds roles, permissions, countries, default settings, super admin, email templates
5. Builds API and Web (TypeScript + Next.js)
6. Starts / restarts all three services under PM2 (`ecosystem.config.cjs`)
7. `pm2 save` so they persist across reboots

Verify:
```powershell
pm2 status
# expect 3 "online" services: platform-api, platform-workers, platform-web
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:3000
```

---

## 5. Reverse proxy + HTTPS

Pick one — **Caddy** is simplest for Let's Encrypt:

### Caddy (recommended)
Download Caddy for Windows. Create `Caddyfile`:
```
yourdomain.com {
  reverse_proxy 127.0.0.1:3000
}
api.yourdomain.com {
  reverse_proxy 127.0.0.1:4000
}
```
Run: `caddy run --config Caddyfile`. Caddy auto-fetches and renews TLS certs.

### Apache (if using XAMPP)
Enable `mod_proxy`, `mod_proxy_http`, `mod_ssl`, then add two virtual hosts:
```apache
<VirtualHost *:443>
  ServerName yourdomain.com
  SSLEngine on
  SSLCertificateFile C:/certs/fullchain.pem
  SSLCertificateKeyFile C:/certs/privkey.pem
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
<VirtualHost *:443>
  ServerName api.yourdomain.com
  SSLEngine on
  SSLCertificateFile C:/certs/fullchain.pem
  SSLCertificateKeyFile C:/certs/privkey.pem
  ProxyPreserveHost On
  ProxyPass / http://127.0.0.1:4000/
  ProxyPassReverse / http://127.0.0.1:4000/
</VirtualHost>
```
Use `win-acme` to provision certs.

---

## 6. Post-deploy configuration (in the admin panel)

Log in at `https://yourdomain.com/login` with the super admin account, then go to **Admin → Settings**:

- **Branding** — site name, tagline, logo URL, favicon URL, primary/accent colors, support Telegram.
- **CoinPayments** — paste `Client ID` + `Client Secret` (the Client Secret also verifies incoming IPNs; no separate webhook secret needed).
- **GoFile** — paste `Account Token` (Account ID is optional).
- **Security** — toggle CAPTCHA (and provide hCaptcha site key + secret if enabling).
- **Economy** — `points_per_dollar`, `min_topup_usd`, `max_topup_usd`, accepted currencies.

Then visit:
- **Pricing** — default price, TLD groups, domain overrides, bulk discounts, top-up bonuses.
- **Countries** + **Domains** — ensure country mappings cover your inventory.
- **Ingestion** — register email folders to begin importing.
- **Resellers** — create tiers if you offer reseller pricing.

---

## 7. Updates

```powershell
pwsh -File scripts\update.ps1
```

What it does:
- `git pull`
- `pnpm install`
- `prisma generate` + `migrate deploy`
- Rebuilds both apps
- `pm2 restart ecosystem.config.cjs --update-env`

---

## 8. Logs + health

```powershell
pm2 status
pm2 logs                                 # all services, tail
pm2 logs platform-api --lines 200        # one service
pm2 logs platform-workers --lines 200
Get-Content .\logs\api.err.log -Tail 100
```

Restart a single service:
```powershell
pm2 restart platform-api
```

Stop everything (and prevent restart at boot):
```powershell
pm2 stop all
pm2 delete all
pm2 save --force
```

---

## 9. Backup

Minimum daily backup — `platform` database only:
```powershell
pg_dump -U platform -F c -f D:\backups\platform-$(Get-Date -Format "yyyyMMdd").dump platform
```

Add as a Windows Scheduled Task running as Administrator.

The raw email source files under `data/` are not critical (they're re-ingestible) but back them up if ingestion cost is high.

---

## 10. Scaling checklist

When inventory grows past ~50M rows:
- Run `apps/api/prisma/sql/convert-email-to-partitioned.sql` **once** (ideally before heavy ingestion) — splits the `Email` table into 32 partitions.
- Consider a dedicated workers VM: same `.env`, start only `platform-workers`, remove `platform-api` / `platform-web` from its `ecosystem.config.cjs`.
- Move `data/` to a separate SSD volume.
- Enable streaming replication on PostgreSQL.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED` on API startup | Memurai / PostgreSQL not running | `Start-Service Memurai`; check Postgres service |
| CoinPayments `400 SuccessUrl not valid` | `PUBLIC_WEB_URL` is `localhost` | Set to a real `https://…` domain (or leave unset for local tests; fields are auto-skipped) |
| CoinPayments `401` | Wrong client ID / secret OR server clock drift | Re-check Settings → CoinPayments; sync system time |
| Payment stuck `pending` | IPN webhook URL not reachable | Set a real `PUBLIC_API_URL`, or click **Recheck** in `/admin/payments`; the cron reconciles every minute regardless |
| Prisma `database does not exist` | Forgot to `CREATE DATABASE platform` | See §2 |
| `pnpm install` fails on argon2 | Missing build tools | `npm install -g windows-build-tools` (one-time) |
