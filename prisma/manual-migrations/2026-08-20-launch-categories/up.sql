-- Wave 1 of the launch taxonomy — the TEACHING sphere, and two corrections.
-- 2026-08-20
--
-- prisma db execute --file prisma/manual-migrations/2026-08-20-launch-categories/up.sql --schema prisma/schema.prisma
--
-- THE OWNER'S LIST („მცოდნე.ge — გასაშვები კატეგორიები", 2026-08-20) names three
-- forms of one promise: სწავლება (gives you a skill), კონსულტაცია (gives you an
-- understanding), სერვისი (gives you a result). „სამივე მცოდნეა."
--
-- ⚠️ ONLY ONE OF THE THREE BECOMES A `Category` ROW, AND THAT IS THE WHOLE
-- POINT OF THIS FILE.
--
--   სწავლება      → a Category. Teaching is bought by booking an hour, so a
--                   teacher is a TutorProfile with a calendar, exactly like a
--                   consultant. It belongs in the sphere taxonomy.
--   კონსულტაცია   → already Categories: tax · law · psychology · business ·
--                   marketing · it. Nothing to create.
--   სერვისი       → NOT a Category. The trades live in lib/requestTopics
--                   (`plumbing` „სანტექნიკა", `electrical` „ელექტრიკა",
--                   `appliances` „ტექნიკის შეკეთება", `repairs`), they are
--                   ALREADY live (LIVE_SERVICE_GROUP_IDS, eight of them since
--                   this morning), and a plumber registers as a ServiceProfile
--                   through the WORK door — no categoryId is ever written.
--
-- So a „სახლის რემონტი" Category would be a filter option matching ZERO experts
-- forever, sitting beside `?trade=plumbing` which matches the real ones: two
-- names for one thing, one of them permanently empty. „A client is never sent
-- to an empty room" (CLAUDE.md → catalogue archetype) is the rule that decides
-- it. If the trades ever need a *display* grouping, that grouping belongs in
-- lib/requestTopics next to the topics it groups, not in this table.
--
-- ⚠️ `saqofacxovrebo` IS DELIBERATELY ABSENT — owner, 2026-08-20: „არ გვინდა."
-- Its three professions (დამლაგებელი, საყოფაცხოვრებო ტექნიკა, ავეჯის გადაზიდვა)
-- are not touched on the requests side: `cleaning` and `moving` stay in
-- LIVE_SERVICE_GROUP_IDS, which was set this morning with its own owner quote
-- („სერვისებსაც, რაც ყოველდღიურად სჭირდება — დალაგება და ხელოსანი, ესეც").
-- The two statements are about DIFFERENT surfaces — a launch category versus an
-- intake vocabulary — so neither is overridden here. Switching those groups off
-- is a separate decision and a separate file.

BEGIN;

-- ── 1. სწავლება ──────────────────────────────────────────────────────────────
--
-- HIDDEN, not VISIBLE, and that is the established shape for „a real sphere
-- with nobody in it yet" (see 2026-08-11-open-new-spheres): out of the menu, the
-- home grid and the browse filter, but IN the /join picker and the profile
-- editor (lib/categoryTree → ASSIGNABLE_CATEGORY covers HIDDEN + parentId NULL),
-- and it publishes ITSELF the day its first teacher is approved
-- (lib/categoryReveal → revealCategoryIfHidden). So this changes nothing a
-- visitor can see today and everything an applicant can reach.
--
-- `order` 15 continues the original block (business 1 … crypto 14) rather than
-- reshuffling it. Display order is the admin's data and the rail sorts by count
-- anyway; renumbering fourteen live rows to put teaching first would be an
-- opinion this file has no business holding.
--
-- ⚠️ THIS REVERSES A DECISION, ON THE RECORD. 2026-08-11-open-new-spheres says:
-- „Tutoring / რეპეტიტორობა (owner, 2026-08-11): not yet, and it would also fight
-- the product's own vocabulary." The owner reopened it on 2026-08-20 and the
-- vocabulary objection is answered rather than ignored: the banned word is
-- „რეპეტიტორი", and none of the five professions below uses it. They are
-- „X-ის მასწავლებელი" — profession NAMES, which CLAUDE.md explicitly allows
-- („a profession NAME like „IT სპეციალისტი" is fine"); what is retired is
-- „მასწავლებელი" as the ROLE word, and the role word here is still „ექსპერტი".
INSERT INTO "Category" ("id", "slug", "name", "order", "status", "isLive", "defaultServiceType", "count")
VALUES (gen_random_uuid()::text, 'swavleba', 'სწავლება', 15, 'HIDDEN', false, 'CONSULTATION', 0)
ON CONFLICT ("slug") DO NOTHING;

-- ── 2. health goes back to HIDDEN ────────────────────────────────────────────
--
-- It was created HIDDEN on 2026-08-11 and turned VISIBLE by the auto-reveal —
-- correctly, by its own rule, because an expert was approved into it. That
-- expert is `mcodne.ge@gmail.com`, the site's OWN account, whose card sits in
-- the live catalogue with the registration form's hint text („2–3 წინადადება
-- საკმარისია — მინიმუმ 40 სიმბოლო…") pasted into its bio.
--
-- So the sphere has ZERO real experts and is advertising a room with one test
-- profile in it. HIDDEN is not deletion: the row, its URL and its assignability
-- survive, and the first genuine dietician re-publishes it automatically.
UPDATE "Category" SET "status" = 'HIDDEN', "isLive" = false
 WHERE "slug" = 'health';

-- ── 3. the test profile leaves the catalogue ────────────────────────────────
--
-- `available = false` is the SELF-PAUSE flag, not a suspension and not a delete:
-- the profile page still resolves so any existing link or booking keeps working
-- (lib/tutorsQuery → PUBLIC_TUTOR only reads it for the browse list), the
-- account keeps its role, and one UPDATE puts it back.
--
-- ⚠️ IT MUST HAPPEN IN THE SAME TRANSACTION AS STEP 2. Hiding the sphere while
-- leaving the profile listed would let the next approval — or an admin re-file
-- of this very row — reveal `health` again, and the two statements would
-- silently undo each other over a week.
UPDATE "TutorProfile" tp SET "available" = false
  FROM "User" u
 WHERE u."id" = tp."userId" AND lower(u."email") = 'mcodne.ge@gmail.com';

-- ── guards ──────────────────────────────────────────────────────────────────

-- The teaching sphere exists and is reachable by an applicant.
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM "Category"
   WHERE "slug" = 'swavleba' AND "parentId" IS NULL AND "status" IN ('VISIBLE','HIDDEN');
  IF n <> 1 THEN RAISE EXCEPTION 'swavleba is missing or not assignable (found %)', n; END IF;
END $$;

-- No VISIBLE sphere is left holding zero listed experts — the „empty room" this
-- migration exists to close. Checked against the real rows, not the sentences
-- above, so a second empty sphere would fail here rather than ship.
DO $$
DECLARE empties text;
BEGIN
  SELECT string_agg(c."slug", ', ') INTO empties
    FROM "Category" c
   WHERE c."status" = 'VISIBLE'
     AND c."parentId" IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM "TutorProfile" tp
         JOIN "User" u ON u."id" = tp."userId"
        WHERE tp."available" = true AND u."suspendedAt" IS NULL
          AND (tp."categoryId" = c."id"
               OR tp."categoryId" IN (SELECT ch."id" FROM "Category" ch WHERE ch."parentId" = c."id"))
     );
  IF empties IS NOT NULL THEN
    RAISE EXCEPTION 'VISIBLE spheres with no listed expert: %', empties;
  END IF;
END $$;

COMMIT;
