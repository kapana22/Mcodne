-- Requests: the client describes a problem, providers bid on it.  2026-08-14
--
-- THE DIRECTION IS INVERTED. Everywhere else here a client picks a person and
-- books their hour. This is the other way round: they say what is wrong and
-- what they can spend, an admin phones them, and the providers come to them.
--
-- ⚠️ ADDITIVE ONLY. Three new tables, five new enum types, and NOT ONE existing
-- table altered — "Booking", "Consultation", "Package", "Enrollment",
-- "AvailabilitySlot", "Review", "Dispute", "BusinessLead" and "B2BService" are
-- untouched by every statement in this file. Nothing is backfilled.
--
-- lib/dbBoot.ts carries the same statements and applies them on the first
-- request after deploy; this file is the reviewable document, and the reason
-- down.sql exists before the change ships. The two must stay identical.
--
-- The subsystem is dark behind FEATURE_REQUESTS (lib/requests.ts). These tables
-- exist on every deployment and stay EMPTY until somebody uses them.

BEGIN;

-- ⚠️ THE `RequestBudget` AND `RequestDeadline` ENUMS THIS FILE ORIGINALLY
-- CREATED ARE GONE. They lasted one day; 2026-08-14-request-topics drops them
-- and explains why (a budget that must say both „500–1 000₾" and „20–40₾ ერთ
-- გაკვეთილზე" is not one enum). Removed from this file too rather than left to
-- be created and immediately dropped — a migration that undoes its own
-- neighbour is a migration nobody can read in a year.
DO $$ BEGIN CREATE TYPE "ServiceRequestStatus" AS ENUM ('NEW', 'VERIFIED', 'REJECTED', 'MATCHED', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RequestOfferStatus" AS ENUM ('SENT', 'WITHDRAWN', 'ACCEPTED', 'DECLINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RequestProviderKind" AS ENUM ('EXPERT', 'COMPANY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ServiceRequest" (
  "id"           TEXT NOT NULL,
  -- The code we read down a phone line: „MC-7A4K2". Minted from crypto
  -- randomness, never a sequence — it is the client's only key to their own
  -- request, so a guessable one hands a stranger somebody's phone number.
  "publicRef"    TEXT NOT NULL,
  -- The shape of the need (LEARNING | CONSULTATION | PROJECT) and what it is
  -- FOR. Both TEXT, read through lib/requestTopics — `topic` is deliberately
  -- NOT a Category FK: that taxonomy describes what the experts here DO, and
  -- „ქიმია" in it would be a sphere page with nobody behind it.
  "kind"         TEXT NOT NULL DEFAULT 'CONSULTATION',
  "topic"        TEXT NOT NULL DEFAULT 'other',
  "categoryId"   TEXT,
  "description"  TEXT NOT NULL,
  -- Numbers, not a band enum. NULL max is the open top band.
  "budgetMin"    INTEGER NOT NULL DEFAULT 0,
  "budgetMax"    INTEGER,
  "budgetUnit"   TEXT NOT NULL DEFAULT 'PER_SESSION',
  -- Meaning depends on `kind`: a deadline, an urgency, or a FREQUENCY.
  "timing"       TEXT NOT NULL DEFAULT 'flexible',
  "format"       TEXT NOT NULL DEFAULT 'EITHER',
  -- A code („TBILISI"), not the Georgian label — renaming what the form says
  -- must never rewrite rows. lib/requestTopics → CITIES owns the words.
  "city"         TEXT NOT NULL,
  "contactName"  TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "email"        TEXT,
  "userId"       TEXT,
  "status"       "ServiceRequestStatus" NOT NULL DEFAULT 'NEW',
  -- Admin-only. Never selected by a client- or provider-facing endpoint.
  "adminNote"    TEXT,
  "verifiedAt"   TIMESTAMP(3),
  -- Plain TEXT with no FK, like "AuditLog"."actorId": a record of something
  -- that happened must outlive the account that did it.
  "verifiedById" TEXT,
  "offerLimit"   INTEGER NOT NULL DEFAULT 3,
  "offerCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NOT NULL with no DB default, exactly as prisma migrate diff emits it for
  -- @updatedAt: the client applies it on every write, and a default here would
  -- leave a difference for the next `prisma db push` to "fix".
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id"),
  -- The last line of defence under the conditional increment the offer
  -- endpoint uses. The claim itself is what enforces the limit; this makes a
  -- fourth offer impossible to store even if something ever writes the table
  -- without going through that endpoint.
  CONSTRAINT "ServiceRequest_offerCount_within_limit" CHECK ("offerCount" >= 0 AND "offerCount" <= "offerLimit"),
  CONSTRAINT "ServiceRequest_offerLimit_positive" CHECK ("offerLimit" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceRequest_publicRef_key" ON "ServiceRequest"("publicRef");
-- The admin queue: unhandled first, newest first.
CREATE INDEX IF NOT EXISTS "ServiceRequest_status_createdAt_idx" ON "ServiceRequest"("status", "createdAt");
-- The provider list: verified requests, optionally within a sphere.
CREATE INDEX IF NOT EXISTS "ServiceRequest_categoryId_status_idx" ON "ServiceRequest"("categoryId", "status");
-- „what is being asked for" — the admin's topic filter, and the only way to see
-- demand the catalogue does not serve.
CREATE INDEX IF NOT EXISTS "ServiceRequest_topic_status_idx" ON "ServiceRequest"("topic", "status");
CREATE INDEX IF NOT EXISTS "ServiceRequest_kind_status_idx" ON "ServiceRequest"("kind", "status");

CREATE TABLE IF NOT EXISTS "RequestOffer" (
  "id"           TEXT NOT NULL,
  "requestId"    TEXT NOT NULL,
  "providerKind" "RequestProviderKind" NOT NULL,
  "expertUserId" TEXT,
  "companyId"    TEXT,
  "priceGel"     INTEGER NOT NULL,
  "daysEstimate" INTEGER,
  "message"      TEXT NOT NULL,
  "status"       "RequestOfferStatus" NOT NULL DEFAULT 'SENT',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequestOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestOffer_price_positive" CHECK ("priceGel" > 0),
  -- EXACTLY ONE provider column. The rule is CHECKED in one place —
  -- offerProviderError() in lib/requests.ts, which can say which half was
  -- wrong. This constraint is the backstop for anything that ever writes the
  -- table without going through it.
  CONSTRAINT "RequestOffer_exactly_one_provider" CHECK (
    ("expertUserId" IS NOT NULL AND "companyId" IS NULL)
    OR ("expertUserId" IS NULL AND "companyId" IS NOT NULL)
  )
);

-- One offer per provider per request. Not „one per provider": revising a price
-- by sending a second offer would let the same provider eat two of the three
-- places the offerCount claim is counting.
CREATE UNIQUE INDEX IF NOT EXISTS "RequestOffer_requestId_expertUserId_key" ON "RequestOffer"("requestId", "expertUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "RequestOffer_requestId_companyId_key" ON "RequestOffer"("requestId", "companyId");
CREATE INDEX IF NOT EXISTS "RequestOffer_expertUserId_status_idx" ON "RequestOffer"("expertUserId", "status");
CREATE INDEX IF NOT EXISTS "RequestOffer_companyId_status_idx" ON "RequestOffer"("companyId", "status");

-- WHO CAN SEE THE SUBSYSTEM AT ALL. An allowlist an admin maintains by hand,
-- and it starts empty on purpose: the experts already on the platform applied
-- to be booked, not to bid on leads. An empty table can only produce an empty
-- audience, which is the only safe state for a stage-1 test.
CREATE TABLE IF NOT EXISTS "RequestAccess" (
  "id"        TEXT NOT NULL,
  "kind"      "RequestProviderKind" NOT NULL,
  "userId"    TEXT,
  "companyId" TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestAccess_exactly_one_subject" CHECK (
    ("userId" IS NOT NULL AND "companyId" IS NULL)
    OR ("userId" IS NULL AND "companyId" IS NOT NULL)
  )
);

-- Nullable + unique on both, the same trick "Company"."taxId" relies on:
-- Postgres allows any number of NULLs under a unique constraint, so the two
-- nullable columns do not fight each other.
CREATE UNIQUE INDEX IF NOT EXISTS "RequestAccess_userId_key" ON "RequestAccess"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "RequestAccess_companyId_key" ON "RequestAccess"("companyId");

-- The foreign keys, after every side exists.
--
-- RESTRICT on the sphere: one with live requests must fail loudly on delete
-- rather than silently unfile them.
DO $$ BEGIN ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- SET NULL on the account, deliberately unlike "Booking"'s Restrict: deleting
-- an account must not be refused because of a request, and must not erase it
-- either — what somebody asked for stays readable with no name on it.
DO $$ BEGIN ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Everything else cascades: an offer without its request, or an allowlist row
-- without its subject, is a row that cannot be read at all.
DO $$ BEGIN ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_expertUserId_fkey" FOREIGN KEY ("expertUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RequestAccess" ADD CONSTRAINT "RequestAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RequestAccess" ADD CONSTRAINT "RequestAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
