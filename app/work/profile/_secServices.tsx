'use client'
// „რას აკეთებ, სად, და რა ღირს" — the SELLING half of the one provider editor.
//
// ⚠️ IT WAS THE WHOLE OF /work/services UNTIL 2026-08-30, and what changed is
// ownership, not markup. Every card below, and every ⚠️ on it, arrived here
// byte-for-byte from `app/work/services/_trades.tsx`; the reasoning those notes
// carry is about the CONTROLS and is untouched by the move.
//
// What this file lost, and where each piece went:
//
//   · the fetch, the draft, the dirty flag, the save     → `_editor.tsx`
//   · the „ახალი მოთხოვნები მომდის" switch               → /work/account
//   · the ShopfrontCard beside it                        → `_editor.tsx`
//   · the sticky save bar and the „+20₾" line            → `_editor.tsx`
//
// It is now PRESENTATIONAL: it reads `draft` and calls `patch`, and holds no
// state but the two the pickers need to draw themselves (which group is open,
// what is typed in the search). One editor, one draft, one save — so a section
// that owned a copy of any of those would be the duplication coming back a
// level down.

import { useState } from 'react'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { MAX_SERVICES } from '@/lib/serviceProfile'
import type { Draft, Loaded } from './_types'

/** A number field that distinguishes „empty" from „zero". `null` is „ask me",
 *  and it has to survive the round trip — see lib/serviceProfile. */
