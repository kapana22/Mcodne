'use client'
import { useMessagesUnread } from '@/lib/messagesUnread'

export type StudentBadges = {
  messages: number
}

/* Badge source for the student sidebar.
 *
 * The fetch + 90s interval that used to live here moved to lib/messagesUnread
 * (2026-08-17) when the public header grew the same badge: two components asking
 * the same endpoint the same question on the same screen is two requests and,
 * worse, two numbers that can disagree for a poll's length. The shared store is
 * refcounted and single-flight, so this hook now costs nothing on a screen that
 * already has another subscriber.
 *
 * Behaviour is unchanged: space=student → the count reflects ONLY client-side
 * threads, so a dual-role user's expert unread never shows on this pill; it
 * polls every 90s while visible and refreshes on `mcodne:threads-refresh`, the
 * event the chat pane fires after send/receive, so the pill clears the moment a
 * thread is opened. */
export function useStudentBadges(): StudentBadges {
  return { messages: useMessagesUnread('student') }
}
