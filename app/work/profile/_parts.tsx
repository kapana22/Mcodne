'use client'
// One labelled field. What is left of a file that held four building blocks.
//
// ⚠️ `TabPanel` WENT WITH THE TABS (2026-08-30). /work/profile drew a bar
// („პროფილი / ანგარიში") that did not cover its own page — the work photos
// stood BELOW it, in neither tab, with a second save button and a second
// unsaved-changes guard. A tab bar that describes part of a screen is worse
// than none: it tells the reader they have seen everything when they have not.
// One page, one column, one save.
//
// ⚠️ `AddDisclosure` WENT WITH THE CREDENTIALS TAB (2026-08-29). It hid the
// certificate, education and job add-forms behind „+ დამატება"; all three lists
// are gone. Owner: „რითი დაგიჯერებს აღარ გვჭირდება, ეს ხომ სერვისებს ყიდის."
//
// ⚠️ `ServiceTypeAndAvailability` WENT WITH THE BOOKING PRODUCT (2026-08-24).

import Link from 'next/link'
import { Eyebrow } from '@/components/Eyebrow'
import { TETRI, contactsLabel } from '@/lib/credits'
import type { Loaded } from './_types'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Eyebrow as="span" tone="muted" className="block mb-1.5">{label}</Eyebrow>
      {children}
    </label>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE STATUS BAND — is this page working, how full is it, what is the rest
 * worth. One surface, three answers.
 *
 * ⚠️ IT REPLACES A GREY STRIP IN THE MIDDLE OF THE FORM (2026-08-31, from the
 * owner's design canvas → Work Profile). That strip said the first of the three
 * and was the fourth thing on the screen; the other two lived in the sidebar,
 * on every workspace page including this one, where they said nothing about the
 * form the reader was looking at. The canvas puts all three at the top of the
 * one screen where they are actionable.
 *
 * 🔒 EVERY NUMBER HERE IS THE GRANT'S OWN. `percent` and `unearnedTetri` come
 * from `lib/creditsServer → profileCompletion` — the same six tasks, the same
 * arithmetic — so the ring and the money cannot disagree. The canvas's „73%" and
 * „+38₾" are placeholders; these are measured, and the band is a quiet neutral
 * plate when there is nothing left to earn.
 *
 * ⚠️ „38 კლიენტის პასუხია" IS DERIVED, NOT DECORATIVE. It is `contactsFor` —
 * what that balance actually opens (lib/credits) — and it is the sentence that
 * turns a reward into a reason. Drawn only when the division is meaningful.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The conic completion ring — the canvas's, in the palette's own gold. */
function CompletionRing({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <span
      aria-hidden
      style={{ backgroundImage: `conic-gradient(#EFD48A 0% ${p}%, rgba(255,255,255,0.16) ${p}% 100%)` }}
      className="inline-flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full"
    >
      <span className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand-900 font-display text-small font-extrabold tabular-nums text-white">
        {p}%
      </span>
    </span>
  )
}

export function ProfileStatusBand({ data }: { data: Loaded }) {
  const left = data.unearnedTetri / TETRI
  const contacts = contactsLabel(data.unearnedTetri)

  /* THE HEADLINE IS THE STATE, and the three states are not interchangeable:
     switched off beats incomplete beats finished. „ჯერ არ ხარ სიაში" names the
     missing fields because the endpoint already computed exactly which ones
     (`profileGaps`) — a generic „შეავსე პროფილი" would send somebody hunting. */
  const off = !data.available
  const short = data.gaps.length > 0
  const eyebrow = off
    ? 'გვერდი დამალულია'
    : short
      ? 'ჯერ არ ჩანხარ კატალოგში'
      : 'ჩანხარ კატალოგში · მოთხოვნები მოგდის'
  const title = off
    ? 'არც ძებნაში ჩანხარ და არც მოთხოვნები მოგდის'
    : short
      ? `დარჩა ${data.gaps.join(' და ')}`
      : 'პროფილი მუშაობს'

  return (
    <div
      className={`mb-5 flex flex-wrap items-center gap-6 rounded-panel px-6 py-6 text-white sm:px-8 ${
        off ? 'bg-ink-900' : 'bg-[radial-gradient(120%_160%_at_8%_0%,#26806E_0%,#1E6656_46%,#123A31_100%)]'
      }`}
    >
      {/* The ring only where there is a form to finish. At 100% it is a circle
          saying „100%" beside a sentence that already says so. */}
      {data.percent < 100 && <CompletionRing percent={data.percent} />}

      <div className="min-w-[240px] flex-1">
        <p className="font-display text-micro font-bold uppercase text-white/60">{eyebrow}</p>
        <p className="mt-2 font-display text-h2 font-extrabold tracking-[-0.02em]">{title}</p>
        {left > 0 && (
          <p className="mt-2 max-w-[520px] text-body leading-[1.55] text-white/[0.76]">
            შევსება <b className="font-bold tabular-nums">+{left}₾</b> ბალანსზე
            {contacts && <> — ეს <span className="tabular-nums">{contacts}</span> კლიენტის კონტაქტია</>}.
          </p>
        )}
      </div>

      {/* ⚠️ THE GOLD BUTTON IS THE CANVAS'S AND IT IS THE ONE PLACE THE ACCENT
          BECOMES A CONTROL. It is legible where a white or green fill on this
          gradient is not: ink-900 on #EFD48A measures 13.9:1. It appears only
          when there is somewhere to send somebody — a switched-off page is
          fixed in /work/account, an incomplete one in the form below. */}
      {off ? (
        <Link
          href="/work/account"
          className="inline-flex h-[52px] shrink-0 items-center rounded-field bg-white px-6 font-display text-body-lg font-extrabold text-ink-900 transition-colors duration-fast hover:bg-ink-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
        >
          ჩართვა
        </Link>
      ) : data.percent < 100 ? (
        <a
          href="#profile-form"
          style={{ backgroundColor: '#EFD48A' }}
          className="inline-flex h-[52px] shrink-0 items-center rounded-field px-6 font-display text-body-lg font-extrabold text-ink-900 transition-[filter] duration-fast hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
        >
          შევსება
        </a>
      ) : null}
    </div>
  )
}