function num(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

const FIELD =
  'w-full h-11 px-3.5 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast'

export function ServicesSections({ data, draft, patch }: {
  data: Loaded
  draft: Draft
  patch: (p: Partial<Draft>) => void
}) {
  // ⚠️ THE HOOKS COME FIRST, ABOVE EVERY BRANCH. They used to sit past two early
  // returns in the old file, so the first render called five hooks and the one
  // after the fetch called six — React #310, which reaches the provider as a
  // blank screen. The parent owns the loading branch now, but the rule is why
  // these two stayed at the top rather than moving down beside their pickers.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const atCap = draft.services.length >= MAX_SERVICES
  const prices: Record<string, number> = draft.priceList ?? {}

  const allTopics = data.groups.flatMap(g => g.topics)
  const topicById = (id: string) => allTopics.find(t => t.id === id)

  /** ⚠️ IT SEARCHES `alt` TOO, AND THAT IS MOST OF ITS VALUE — the same
   *  sentence the intake's copy of this carries, for the same reason. The
   *  topics hold the words people actually type: „სანტექნიკოსი" for the
   *  plumbing rows, „დამლაგებელი" for „ბინის დალაგება". A search over the
   *  printed label alone would fail the exact person it is for — the one who
   *  names their trade in their own words rather than ours.
   *
   *  Two characters, because one letter matches most of the catalogue; 24 hits,
   *  because past that a „search" is a second wall. Both numbers are the
   *  intake's, deliberately — one behaviour, two screens. */
  const q = query.trim().toLowerCase()
  const searching = q.length >= 2
  const hits = searching
    ? allTopics
        .filter(t => t.label.toLowerCase().includes(q) || t.alt.some(a => a.toLowerCase().includes(q)))
        .slice(0, 24)
    : []

  /** ⚠️ THE TWO WORLDS, IN THE CATALOGUE'S OWN HEADINGS AND ORDER. „პროფესიული
   *  სერვისები" then „სერვისი" is what app/experts/_filters.tsx already draws
   *  over this very list, under the owner's own ruling on which leads: „უფრო
   *  მაღალი დონის სერვისები და ინტელექტუალურიც იყოს… პარალელურად სერვისებსაც,
   *  რაც ყოველდღიურად სჭირდება — დალაგება და ხელოსანი, ესეც."
   *
   *  Nothing is REORDERED here — the endpoint already sends them in that order.
   *  What was missing is that the run of 20 turned into a run of 8 with no
   *  heading between them, so the second half read as more of the first. */
  /* ⚠️ THEIR OWN WORLD LEADS, AND THE OTHER ONE FOLDS (2026-08-30). Owner:
     „როდესაც დამლაგებლად დაამატა სერვისი, იმას ხომ არ ექნება სურვილი
     ბუღალტრის სერვისი ჰქონდეს… ზედმეტ რაღაცებს აღარ უნდა თავაზობდეს."

     Measured that day across the 28 live providers who have any services:
     EVERY ONE sits inside a single vertical, and 26 of the 28 inside a single
     GROUP — 1.1 groups on average. Drawing 28 group headings was drawing 27
     that person will never open.

     ⚠️ NOTHING IS ASKED HERE, and that is the difference from /join. By the
     time somebody opens this screen they have already answered — their stored
     services say which world they are in. Asking again would be the form
     forgetting what it knows.

     ⚠️ AND THE OTHER WORLD IS ONE TAP AWAY, NEVER GONE. A cleaner who starts
     teaching is a real person; a picker that made that impossible would be
     worse than one that scrolls. It is collapsed, not removed — and the search
     above still crosses both, deliberately. */
  const mine = new Set(
    draft.services
      .map(id => data.groups.find(g => g.topics.some(t => t.id === id))?.vertical)
      .filter(Boolean) as ('SERVICE' | 'EXPERT')[],
  )
  // No services yet (a brand-new row): show both, in the catalogue's order.
  const ORDER = [
    { v: 'EXPERT' as const, title: 'პროფესიული სერვისები' },
    { v: 'SERVICE' as const, title: 'სერვისი' },
  ]
  const sections = (mine.size === 1 ? [...ORDER].sort(a => (mine.has(a.v) ? -1 : 1)) : ORDER)
    .map(s => ({ ...s, groups: data.groups.filter(g => g.vertical === s.v), theirs: mine.has(s.v) }))
    .filter(s => s.groups.length > 0)

  const toggleService = (id: string) => {
    const on = draft.services.includes(id)
    if (!on && atCap) return
    // ⚠️ THE PRICE COMES OFF WITH THE TICK. The endpoint refuses a map holding a
    // key that is not a chosen service (it is either a stale leftover or a
    // crafted body), so leaving one behind would turn „I no longer do that" into
    // a save that fails with a message about a service they just removed.
    const rest = { ...prices }
    if (on) delete rest[id]
    patch({
      services: on ? draft.services.filter(s => s !== id) : [...draft.services, id],
      priceList: rest,
    })
  }

  /** The price map, always an object — a stored `null` must not reach `[id]`. */
  const setPrice = (id: string, raw: string) => {
    const next = { ...prices }
    const n = num(raw)
    // Blank REMOVES the key rather than storing a zero: „ask me" is an honest
    // answer for a job whose price depends on what is behind the wall, and the
    // card prints „ფასს შემოგთავაზებს" for it.
    if (n === null || n <= 0) delete next[id]
    else next[id] = n
    patch({ priceList: next })
  }

  const toggleArea = (id: string) => {
    const on = draft.areas.includes(id)
    patch({ areas: on ? draft.areas.filter(a => a !== id) : [...draft.areas, id] })
  }
  return (
    <>
      {/* ── What you do, and what it costs ──────────────────────────────────
          ONE CARD, because they are one answer. The list of ticks and the list
          of prices were two cards drawing the same rows 200px apart; a price
          belongs on the row it prices. */}
      <Card id="section-services" className="scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-display text-h3 font-bold text-ink-900">რას აკეთებ</h2>
          <span className="text-meta text-ink-500 tabular-nums">
            {draft.services.length} / {MAX_SERVICES}
          </span>
        </div>
        {atCap && (
          <p className="mt-1 text-small text-ink-500">
            მაქსიმუმია. ერთი მოხსენი, თუ სხვის დამატება გინდა.
          </p>
        )}

        {/* ── The answer, above the question ───────────────────────────────
            Every chosen service, with its price on the same row and its own
            way off. Empty until the first tick, so a first visit opens on the
            search field and nothing else. */}
        {draft.services.length > 0 && (
          <div className="mt-4">
            <p className="text-small text-ink-500">
              ფასი სავალდებულო არ არის. ცარიელი ნიშნავს, რომ ფასს ყოველ ჯერზე ამბობ —
              ერთი ფასიც კმარა, კატალოგში სერვისი ფასით უფრო ხშირად აირჩევა.
            </p>
            <ul className="mt-3 divide-y divide-ink-100 border-y border-ink-100">
              {draft.services.map(id => {
                const t = topicById(id)
                return (
                  <li key={id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 font-display text-body font-semibold text-ink-900 truncate">
                      {t?.label ?? id}
                    </span>
                    <span className="inline-flex items-center gap-2 shrink-0">
                      <input
                        type="number" min={1} max={1000000} inputMode="numeric"
                        value={prices[id] ?? ''}
                        onChange={e => setPrice(id, e.target.value)}
                        aria-label={`${t?.label ?? id} — ფასი`}
                        placeholder="—"
                        className="w-24 h-11 px-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 tabular-nums text-right focus:border-brand-500 outline-none transition-colors duration-fast"
                      />
                      <span className="text-small text-ink-600">₾</span>
                      {/* 40px, like anything else tappable — the glyph is 16. */}
                      <button
                        type="button"
                        onClick={() => toggleService(id)}
                        aria-label={`მოხსენი ${t?.label ?? id}`}
                        className="w-10 h-10 inline-flex items-center justify-center rounded-btn text-ink-400 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <Icon.x aria-hidden className="w-4 h-4" />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* ── The field, then the catalogue behind it ──────────────────────
            The intake's shape (app/join/_provider/client.tsx), which is the
            client intake's shape (app/request/_stepWhat.tsx), which is the
            owner's: type the thing, and the filing is ours to do. */}
        <div className="mt-4 relative">
          <Icon.search aria-hidden className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="მოძებნე სერვისი"
            placeholder="მოძებნე — ონკანი, დეკლარაცია, დალაგება…"
            className="w-full h-11 pl-10 pr-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast"
          />
        </div>

        {searching ? (
          // Flat and ungrouped: somebody who typed knows what they want, and a
          // group heading over one chip is furniture. The intake's rule.
          <div className="mt-3 flex flex-wrap gap-2">
            {hits.length === 0
              ? <p className="text-small text-ink-500">ვერაფერი მოიძებნა — სცადე სხვა სიტყვა ან გაასუფთავე ველი და გადახედე სიას.</p>
              : hits.map(t => {
                  const on = draft.services.includes(t.id)
                  const blocked = !on && atCap
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      disabled={blocked}
                      onClick={() => toggleService(t.id)}
                      className={`h-11 px-4 rounded-pill border text-body font-display font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
                        on
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : blocked
                            ? 'border-ink-100 text-ink-300 cursor-not-allowed'
                            : 'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {sections.map(s => (
              <div key={s.v}>
                {/* The world they are not in is a single row until they open
                    it — one tap, and the 20 headings behind it stay out of the
                    way of the person who came to tick one. */}
                {!s.theirs && mine.size === 1 && (
                  <button
                    type="button"
                    aria-expanded={openGroup === `world:${s.v}`}
                    onClick={() => setOpenGroup(openGroup === `world:${s.v}` ? '' : `world:${s.v}`)}
                    className="w-full min-h-11 py-2 flex items-center justify-between gap-3 text-left rounded-btn hover:bg-ink-50 transition-colors duration-fast"
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-small font-semibold text-ink-700">
                        {s.title}
                      </span>
                      <span className="block text-meta text-ink-500 leading-snug">
                        სხვა კატეგორია — {s.groups.length} ჯგუფი. გახსენი, თუ ესეც აკეთებ.
                      </span>
                    </span>
                    <Icon.chevD className={`w-4 h-4 text-ink-500 transition-transform duration-fast ${openGroup === `world:${s.v}` ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <div hidden={!s.theirs && mine.size === 1 && openGroup !== `world:${s.v}`}>
                {s.theirs || mine.size !== 1 ? <Eyebrow as="h3" tone="muted">{s.title}</Eyebrow> : null}
                <div className="mt-1 flex flex-col gap-1">
                  {s.groups.map(g => {
                    const chosen = g.topics.filter(t => draft.services.includes(t.id)).length
                    // A group that already holds a choice opens on its own the
                    // first time the list is drawn — otherwise a returning
                    // provider has to hunt for their own answers.
                    const open = openGroup === null ? chosen > 0 : openGroup === g.id
                    return (
                      <div key={g.id} className="border-b border-ink-100 last:border-b-0">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenGroup(open ? '' : g.id)}
                          className="w-full min-h-11 py-2 flex items-center justify-between gap-3 text-left rounded-btn hover:bg-ink-50 transition-colors duration-fast"
                        >
                          <span className="font-display text-body font-semibold text-ink-900">{g.label}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            {chosen > 0 && (
                              <span className="h-6 min-w-6 px-2 inline-flex items-center justify-center rounded-pill bg-brand-600 text-white text-meta font-display font-semibold tabular-nums">
                                {chosen}
                              </span>
                            )}
                            <Icon.chevD className={`w-4 h-4 text-ink-500 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
                          </span>
                        </button>
                        {open && (
                          <div className="pb-3 flex flex-wrap gap-2">
                            {g.topics.map(t => {
                              const on = draft.services.includes(t.id)
                              // Disabled only when it would be a no-op — a ticked
                              // chip at the cap must stay pressable, or the cap
                              // becomes a trap.
                              const blocked = !on && atCap
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  aria-pressed={on}
                                  disabled={blocked}
                                  onClick={() => toggleService(t.id)}
                                  className={`h-11 px-4 rounded-pill border text-body font-display font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
                                    on
                                      ? 'border-brand-600 bg-brand-600 text-white'
                                      : blocked
                                        ? 'border-ink-100 text-ink-300 cursor-not-allowed'
                                        : 'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50'
                                  }`}
                                >
                                  {t.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Where ───────────────────────────────────────────────────────────
          ⚠️ NOT ASKED WHILE THERE IS ONE CITY (2026-08-29) — the rule the
          intake already applied on 2026-08-20, in its own words: „a block whose
          list holds a single chip is the form performing a choice nobody has".
          `CITIES` holds Tbilisi. This drew a whole card — heading, helper
          sentence, one chip — for a question with one answer, and the gaps line
          above it could still demand „აირჩიე ქალაქი" for a seeded row that had
          never been saved. The PUT fills it in instead (see the route), and
          `profileGaps` stops reporting it while the list is one long.

          The block SURVIVES rather than being deleted: the day a second city
          opens it is a real question again, and this is the whole of what has
          to happen for it to come back. */}
      {data.cities.length > 1 && (
      <Card>
        <h2 className="font-display text-h3 font-bold text-ink-900">რომელ ქალაქებში მუშაობ</h2>
        <p className="mt-1 text-small text-ink-500">
          მოთხოვნა მხოლოდ არჩეული ქალაქებიდან მოგდის.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.cities.map(c => {
            const on = draft.areas.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleArea(c.id)}
                className={`h-11 px-4 rounded-pill border text-body font-display font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
                  on
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink-200 text-ink-800 hover:border-ink-300 hover:bg-ink-50'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </Card>
      )}

      {/* ── What a VISIT costs ──────────────────────────────────────────────
          ⚠️ THIS CARD WAS „ფასი" AND IT HELD TWO DIFFERENT THINGS (2026-08-29).
          Its first half was „რა ღირს თითოეული" — the chosen services again,
          each with a price box — which made this screen draw the same list
          twice, ~200px apart, one to tick and one to price. The prices moved
          onto the rows they price (the card above); what is left here is the
          half that was never about a service at all.

          ⚠️ AND THE HISTORY OF THE PRICE MAP STAYS SAID, because it explains a
          column that has no field on this card any more. `priceList` had
          exactly one writer until 2026-08-21 — the application, which is sealed
          once approved — so a master who signed up without prices, or whose
          prices moved, had nowhere to say so. Two things broke, and the second
          reads as the product lying:

            · THE CARD COULD NOT PRINT WHAT THE CATALOGUE SELLS. „ბინის
              დალაგება — 60₾" comes from that map; the two fields BELOW say what
              a VISIT costs and nothing about what a JOB costs.
            · 20₾ OF THE BONUS WAS UNWINNABLE. lib/credits pays PROFILE_SERVICE
              for „დაუწერე ფასი ერთ სერვისს მაინც" and `profileFacts` reads that
              column to decide — so the task sat on the provider's home screen
              with no field anywhere on the site that could tick it. */}
      <Card>
        <h2 className="font-display text-h3 font-bold text-ink-900">გამოძახება და მინიმუმი</h2>
        <p className="mt-1 text-small text-ink-500">
          რა ღირს მისვლა და დათვალიერება, სანამ სამუშაო ცნობილია. სავალდებულო არ არის.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
              გამოძახება, ₾
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.calloutFee ?? ''}
              onChange={e => patch({ calloutFee: num(e.target.value) })}
              className={FIELD}
              placeholder="30"
            />
          </label>
          <label className="block">
            <span className="block text-small font-display font-semibold text-ink-800 mb-1.5">
              სამუშაო, ₾-დან
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.priceFrom ?? ''}
              onChange={e => patch({ priceFrom: num(e.target.value) })}
              className={FIELD}
              placeholder="50"
            />
          </label>
        </div>
      </Card>
    </>
  )
}
