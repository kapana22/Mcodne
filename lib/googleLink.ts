// What happens when Google sign-in lands on an email that ALREADY has an
// account here.
//
// ── THE ATTACK ────────────────────────────────────────────────────────────────
// Signing up with a password creates a usable account immediately — there is no
// verification wall (a deliberate product call, see app/api/auth/signup). So
// anyone can register `victim@gmail.com` with a password of their own choosing
// and own that row, having never proved they can read that mailbox.
//
// Google sign-in then found that row, set `emailVerified: true`, and signed the
// visitor in — leaving `passwordHash` untouched. The real mailbox owner ends up
// inside an account the attacker also holds the password to, and nothing about
// the flow looks wrong from either side. This is the documented
// „unverified account pre-hijacking" pattern, and it is silent by construction.
//
// ── THE FIX, AND WHY IT IS THE ONLY HONEST ONE ───────────────────────────────
// Two credentials claim one email and exactly one of them is proven: Google has
// just demonstrated that whoever is at the browser can read the mailbox. The
// password has demonstrated nothing. We cannot tell „I made this account myself
// last week" from „someone made it in my name", so we keep the proven credential
// and discard the unproven one — the password hash AND every session it may have
// opened. The mailbox owner keeps the account; nobody is locked out of anything
// they could prove was theirs.
//
// ── WHAT IT DELIBERATELY DOES NOT TOUCH ──────────────────────────────────────
// An account whose email is ALREADY verified. Verification (our OTP, or being
// created by Google in the first place) is exactly the proof that was missing,
// so its password is the mailbox owner's and must survive. Getting this wrong in
// the other direction would wipe the password of every returning user the first
// time they tried the Google button — which is why it is pinned by a test rather
// than left as a condition someone can „simplify" later.
//
// Pure: no prisma, no next/∗, no crypto. The callback route does the writing;
// this only decides, where tests/googleLink.test.ts can pin it.

type ExistingAccount = {
  /** `User.emailVerified` as stored — see the strictness note below. */
  emailVerified?: boolean | null
}

type GoogleLinkDecision = {
  /** Replace the stored password hash with an unusable random one. */
  revokePassword: boolean
  /** Delete every session on the account before minting the new one. */
  revokeSessions: boolean
  /** Email the owner that both of the above happened. Never silent: the user
   *  is losing a credential they may have been using, and if this WAS an
   *  attack, the mail is the only thing that tells them so. */
  notify: boolean
}

const NOTHING_TO_DO: GoogleLinkDecision = { revokePassword: false, revokeSessions: false, notify: false }

/**
 * Decide what to revoke when Google signs in as `existing`.
 *
 * Pass `null` for a brand-new account (nothing to revoke — the row is created
 * by this very request). Otherwise pass the row as read BEFORE the callback
 * patches `emailVerified` to true, or this always reads „verified" and the fix
 * quietly stops doing anything.
 *
 * STRICT on purpose, and in the direction that fails SAFE: only a literal
 * `true` counts as verified. `null`, `undefined`, or anything non-boolean
 * resolves to unverified and therefore to revoking. Retaining a password on a
 * value we could not interpret is the failure that has a victim.
 */
export function resolveGoogleLink(existing: ExistingAccount | null | undefined): GoogleLinkDecision {
  if (!existing) return NOTHING_TO_DO
  if (existing.emailVerified === true) return NOTHING_TO_DO
  return { revokePassword: true, revokeSessions: true, notify: true }
}
