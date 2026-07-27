'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sheet } from '@/components/Sheet'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'

/* „გახსენი შენი დრო" — the one nudge a freshly approved expert needs.
   Booking is slot-gated, so an expert with no published window is invisible to
   every booking CTA on their own profile; nothing else in the workspace says so
   outside /tutor/schedule and the dashboard alert row.

   Mounted once from WorkspaceShell so it can surface on ANY /tutor/* page.
   Anti-nag rules:
     • never while they're already on /tutor/schedule (the page carries its own
       banner, and a modal would cover the form we want them in) — and landing
       there at all counts as a dismiss, so following the CTA and then leaving
       without publishing can't bounce the modal straight back,
     • „მოგვიანებით" (or Escape/backdrop) snoozes it for 24h,
     • the moment we ever observe published time it is retired for good.
   Both flags live in localStorage — per browser, deliberately cheap: the cost
   of a missed nudge is far lower than the cost of nagging. */

const SNOOZE_KEY = 'mcodne:open-time-nudge-snoozed' // ms timestamp of last dismiss
const DONE_KEY = 'mcodne:open-time-nudge-done'      // '1' once any future window existed
const SNOOZE_MS = 24 * 60 * 60 * 1000

export function OpenTimeNudge({ noAvailability }: { noAvailability: boolean | null }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // null = the badge poll hasn't answered yet. Acting on it would either flash
    // the modal or (worse) mark the nudge done for someone who has no time.
    if (noAvailability === null) return
    if (!noAvailability) {
      // They have published time — retire the nudge permanently.
      try { localStorage.setItem(DONE_KEY, '1') } catch {}
      setOpen(false)
      return
    }
    if (path?.startsWith('/tutor/schedule')) {
      try { localStorage.setItem(SNOOZE_KEY, String(Date.now())) } catch {}
      setOpen(false)
      return
    }
    let done = false
    let snoozedAt = 0
    try {
      done = localStorage.getItem(DONE_KEY) === '1'
      snoozedAt = Number(localStorage.getItem(SNOOZE_KEY)) || 0
    } catch {}
    setOpen(!done && Date.now() - snoozedAt > SNOOZE_MS)
  }, [noAvailability, path])

  const snooze = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())) } catch {}
    setOpen(false)
  }

  return (
    <Sheet
      open={open}
      onClose={snooze}
      size="sm"
      eyebrow="შემდეგი ნაბიჯი"
      title="გახსენი შენი თავისუფალი დრო"
      footer={
        <>
          <Btn variant="ghost" onClick={snooze}>მოგვიანებით</Btn>
          {/* A link <Btn> takes no onClick — the route change itself closes the
              modal (and snoozes it) through the effect above.
              `?template=1` lands in the weekly form ALREADY filled with
              ორშ–პარ 10:00–18:00 (app/tutor/schedule/page.tsx), so this is one
              tap from nudge to a ready-to-publish schedule. Nothing is written
              until they press „შექმნა" there. */}
          <Btn href="/tutor/schedule?template=1">ორშ–პარ 10:00–18:00 გახსნა</Btn>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-btn bg-ink-100 text-ink-700 inline-flex items-center justify-center shrink-0">
          <Icon.calendar className="w-5 h-5" />
        </span>
        <div className="min-w-0 text-[13.5px] text-ink-700 leading-relaxed">
          <p>პროფილი დამტკიცებულია და ძებნაში ჩანს — მაგრამ სანამ განრიგში დროს არ გამოაქვეყნებ, დაჯავშნა არავის შეუძლია.</p>
          <p className="mt-2">განრიგი უკვე შევსებულია: ორშაბათიდან პარასკევამდე, 10:00–18:00. გახსენი, გამორთე დღეები ან შეცვალე საათები და გამოაქვეყნე — ნებისმიერ დროს შეცვლი.</p>
        </div>
      </div>
    </Sheet>
  )
}
