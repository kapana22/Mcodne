'use client'
// „რას აკეთებ და სად" — the master's own form.
//
// ⚠️ IT MOVED, IT DID NOT CHANGE (2026-08-19). This was
// app/work/(provider)/service-profile/_form.tsx, the whole of a page that asked
// „რას ვყიდი?" one floor away from the expert's tab asking the same question.
// One page answers it now — /work/services — and this file is the quote-based
// half of it, byte-for-byte what it was: same endpoint, same vocabulary, same
// gaps line, same uploader, same switch. The gate that stood in the old route's
// layout stands in that page instead (`requestsViewer().providerAllowed`), so
// nothing here decides who may see it.
//
// ⚠️ THE VOCABULARY COMES FROM THE SERVER, not from an import. The endpoint
// sends the groups and the cities alongside the saved row, so the list this
// draws and the list the schema validates against are the same object. A
// hard-coded copy here is how a trade gets added to requestTopics and stays
// invisible to every provider on the site.
//
// ⚠️ AND THE „ready / not ready" LINE IS THE SERVER'S ANSWER TOO (`gaps`).
// Whether a profile will actually be routed to is a routing question, and a
// second opinion computed in the browser is the one that would be wrong.

import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { MAX_SERVICES } from '@/lib/serviceProfile'
import { useUnsavedGuard } from '@/lib/useUnsavedGuard'
import { ShopfrontCard, ShopfrontLabel } from '../_components/ShopfrontCard'

type Topic = { id: string; label: string; alt: string[] }
type Group = { id: string; label: string; vertical: 'SERVICE' | 'EXPERT'; topics: Topic[] }
type City = { id: string; label: string }
type Profile = {
  services: string[]
  areas: string[]
  calloutFee: number | null
  priceFrom: number | null
  available: boolean
  /** ⚠️ THESE TWO WERE UNEDITABLE UNTIL 2026-08-18, and they are the two a
   *  client actually looks at. Their only writer was the approval transaction,
   *  and the application is sealed once approved — so a master's face and their
   *  one sentence were frozen at application day, permanently. */
  /** ⚠️ EDITABLE SINCE 2026-08-21, AND FROZEN AT APPLICATION DAY BEFORE THAT —
   *  which is what made 20₾ of the bonus unwinnable on this half of the site.
   *  `priceList` is what lib/credits calls „დაუწერე ფასი ერთ სერვისს მაინც",
   *  and `profileFacts` reads this very column to decide whether it is earned;
   *  its only writer used to be the intake, which is sealed at approval.
   *
   *  ⚠️ `about`, `photoUrl` AND `workPhotos` LEFT THIS FORM (2026-08-21) for
   *  /work/profile — who you are is not what you sell, and a page called „ჩემი
   *  სერვისები" that opened with a photo upload was the master's half of the
   *  „პროფილი vs ჩემი სერვისები" duplication. They are absent from the body
   *  this form PUTs, and the endpoint leaves absent fields alone, so nothing
   *  here can blank what the other page writes. */
  priceList?: Record<string, number> | null
  /** Read-only here — /work/profile owns it. Drawn on the preview card. */
  headline?: string | null
}

type Loaded = {
  profile: Profile
  gaps: string[]
  groups: Group[]
  cities: City[]
  /** How many work photos the row holds — counted by the endpoint, never sent. */
  workPhotoCount: number
}

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

