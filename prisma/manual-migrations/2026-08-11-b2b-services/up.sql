-- B2B services: the fixed-price catalogue.  2026-08-11
--
-- The product is the SERVICE, not the expert. A company buys „იურიდიული აუდიტი
-- — 800₾" and the owner decides who delivers it, off the platform. There is
-- deliberately no expert column and no assignment flow here.
--
-- Additive only: ONE new table and THREE nullable columns on "BusinessLead".
-- No existing column is altered, dropped or backfilled.
--
-- lib/dbBoot.ts carries the same statements and applies them on the first
-- request after deploy; this file is the reviewable document, and the reason
-- down.sql exists before the change ships.

BEGIN;

CREATE TABLE IF NOT EXISTS "B2BService" (
  "id"             TEXT NOT NULL,
  "direction"      TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  -- One short meta line: „4 საათი · ჯგუფური · ონლაინ". Matters most for a
  -- TRAINING, where format decides whether the service fits at all.
  "format"         TEXT,
  "priceGel"       INTEGER NOT NULL,
  "priceOnRequest" BOOLEAN NOT NULL DEFAULT false,
  "order"          INTEGER NOT NULL DEFAULT 0,
  "visible"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2BService_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "B2BService_price_nonnegative" CHECK ("priceGel" >= 0)
);

-- Added after the table first shipped, so the ALTER is here too.
ALTER TABLE "B2BService" ADD COLUMN IF NOT EXISTS "format" TEXT;

CREATE INDEX IF NOT EXISTS "B2BService_visible_direction_order_idx"
  ON "B2BService"("visible", "direction", "order");

ALTER TABLE "BusinessLead"
  ADD COLUMN IF NOT EXISTS "serviceId"   TEXT,
  ADD COLUMN IF NOT EXISTS "agreedPrice" INTEGER,
  ADD COLUMN IF NOT EXISTS "adminNote"   TEXT;

CREATE INDEX IF NOT EXISTS "BusinessLead_serviceId_idx" ON "BusinessLead"("serviceId");

-- SET NULL and NOT CASCADE: retiring a service must never delete the requests
-- it produced. Those rows are the record of who asked for what.
DO $$ BEGIN
  ALTER TABLE "BusinessLead"
    ADD CONSTRAINT "BusinessLead_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "B2BService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
