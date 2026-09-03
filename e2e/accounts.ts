/**
 * THE TWO FIXTURE ADDRESSES, AND NOTHING ELSE.
 *
 * ⚠️ THEY LIVE IN THEIR OWN FILE BECAUSE A CONSTANT MUST NOT COST A SIDE
 * EFFECT. They started out in `prisma/seed-e2e.ts` beside the seeding code, and
 * `e2e/flow.spec.ts` imported them from there — so naming an email address ran
 * the seed's module body: first writing rows as a side effect of an import,
 * then, once that was guarded, killing the whole Playwright run with a refusal
 * message about a database URL the test had never asked to write to.
 *
 * This file has no imports, no I/O and no top-level statements. Both the seed
 * and the test read it, which is also what keeps them naming the same accounts.
 */
export const E2E = {
  provider: 'e2e-provider@mcodne.test',
  rival: 'e2e-rival@mcodne.test',
  /** A local fixture's password. `prisma/seed-e2e.ts` refuses to run against
   *  anything but localhost, so this never reaches a real account. */
  password: 'e2e-local-only',
  /** Both fixtures are seeded with this, in tetri — the test asserts against it
   *  when it checks that a refused purchase charged nobody. */
  balanceTetri: 10_000,
} as const
