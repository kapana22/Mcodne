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
import { VERTICAL_LABEL } from '@/lib/requestTopics'
import type { Draft, Loaded } from './_types'
import { PRICE_ON_REQUEST } from '@/lib/requests'
import { topicGroupMark } from '@/lib/topicMarks'

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
  /* ⚠️ TWO STATES, AND FOR ONE COMPILE THEY WERE ONE (2026-09-02).
     `openGroup` held BOTH „which world section is expanded" (as `world:SERVICE`)
     and, after the category strip landed here, „which category is open" (a bare
     group id). One variable, two meanings — so opening „სამართალი" set it to
     `law`, which made `openGroup !== 'world:EXPERT'` true on the section's
     `hidden`, and the entire section vanished, taking the strip that had just
     been tapped with it.

     Caught by reading the file rather than by the screen, because the browser
     panel was unusable at that moment — and it is the same defect this whole
     run has been about, one level down: two things sharing one name always end
     up disagreeing. */
  const [openWorld, setOpenWorld] = useState<string | null>(null)
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
  // The two names are the site's one pair (lib/requestTopics → VERTICAL_LABEL),
  // the same words /join asks with and the catalogue's switch filters by. This
  // list said „სერვისი" for the everyday half until 2026-09-01 — the name of
  // everything the site sells, used for half of it.
  const ORDER = [
    { v: 'EXPERT' as const, title: `${VERTICAL_LABEL.EXPERT} სერვისები` },
    { v: 'SERVICE' as const, title: `${VERTICAL_LABEL.SERVICE} სერვისები` },
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
        {/* ⚠️ THE PRICE CAME OFF THESE ROWS (2026-09-01, owner: „ერთი ფასი და
            „შეთანხმებით""). Each row carried its own money box, and the
            sentence over the list explained them: „ფასი სავალდებულო არ არის…
            კატალოგში სერვისი ფასით უფრო ხშირად აირჩევა." Both are gone.
            The BOXES, because 1 of 25 published providers had ever filled one
            — a question asked five times per provider and answered by one.
            The SENTENCE, because its second half is a claim about what clients
            do, and no search or click data has ever been collected on this site
            (CLAUDE.md → „never invent a number"). What replaces both is one
            price under the list, and „შეთანხმებით" beside it.
            The row keeps its own way off; that was never the problem. */}
        {draft.services.length > 0 && (
          <div className="mt-4">
            <ul className="divide-y divide-ink-100 border-y border-ink-100">
              {draft.services.map(id => {
                const t = topicById(id)
                return (
                  <li key={id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 font-display text-body font-semibold text-ink-900 truncate">
                      {t?.label ?? id}
                    </span>
                    {/* 40px, like anything else tappable — the glyph is 16. */}
                    <button
                      type="button"
                      onClick={() => toggleService(id)}
                      aria-label={`მოხსენი ${t?.label ?? id}`}
                      className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-btn text-ink-400 hover:text-danger-700 hover:bg-danger-50 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <Icon.x aria-hidden className="w-4 h-4" />
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* ── ONE PRICE, AND THE HONEST ALTERNATIVE ────────────────────
                The intake's plate (app/join/_provider/client.tsx), in this
                card's own materials — the same two answers, in the same order,
                worded the same way. It lives INSIDE „რას აკეთებ" because it
                prices what that list holds; „სამუშაო, ₾-დან" used to sit two
                cards below, next to the call-out fee, which is a question
                about a VISIT and not about the work.

                ⚠️ THE TICK IS DERIVED HERE AND IS REAL STATE ON /join, and the
                difference is not an oversight. A saved profile has always
                answered — `priceFrom === null` IS „შეთანხმებით" — so deriving
                it invents nothing. A BLANK application has not answered yet,
                and deriving it there would pre-tick an answer nobody gave. */}
            <div className="mt-4 rounded-tile border border-ink-100 bg-ink-50 p-4">
              <label className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-[120px] flex-1 font-display text-small font-semibold text-ink-900">ფასი იწყება</span>
                <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-field border border-ink-200 bg-white px-3.5 transition-colors duration-fast focus-within:border-brand-600">
                  <input
                    type="number" min={1} max={1000000} inputMode="numeric"
                    value={draft.priceFrom ?? ''}
                    onChange={e => patch({ priceFrom: num(e.target.value) })}
                    aria-label="ფასი, ₾-დან"
                    placeholder="ფასი"
                    className="w-20 min-w-0 border-0 bg-transparent p-0 text-body font-bold tabular-nums text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-400"
                  />
                  <span className="text-small text-ink-600">₾</span>
                </span>
              </label>
              <div className="mt-3 border-t border-ink-100 pt-3">
                <button
                  type="button"
                  aria-pressed={draft.priceFrom === null}
                  onClick={() => patch({ priceFrom: null })}
                  className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-pill border px-3.5 py-1.5 text-left font-display text-small font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
                    draft.priceFrom === null
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-ink-200 bg-white text-ink-900 hover:border-ink-300 hover:bg-ink-75'
                  }`}
                >
                  {draft.priceFrom === null && <Icon.check aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 leading-snug">ფასი შეთანხმებით</span>
                </button>
                {/* The catalogue card's own sentence, not new copy — see
                    app/experts/_providerCard.tsx. */}
                <p className="mt-2 text-meta text-ink-500">ბარათზე დაიწერება „{PRICE_ON_REQUEST}“.</p>
              </div>
            </div>
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
            placeholder="მოძებნე სერვისი"
            className="w-full h-11 pl-10 pr-3 rounded-field border border-ink-200 bg-white text-body text-ink-900 placeholder-ink-400 focus:border-brand-500 outline-none transition-colors duration-fast"
          />
        </div>

        {searching ? (
          // Flat and ungrouped: somebody who typed knows what they want, and a
          // group heading over one chip is furniture. The intake's rule.
          <div className="mt-3 flex flex-wrap gap-2">
            {hits.length === 0
              ? <p className="text-small text-ink-500">ვერაფერი მოიძებნა — სცადე სხვა სიტყვა.</p>
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
                      className={`h-10 px-3.5 rounded-pill border text-small font-display font-semibold transition-[background-color,border-color,transform] duration-fast motion-safe:active:scale-[0.97] ${
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
                    aria-expanded={openWorld === s.v}
                    onClick={() => setOpenWorld(openWorld === s.v ? '' : s.v)}
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
                    <Icon.chevD className={`w-4 h-4 text-ink-500 transition-transform duration-fast ${openWorld === s.v ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <div hidden={!s.theirs && mine.size === 1 && openWorld !== s.v}>
                {s.theirs || mine.size !== 1 ? <Eyebrow as="h3" tone="muted">{s.title}</Eyebrow> : null}
                {/* ⚠️ THE SAME CONTROL /join USES, AND FOR ONE DAY IT WAS NOT
                    (2026-09-02). Owner, on this exact screen: „ამაზე რატომ არ
                    გადაწყვიტე როგორც რეგისტრაციაზე გვქონდა კომფორტულად??? ხო
                    ვთქვით ესეც."

                    Fair, and it was the very duplication this run was called to
                    end: ONE question — „what do you sell" — with two
                    implementations, and only one of them fixed. This screen
                    still printed every group heading and every chip at once, so
                    a provider on the professional side scrolled past ~109 chips
                    to change one. The measurements and the six-marketplace
                    comparison that produced the strip are written out at the
                    browse panel in app/join/_provider/client.tsx; they apply
                    here unchanged, because it is the same taxonomy.

                    ⚠️ AND THE 2026-09-01 NOTE THAT STOOD HERE IS NOT BEING
                    REVERSED. It refused an ACCORDION — „a row that must be
                    tapped to reveal its contents spends a full line and the
                    whole width to print one word" — and every word of that
                    holds. The categories below are not hidden and are not rows:
                    they are one scrolling line of chips, all present, and they
                    are themselves the vocabulary. One question answered, the
                    next appears under it. */}
                <div className="mt-2 relative">
                  <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-1 px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {s.groups.map(g => {
                      const chosen = g.topics.filter(t => draft.services.includes(t.id)).length
                      const open = openGroup === g.id
                      return (
                        <button
                          key={g.id}
                          type="button"
                          aria-pressed={open}
                          onClick={() => setOpenGroup(open ? null : g.id)}
                          className={`inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-field border px-3.5 py-1.5 text-left font-display text-small font-semibold transition-[background-color,border-color] duration-fast ${
                            open ? 'border-brand-700 bg-brand-700 text-white'
                              : 'border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-75'
                          }`}
                        >
                          {/* ⚠️ THE SAME MARK THE INTAKE AND /join DRAW
                              (2026-09-02). One taxonomy, one icon per family
                              (lib/topicMarks) — the provider ticking
                              „სამართალი" here sees the scales a client saw
                              filing the request that will reach them. White on
                              the open chip, which is a filled brand surface;
                              `brand-600` on the rest. */}
                          {(() => {
                            const mark = topicGroupMark(g.id, 'w-4 h-4 shrink-0')
                            return mark && <span className={open ? 'text-white' : 'text-brand-600'}>{mark}</span>
                          })()}
                          <span className="whitespace-nowrap leading-snug">{g.label}</span>
                          {chosen > 0 && (
                            <span className={`inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-pill border px-1 font-display text-meta font-bold tabular-nums ${
                              open ? 'border-white/40 text-white' : 'border-brand-200 text-brand-700'
                            }`}>
                              {chosen}
                            </span>
                          )}
                          {open && <Icon.chevD aria-hidden className="h-3.5 w-3.5 shrink-0 rotate-180 text-white" />}
                        </button>
                      )
                    })}
                  </div>
                  <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
                </div>

                {(() => {
                  const g = s.groups.find(x => x.id === openGroup)
                  if (!g) return null
                  return (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                      {g.topics.map(t => {
                        const on = draft.services.includes(t.id)
                        // Disabled only when it would be a no-op — a ticked chip
                        // at the cap must stay pressable, or the cap becomes a
                        // trap.
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
                  )
                })()}
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
      {/* ⚠️ ONE FIELD NOW, AND THE HEADING SAYS SO (2026-09-01). „სამუშაო,
          ₾-დან" sat here beside the call-out fee, and the card was called
          „გამოძახება და მინიმუმი" — two questions about two different things
          filed together because both happen to be money. One asks what the WORK
          costs and belongs on the list of work („რას აკეთებ", above); the other
          asks what a VISIT costs before anybody knows what the work is, and
          that is this card's whole subject.
          The remaining field keeps „სავალდებულო არ არის", which is still true
          of it — it is the price question above that stopped being optional. */}
      <Card>
        <h2 className="font-display text-h3 font-bold text-ink-900">გამოძახება</h2>
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
        </div>
      </Card>
    </>
  )
}
