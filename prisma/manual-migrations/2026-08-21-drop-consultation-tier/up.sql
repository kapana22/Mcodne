-- Consultation.tier — a derived column nothing read.  2026-08-21
--
-- QUICK / STANDARD / DEEP was computed from `minutes` and never consulted again.
-- components/booking/slots says it outright — „the only two columns tier
-- RESOLUTION actually reads" are minutes and price — and a grep for the three
-- values outside the derivation and the enum declaration returns nothing. No
-- branch tested it, no surface rendered it, and it was posted by the BROWSER on
-- every save, from a ladder that existed in two files.
--
-- ⚠️ RUN THIS IN TWO PARTS, WITH A DEPLOY BETWEEN THEM. The column is NOT NULL
-- with no default, so:
--
--   PART 1 (this file, first half) — drop the constraint. After it, the OLD
--   build still works (it writes a tier) and the NEW build works too (it does
--   not). This is the window in which nothing can break.
--
--   PART 2 (second half) — only after the build that stops writing `tier` is
--   live. Running it early makes every consultation insert from the old build
--   fail on an unknown column.
--
-- Reversible: down.sql restores the column, the type and the values, deriving
-- them from `minutes` exactly as the application used to.

-- ── PART 1 ──────────────────────────────────────────────────────────────────
ALTER TABLE "Consultation" ALTER COLUMN "tier" DROP NOT NULL;

DO $$ BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Consultation' AND column_name='tier') <> 'YES' THEN
    RAISE EXCEPTION 'Consultation.tier is still NOT NULL — part 2 would break the running build';
  END IF;
END $$;

-- ── PART 2 — AFTER THE DEPLOY ───────────────────────────────────────────────
-- Both parts were applied to production on 2026-08-21, in this order, with the
-- deploy of commit „Drop the tier column…" between them. Verified after each:
-- part 1 → an insert omitting `tier` succeeded while the old build was live;
-- part 2 → 58 rows intact, create/update/delete all fine, and the profile pages
-- still render their consultations.
ALTER TABLE "Consultation" DROP COLUMN "tier";
DROP TYPE "ConsultationTier";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='Consultation' AND column_name='tier') THEN
    RAISE EXCEPTION 'Consultation.tier survived the drop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConsultationTier') THEN
    RAISE EXCEPTION 'ConsultationTier survived the drop';
  END IF;
END $$;
