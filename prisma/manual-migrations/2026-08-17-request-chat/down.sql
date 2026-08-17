-- Rollback for 2026-08-17-request-chat.
--
-- ⚠️ ROLL BACK THE DEPLOYMENT FIRST — lib/dbBoot.ts re-creates this table on
-- every boot (the standing trap every rollback in this folder documents).
--
-- ⚠️ THIS DESTROYS EVERY CONVERSATION. What a client asked and what a provider
-- answered before the choice was made exists nowhere else — not in the offer
-- (which carries one paragraph, written before any question), and not in the
-- contact details (which only opened afterwards, if at all).
--
--   pg_dump "$DATABASE_URL" --data-only -t '"RequestMessage"' > chat-backup.sql
--
-- The offers and requests themselves are untouched: this drops one table and
-- alters nothing.

BEGIN;

DROP TABLE IF EXISTS "RequestMessage";

COMMIT;
