// The ONE place a hidden sphere comes back into view when an expert is filed
// into it. Stage 11 (2026-08-19).
//
// A sphere is HIDDEN because it has no expert yet — that is the whole reason.
// Filing one into it makes the reason false, so the sphere is revealed in the
// same request rather than waiting for somebody to notice; leaving it hidden
// would publish an expert nobody can find (the activation lapse that killed 46%
// of booking attempts on 2026-08-03, arriving by a new door). For a sub-field
// the row to reveal is its SPHERE — that is what it is browsed through, so
// revealing the child alone leaves the expert reachable from nowhere.
//
// Which row (if any) is `lib/categoryTree → sphereToReveal` — pure, client-safe,
// pinned by tests/categoryTree.test.ts. THIS file is the server half: the
// write (`status: 'VISIBLE'` + `isLive: true`, always together) and the audit
// row. Approval (`app/api/applications/[id]`) and the admin re-file endpoint
// (`app/api/admin/experts/[id]/category`) used to inline the same two calls; a
// third caller would have made a third copy. Both call this now.
//
// `categoryTree` must stay free of prisma (client components import it), which
// is why this lives in its own file. The two writes are injectable so the test
// runs without a database — the defaults are the real prisma + audit.

import { prisma } from './prisma'
import { audit } from './audit'
import { sphereToReveal, type TreeNode } from './categoryTree'

export type RevealableCategory = TreeNode & { name: string }

export type RevealContext = {
  /** Who caused it — the admin approving / re-filing. */
  adminId: string
  /** Free text for the audit row: 'first approved expert' / 'expert re-filed here'. */
  reason: string
  /** What the expert was filed into (slug or name) — the audit's `via`. */
  via: string | null
}

export type RevealWrites = {
  reveal: (id: string) => Promise<unknown>
  audit: (actorId: string, action: string, opts: { targetType: string; targetId: string; meta: unknown }) => Promise<unknown>
}

const REAL: RevealWrites = {
  // `isLive` is written alongside `status`, as everywhere.
  reveal: id => prisma.category.update({ where: { id }, data: { status: 'VISIBLE', isLive: true } }),
  audit,
}

/**
 * Reveal the sphere that filing an expert into `cat` makes visible — or do
 * nothing. Returns the revealed row (so a caller can mention it) or undefined.
 */
export async function revealCategoryIfHidden<T extends RevealableCategory>(
  cat: T | undefined,
  all: readonly T[],
  ctx: RevealContext,
  writes: RevealWrites = REAL,
): Promise<T | undefined> {
  const reveal = sphereToReveal(cat, all)
  if (!reveal) return undefined
  await writes.reveal(reveal.id)
  await writes.audit(ctx.adminId, 'category.show', {
    targetType: 'Category',
    targetId: reveal.id,
    meta: { name: reveal.name, reason: ctx.reason, via: ctx.via },
  })
  return reveal
}
