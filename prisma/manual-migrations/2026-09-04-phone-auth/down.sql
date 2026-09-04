-- Reverse of ./up.sql.
--
-- ⚠️ STEPS 1 AND 2 CAN FAIL, AND THAT FAILURE IS THE POINT. Restoring NOT NULL
-- on `email` / `passwordHash` aborts if a single phone-registered account
-- exists — which is exactly right: there is no address to invent for them and
-- CLAUDE.md's rule 6 forbids inventing one. Delete or complete those accounts
-- deliberately first; a migration must not silently manufacture identities.
--
-- The phone canonicalisation in up.sql step 3 is NOT reversed. „+995555123456"
-- is the same phone as „555123456", nothing reads the old shape (lib/sms
-- accepts every variant), and the three-shape mess it replaced is not a state
-- worth being able to return to.

DROP TABLE IF EXISTS "PhoneOtp";
DROP INDEX IF EXISTS "User_phone_verified_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "phoneVerified";
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
