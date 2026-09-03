// The default avatar — what an account with no photo shows in every avatar slot,
// and the two drawn faces a person can pick instead.
//
// ⚠️ NOBODY IS GUESSED AT ANY MORE (2026-09-03, second pass). For half a day
// this file hashed the person's NAME to choose between a man's and a woman's
// portrait, because the owner had shipped two. Measured against the live
// database that morning: 56 accounts, 12 with no photo, and only ONE of them a
// provider — so the guess was mostly aimed at clients, and it was a coin flip.
// „ნინო" drawing a man's face is not a small blemish on a marketplace where the
// avatar beside a price is supposed to BE the person.
//
// So: the default is FACELESS — the same clay mark in the same ring, no gender
// to get wrong — and the two portraits became a CHOICE the person makes in
// /settings. A pick is stored in `User.avatarUrl` exactly like an uploaded
// photo, so nothing downstream needed a new field, a migration or a branch.
//
// ⚠️ THE PICK PATHS ARE AN ALLOWLIST, NOT A CONVENTION. `avatarUrl` is written
// by a PATCH the browser sends (app/api/me), and that endpoint refuses anything
// that is not an uploaded `data:image/…` or an https URL — a rule that exists
// so a `javascript:` or `data:text/html` string can never reach an `src`.
// `isAvatarPick` is the one narrow hole in it: an exact match against these two
// strings, which no user input can widen.

/** The faceless mark. Everybody starts here, and firms stay here. */
export const DEFAULT_AVATAR = '/avatars/default-neutral-384.png'

/** The two drawn faces, offered in /settings to somebody with no photo. */
export const AVATAR_PICKS = [
  '/avatars/default-a-384.png',
  '/avatars/default-b-384.png',
] as const

/** Exactly one of the two picks — the allowlist app/api/me checks. */
export function isAvatarPick(v: string): boolean {
  return (AVATAR_PICKS as readonly string[]).includes(v)
}
