'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/Card'
import { Eyebrow } from '@/components/Eyebrow'
import { Skeleton } from '@/components/Skeleton'

/* „პროფილის სიგნალი" — the one thing an approved expert has no other way to
   know: is my profile working?
   ────────────────────────────────────────────────────────────────────────────
   An expert publishes availability and then sits in silence. „Nobody has seen
   me" and „people see me and don't book" produce the identical experience — no
   bookings — but have OPPOSITE fixes (visibility vs. persuasion). With no
   signal at all, giving up is the rational move. This card exists to make that
   one distinction, and its value is the SENTENCE, not the digits: the numbers
   without a reading are just a second kind of silence.

   Honesty rules this card is built around:
   • Zeros are shown as zeros. At today's traffic most experts will see „0
     ნახვა"; that plus a real next step is the truth. Manufactured
     encouragement („ბევრი ადამიანი ეძებს შენნაირ ექსპერტს!") would imply demand
     we cannot see and would cost the expert their trust the first time they
     checked.
   • Below MIN_SIGNAL views we say the sample is too small instead of
     diagnosing. Calling a persuasion problem off three views is noise wearing a
     verdict's clothes.
   • Nothing here is a projection or a comparison to other experts. */

export const MIN_SIGNAL_VIEWS = 5
/** Below this share of views converting, the profile/price is worth a look. */
export const LOW_CONVERSION = 0.05
/** …but only once enough views exist for a rate to mean anything. */
export const RATE_MIN_VIEWS = 20

export type InsightsData = {
  days: number
  views: number
  bookings: number
  conversion: number | null
}

export type Verdict = {
  /** Stable id — the unit test asserts on this, never on the Georgian copy. */
  key:
    | 'no-time-no-views'
    | 'no-time'
    | 'no-views'
    | 'too-few'
    | 'no-bookings'
    | 'low-rate'
    | 'repeat'
    | 'working'
  text: string
  cta: { label: string; href: string } | null
}

const pct = (views: number, bookings: number) => Math.round((bookings / views) * 100)

/**
 * The diagnosis. Pure, ordered, exhaustive — every (views, bookings, free-time)
 * shape maps to exactly one sentence, and the order matters: a blocker the
 * expert can actually clear (no bookable time) outranks any reading of the
 * numbers, because with no free time even a perfect profile converts nobody.
 *
 * `freeMinutes` is the dashboard's already-computed free-time figure (windows
 * minus active bookings); `null` means „not loaded", never „zero".
 */
export function diagnose(o: {
  days: number
  views: number
  bookings: number
  freeMinutes: number | null
}): Verdict {
  const { days, views, bookings, freeMinutes } = o

  if (freeMinutes === 0) {
    return views === 0
      ? {
          key: 'no-time-no-views',
          text: `ბოლო ${days} დღეში პროფილი არავის უნახავს — და თავისუფალი დროც არ გაქვს. სანამ დროს არ გამოაქვეყნებ, ვერავინ დაგიჯავშნის.`,
          cta: { label: 'დროის გამოქვეყნება', href: '/work/schedule' },
        }
      : {
          key: 'no-time',
          text: `${views} ნახვა, მაგრამ თავისუფალი დრო არ გაქვს — ვერავინ დაგიჯავშნის, რაც არ უნდა კარგი იყოს პროფილი.`,
          cta: { label: 'დროის გამოქვეყნება', href: '/work/schedule' },
        }
  }

  if (views === 0) {
    return {
      key: 'no-views',
      text: `ბოლო ${days} დღეში პროფილი არავის უნახავს. ეს ხილვადობის და არა დარწმუნების საკითხია — შეამოწმე, კატეგორია და სათაური ზუსტად აღწერს თუ არა შენს საქმეს.`,
      cta: { label: 'პროფილის შემოწმება', href: '/work/profile' },
    }
  }

  if (views < MIN_SIGNAL_VIEWS && bookings === 0) {
    return {
      key: 'too-few',
      text: `${views} ნახვა — დასკვნისთვის ჯერ ცოტაა. ერთი კი უკვე ჩანს: პროფილი ძებნაში გამოდის.`,
      cta: { label: 'პროფილის შემოწმება', href: '/work/profile' },
    }
  }

  if (bookings === 0) {
    return {
      key: 'no-bookings',
      text: `${views} ნახვას ჯავშანი არ მოჰყოლია. ე.ი. გხედავენ, მაგრამ არ ირჩევენ — სათაური, ბიო და ფასი ის სამია, რაც ამას ცვლის.`,
      cta: { label: 'პროფილის რედაქტირება', href: '/work/profile' },
    }
  }

  // Repeat clients book straight from „ჩემი სივრცე" without reopening the
  // profile, so bookings can legitimately exceed views. Printing „150%" would
  // just look broken — say what actually happened instead.
  if (bookings >= views) {
    return {
      key: 'repeat',
      text: `${views} ნახვა და ${bookings} ჯავშანი — ჯავშნების ნაწილი პირდაპირ მოდის, პროფილის ხელახლა ნახვის გარეშე.`,
      cta: null,
    }
  }

  if (views >= RATE_MIN_VIEWS && bookings / views < LOW_CONVERSION) {
    return {
      key: 'low-rate',
      text: `${views} ნახვიდან ${bookings} ჯავშანი (${pct(views, bookings)}%) — ნახვა ბევრია, არჩევანი ცოტა. ჯერ ფასს და სათაურს გადახედე.`,
      cta: { label: 'პროფილის რედაქტირება', href: '/work/profile' },
    }
  }

  return {
    key: 'working',
    text: `${views} ნახვიდან ${bookings} ჯავშანი (${pct(views, bookings)}%). პროფილი მუშაობს — შემდეგი ბერკეტი გრაფიკია: რაც მეტი თავისუფალი დროა, მით მეტი ასარჩევი აქვს კლიენტს.`,
    cta: { label: 'გრაფიკის შევსება', href: '/work/schedule' },
  }
}

