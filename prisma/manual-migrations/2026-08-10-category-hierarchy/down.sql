-- Rollback for 2026-08-10-category-hierarchy.
--
-- Restores the exact previous behaviour. This is lossless BECAUSE up.sql left
-- `isLive` untouched: the boolean the whole app used to read is still the one
-- it read before, so dropping the new columns puts the site back where it was.
--
-- The three widened names are restored too. They are the only thing up.sql
-- overwrote, so they are the only thing that needs naming here.
--
-- Run:  prisma db execute --file prisma/manual-migrations/2026-08-10-category-hierarchy/down.sql --schema prisma/schema.prisma
-- Then: revert the schema.prisma change and `prisma generate`.

BEGIN;

-- Names, back to what they were before the merge.
UPDATE "Category" SET "name" = 'ბიზნესი'            WHERE "slug" = 'business';
UPDATE "Category" SET "name" = 'მარკეტინგი'         WHERE "slug" = 'marketing';
UPDATE "Category" SET "name" = 'IT და პროგრამირება' WHERE "slug" = 'it';

-- The hierarchy and the status vocabulary. `isLive` was never modified, so no
-- category changes visibility as a result of this.
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_parentId_fkey";
DROP INDEX IF EXISTS "Category_parentId_idx";
ALTER TABLE "Category" DROP COLUMN IF EXISTS "parentId";
ALTER TABLE "Category" DROP COLUMN IF EXISTS "status";

DROP TYPE IF EXISTS "CategoryStatus";

COMMIT;
