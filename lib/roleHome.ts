// Single source of truth for the role → workspace-home mapping.
//
// Kept in its own dependency-free module (no next/headers, no prisma, no
// 'use server') so BOTH server code (lib/auth, auth API routes) and client
// components (signin auth-client, shells) can import the same map. Before
// this file existed the mapping was hand-copied in five places (lib/auth,
// the Google callback, the impersonate route, and twice inside
// auth-client.tsx) — adding a role or changing a home meant editing all of
// them, and they had already started to drift.
export function homeForRole(role: string | null | undefined): string {
  return role === 'ADMIN' ? '/admin' : role === 'TUTOR' ? '/tutor' : '/student'
}

// Single gate for every "become an expert" / apply CTA (nav, footer, marketing
// sections). Only anonymous visitors and STUDENTs should ever be invited to
// /apply — telling an existing TUTOR (or ADMIN) to "become an expert" is
// nonsensical. Use this everywhere instead of hand-rolling role checks so the
// whole surface gates uniformly and the bug can't reappear per-surface.
export function showApplyCta(role: string | null | undefined): boolean {
  return !role || role === 'STUDENT'
}

// Shared guard for client-supplied post-auth destinations: app-internal
// absolute paths only. Blocks external hosts (`https://…`), protocol-relative
// `//evil.com`, and backslash tricks — the open-redirect classics.
export function safeInternalPath(p: string | null | undefined): string | null {
  if (!p || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return null
  return p
}
