-- Requests: the clarifying answers.  2026-08-14 (third of the day)
--
-- ONE nullable JSONB column. „ვისთვის?" and „რა დონეა?" are the two facts a
-- tutor cannot quote without, and the catalogue's direction (per-topic
-- clarifying questions, thumbtack-shaped) cannot mean a column per question —
-- so the answers live in a bag whose LEGAL CONTENT is defined in
-- lib/requestTopics → EXTRAS and enforced by zod at the door. Same pattern as
-- "TutorProfile"."professionData".
--
-- Additive only; nothing else is touched. lib/dbBoot.ts carries the same
-- statement. NULL means „nothing to clarify for this kind" — most rows.

BEGIN;

ALTER TABLE "ServiceRequest"
  ADD COLUMN IF NOT EXISTS "details" JSONB;

COMMIT;
