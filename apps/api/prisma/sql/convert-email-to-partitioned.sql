-- Convert the "Email" table to a LIST-partitioned table by partitionKey (0..31).
-- RUN ONLY BEFORE LARGE-SCALE INGESTION. The table must be empty or near-empty,
-- because this script renames the original table and re-inserts rows.
--
-- Steps:
--   1. Rename Email -> Email_old
--   2. Create new Email as partitioned by partitionKey
--   3. Create 32 partitions
--   4. Re-create indexes on parent (propagated to partitions)
--   5. Copy rows back (if any)
--   6. Drop Email_old
--
-- Prisma's Email model still works unchanged; it just treats the parent as one
-- logical table. Foreign keys on Email (to Domain) are preserved via triggers.

BEGIN;

ALTER TABLE "Email" RENAME TO "Email_old";

CREATE TABLE "Email" (
  id              bigserial NOT NULL,
  email           text NOT NULL,
  "localPart"     text NOT NULL,
  "domainId"      integer NOT NULL,
  hash            text NOT NULL,
  "partitionKey"  integer NOT NULL,
  status          text NOT NULL DEFAULT 'available',
  "reservedUntil" timestamp(3),
  "reservedById"  text,
  "soldAt"        timestamp(3),
  "availableAfter" timestamp(3),
  "sourceFileId"  integer,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, "partitionKey")
) PARTITION BY LIST ("partitionKey");

-- 32 partitions
DO $$
DECLARE i int;
BEGIN
  FOR i IN 0..31 LOOP
    EXECUTE format(
      'CREATE TABLE "Email_p%s" PARTITION OF "Email" FOR VALUES IN (%s);',
      i, i
    );
  END LOOP;
END$$;

-- Indexes on the parent propagate to all partitions
CREATE UNIQUE INDEX "Email_hash_key" ON "Email" (hash);
CREATE INDEX "Email_domainId_status_availableAfter_idx"
  ON "Email" ("domainId", status, "availableAfter");
CREATE INDEX "Email_status_reservedUntil_idx"
  ON "Email" (status, "reservedUntil");

-- Re-insert old rows if any
INSERT INTO "Email" (id, email, "localPart", "domainId", hash, "partitionKey", status,
  "reservedUntil", "reservedById", "soldAt", "availableAfter", "sourceFileId", "createdAt")
SELECT id, email, "localPart", "domainId", hash, "partitionKey", status,
  "reservedUntil", "reservedById", "soldAt", "availableAfter", "sourceFileId", "createdAt"
FROM "Email_old";

-- Recreate the id sequence pointer so bigserial continues correctly
SELECT setval(
  pg_get_serial_sequence('"Email"', 'id'),
  COALESCE((SELECT MAX(id) FROM "Email"), 1)
);

DROP TABLE "Email_old";

COMMIT;

-- Optional: add the trigram index (local-part LIKE search) on partitions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$
DECLARE i int;
BEGIN
  FOR i IN 0..31 LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS "Email_p%s_local_trgm_idx" ON "Email_p%s" USING gin ("localPart" gin_trgm_ops) WHERE status = ''available'';',
      i, i
    );
  END LOOP;
END$$;
