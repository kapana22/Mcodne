'use client'

export type StudentBadges = {
  messages: number
}

/* Badge source for the client sidebar.
 *
 * ⚠️ IT IS ALWAYS ZERO SINCE 2026-08-24, AND THAT IS THE TRUTH RATHER THAN A
 * STUB. It polled `/api/messages?space=client` every 90s for a CLIENT inbox —
 * threads a signed-in client had started on somebody's profile. There is no such
 * inbox any more: a client describes a job at /request, and the conversation
 * that follows is addressed by its public reference (/request/<ref>), which
 * needs no account and therefore no badge. `app/me` has no messages route at
 * all, so the pill this feeds has nothing to open.
 *
 * The hook is KEPT rather than deleted, and the shape with it, because the
 * client sidebar reads `badges.messages` in three places; returning a real zero
 * removes a 404 poll from every /me page load without touching the nav. When a
 * client-side inbox exists again, this is the one line to change. */
export function useStudentBadges(): StudentBadges {
  return { messages: 0 }
}
