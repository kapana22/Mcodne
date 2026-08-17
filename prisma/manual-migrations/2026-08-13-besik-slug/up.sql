-- The slug follows the name (owner, 2026-08-13).
--
-- The old one was generated from „Lawyer Besik guliashvili (ადვოკატი ბესიკ
-- გულიაშვილი)" — a marketing line typed into the name field — and described
-- nobody once the name was corrected.
--
-- ⚠️ RUN THE DEPLOY FIRST, or at least alongside: next.config.js carries a 308
-- from the old path to the new one, and until that is live an old link 404s
-- instead of redirecting (app/tutors/[id] resolves by id OR slug, with no slug
-- history table).
UPDATE "TutorProfile" SET "slug" = 'besik-guliashvili'
 WHERE "slug" = 'lawyer-besik-guliashvili-advokati-besik-guliashv';

SELECT tp."slug", u."fullName" FROM "TutorProfile" tp JOIN "User" u ON u.id = tp."userId" WHERE tp."slug" = 'besik-guliashvili';
