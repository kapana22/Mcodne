'use client'
// /me — the first-visit tour, and nothing else any more.
//
// ⚠️ `Welcome` AND `StartRequest` LEFT THIS FILE ON 2026-08-31, with the
// greeting band the owner's „Client Space" canvas replaced. They were the
// full-bleed white section at the top of /me: „გამარჯობა, <name>.", one line of
// lead copy, the „აღწერე, რა გჭირდება" button and a quieter „ან მოძებნე
// ექსპერტი პირდაპირ" beneath it.
//
// Both of those doors survive, permanently and in the chrome rather than on one
// screen: the rail's pinned „ახალი მოთხოვნა" is the intake and the rail's
// „ექსპერტები" row is the catalogue, so they are reachable from all three /me
// screens instead of only this one. The reasoning the band's own notes fought
// for — that DESCRIBING is the product and searching is the alternative — is
// intact: the intake is the filled button, the catalogue is a plain row.
//
// The file keeps its name because the tour is still the „first minutes here"
// surface. What is below is unchanged apart from losing its own <Container>:
// the page it mounts into now provides one, and two nested grids double the
// gutter.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'

/* ───── Onboarding tour — first-run getting-started card ───── */
export const OnboardingTour = ({ userId, joinedAt, requestHref, hasRequests }: {
  userId?: string
  joinedAt?: string
  /** ⚠️ THE TOUR TEACHES STEP 1, SO IT MUST NOT OUTLIVE STEP 1 (2026-09-01).
   *  It gated on a dismissal and on the account being under a week old, and on
   *  neither of the two things that actually matter: whether the person has
   *  already done the thing it is explaining. Somebody who signed up and filed
   *  a request the same minute read „3 ნაბიჯი — და მზად ხარ / 1. აღწერე, რა
   *  გჭირდება" printed directly ABOVE the request they had just described — for
   *  the next seven days. Filing one is the tour finishing; it should behave
   *  that way. */
  hasRequests?: boolean
  /** The intake address — the same one the rail's button uses, so the first
   *  screen a client sees cannot offer two different „start here"s. */
  requestHref: string | null
}) => {
  const [dismissed, setDismissed] = useState(true) // start dismissed to avoid SSR flash
  useEffect(() => {
    if (!userId) return
    if (typeof window === 'undefined') return
    try {
      const key = `mcodne:onboarding-dismissed:${userId}`
      const isDismissed = localStorage.getItem(key) === '1'
      setDismissed(isDismissed)
    } catch {}
  }, [userId])
  if (dismissed) return null
  // Step 1 is done. Nothing here is news any more.
  if (hasRequests) return null
  // ⚠️ AND IT MUST NOT PRECEDE STEP 1 EITHER (2026-09-01). The rule above is
  // „the tour teaches step 1, so it must not outlive step 1"; the same sentence
  // read forwards says it must not run where step 1 is impossible. `requestHref`
  // is null for somebody who SELLS here — /request refuses them (owner,
  // 2026-08-31: a seller does not order) — and the card would have opened their
  // client room with a three-step guide whose first step has no door on it.
  if (!requestHref) return null
  // Only show for accounts younger than 7 days.
  if (joinedAt) {
    const ageMs = Date.now() - new Date(joinedAt).getTime()
    if (ageMs > 7 * 24 * 60 * 60 * 1000) return null
  }
  const close = () => {
    if (userId && typeof window !== 'undefined') {
      try { localStorage.setItem(`mcodne:onboarding-dismissed:${userId}`, '1') } catch {}
    }
    setDismissed(true)
  }
  // ⚠️ STEPS 2 AND 3 DESCRIBED A CALENDAR AND A VIDEO ROOM (2026-08-26).
  // „აირჩიე დრო კალენდარში — ექსპერტი ადასტურებს" and „შედი ვიდეოოთახში":
  // neither exists since 2026-08-24, and this is the FIRST screen a new client
  // sees, so it was teaching them a product they would then fail to find.
  //
  // ⚠️ AND STEP 1 WAS STILL WRONG AFTER THAT FIX (2026-08-30). It read „იპოვე
  // ექსპერტი" and pointed at /experts — so the card that teaches a new client
  // how this works never mentioned the intake at all, while the headline four
  // lines above it said „აღწერე, რა გჭირდება". Two answers to „what do I do
  // first" on one screen, and the tour was giving the wrong one.
  //
  // Step 2 pointed at /experts TOO, which is worse than a wrong link: you do
  // not receive offers by going to the catalogue. It waits, so it links to the
  // place the waiting is visible — which since 2026-08-30 is /me itself, the
  // screen this card is standing on. So it links nowhere: a step that says
  // „you are already looking at it" is honest, and a link back to the current
  // page reads as broken.
  const steps = [
    { n: 1, l: 'აღწერე, რა გჭირდება', d: 'რამდენიმე კითხვა — და მოთხოვნა გასულია.', href: requestHref },
    { n: 2, l: 'მიიღე შეთავაზებები', d: 'ექსპერტები ფასთან ერთად გამოგიგზავნიან — შენ ირჩევ.', href: null as string | null },
    { n: 3, l: 'შეათანხმე დეტალები', d: 'მიმოწერა მცოდნეზეა — იქვე ათანხმებთ ვადასა და ფორმატს.', href: null as string | null },
  ]
  return (
    <section className="mb-4 motion-safe:animate-scale-in">
      <div className="rounded-card bg-white border border-ink-100 p-5 sm:p-6 relative overflow-hidden">
        <button
          type="button"
          onClick={close}
          aria-label="დახურვა"
          className="absolute top-3 right-3 w-10 h-10 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast z-10"
        >
          <Icon.x className="w-4 h-4" />
        </button>
        <div className="relative">
          <Eyebrow className="mb-2 motion-safe:animate-rise-in">დასაწყისი</Eyebrow>
          <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight motion-safe:animate-rise-in" style={{ animationDelay: '60ms' }}>3 ნაბიჯი — და მზად ხარ</h2>
          <div className="mt-5 grid sm:grid-cols-3 gap-3 stagger">
            {steps.map(s => {
              // Solid, not translucent: an in-flow card is a surface you READ,
              // and the canon reserves glass for surfaces you look PAST
              // (.glass / .glass-bar). The old `bg-white/80 backdrop-blur-sm`
              // also paid for a compositor layer per card to tint the page
              // background by 20%.
              const inner = (
                <div className="p-4 rounded-tile border border-ink-100 bg-ink-50 h-full flex flex-col hover:border-brand-300 transition-colors duration-fast">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-600 text-white font-display font-bold text-small shadow-xs">{s.n}</span>
                    <span className="font-display text-body font-bold text-ink-900">{s.l}</span>
                  </div>
                  <p className="text-small text-ink-600">{s.d}</p>
                </div>
              )
              return s.href
                ? <Link key={s.n} href={s.href} className="block focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-tile">{inner}</Link>
                : <div key={s.n}>{inner}</div>
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
