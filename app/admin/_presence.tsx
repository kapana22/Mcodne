'use client'
// „I am at the desk" — the only thing behind the ონლაინ badge a waiting client
// sees on their thread (lib/requestThread).
//
// Mounted once by the admin page, not per tab: an operator reading the finance
// tab is still an operator, and a heartbeat that only beats on one screen would
// make the badge mean „is looking at requests" instead of „is here".
//
// ⚠️ VISIBILITY-AWARE, and that is the whole honesty of it. A backgrounded tab
// left open overnight would otherwise report somebody at the desk until the
// laptop died. `document.visibilityState` is what separates „the panel is open"
// from „the panel is being looked at", and only the second is a promise we can
// keep. Same contract as AutoRefresh and the chat poll.

import { useEffect } from 'react'

/** Comfortably under the 2-minute staleness window in lib/requestThread, so one
 *  missed beat (a sleeping laptop, a slow network) does not blink the badge. */
const BEAT_MS = 40_000

export function PresenceBeat() {
  useEffect(() => {
    let alive = true
    const beat = () => {
      if (!alive || document.visibilityState !== 'visible') return
      // Fire and forget: a failed beat is a beat that happens again in 40s, and
      // there is nothing to tell the operator about it.
      fetch('/api/admin/presence', { method: 'POST', cache: 'no-store' }).catch(() => {})
    }
    beat()
    const id = window.setInterval(beat, BEAT_MS)
    // Coming back to the tab should light the badge immediately rather than up
    // to 40s later — the operator sat down, and the client refreshing right
    // then should see it.
    document.addEventListener('visibilitychange', beat)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [])
  return null
}
