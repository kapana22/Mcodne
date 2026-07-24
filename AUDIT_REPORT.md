# Launch-Readiness Audit — mcodne

Method: 8 parallel track auditors (security, functionality, backend, performance, UI, a11y, SEO, code-health) → adversarial verification of every P0/P1 → fix loop. **47 raw findings; 0 P0; 2 P1 (both confirmed & FIXED); 1 P1 rejected as a false positive; 44 P2/P3.**

Legend: **FIXED ✅** · **NEEDS YOUR ACTION ⚠️** (infra/secrets/assets only you can do) · **DEFERRED ▷** (documented, low-risk, not blocking).

---

## P0 — launch blockers
None.

## P1 — must-fix before launch

### [P1] Reschedule/accept state desync auto-cancels confirmed sessions — FIXED ✅
File: app/api/bookings/[id]/route.ts, reschedule/route.ts, reschedule/respond/route.ts
Tutor `accept` set CONFIRMED but never updated the pending reschedule blob's frozen `prevStatus` (PREPARING). A later reject restored PREPARING → the */15 cleanup cron auto-cancels a confirmed, student-notified session. Also complete/no_show left the blob → permanent stuck reschedule banner with dead buttons on terminal bookings.
Fix: accept bumps the blob `prevStatus`→CONFIRMED; complete/no_show/decline/cancel null the blob; propose/reject raw UPDATEs status-guarded.
Verified by: `npx tsc --noEmit` clean; logic traced against the verifier's proof chain.

### [P1] Unguarded destructive seed scripts against the prod DB — FIXED ✅
File: prisma/seed.ts, app/api/dev/seed/route.ts
`npm run db:seed` had no env guard and hard-deletes users by broad email patterns (test*, qa*, @x.com) → on the shared prod DB it could delete real customers. `/api/dev/seed` gated only on NODE_ENV (bypassed in dev-against-prod) and reset the admin password on every call.
Fix: seed refuses without `SEED_ENABLED=1`; destructive delete further gated behind `CLEAN_TEST_USERS=1` (skipped by default); `/api/dev/seed` requires `SEED_ENABLED=1` unconditionally and no longer resets the admin password.

### [P1-rejected] "Demo admin admin1234 in prod" — CODE FALSE POSITIVE, but ⚠️ see checklist
The route gate is correct; the residual risk is a live weak-password admin account (admin@/student@/tutor@mcodne.ge) — a DB-state issue only you can close. See LAUNCH_CHECKLIST.

## P2 — fixed this pass
- **Booking lifecycle races** (accept/decline/no_show/complete/cancel racing cleanup-cron/each-other resurrecting canceled bookings, orphaning slots) — status-guarded conditional updates + in-tx slot re-read. FIXED ✅ (app/api/bookings/[id]/route.ts, cancel/route.ts)
- **Google OAuth ignored `verified_email`** (unverified Google email could log into an existing account by address) — now required. FIXED ✅ (auth/google/callback)
- **SSR /tutors/[id] skipped blob guards** (legacy base64 could inline into profile HTML) — now stripAvatar + data:-video guard. FIXED ✅
- **`(user as any).suspendedAt`** on 3 suspension gates — casts removed (a typo could silently disable the gate). FIXED ✅ (lib/auth.ts, otp/verify, google/callback)
- **SEO signal mismatches** — /signin removed from sitemap, /ask added; /discover noindex; manifest brand color/desc/icons. FIXED ✅
- **blog/category hard-404 on transient DB error** (deindex risk) — now 5xx sentinel. FIXED ✅

## P2 — DEFERRED ▷ (documented, follow-up)
- Price-range slider 18px touch target (globals.css:618) — mobile hit area < 44px.
- Auth/profile/payment forms use sibling `<label>` without htmlFor (a11y 1.3.1) — signin/profile/PaymentStep/schedule.
- `text-ink-400` (#9C9488 ≈ 3.0:1) on small text fails AA contrast — step true-text usages to ink-500.
- Message-thread fetch unbounded + ships every base64 attachment per open (api/messages) — add `take`/cursor.
- ESLint never configured (`next lint` interactive) — NOT auto-fixed: enabling it can fail `next build`; add `eslint.config.mjs` + `eslint:{ignoreDuringBuilds:true}` deliberately.
- Category lists hardcoded twice matched by display-name (tutors/client.tsx) — drive from /api/categories by slug.
- Global `[class*="uppercase"]` letter-spacing overrides all `tracking-*` utilities (Eyebrow 0.18em never renders) — move rules into `@layer base`.

## P3 — fixed this pass
signup/Google P2002→409; review submit wrapped in a transaction; nodemailer + Resend + Daily fetch timeouts; message-reminder scan bounded to 30 days (anti-starvation); dead DateTimePicker.tsx + blue `.glow-info` deleted; stale contact TODO fixed.

## P3 — DEFERRED ▷ (see FIXES_APPLIED for the full list)
XFF-first rate-limit key (verify Railway proxy first); CLEANUP_SECRET accepted as query param (switch cron to header); Notification table never pruned + missing (type,href) index; several unbounded server queries (student bookings page, admin applications, queryTutors slot fetch — use distinct/take); reminder cron stamp-after-send ordering; 10px icons + admin status dots (canon); off-token colors in .prose-post/MiniChart; /tutors filter-bar off-canon heights; NotifBell no Escape + unread not announced; no OG image / favicon.ico; 156 `any` casts; tests/ cruft (.bak + one-off probes); duplicated micro-helpers.
