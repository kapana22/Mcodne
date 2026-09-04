// THE SERVICE, AT THE TOP OF THE CLIENT'S OWN ROOM.
//
// ⚠️ FROM THE OWNER'S DESIGN CANVAS „კლიენტის მოთხოვნის ოთახი" (2026-09-04).
// Owner, on a competitor's screen: „უბრალოდ სერვისი იყოს მთავარი აქცენტი და რა
// ინფოც გვაქვს" — the service is the accent, and only facts we hold.
//
// WHAT IT REPLACES. The room used to open with the client's own DESCRIPTION and
// a row of brief chips, under a headline about us („ვეძებთ შენთვის ექსპერტს").
// A person opening their own request already knows what they wrote; what they
// cannot see at a glance is WHICH request this is, out of the three they filed,
// and whether it is still running. The service name answers both in one line,
// and everything below the band is an answer to it.
//
// ⚠️ THE MATERIAL IS THE SITE'S OWN, NOT A NEW ONE. The same green radial the
// home hero, /how and the provider's status band use — one material for „this
// is what we are", which is the whole reason that gradient is a single
// declaration repeated rather than a per-screen invention.
//
// ⚠️ AND IT GOES INK WHEN THE REQUEST IS SETTLED. Green means „open, you are
// still choosing"; a matched or closed request belongs to one person now and
// says so in the ink end of the same material. Two states, one language — not
// a second visual vocabulary bolted on for the after-state.

import type { ReactNode } from 'react'
import { Icon } from '@/components/Icon'

/** Live (still choosing) vs settled (matched, closed, refused). */
export type HeroTone = 'live' | 'settled'

const SURFACE: Record<HeroTone, string> = {
  live: 'radial-gradient(120% 140% at 12% 8%, #26806E 0%, #1E6656 42%, #123A31 100%)',
  settled: 'radial-gradient(120% 140% at 12% 8%, #2E2A21 0%, #1D1B15 46%, #0F0E0A 100%)',
}

export function RequestHero({
  /** The SERVICE — `topicLabel(topic)`. The accent, and the largest type here. */
  service,
  /** „აქტიური მოთხოვნა" · „ექსპერტი არჩეულია" — the client's word for the
   *  state, decided in the loader (STATUS_LABEL is the admin's vocabulary). */
  statusWord,
  publicRef,
  /** Category · city · kind. Values only, no labels: the client wrote them and
   *  „ქალაქი: თბილისი" is two words of scaffolding around one they know. */
  facts,
  tone = 'live',
  /** One line under the title on a settled request — who it went to, for how
   *  much. Nothing on a live one; the offers below say it better. */
  sub,
  children,
}: {
  service: string
  statusWord: string
  publicRef: string
  facts: string[]
  tone?: HeroTone
  sub?: string | null
  children?: ReactNode
}) {
  return (
    <div
      className="relative overflow-hidden rounded-band px-5 pb-9 pt-5 text-white sm:px-7 sm:pb-10 sm:pt-6"
      style={{ background: SURFACE[tone] }}
    >
      {/* The card's own light — the same gesture as the home hero's, so the two
          read as one material rather than two coloured rectangles. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-[260px] w-[260px] rounded-pill bg-white/[0.06]"
      />

      <div className="relative">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {tone === 'live' ? (
              // A dot, not a spinner: the request is standing, not loading.
              <span aria-hidden className="inline-block h-2 w-2 rounded-pill bg-brand-300" />
            ) : (
              <Icon.check aria-hidden className="h-3.5 w-3.5 text-brand-300" />
            )}
            {/* No `tracking-*`: globals.css already owns letter-spacing on
                anything uppercase (Georgian mtavruli), and a utility here
                would be dead markup — tests/primitiveAdoption ratchets it. */}
            <span className="font-display text-micro font-semibold uppercase text-white/[0.78]">
              {statusWord}
            </span>
          </div>
          {/* ⚠️ SMALL AND MONOSPACED, AND IT STAYS. It is how an operator finds
              this row when the client reads it down a phone — the one string on
              the screen that is for saying out loud. */}
          <span className="font-mono text-meta tabular-nums tracking-[0.02em] text-white/[0.55]">
            {publicRef}
          </span>
        </div>

        <h1 className="font-display text-h1 font-extrabold leading-[1.2] tracking-[-0.02em] text-balance sm:text-display">
          {service}
        </h1>

        {sub && <p className="mt-2.5 text-body leading-relaxed text-white/[0.7]">{sub}</p>}

        {facts.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {facts.map(f => (
              <span
                key={f}
                className="inline-flex items-center rounded-pill bg-white/[0.12] px-2.5 py-[5px] text-meta font-medium"
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
