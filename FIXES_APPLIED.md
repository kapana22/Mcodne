# Fixes Applied — audit/launch-hardening

Every change is a small, scoped commit on `audit/launch-hardening` (baseline snapshot first for rollback). `npx tsc --noEmit` verified clean after each batch.

### Commit 1 — booking lifecycle (P1 + P2)
`app/api/bookings/[id]/route.ts`, `.../cancel/route.ts`, `.../reschedule/route.ts`, `.../reschedule/respond/route.ts`
- accept bumps a pending reschedule blob's `prevStatus`→CONFIRMED (was frozen at PREPARING) so a later reject can't demote+auto-cancel a confirmed session.
- complete/no_show/decline/cancel now NULL the reschedule blob (no stuck banner on terminal bookings).
- accept/decline/no_show/complete/cancel + reschedule propose/reject use **status-guarded conditional updates** (`updateMany count===1` / `WHERE status IN (...)`) instead of blind updates — closes cancel-vs-accept / cron-vs-accept races. cancel re-reads `heldSlotId` inside the tx so it frees the current slot, not a stale one.

### Commit 2 — seed guards (P1)
`prisma/seed.ts`, `app/api/dev/seed/route.ts`
- seed refuses without `SEED_ENABLED=1`; junk-user delete gated behind `CLEAN_TEST_USERS=1` (off by default).
- `/api/dev/seed` requires `SEED_ENABLED=1` unconditionally; no longer resets the admin password on re-seed.

### Commit 3 — security (P2/P3)
`auth/google/callback`, `lib/auth.ts`, `auth/otp/verify`, `tutors/[id]/page.tsx`, `auth/signup`
- Google OAuth requires `verified_email===true`; +timeout; concurrent-create P2002 → re-lookup.
- Removed `(user as any).suspendedAt` casts on the suspension gate (3 sites).
- SSR profile seed applies `stripAvatar` + `data:`-video guard.
- signup P2002 → `EMAIL_TAKEN` 409 (was 500).

### Commit 4 — SEO/meta (P2/P3)
`sitemap.ts`, `app/discover/layout.tsx` (new), `public/manifest.webmanifest`, `blog/[slug]/page.tsx`, `categories/[slug]/page.tsx`
- sitemap +/ask −/signin; /discover noindex; manifest theme_color/desc/icons; blog+category return 5xx (not 404) on DB blip.

### Commit 5 — resilience (P3)
`api/reviews/route.ts`, `lib/mailer.ts`, `lib/meeting.ts`, `lib/messageReminders.ts`
- review upsert+aggregate+profile-update in one tx; nodemailer/Resend/Daily timeouts; message-reminder scan bounded to 30 days (dedup-safe).

### Commit 6 — dead code / comments
Deleted `components/booking/DateTimePicker.tsx` (unused) + `.glow-info` (dead blue util); fixed stale `CLAUDE.md` picker line and the contact-form mailer TODO.

See AUDIT_REPORT.md for the full finding list (fixed + deferred) and LAUNCH_CHECKLIST.md for the operator actions.
