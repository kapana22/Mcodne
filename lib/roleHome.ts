// Single source of truth for the role → workspace-home mapping.
import { ROLE } from '@/lib/roles'
//
// Kept in its own dependency-free module (no next/headers, no prisma, no
// 'use server') so BOTH server code (lib/auth, auth API routes) and client
// components (signin auth-client, shells) can import the same map. Before
// this file existed the mapping was hand-copied in five places (lib/auth,
// the Google callback, the impersonate route, and twice inside
// auth-client.tsx) — adding a role or changing a home meant editing all of
// them, and they had already started to drift.
export function homeForRole(role: string | null | undefined): string {
  return role === 'ADMIN' ? '/admin' : role === ROLE.PROVIDER ? '/work' : '/me'
}

// Single gate for every "become an expert" / apply CTA (nav, footer, marketing
// sections). Only anonymous visitors and STUDENTs should ever be invited to
// /join — telling an existing TUTOR (or ADMIN) to "become an expert" is
// nonsensical. Use this everywhere instead of hand-rolling role checks so the
// whole surface gates uniformly and the bug can't reappear per-surface.
/**
 * WHERE „შემოგვიერთდი" GOES — one constant, both chromes.
 *
 * ⚠️ IT IS /signup AND NOT /apply (2026-08-18). /apply WAS the expert
 * application: it never mentioned the trades and never linked onward, while
 * /apply/master linked back to it. So the site's only nav-level join door
 * dropped every tradesperson into the wrong form, one-directionally — and on a
 * phone, where the drawer renders this same list, it was the only route in
 * apart from a footer link at the bottom of a 7,500px page.
 *
 * /signup is the door that actually asks who you are: three tiles — კლიენტი,
 * ექსპერტი, ხელოსანი — each carrying its own destination. (Since 2026-08-19
 * both provider tiles hand off to /join, which asks the same question of a
 * signed-in person; this constant stays /signup because a guest needs the
 * account first.)
 *
 * Stated once here because the public header and the student sidebar must not
 * diverge; that divergence is the exact bug tests/regression-invariants §K
 * exists to catch, and it caught this change.
 */
/**
 * ⚠️ NOTHING LINKS THIS FROM THE PUBLIC HEADER SINCE 2026-08-31, and the
 * constant stays because the ADDRESS is still real: /signup is the client's
 * registration route (CLAUDE.md), app/signup is a first-class page, and
 * regression-invariants K0 pins that the guest door has ONE destination rather
 * than two chromes inventing their own. What left is the bar's „დაწყება"
 * button — owner: „ერთი და იგივეს აკეთებს", and it did: /signup and /signin
 * render one component with a different `defaultView`.
 */
export const JOIN_HREF = '/signup'

/**
 * RETIRED 2026-08-19 — kept as a tombstone, called by nothing.
 *
 * It answered „no role, or a client", which was the wrong question the day the
 * trades vertical shipped: an approved MASTER keeps role CLIENT (lib/hats says
 * why), so every „გახდი ექსპერტი" surface invited a provider to become one.
 * The live gate is `lib/capabilities → showJoinInvite(role, capabilities)`; the
 * provider who holds one half gets `missingCapability` instead. Do not call
 * this, and do not resurrect the role as the question.
 */
export function showApplyCta(role: string | null | undefined): boolean {
  return !role || role === ROLE.USER
}

// Shared guard for client-supplied post-auth destinations: app-internal
// absolute paths only. Blocks external hosts (`https://…`), protocol-relative
// `//evil.com`, and backslash tricks — the open-redirect classics.
export function safeInternalPath(p: string | null | undefined): string | null {
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return null
  return p
}
