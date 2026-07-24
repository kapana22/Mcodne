# Launch Checklist — mcodne

## Verdict: **~97% code-side — GO. Remaining items are operator-side or deliberate design skips.**

Round 2 (the "100% push") additionally fixed: message-thread/student-bookings/admin-applications query caps, queryTutors `distinct`, Notification pruning + 2 indexes, reminder-cron stamp-before-send, NotifBell Escape/aria, price-slider touch target, 12px icon-floor sweep, filter-bar heights, signin label association, sort-select aria, build-safe ESLint config, dead-model comment, tests `.bak` removal. Deployed 3d9c7907, cron + pages verified green.

**Deliberately NOT changed (documented, low-value or design/operator-owned — your call):** ink-400 contrast token & the uppercase letter-spacing `@layer` fix (site-wide visual changes — designer's call); remaining 156 `any` casts (mechanical, tsc already clean); off-token color micro-nits; XFF-first rate-limit key (needs Railway proxy behavior confirmed first — changing it blind can rate-limit real users); CLEANUP_SECRET query-param (fix is the cron command — operator); OG image + favicon.ico (need real image assets); form-label association on profile/payment/schedule (signin — the front door — done).

---

## Verdict (original): **~90% — GO (soft-launch), with 3 must-do operator items first**

The two P1 code defects (reschedule auto-cancel desync, unguarded prod-DB seed) are **fixed**. Core flows (booking/reschedule are now real-availability-only and race-safe; auth hardened) are in good shape. Build/typecheck are clean. Payments aren't live yet (intentional), so the remaining opens are correctness/perf/a11y polish, not revenue-blocking.

The branch `audit/launch-hardening` holds every fix in small commits with a baseline rollback snapshot; deployed to prod via `railway up` after tsc-clean.

---

## ⚠️ ONLY YOU CAN DO THESE (do before public launch)

1. **Rotate/remove the demo accounts.** `admin@mcodne.ge / admin1234` (+ student@/tutor@ /tutor1234) are live with weak, now-publicly-known passwords on real roles — a full admin takeover if left. Action: log into admin → change the admin password to a strong secret (or delete the demo student/tutor rows). The seed no longer resets it, so a new strong password will stick.
2. **Confirm cron env on Railway.** `CLEANUP_SECRET` set (it is), and the `*/15` cleanup cron running. Also `GMAIL_USER`/`GMAIL_APP_PASSWORD` (email is live) and `NEXT_PUBLIC_GA_ID` (GA live) — all confirmed set this session.
3. **(Recommended) Switch the cron to send the secret as a header**, not `?secret=` (it currently leaks into access logs): `curl -fsS -X POST -H "Authorization: Bearer $CLEANUP_SECRET" https://mcodne.ge/api/internal/cleanup`. Then the query-param acceptance can be removed (deferred code change).

## ✅ Done in code this session (deployed)
- P1 reschedule-desync + P1 seed-guard fixes.
- Booking lifecycle race hardening (status-guarded transitions).
- Google `verified_email` gate; suspension-gate cast removal; signup/Google P2002→409.
- SSR profile blob-strip; review-submit transaction; mailer/Daily/Resend timeouts.
- SEO: sitemap/noindex consistency, /discover noindex, manifest brand fixes, blog/category 5xx-on-DB-blip.
- Dead code removed (DateTimePicker, .glow-info); stale comments fixed.

## ▷ Recommended follow-ups (not blocking launch)
- **Performance:** cap message-thread + student-bookings + admin-applications queries (`take`/cursor); `distinct` for queryTutors slot fetch; prune the Notification table + add its (type,href) index. Move base64 avatars/attachments to object storage (known, larger project).
- **A11y (WCAG AA):** associate form labels (htmlFor) on signin/profile/payment; step small `text-ink-400` copy to ink-500 for contrast; enlarge sub-44px touch targets (price slider, compare/favorite icons); NotifBell Escape + aria unread count.
- **Tooling:** add `eslint.config.mjs` (+ `eslint:{ignoreDuringBuilds:true}` so it can't break `railway up`), then triage; add a `test` script running only the maintained `*.test.ts` suites; delete tests/ one-off probes + the `.bak`.
- **SEO polish:** a real 1200×630 OG image + `app/favicon.ico`; drive the /tutors category filter from the DB (slug) instead of two hardcoded lists.
- **Security P3:** take the LAST X-Forwarded-For hop for IP rate-limit keys (verify Railway's proxy appends first).

## Verified green
- `npx tsc --noEmit` — clean across all batches.
- Live smoke after deploy: home/tutors/blog/category pages 200; admin loads; booking + reschedule pickers show real availability only.