const WINDOWS = [7, 30] as const

export function ProfileSignal({ freeMinutes }: { freeMinutes: number | null }) {
  const [days, setDays] = useState<7 | 30>(7)
  const [data, setData] = useState<InsightsData | null>(null)
  // 'idle' → never loaded; 'error' → the fetch failed, so we say nothing rather
  // than print a zero we can't stand behind.
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState(s => (s === 'ready' ? 'ready' : 'loading'))
    ;(async () => {
      try {
        const res = await fetch(`/api/tutor/insights?days=${days}`)
        if (!res.ok) throw new Error('bad')
        const j = await res.json()
        if (cancelled) return
        setData({
          days: typeof j?.days === 'number' ? j.days : days,
          views: typeof j?.views === 'number' ? j.views : 0,
          bookings: typeof j?.bookings === 'number' ? j.bookings : 0,
          conversion: typeof j?.conversion === 'number' ? j.conversion : null,
        })
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [days])

  // A failed read is not „0 ნახვა" — it is „we don't know", and the honest
  // rendering of „we don't know" is nothing at all.
  if (state === 'error') return null

  const verdict = data ? diagnose({ days: data.days, views: data.views, bookings: data.bookings, freeMinutes }) : null

  return (
    <Card as="section" aria-label="პროფილის სიგნალი" padding="none" className="shadow-xs">
      <div className="p-5 sm:p-6 pb-4 sm:pb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow tone="muted">პროფილის სიგნალი</Eyebrow>
          <div className="text-meta text-ink-500 mt-1">რამდენმა გნახა და რამდენმა დაგჯავშნა</div>
        </div>
        <div role="group" aria-label="პერიოდი" className="inline-flex rounded-btn border border-ink-200 overflow-hidden shrink-0">
          {WINDOWS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`h-11 px-3.5 font-display font-semibold text-small transition-colors duration-fast ${
                i > 0 ? 'border-l border-ink-200' : ''
              } ${days === d ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'}`}
            >
              {d} დღე
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 sm:px-6 pb-5 sm:pb-6 grid grid-cols-2 gap-4">
        {[
          { label: 'ნახვა', value: data?.views },
          { label: 'ჯავშანი', value: data?.bookings },
        ].map(c => (
          <div key={c.label}>
            <div className="font-display text-h2 font-bold text-ink-900 tabular-nums leading-none">
              {c.value === undefined ? <Skeleton className="h-6 w-12" /> : c.value}
            </div>
            <div className="text-meta text-ink-500 mt-1.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-ink-100 p-5 sm:px-6">
        {verdict ? (
          <>
            <p className="text-body text-ink-700">{verdict.text}</p>
            {verdict.cta && (
              <Link
                href={verdict.cta.href}
                className="inline-flex items-center h-11 mt-1 text-small font-display font-semibold text-brand-700 hover:text-brand-800"
              >
                {verdict.cta.label}
              </Link>
            )}
          </>
        ) : (
          <Skeleton className="h-4 w-3/4" />
        )}
      </div>
    </Card>
  )
}
