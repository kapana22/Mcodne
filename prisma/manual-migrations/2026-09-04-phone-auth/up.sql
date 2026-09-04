-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTRATION BY PHONE (2026-09-04)
--
-- Owner: „მე მინდა დავამატოთ მობილურით რეგისტრაცია." Chosen shape: a number
-- and an SMS code, with no password — the pattern every Georgian marketplace
-- already trained people on.
--
-- Three facts change, and each one has to happen in this order:
--
--   1. An account may have NO ADDRESS. `email` stops being NOT NULL.
--   2. An account may have NO PASSWORD. `passwordHash` stops being NOT NULL.
--   3. A phone becomes a CREDENTIAL — so it needs one spelling and, once
--      somebody has proved they hold it, it must be theirs alone.
--
-- ⚠️ THE UNIQUE INDEX IS PARTIAL, AND THAT IS THE WHOLE REASON THIS MIGRATION
-- CAN RUN AT ALL. Measured on production the day it was written: 27 accounts
-- carry a phone, 25 distinct numbers — TWO PAIRS COLLIDE (one of them is test
-- data, the other is two real addresses sharing 598636710). A plain
-- `CREATE UNIQUE INDEX ON "User"("phone")` would abort here and take the whole
-- boot with it (lib/dbBoot throws the boot on one failed statement).
--
-- It is also the honest rule rather than a workaround. A number TYPED into a
-- profile field is contact information: two people may share a phone and both
-- be telling the truth. A number somebody ANSWERED A CODE ON is an identity,
-- and two identities cannot be one person. `phoneVerified` is exactly that
-- line, every row starts on the harmless side of it, and the index is empty the
-- moment it is created.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ── an account may have no address, and no password
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- 2 ── did somebody answer a code on this number?
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false;

-- 3 ── ONE SPELLING. „555123456", „995555123456" and „+995555123456" were three
--      rows for one phone (lib/sms carries `phoneVariants` for precisely that),
--      and a credential that three strings can spell is not a credential.
--      Georgian mobiles only: a foreign number already carries its country code
--      and guessing one onto it would dial the wrong country.
--      Idempotent — running it twice leaves the same string.
UPDATE "User"
   SET "phone" = '+995' || right(regexp_replace("phone", '\D', '', 'g'), 9)
 WHERE "phone" IS NOT NULL
   AND regexp_replace("phone", '\D', '', 'g') ~ '^(995)?5[0-9]{8}$'
   AND "phone" <> '+995' || right(regexp_replace("phone", '\D', '', 'g'), 9);

-- 4 ── a VERIFIED number belongs to exactly one account. Unverified ones are
--      left alone on purpose — see the header.
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_verified_key"
    ON "User" ("phone")
 WHERE "phoneVerified" = true;

-- 5 ── the code itself.
--
-- ⚠️ NOT `OtpCode`, which hangs off a userId. This code is sent to a number
-- that, the first time, belongs to nobody — the account is created after it is
-- answered — so there is no user to point at.
--
-- ⚠️ THE CODE IS STORED HASHED. It is the ONLY credential on a passwordless
-- account, and `attempts` is the brute-force floor that lib/rateLimit cannot be:
-- that limiter lives in one instance's memory and resets on every deploy, this
-- counter lives in the row.
CREATE TABLE IF NOT EXISTS "PhoneOtp" (
  "id"         TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "expiresAt"  TIMESTAMPTZ(6) NOT NULL,
  "consumed"   BOOLEAN NOT NULL DEFAULT false,
  "ticketHash" TEXT,
  "createdAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_createdAt_idx" ON "PhoneOtp" ("phone", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PhoneOtp_expiresAt_idx"       ON "PhoneOtp" ("expiresAt");
