// Georgian copy for every failure the Google sign-in round-trip can end on.
//
// WHY THIS EXISTS. /api/auth/google/callback has always redirected to
// `/signin?error=<code>` when something went wrong — and NOTHING on the signin
// page ever read that param, so all seven distinct failures rendered as an
// ordinary, empty signin form. The commonest one is also the most confusing:
// the `g_oauth_state` cookie lives 10 minutes, so a visitor who lingers on
// Google's account chooser comes back to a page that simply looks like the
// button did nothing. There was no way to tell that from „try again".
//
// The callback used a SECOND param for one case (`?e=suspended`) — also unread.
// It now emits `?error=suspended` like everything else, so the page has one
// param to read and this file has one map to answer from.
//
// Pure data (no React, no next/∗, no prisma) so it can be imported by both the
// client page and tests/authErrors.test.ts. That test greps the callback route
// for the codes it can actually emit and asserts each one has copy here —
// a MISSING entry is the exact bug this file fixes, so a missing entry is
// exactly what has to fail the gate.

import { SUPPORT_EMAIL } from './supportEmails'

/** code (from `?error=`) → what the visitor is told, and what to do next. */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // The visitor pressed „Cancel" on Google's consent screen. Not an error on
  // our side, so the copy stays neutral and offers the other door.
  google_denied: 'Google-ით შესვლა შეწყდა. სცადე თავიდან ან შედი ელფოსტით.',
  // The 10-minute state cookie expired (or the tab was reopened / cookies were
  // cleared mid-flow). This is the one that reads as „the button is broken",
  // so it names the fix rather than the cause.
  google_state: 'შესვლის მცდელობას ვადა გაუვიდა. დააჭირე „Google-ით გაგრძელება“ ხელახლა.',
  google_token: 'Google-თან კავშირი ვერ დამყარდა. სცადე თავიდან.',
  google_userinfo: 'Google-იდან მონაცემები ვერ მივიღეთ. სცადე თავიდან.',
  google_noemail: 'Google-მა ელფოსტა არ დააბრუნა. შედი ელფოსტითა და პაროლით.',
  // We require Google to have VERIFIED the address — see the callback route.
  google_unverified: 'ამ Google-ანგარიშის ელფოსტა დადასტურებული არ არის. დაადასტურე Google-ში ან შედი ელფოსტითა და პაროლით.',
  google_not_configured: 'Google-ით შესვლა დროებით მიუწვდომელია. შედი ელფოსტითა და პაროლით.',
  // Word-for-word the message POST /api/auth/signin returns for the same
  // account state — one condition must not read two different ways.
  suspended: `ანგარიში შეჩერებულია. დაგვიკავშირდი: ${SUPPORT_EMAIL}`,
}

/**
 * Copy for a `?error=` value, or null when there is nothing to show.
 *
 * An UNKNOWN code still returns something: the whole failure mode here was
 * silence, and a stale link or a future code must degrade to a generic line
 * rather than back to a blank form. It stays vague on purpose — we don't know
 * what happened — and never echoes the code itself.
 */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null
  return AUTH_ERROR_MESSAGES[code] ?? 'შესვლა ვერ დასრულდა. სცადე თავიდან ან შედი ელფოსტითა და პაროლით.'
}
