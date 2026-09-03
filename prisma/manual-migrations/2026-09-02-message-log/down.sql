-- Reverses 2026-09-02-message-log.
--
-- ⚠️ THIS DESTROYS THE ONLY RECORD OF WHAT THE SITE HAS SENT. There is no
-- second copy: the console lines it replaced are long gone from the Railway
-- log. Export the table first if the history is worth anything.
--
-- Roll the CODE back first — lib/mailer and lib/sms both write here, and a
-- sender writing to a table that is not there fails every send.

BEGIN;

DROP TABLE IF EXISTS "MessageLog";

COMMIT;
