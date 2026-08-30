// The words for who somebody is — ONE place, and a pure leaf (no prisma, no
// react, no environment), so a client component can import them without
// dragging the database into the bundle.
//
//   USER      buys. Registered at /signup, sells nothing, /me is their room.
//   PROVIDER  sells. Registered at /join, /work is their room.
//   ADMIN     runs the place.
//
// A CONSULTATION IS A KIND OF SERVICE, so whoever sells one is a PROVIDER —
// „consultant" was never a third identity, it was the first product wearing a
// role.
//
// ⚠️ THE LEGACY WORDS ARE STILL UNDERSTOOD, AND THAT IS LOAD-BEARING. The enum
// gained USER and PROVIDER additively, so rows may still say STUDENT or TUTOR.
// `asRole` maps them on READ, which is what makes the deploy and the data move
// independent — nobody is locked out of their account in between. The legacy
// branch can go once `SELECT DISTINCT role FROM "User"` shows only the three
// words above.

/** The enum values as the product names them. Compare against these. */
export const ROLE = {
  USER: 'USER',
  PROVIDER: 'PROVIDER',
  ADMIN: 'ADMIN',
} as const
export type RoleCode = (typeof ROLE)[keyof typeof ROLE]

/** What the database may still be holding while the backfill catches up. */
const LEGACY_ROLE: Record<string, RoleCode> = {
  STUDENT: ROLE.USER,
  TUTOR: ROLE.PROVIDER,
}

/**
 * Whatever the database said → what the product means. EVERY read of
 * `User.role` goes through this. An unknown value reads as USER, the least
 * privilege: a word nobody recognises must never open a workspace.
 */
export function asRole(role: string | null | undefined): RoleCode {
  if (role === ROLE.USER || role === ROLE.PROVIDER || role === ROLE.ADMIN) return role
  return LEGACY_ROLE[role ?? ''] ?? ROLE.USER
}

/** What a person can do here. Ordered by how much of the site each one owns —
 *  `homeForHats` (lib/hats) walks this order and the first match wins. */
export const HATS = ['ADMIN', 'PROVIDER', 'COMPANY', 'CLIENT'] as const
export type Hat = (typeof HATS)[number]

/** The word for each, for a switcher or a label. Never a raw code on a screen. */
export const HAT_LABEL: Record<Hat, string> = {
  ADMIN: 'ადმინი',
  // ⚠️ ONE HAT ON THE SUPPLY SIDE SINCE 2026-08-24. `EXPERT` and `MASTER` were
  // two rows that had ALWAYS carried the same word on screen — the label below
  // was written twice, identically, which is the shape of a distinction the
  // product does not have. It existed because there were two profile tables;
  // there is one now, and one hat.
  PROVIDER: 'ექსპერტი',
  COMPANY: 'კომპანია',
  CLIENT: 'კლიენტი',
}

/**
 * The screen word for a `Role` value.
 *
 * ⚠️ IT NORMALISES FIRST. Comparing the raw string let a row still holding
 * legacy `TUTOR` fall past every branch and come out „კლიენტი" — a seller
 * labelled a buyer on their own screen. `asRole` is not optional anywhere a
 * database value is read.
 */
export function roleLabel(role: string | null | undefined): string {
  const r = asRole(role)
  if (r === ROLE.ADMIN) return HAT_LABEL.ADMIN
  if (r === ROLE.PROVIDER) return HAT_LABEL.PROVIDER
  return HAT_LABEL.CLIENT
}

/** The one phrase for a workspace switcher: „<who>ის სივრცე", and the client's
 *  own space is „ჩემი სივრცე" (CLAUDE.md lexicon — never „პირადი კაბინეტი").
 *  Four different phrasings used to sit in the same menu slot. */
export const SPACE_LABEL = {
  CLIENT: 'ჩემი სივრცე',
  // ⚠️ ONE LABEL FOR THE SUPPLY SIDE, and it names the ROOM rather than a kind
  // of person. There were two („ექსპერტის სივრცე" / „ხელოსნის სივრცე") in one
  // menu pointing at two doors into one workspace, and the second carried a
  // retired word into the live menu.
  PROVIDER: 'სამუშაო სივრცე',
  ADMIN: 'ადმინის სივრცე',
} as const
