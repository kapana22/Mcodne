// The words for who somebody is — ONE place, and a pure leaf.
//
// ⚠️ THE DATABASE STILL SAYS STUDENT / TUTOR / ADMIN, AND IT WILL KEEP SAYING
// SO. `Role` is a Postgres enum managed by lib/dbBoot's boot-time DDL — there
// are no migrations — and every enum change there is additive. Renaming a value
// is a hard cut-over: during a rolling deploy the new instance would rename
// while the old one keeps writing `role: 'STUDENT'`, and every one of those
// writes fails. `prisma db push` is worse: Prisma cannot express a rename, so
// it drops and recreates the enum and the column data with it.
//
// So the rename happens HERE and on the screen, nowhere else. Code compares
// against `ROLE.CLIENT`, never against the string; screens read `roleLabel()`
// or `HAT_LABEL`, never a hand-typed „სტუდენტი" — that word was written by
// hand in 39 files, and one person was three different nouns on three screens.
//
// Pure on purpose: no prisma, no react, no environment. lib/hats (which needs
// prisma) re-exports the hat vocabulary from here so a client component can
// import the words without dragging the database into the bundle.

/** The enum values as the product names them. Compare against these. */
export const ROLE = {
  CLIENT: 'STUDENT',
  EXPERT: 'TUTOR',
  ADMIN: 'ADMIN',
} as const
export type RoleCode = (typeof ROLE)[keyof typeof ROLE]

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
  if (role === ROLE.EXPERT) return HAT_LABEL.EXPERT
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
