import { prisma } from './prisma'

// Mark related in-app notifications as read for a user after they've acted on
// the underlying object (accepted a booking, replied to a chat, responded to a
// reschedule, etc.) — so the bell doesn't keep the notif "unread" once the
// action it referenced is already resolved.
//
// Failures are swallowed: notif cleanup is a UX polish, never a primary
// action. If the update errors out, the notif simply stays unread — the same
// state we had before this helper existed.

export async function markRelatedRead(
  userId: string,
  hrefContains: string,
  type?: string,
): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        href: { contains: hrefContains },
        ...(type ? { type } : {}),
      },
      data: { readAt: new Date() },
    })
  } catch {
    /* swallow — see comment above */
  }
}
