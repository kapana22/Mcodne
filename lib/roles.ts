// The words for who somebody is — ONE place, and a pure leaf.
//
// ⚠️ TWO ROLES, NOT THREE (2026-08-21). Owner: „კონსულტანტი საერთოდ უნდა
// ამოვიღოთ. ორი უნდა დავტოვოთ — ჩვეულებრივი მყიდველი და სერვისის გამყიდველი.
// და სტუდენტი არ უნდა იყოს მყიდველი, მომხმარებელია ეს."
//
//   USER      buys. Registered at /signup, sells nothing, /me is their room.
//   PROVIDER  sells. Registered at /join, /work is their room.
//   ADMIN     runs the place.
//
// A CONSULTATION IS A KIND OF SERVICE, so whoever sells one is a PROVIDER too —
// „consultant" was never a third identity, it was the first product wearing a
// role. That is why TUTOR is gone rather than renamed alongside a new value.
//
// WHAT WAS WRONG. `Role` was STUDENT / TUTOR / ADMIN and had no provider value,
// so somebody selling services had to be stored as STUDENT — the same word as
// somebody who has only ever bought. Measured that day: 26 sellers TUTOR, 2
// sellers STUDENT, 30 plain buyers STUDENT. A column that cannot tell a seller
// from a buyer is not answering the question a role exists to answer.
//
// ⚠️ THE LEGACY WORDS ARE STILL UNDERSTOOD, AND THAT IS LOAD-BEARING. The enum
// gained USER and PROVIDER additively (lib/dbBoot), so at the moment this code
// ships every row still says STUDENT or TUTOR. `asRole` maps them on READ, so
// the deploy and the data move are independent and nobody is locked out of
// their own account in between. The legacy branch can go once the backfill has
// run and `SELECT DISTINCT role FROM "User"` shows only the three words above.
//
// Pure on purpose: no prisma, no react, no environment. lib/hats (which needs
// prisma) re-exports the hat vocabulary from here so a client component can
// import the words without dragging the database into the bundle.

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
 * Whatever the database said → what the product means.
 *
 * EVERY read of `User.role` goes through this. An unknown value reads as USER,
 * which is the least privilege in the system: a word nobody recognises must
 * never open a workspace.
 */
export function asRole(role: string | null | undefined): RoleCode {
  if (role === ROLE.USER || role === ROLE.PROVIDER || role === ROLE.ADMIN) return role
  return LEGACY_ROLE[role ?? ''] ?? ROLE.USER
}

/** What a person can do here. Ordered by how much of the site each one owns —
 *  `homeForHats` (lib/hats) walks this order and the first match wins. */
export const HATS = ['ADMIN', 'EXPERT', 'MASTER', 'COMPANY', 'CLIENT'] as const
export type Hat = (typeof HATS)[number]

/** The word for each, for a switcher or a label. Never a raw code on a screen. */
export const HAT_LABEL: Record<Hat, string> = {
  ADMIN: 'ადმინი',
  EXPERT: 'ექსპერტი',
  MASTER: 'ექსპერტი',
  COMPANY: 'კომპანია',
  CLIENT: 'კლიენტი',
}

/** The screen word for a `Role` value. Unknown or missing → the client word,
 *  because that is what everybody without a special role is. */
export function roleLabel(role: string | null | undefined): string {
  if (role === ROLE.ADMIN) return HAT_LABEL.ADMIN
  if (role === ROLE.PROVIDER) return HAT_LABEL.EXPERT
  return HAT_LABEL.CLIENT
}

/** The one phrase for a workspace switcher: „<who>ის სივრცე", and the client's
 *  own space is „ჩემი სივრცე" (CLAUDE.md lexicon — never „პირადი კაბინეტი").
 *  Four different phrasings used to sit in the same menu slot. */
export const SPACE_LABEL = {
  CLIENT: 'ჩემი სივრცე',
  // ⚠️ ONE LABEL FOR THE SUPPLY SIDE SINCE 2026-08-20, and it names the ROOM
  // rather than a kind of person. There were two — „ექსპერტის სივრცე" and
  // „ხელოსნის სივრცე" — sitting in the same menu, pointing at two doors into
  // what is now ONE workspace (/work serves both capabilities). The second
  // also carried a retired word into the live menu for weeks; owner, on the
  // label itself: „ხელოსნის სივრცე ზედმეტია… ჩემი აზრით არასწორია", and on the
  // word: „ხელოსნები აღარ უნდა გამოგყევენებინა არსად".
  //
  // EXPERT and MASTER are kept as separate keys and given the SAME words: the
  // callers still ask a different question („do they consult" / „are they on
  // the allowlist"), and collapsing the keys would hide that they are two
  // checks. What is collapsed is the SENTENCE, which is all a person reads.
  EXPERT: 'სამუშაო სივრცე',
  MASTER: 'სამუშაო სივრცე',
  ADMIN: 'ადმინის სივრცე',
} as const
