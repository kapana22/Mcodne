-- Re-file the two training rows onto a real AREA.
--
-- WHY BY HAND. lib/dbBoot's backfill can read the KIND back out of the old
-- „ტრენინგები" direction, because that word names a kind. It cannot invent the
-- AREA, because the old model had nowhere to record one — „გაყიდვების ტრენინგი"
-- only ever said „training", never „sales". Guessing it in code would write a
-- fact nobody stated; these two are the owner's call.
--
-- Until this runs the page is still correct: it hides an area chip that merely
-- restates the kind (lib/b2b → areaRestatesKind), so the rows read
-- „ტრენინგი → გაყიდვების ტრენინგი" with no empty or duplicated label.

UPDATE "B2BService"
   SET "direction" = 'გაყიდვები'
 WHERE "kind" = 'TRAINING' AND "title" = 'გაყიდვების ტრენინგი';

UPDATE "B2BService"
   SET "direction" = 'მენეჯმენტი'
 WHERE "kind" = 'TRAINING' AND "title" = 'ლიდერობა მენეჯერებისთვის';

SELECT "kind", "direction", "title" FROM "B2BService" ORDER BY "kind", "direction", "order";
