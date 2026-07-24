'use client'
import { useEffect, useState } from 'react'

export type StudentBadges = {
  messages: number
}

const ZERO: StudentBadges = { messages: 0 }

/* Lightweight badge source for the student sidebar — just the unread-message
   count from the threads-mode messages API (the same number the NotifBell and
   ConversationList already surface). Polls every 60s while visible and on the
   `mcodne:threads-refresh` event the chat pane fires after send/receive, so the
   sidebar pill clears the moment a thread is opened. */
export function useStudentBadges(): StudentBadges {
  const [badges, setBadges] = useState<StudentBadges>(ZERO)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      // space=student → the unreadCount reflects ONLY client-side threads, so a
      // dual-role user's expert unread never shows on the student sidebar pill.
      fetch('/api/messages?space=student')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (cancelled || !d?.ok) return
          setBadges({ messages: typeof d.unreadCount === 'number' ? d.unreadCount : 0 })
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 90_000)
    const onRefresh = () => load()
    window.addEventListener('mcodne:threads-refresh', onRefresh)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener('mcodne:threads-refresh', onRefresh)
    }
  }, [])

  return badges
}
