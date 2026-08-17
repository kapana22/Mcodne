-- Every user's name in Georgian (owner, 2026-08-13).
--
-- WHY BY HAND AND NOT BY CODE. Transliteration is deterministic enough to write
-- a function for, but a person's name is not a string to be guessed at: getting
-- it wrong misspells a real human being on their own account, and on a review
-- that is public. So every row below is written out and readable, and down.sql
-- restores the exact previous value.
--
-- Matched on EMAIL, not on the old name: two people here share „giorgi" and two
-- share a surname, and a name-matched UPDATE would hit both.
--
-- NOT TOUCHED, and each for a stated reason:
--   info@infinity.ge, webinfinity11@, webinfinity12@ — COMPANY accounts, not
--       people. „Infinity Solutions" is a brand, and the site's own rule keeps
--       brands in Latin (lib/georgianText: „Google Ads", „SEO" stay as they are).
--   mcodne.ge@gmail.com — the platform's own account, named after the platform.

-- ── the two PUBLIC experts ────────────────────────────────────────────────
-- The Georgian was already there, inside the parentheses of a marketing line
-- typed into the name field.
UPDATE "User" SET "fullName" = 'ბესიკ გულიაშვილი'   WHERE email = 'besikiguliashvili@gmail.com';
UPDATE "User" SET "fullName" = 'ნონა კვიციანი'      WHERE email = 'nonakvitsiani4@gmail.com';

-- ── admins ────────────────────────────────────────────────────────────────
UPDATE "User" SET "fullName" = 'ლუკა კაპანაძე'      WHERE email = 'lukakapanadze313@gmail.com';
UPDATE "User" SET "fullName" = 'გიორგი'             WHERE email = 'giorgi.dzvelaia.3@gmail.com';

-- ── clients ───────────────────────────────────────────────────────────────
UPDATE "User" SET "fullName" = 'ედგარ'              WHERE email = 'akopov43@gmail.com';
UPDATE "User" SET "fullName" = 'გიორგი'             WHERE email = 'giorgi1999.dzvelaia@gmail.com';
UPDATE "User" SET "fullName" = 'გიორგი ძველაია'     WHERE email = 'giorgi.dzvelaia.2@gmail.com';
UPDATE "User" SET "fullName" = 'ბექა ჩხიროძე'       WHERE email = 'bekachkhirodze1@gmail.com';
UPDATE "User" SET "fullName" = 'დეა მელქაძე'        WHERE email = 'melkadzedea7@gmail.com';
UPDATE "User" SET "fullName" = 'ბექა ჩხიროძე'       WHERE email = 'beqachxirodze@gmail.com';
UPDATE "User" SET "fullName" = 'ქასიმ გულიევი'      WHERE email = 'gulievkasim@gmail.com';
UPDATE "User" SET "fullName" = 'დათა'               WHERE email = 'datiobashvili1@gmail.com';
UPDATE "User" SET "fullName" = 'ნინი'               WHERE email = 'ninibenashvili9@gmail.com';
UPDATE "User" SET "fullName" = 'ნანაკო უსტარაშვილი' WHERE email = 'ustarashvili.nanako@gmail.com';
UPDATE "User" SET "fullName" = 'ლუკა ვაშაკიძე'      WHERE email = 'lukavashakidze0@gmail.com';
UPDATE "User" SET "fullName" = 'გიორგი ხარატიშვილი' WHERE email = 'hr@gkharatishvili.com';
UPDATE "User" SET "fullName" = 'სევილია ისაევა'     WHERE email = 'seviliaisaeva1@gmail.com';
UPDATE "User" SET "fullName" = 'ნათია ადამოვა'      WHERE email = 'natiaadamova@gmail.com';
UPDATE "User" SET "fullName" = 'დავით ცქაბელია'     WHERE email = 'datotsk12@gmail.com';
UPDATE "User" SET "fullName" = 'ნინი ბენაშვილი'     WHERE email = 'beberoo85@gmail.com';
UPDATE "User" SET "fullName" = 'ლუკა კაპანაძე'      WHERE email = 'grubela22@gmail.com';
