-- Additional PostgreSQL optimizations applied after Prisma migrations.
-- Run: psql -d $DATABASE -f prisma/sql/post-migrate.sql

-- Case-insensitive domain name lookup
CREATE INDEX IF NOT EXISTS "idx_domain_name_lower" ON "Domain" (lower(name));

-- Email local_part trigram for LIKE/contains filters
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "idx_email_local_trgm"
  ON "Email" USING gin ("localPart" gin_trgm_ops)
  WHERE status = 'available';

-- Partial index for fast "available now" queries (cooldown-aware)
CREATE INDEX IF NOT EXISTS "idx_email_available_now"
  ON "Email" ("domainId")
  WHERE status = 'available' AND (availableAfter IS NULL OR availableAfter <= now());

-- Cleanup expired reservations lookup
CREATE INDEX IF NOT EXISTS "idx_reservation_expired"
  ON "Reservation" ("expiresAt")
  WHERE status = 'active';
