-- Put „დიზაინი" back under „ტექნოლოგია და პროდუქტი".
-- Lossless: only one parent link changes, and the category has no experts.

BEGIN;

UPDATE "Category" AS c
   SET "parentId" = p."id"
  FROM "Category" AS p
 WHERE c."slug" = 'design'
   AND p."slug" = 'it';

COMMIT;
