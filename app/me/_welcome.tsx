'use client'
// /student — the top of the workspace: the greeting, the search box and the
// first-visit tour.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Container } from '@/components/Container'
import { KA_MONTHS_SHORT, KA_WEEKDAY_SHORT, MeData } from './_model'

/* ───── The two ways in, in the order the product actually works ─────
 *
 * ⚠️ SEARCHING WAS THE PRIMARY ACTION AND IT SHOULD NEVER HAVE BEEN
 * (2026-08-30). Owner, on this screen: „მთავარ გვერდზე ექსპერტის მოსაძებნი
 * უნდა იყოს პირველი? არაა რა თქმა უნდა."
 *
 * They are right, and the page's own sentence one line above said so already:
 * „აღწერე, რა გჭირდება — ან მოძებნე ექსპერტი პირდაპირ." Describing is the
 * product. A client who knew which expert they wanted would not need us; the
 * whole machine — routing, offers, the price a provider quotes against a real
 * brief — starts from a description. Searching is the ALTERNATIVE, for the
 * minority who already have somebody in mind.
 *
 * So the hero asks for the brief and offers the catalogue underneath it, at the
 * weight of a link. The rail already carries „ექსპერტები" as a permanent door;
 * this does not need to be a third one at button weight.
 */
const StartRequest = ({ requestHref }: { requestHref: string | null }) => (
  <div className="mt-6 flex flex-col items-start gap-3">
    {requestHref && (
      <Link
        href={requestHref}
        className="h-12 px-6 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-body-lg tracking-wide inline-flex items-center gap-2 shadow-xs transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        <Icon.edit className="w-4 h-4" />
        აღწერე, რა გჭირდება
      </Link>
    )}
    <Link
      href="/experts"
      className="font-display text-small font-semibold text-ink-600 hover:text-ink-900 inline-flex items-center gap-1.5 transition-colors duration-fast"
    >
      <Icon.search className="w-3.5 h-3.5" />
      ან მოძებნე ექსპერტი პირდაპირ
    </Link>
  </div>
)

/* ───── Onboarding tour — first-run getting-started card ───── */
export const OnboardingTour = ({ userId, joinedAt }: { userId?: string; joinedAt?: string }) => {
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
  const steps = [
    { n: 1, l: 'იპოვე ექსპერტი', d: 'აირჩიე საკითხი — საგადასახადო, სამართალი, ან სხვა.', href: '/experts' },
    // ⚠️ STEPS 2 AND 3 DESCRIBED A CALENDAR AND A VIDEO ROOM (2026-08-26).
    // „აირჩიე დრო კალენდარში — ექსპერტი ადასტურებს" and „შედი ვიდეოოთახში":
    // neither exists since 2026-08-24, and this is the FIRST screen a new
    // client sees, so it was teaching them a product they would then fail to
    // find.
    { n: 2, l: 'მიიღე შეთავაზებები', d: 'ექსპერტები ფასთან ერთად გამოგიგზავნიან — შენ ირჩევ.', href: '/experts' },
    { n: 3, l: 'შეათანხმე დეტალები', d: 'მიმოწერა მცოდნეზეა — იქვე ათანხმებთ ვადასა და ფორმატს.', href: null as string | null },
  ]
  return (
    <Container as="section" className="mt-6 motion-safe:animate-scale-in">
      <div className="rounded-card bg-white border border-ink-200 p-5 sm:p-6 relative overflow-hidden">
        <button
          type="button"
          onClick={close}
          aria-label="დახურვა"
          className="absolute top-3 right-3 w-9 h-9 rounded-btn text-ink-500 hover:text-ink-800 hover:bg-ink-100 inline-flex items-center justify-center transition-colors duration-fast z-10"
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
                <div className="p-4 rounded-card border border-ink-200 bg-white h-full flex flex-col hover:border-brand-300 hover-lift transition-colors duration-fast">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-600 text-white font-display font-bold text-small shadow-xs">{s.n}</span>
                    <span className="font-display text-body font-bold text-ink-900">{s.l}</span>
                  </div>
                  <p className="text-small text-ink-600">{s.d}</p>
                </div>
              )
              return s.href
                ? <Link key={s.n} href={s.href} className="block focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-card">{inner}</Link>
                : <div key={s.n}>{inner}</div>
            })}
          </div>
        </div>
      </div>
    </Container>
  )
}

/* ⚠️ THE COUNTER IS GONE WITH WHAT IT COUNTED (2026-08-24). This header said
   „დაჯავშნილი გაქვს N სესია", derived through `lib/bookings → deriveSummary`,
   the shared helper that kept it in step with the session list beside it. There
   are no sessions; there is one sentence, and it says what the page is for. */

export const Welcome = ({ name, requestHref }: {
  /** The reader's full name, resolved on the SERVER — this used to be the whole
   *  `me` object, fetched by the page after mount. */
  name: string
  /** The intake address, or null when FEATURE_REQUESTS is off. Read once by the
   *  server page so the hero and the rest of the screen cannot disagree. */
  requestHref: string | null
}) => {
  // ⚠️ THE CLOCK IS GONE (2026-08-30), and it took three problems with it.
  //
  //   · It could not be server-rendered (Node's ICU has no ka-GE), so it drew
  //     „—" on the first paint and swapped a beat later — a visible stutter on
  //     the client's landing page, which is the complaint that started this.
  //   · It re-rendered every 30 seconds, for ever, to say nothing.
  //   · „თბილისი" beside it is a CONSTANT: `CITIES` in lib/requestTopics holds
  //     one city. A field whose value cannot differ carries no information.
  //
  // What a person needs on their own home screen is their name and the one
  // thing to do — not the time, which their device already shows them.
  const firstName = name.split(' ')[0] ?? ''

  return (
    <section className="border-b border-ink-100 bg-white">
      <Container className="pt-6 sm:pt-10 lg:pt-12 pb-6 sm:pb-8">
        <div className="min-w-0">
          <h1 className="font-display text-h1 sm:text-display-lg lg:text-display-xl font-bold tracking-[-0.028em] leading-[1.02] text-ink-900">
            {firstName ? `გამარჯობა, ${firstName}.` : 'გამარჯობა.'}
          </h1>
          <p className="mt-3 text-body-lg text-ink-600 max-w-[560px] leading-[1.55]">
            აღწერე, რა გჭირდება — ექსპერტები ფასს შემოგთავაზებენ.
          </p>

          <StartRequest requestHref={requestHref} />
        </div>
      </Container>
    </section>
  )
}