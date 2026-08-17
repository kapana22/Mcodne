-- Requests grow to cover every sphere.  2026-08-14 (same day as the first)
--
-- WHY, ONE DAY LATER. The subsystem shipped assuming every request is „a
-- problem with a total budget". It is not: „ვეძებ ქიმიის მასწავლებელს, 25₾
-- გაკვეთილზე" is a request this platform must carry, and it does not fit —
-- not the budget bands (500–1 000₾), not the deadline („by when" is not a
-- question you ask about a weekly lesson), and not the sphere list, which was
-- measured on this database and holds 16 professional spheres and ZERO school
-- subjects.
--
-- WHAT CHANGES
--   · `kind`        the shape of the need — LEARNING | CONSULTATION | PROJECT.
--                   Decides what the budget is measured in and what `timing`
--                   means. A TEXT column read through lib/requestTopics and
--                   validated by zod, like B2BService.kind, so the taxonomy can
--                   grow without an ALTER TYPE.
--   · `topic`       what they need, as a stable slug from the request system's
--                   OWN vocabulary (lib/requestTopics — 132 entries, built for
--                   hundreds). Deliberately NOT a Category FK: the sphere
--                   taxonomy describes what the experts here DO, and „ქიმია"
--                   in it would be a sphere page with nobody behind it.
--   · budget        `budget` (enum) → `budgetMin` / `budgetMax` / `budgetUnit`.
--                   Numbers, because „500–1 000₾" and „20–40₾ per lesson" are
--                   not the same question and one enum answering both is the
--                   defect B2BService.kind exists to undo.
--   · `timing`      `deadline` (enum) → TEXT. Its legal values depend on `kind`,
--                   which a Postgres enum cannot express — so zod checking
--                   `timing ∈ TIMING[kind]` is a STRONGER guarantee, not weaker.
--   · `format`      ONLINE | IN_PERSON | EITHER. Asked before the city, because
--                   for most of this catalogue online makes the city irrelevant.
--
-- ⚠️ THIS TOUCHES ONLY "ServiceRequest". "RequestOffer" and "RequestAccess" are
-- unchanged, and no table outside this subsystem is read or written.
--
-- SAFE ON A POPULATED TABLE TOO, though it is empty on every deployment as this
-- is written (verified 2026-08-14): the new columns arrive WITH defaults so the
-- ALTER cannot fail, and the two dropped columns carried an enum that only this
-- subsystem ever used.
--
-- lib/dbBoot.ts carries the same statements. The two must stay identical.

BEGIN;

ALTER TABLE "ServiceRequest"
  -- Defaults exist so this statement is safe whether or not rows are present.
  -- They are NOT a fallback anybody relies on: every writer supplies all five,
  -- and zod refuses a body that does not.
  ADD COLUMN IF NOT EXISTS "kind"       TEXT    NOT NULL DEFAULT 'CONSULTATION',
  ADD COLUMN IF NOT EXISTS "topic"      TEXT    NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "budgetMin"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "budgetMax"  INTEGER,
  ADD COLUMN IF NOT EXISTS "budgetUnit" TEXT    NOT NULL DEFAULT 'PER_SESSION',
  ADD COLUMN IF NOT EXISTS "timing"     TEXT    NOT NULL DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS "format"     TEXT    NOT NULL DEFAULT 'EITHER';

-- The budget is a range, so the top must not sit under the bottom. `budgetMax`
-- NULL is the open band („120₾-ზე მეტი") and is allowed on purpose.
DO $$ BEGIN
  ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_budget_range"
    CHECK ("budgetMin" >= 0 AND ("budgetMax" IS NULL OR "budgetMax" >= "budgetMin"));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The two enum-backed columns go, and their types with them. Nothing outside
-- this subsystem ever referenced either.
ALTER TABLE "ServiceRequest"
  DROP COLUMN IF EXISTS "budget",
  DROP COLUMN IF EXISTS "deadline";

DROP TYPE IF EXISTS "RequestBudget";
DROP TYPE IF EXISTS "RequestDeadline";

-- „what is being asked for" — the admin's topic filter, and the only way to see
-- demand the catalogue does not serve.
CREATE INDEX IF NOT EXISTS "ServiceRequest_topic_status_idx" ON "ServiceRequest"("topic", "status");
-- The provider queue, filtered to one shape of work.
CREATE INDEX IF NOT EXISTS "ServiceRequest_kind_status_idx" ON "ServiceRequest"("kind", "status");

COMMIT;
