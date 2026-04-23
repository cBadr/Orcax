# ==============================================================================
# First-time production deploy on Windows.
# Run from project root:
#   pwsh -File scripts/deploy.ps1
# Pre-requisites:
#   - Node 20+, pnpm, PostgreSQL, Memurai (Redis), pm2, pm2-windows-startup
#   - apps/api/.env and apps/web/.env filled in (see .env.production.example)
# ==============================================================================

$ErrorActionPreference = 'Stop'

function Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

Step "Verifying .env files"
if (-not (Test-Path apps/api/.env))  { throw "Missing apps/api/.env — copy from apps/api/.env.production.example" }
if (-not (Test-Path apps/web/.env))  { throw "Missing apps/web/.env — copy from apps/web/.env.production.example" }

Step "Installing dependencies (production-minded)"
pnpm install --frozen-lockfile

Step "Generating Prisma client"
pnpm --filter @platform/api db:generate

Step "Applying database migrations"
pnpm --filter @platform/api db:deploy

Step "Applying PostgreSQL optimizations (post-migrate.sql)"
# Reads DATABASE_URL from env (requires Invoke-Sqlcmd-free approach: rely on psql)
$envContent = Get-Content apps/api/.env | Where-Object { $_ -match '^DATABASE_URL=' }
if (-not $envContent) { throw "DATABASE_URL not set in apps/api/.env" }
$dbUrl = ($envContent -replace '^DATABASE_URL=', '').Trim('"', "'")
& psql $dbUrl -f apps/api/prisma/sql/post-migrate.sql

Step "Seeding super admin, roles, permissions, settings"
pnpm --filter @platform/api db:seed

Step "Building API"
pnpm --filter @platform/api build

Step "Building Web"
pnpm --filter @platform/web build

Step "Creating logs directory"
New-Item -ItemType Directory -Force -Path logs | Out-Null

Step "Starting / restarting services via PM2"
if (pm2 describe platform-api 2>$null) {
  pm2 restart ecosystem.config.cjs
} else {
  pm2 start ecosystem.config.cjs
}
pm2 save

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Check status: pm2 status"
Write-Host "Tail logs:    pm2 logs"
