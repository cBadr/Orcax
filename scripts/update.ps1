# ==============================================================================
# Pull latest code + migrate + rebuild + restart (idempotent).
# Run after each deploy on the server.
# ==============================================================================

$ErrorActionPreference = 'Stop'

function Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

Step "Pulling latest code"
git pull --ff-only

Step "Installing dependencies"
pnpm install --frozen-lockfile

Step "Generating Prisma client"
pnpm --filter @platform/api db:generate

Step "Applying any new migrations"
pnpm --filter @platform/api db:deploy

Step "Rebuilding"
pnpm --filter @platform/api build
pnpm --filter @platform/web build

Step "Restarting services"
pm2 restart ecosystem.config.cjs --update-env

Write-Host ""
Write-Host "Update complete." -ForegroundColor Green
pm2 status