export function ServiceProfileForm({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  /** What the save just paid for, in lari. See the line under the button: the
   *  grant has to arrive attached to the act that earned it. */
  const [earned, setEarned] = useState<string[]>([])

  // ⚠️ 39 CHIPS IN 8 GROUPS, ALL EXPANDED, WAS THE WHOLE SCREEN (2026-08-21).
  // Measured: eight `h-11` rows deep, roughly 1 400px of scrolling before the
  // cities card came into view — and the cap was 12, so a plumber ticked four
  // of the five under სანტექნიკა and scrolled past the other thirty-four.
  // Owner: „ამდენი სივრცე სჭირდება? … მარტო ტექსტები და ღილაკებია დაყრილი და
  // არაპროფესიონალურია." The answer that day was the accordion below: one
  // group open at a time, its count on the closed header.
  //
  // ⚠️ AND THAT ANSWER STOPPED BEING ONE ON 2026-08-24, WHEN THE VOCABULARY
  // GREW UNDER IT. `OFFER_GROUPS` became the whole taxonomy — measured
  // 2026-08-29, **148 live topics in 28 groups**, up from 39 in 8. An accordion
  // that turns 8 headings into 8 words turns 28 headings into a 1 260px wall of
  // them (28 × `min-h-11` + border), and the 8 household groups sit BELOW the
  // 20 professional ones, so a plumber scrolled ~900px of ეროვნული გამოცდები ·
  // ფრანგული · კორპორატიული სამართალი · SMM to reach დალაგება.
  //
  // The fix is not a fourth layout. It is the two controls this site had
  // already decided on, in two other places, over the same vocabulary:
  //
  //   · A SEARCH FIELD FIRST. Owner, 2026-08-19, on the intake's own accordion
  //     („და არა ესე ჩამოწერილი"), and app/request/_stepWhat.tsx says what that
  //     screenshot showed: 31 headings drawn before a single character was
  //     typed, so the first thing the screen said was „here is our filing
  //     system". This screen was saying it to the provider. The intake
  //     (app/join/_master/client.tsx) has had the field since it was built —
  //     the same person picks these services with a search box on the day they
  //     register and, until today, without one every day after.
  //   · THE ANSWER ABOVE THE QUESTION. Also the intake's rule, in its own
  //     words: „on a form this long the answer scrolls away from the question".
  //     Here the chosen rows are also where the PRICE is typed, so the separate
  //     „რა ღირს თითოეული" card — a second copy of this same list, 200px
  //     lower — is gone with them.
  //
  // Seen in the field, on the same task: Behance („Add the types of services
  // you offer") is a search box over grouped rows; Contra and GoDaddy open on
  // the field alone; Braintrust puts the chosen skills under it as rows with
  // per-row controls, which is what a price needs. Nobody ships 28 folds.
  //
  // ⚠️ THE HOOKS ARE DECLARED HERE, WITH THE OTHERS (2026-08-21). They used to
  // sit further down, past the two early returns for „loading" and „failed to
  // load" — so the first render called five hooks and the render after the
  // fetch called six. React counts them: „Rendered more hooks than during the
  // previous render" (#310), which reaches the provider as a blank screen and
  // reached the owner as „რატომ არ მუშაობს". A hook after a conditional return
  // is the bug; the position is the fix.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  /** The last-saved values, so „is there unsaved work here" is answerable. */
  const [saved, setSaved] = useState<Profile | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/provider/service-profile', { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setError('ვერ ჩაიტვირთა.'); return }
      setData({ profile: j.profile, gaps: j.gaps, groups: j.groups, cities: j.cities,
                workPhotoCount: Number(j.workPhotoCount) || 0 })
      const loaded = { ...j.profile, priceList: (j.profile?.priceList ?? {}) as Record<string, number> }
      setDraft(loaded)
      setSaved(loaded)
    } catch {
      setError('ვერ ჩაიტვირთა.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ⚠️ THE LONGEST FORM IN THE WORKSPACE WAS THE ONE WITH NO GUARD (2026-08-29).
  // Both forms on /work/profile have had `useUnsavedGuard` for a week; this one
  // — where a provider ticks up to 16 services and types a price against each —
  // had no dirty tracking at all. Ten minutes of work, one stray click on the
  // rail two inches to the left, gone without a word.
  //
  // Declared here, above the early returns, or React counts a different number
  // of hooks before and after the fetch (#310). Same sentence as the other two:
  // one behaviour, three forms.
  const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  useUnsavedGuard(dirty, 'შენახული არ არის — თუ გახვალ, ცვლილებები დაიკარგება. მაინც გავიდე?')

  if (error && !draft) return <p className="text-body text-danger-700">{error}</p>
  if (!data || !draft) return <p className="text-body text-ink-500">იტვირთება…</p>

  const patch = (p: Partial<Profile>) => {
    setDraft(d => (d ? { ...d, ...p } : d))
    // A saved badge that survives the next edit is a badge that lies — and so
    // does a „+20₾ დაგერიცხა" line left hanging over the next thing they type.
    if (status === 'saved') { setStatus('idle'); setEarned([]) }
    setError(null)
  }

  // ⚠️ `profileId` AND `stamp` WERE DERIVED HERE AND READ BY NOTHING (removed
  // 2026-08-29). They drew the stored photo, and the photo left this form for
  // /work/profile on 2026-08-21 — two casts and a comment about caching that
  // outlived the <img> they were written for.

  const atCap = draft.services.length >= MAX_SERVICES
  const prices: Record<string, number> = draft.priceList ?? {}

  // ⚠️ BUILT FROM THE DRAFT, NOT FROM `data.profile`. The point of standing the
  // card beside the form is that it shows what WOULD be saved; reading the
  // stored row would leave it one save behind and quietly wrong.
  const shopfront = draft.services.map(id => ({
    id,
    label: data.groups.flatMap(g => g.topics).find(t => t.id === id)?.label ?? id,
    price: prices[id] ?? null,
  }))

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

  const save = async () => {
    setStatus('saving'); setError(null)
    try {
      const r = await fetch('/api/provider/service-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        // The endpoint's own message when it has one — these are written to be
        // read by the person who filled the form in.
        setError(j?.detail ?? 'ვერ შეინახა.')
        setStatus('idle')
        return
      }
      setData(d => (d ? { ...d, profile: j.profile, gaps: j.gaps } : d))
      // ⚠️ FROM WHAT THE SERVER STORED, NOT FROM WHAT WE SENT. The PUT fills the
      // single city in on our behalf, so a snapshot of the request body would
      // differ from the row and the bar would say „შეუნახავი ცვლილებები" the
      // instant the save succeeded.
      const stored = { ...j.profile, priceList: (j.profile?.priceList ?? {}) as Record<string, number> }
      setDraft(stored)
      setSaved(stored)
      // What the save paid for, in the endpoint's own words („20₾"). An empty
      // list is the normal case and says nothing.
      setEarned(Array.isArray(j.earned) ? j.earned.map((e: { label: string }) => e.label) : [])
      setStatus('saved')
    } catch {
      setError('ვერ შეინახა.')
      setStatus('idle')
    }
  }

  return (
    <div>
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-7 xl:items-start">
      <div className="flex flex-col gap-5 min-w-0">

      {/* ── Is this profile actually going to receive anything ──────────────
          The first thing on the screen, because a master whose list is empty is
          waiting for work that is never routed to them and nothing else on the
          page would say so. */}
      {/* ⚠️ ONE ROW: WHAT IS TRUE, AND THE CONTROL THAT MAKES IT TRUE
          (2026-08-29). „ახალი მოთხოვნები მომდის" was a Card of its own at the
          very BOTTOM of the page, while the sentence reporting its state —
          „დროებით გამორთულია — მოთხოვნები არ მოგდის" — sat here at the top.
          Roughly 1 500px of accordion between a state and the switch that sets
          it: a provider reading „you are switched off" had nothing to act on,
          and a provider switching off had to scroll back up to see that it
          took. It also takes a near-empty Card off a page that was reading as a
          stack of boxes.

          ⚠️ AND THE SWITCH IS OUTSIDE THE gaps BRANCH, deliberately. Drawing it
          only in the „ready" state would take the pause control away from
          exactly the person most likely to want it — somebody who has emptied
          their list because they are not working right now.

          ⚠️ ONE LINE, NOT A BULLETED BOX (2026-08-21). It listed „აირჩიე ერთი
          სერვისი მაინც" and „აირჩიე ქალაქი" as bullets directly above the cards
          that ASK for exactly those things — the warning restated the form it
          was sitting on top of. The state is worth saying because nothing else
          would; the instructions are not, because the next heading is the
          instruction. */}
      <div className={`rounded-card border px-4 py-3 flex items-center justify-between gap-4 flex-wrap ${
        data.gaps.length > 0 ? 'border-warning-200 bg-warning-50' : 'border-ink-200 bg-ink-50'
      }`}>
        <p className="text-body text-ink-900">
          {data.gaps.length > 0
            ? `ჯერ არ ხარ სიაში — ${data.gaps.join(', ')}.`
            : draft.available
              ? (data.cities.length > 1
                  ? 'მოთხოვნები მოგდის არჩეულ სერვისებზე და ქალაქებზე.'
                  : 'მოთხოვნები მოგდის არჩეულ სერვისებზე.')
              : 'დროებით გამორთულია — მოთხოვნები არ მოგდის.'}
        </p>
        {/* The label is the whole control — a 44px row, not a 20px box with
            words beside it. „მოხსენი, თუ დროებით ვერ იღებ სამუშაოს. სია
            შენარჩუნდება" went with the card: the sentence to its left already
            says which state you are in, and nothing here can lose the list. */}
        <label className="inline-flex items-center gap-2.5 min-h-11 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={draft.available}
            onChange={e => patch({ available: e.target.checked })}
            className="w-5 h-5 accent-brand-600 shrink-0"
          />
          <span className="text-small font-display font-semibold text-ink-800">
            ახალი მოთხოვნები მომდის
          </span>
        </label>
      </div>

      {/* ── What you do, and what it costs ──────────────────────────────────
          ONE CARD, because they are one answer. The list of ticks and the list
          of prices were two cards drawing the same rows 200px apart; a price
          belongs on the row it prices. */}
      <Card>
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
            The intake's shape (app/join/_master/client.tsx), which is the
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

      {/* ⚠️ THE SWITCH'S OWN CARD STOOD HERE (moved 2026-08-29). It is in the
          status row at the top of this form now, beside the sentence that
          reports what it does — see the note there. */}

      {error && (
        <div role="alert" className="rounded-field border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-body text-danger-700">
          {error}
        </div>
      )}

      </div>

      {/* ── The shopfront ───────────────────────────────────────────────────
          ⚠️ BELOW THE FORM ON A NARROW SCREEN, NOT HIDDEN. The grid only splits
          at `xl`; under it the card falls to the bottom of the column, which is
          where somebody scrolling a phone expects the result of what they just
          typed. */}
      <aside className="mt-6 xl:mt-0 xl:sticky xl:top-7">
        <ShopfrontLabel />
        <ShopfrontCard
          name={name}
          avatarUrl={avatarUrl}
          headline={(data.profile as { headline?: string | null }).headline ?? null}
          services={shopfront}
          workPhotos={data.workPhotoCount}
        />
      </aside>
    </div>

    <div className="flex flex-col gap-5">
      {/* ── Sticky save bar ────────────────────────────────────────────────
          ⚠️ IT WAS A BARE BUTTON AT THE BOTTOM OF A ~1 500px PAGE (2026-08-29),
          and that is the wrong end of this particular form: the accordion is
          28 groups tall, so the tick a provider came here to make is made a
          long way from the control that keeps it. Scrolling back to save is the
          step where the work gets lost.

          NOT A NEW PATTERN — it is the one this workspace already uses, ported
          from app/work/profile/_tabProfile.tsx with its copy intact: the state
          line reads „შეუნახავი ცვლილებები" / „ყველაფერი შენახულია" and the
          button doubles as the confirmation („შენახულია ✓"). Three long forms,
          one save affordance.

          The negative gutter mirrors `Container`'s own — `px-6 sm:px-8`,
          fixed regardless of size (components/Container) — so the bar spans the
          column edge to edge instead of floating inside its padding. */}
      <div className="sticky bottom-0 -mx-6 sm:-mx-8 px-6 sm:px-8 py-3 border-t border-ink-100 bg-white flex items-center justify-between gap-3">
        <span
          className={`text-meta font-display font-semibold ${dirty ? 'text-warning-700' : 'text-ink-400'}`}
          aria-live="polite"
        >
          {status === 'saving' ? 'ინახება…' : dirty ? 'შეუნახავი ცვლილებები' : 'ყველაფერი შენახულია'}
        </span>
        <Btn onClick={save} disabled={status === 'saving' || !dirty} aria-busy={status === 'saving'}>
          {status === 'saving' ? 'ინახება…' : dirty ? 'შეინახე ცვლილებები' : 'შენახულია ✓'}
        </Btn>
      </div>

      {/* ⚠️ THE GRANT IS SAID OUT LOUD, WHERE IT WAS EARNED (2026-08-21). The
          ledger is written by the shell on the next navigation, so filling this
          form used to move a number on another screen at some later moment —
          which is not a bonus, it is a balance that changed on its own. The
          endpoint grants on save and returns what it paid.

          The wording is the sanctioned one (lib/credits, SAY / NEVER SAY): this
          is a balance that buys offers, and nothing about it may read as money
          owed — it cannot be withdrawn, transferred or refunded. */}
      {status === 'saved' && earned.length > 0 && (
        <div className="rounded-card border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-body text-brand-800">
            <b className="font-display font-semibold">
              +{earned.join(' +')}
            </b>{' '}
            ბალანსზე დაგერიცხა.
          </p>
        </div>
      )}
    </div>
    </div>
  )
}
