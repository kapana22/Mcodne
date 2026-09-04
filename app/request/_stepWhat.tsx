'use client'
// Step 1 — „რა გჭირდება?". ONE FIELD. Everything else opens out of it.
//
// THE THUMBTACK/PROFI ENTRY, adopted deliberately (owner, 2026-08-14:
// „ჩასაწერი უნდა იყოს და მერე კატეგორიები უნდა იშლებოდეს"): the person types
// what they need IN THEIR OWN WORDS and the system does the classifying. The
// previous revision opened on three abstract cards — asking somebody to file
// their problem under our taxonomy before they had even named it, which is our
// filing problem exported to the visitor.
//
// ⚠️ AND THE CATALOGUE IS NO LONGER PRINTED UNDER THE FIELD (2026-08-19).
// Owner, holding a screenshot of this screen: „როცა ჩათს [საძიებოს] მოსაძებნად
// დაჭერ, მაშინ იშლებოდეს ქვევით და ჩაწერისას რაღაც კატეგორიები გამოდიოდეს. და
// არა ესე ჩამოწერილი."
//
// What that screenshot showed is the accordion's own defence used against it:
// 31 headings, all drawn before a single character was typed, so the first
// thing the intake said to a visitor was „here is our filing system". The field
// asks for a sentence; the wall under it asks them to browse instead. Two
// invitations, and the loud one is the wrong one — the whole point of the
// search-first entry is that the visitor names the thing and WE do the filing.
//
// So the browse list became what it always was — a fallback — and it now lives
// where a fallback belongs: folded into the field, one tap away.
//   • closed: the field alone, its placeholder carrying a real example, plus
//     one quiet line for the person who would rather look than type;
//   • tapped: the panel unfolds under the field with the folded groups in it;
//   • typing: the same panel switches to hits (the stemmer handles Georgian
//     declension, so „ქიმიის" finds ქიმია).
// Both roads still end on the same topic tap. The tap advances; the kind is
// derived from the topic and asked about ONLY when genuinely ambiguous
// (see _model → withTopic / stepVisible).
//
// ⚠️ THE PANEL SCROLLS INSIDE ITSELF, and that is the half of the fix that is
// not about first impressions. Opened inline at full height, 31 group rows push
// the field to the top of a 2000px page and, on a phone with the keyboard up,
// the row you are reaching for moves every time a fold opens. A capped box
// (`max-h`, its own scroll) keeps the field, the panel and the keyboard in one
// stable frame — the control stays where the thumb left it.
//
// THE GROUPS INSIDE IT ARE STILL AN ACCORDION, one open at a time: 132 topics
// rendered flat was two screens of pills, and a table of contents with three
// chapters open is a wall again.
//
// ⚠️ AND THE WHOLE THING GOES AWAY THE MOMENT IT HAS NOTHING LEFT TO SAY. A
// topic that carries more than one kind turns this screen into the „რა სახის
// დახმარება" question — see `awaitingKind` in the body for the measurement that
// forced it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  searchAllTopics, OTHER_TOPIC, KIND, kindsOfTopic,
  browseGroupsFor, VERTICAL_COPY, verticalOfTopic,
  topicLabel, TOPIC_GROUPS,
  type Topic, type TopicGroup, type RequestKindName, type Vertical,
} from '@/lib/requests'
import { StepPick } from './_stepPick'
import type { Draft } from './_model'
import { topicGroupMark } from '@/lib/topicMarks'
import { categoryIcon, categoryPhoto } from '@/lib/categoryMarks'
import Image from 'next/image'

/**
 * One example, one tap.
 *
 * ⚠️ MODULE SCOPE, NOT INSIDE StepWhat. It was defined in the component body
 * and closed over `draft`/`onPick`, which meant React saw a NEW component type
 * on every keystroke in the search box and remounted all six chips — throwing
 * away their DOM, and with it any focus or press state mid-tap. The props it
 * used to close over are now passed; that is the whole difference.
 */
function Chip({ t, on, onPick }: { t: Topic; on: boolean; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onPick(t.id)}
      // 0.97, the BUTTON press tier (components/Btn) — a pill is a
      // button-sized control, unlike the full-width option rows in
      // _stepPick, which press at the card tier.
      className={`h-11 px-4 rounded-pill border font-display text-small font-semibold transition-[background-color,border-color,color,transform] duration-fast motion-safe:active:scale-[0.97] ${
        on
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'
      }`}
    >
      {t.label}
    </button>
  )
}

const INPUT =
  'w-full h-12 pl-11 pr-4 rounded-field border border-ink-200 bg-white text-body text-ink-900 ' +
  'placeholder-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none ' +
  'transition-colors duration-fast'

/** The panel's scroll frame — a MAX, so five trade rows still draw five rows.
 *
 *  24rem is the operative cap on any ordinary screen (measured: 384px of panel
 *  under a 48px field leaves the question and the sub-line on a 390×844 phone
 *  with the page still one screen tall — `scrollHeight` 913 against a 844
 *  viewport, against ~2000px when the catalogue was printed). The `58vh` half
 *  only takes over below a 662px-tall viewport — a landscape phone — where a
 *  fixed 384px box would be most of the window. */
const PANEL_SCROLL = 'max-h-[min(58vh,24rem)] overflow-y-auto overscroll-contain'

const PANEL_ID = 'what-panel'

/**
 * The browse list a door offers, narrowed to one provider's own topics.
 *
 * Module scope so the initial „which fold is open" state and the render's memo
 * read the SAME list — computing it twice in two places is how a panel opens on
 * a group that is not there.
 */
/** One sphere, as the intake draws it: the name, the measured floor, and the
 *  photograph the home page already prints for it. Resolved on the server —
 *  `priceFrom` is a query, not a constant. */
export type CatTile = { slug: string; name: string; priceFrom: number | null }

/** Every topic filed under a sphere. `Topic.categorySlug` is the ONE place the
 *  two vocabularies touch (lib/requestTopics), so this is a read of that field
 *  and not a second table to keep in step. Built once at module load. */
const TOPICS_BY_CATEGORY: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}
  for (const g of TOPIC_GROUPS) {
    for (const t of g.topics) {
      if (t.categorySlug) (out[t.categorySlug] ??= []).push(t.id)
    }
  }
  return out
})()

/** Which fold to open for a sphere: the one holding the MOST of its topics.
 *
 *  ⚠️ IT WAS `gs[0]` AND THAT WAS WRONG (2026-09-04). A sphere's topics are
 *  spread across the browse groups — „law" has eight and they do not all live
 *  together — so the FIRST narrowed group can be the one holding a single
 *  entry. Measured on /request?category=law: one topic on screen where the
 *  tile tap showed seven. Opening the biggest is what „show me this sphere"
 *  means, and it makes the URL and the tile agree. */
function bestGroupFor(vertical: Vertical, only: Set<string>): string | null {
  const gs = narrowedGroups(vertical, only)
  if (gs.length === 0) return null
  return gs.reduce((a, b) => (b.topics.length > a.topics.length ? b : a)).id
}

function narrowedGroups(vertical: Vertical, only: Set<string>): TopicGroup[] {
  const all = browseGroupsFor(vertical)
  if (!only.size) return all
  // Rebuilt rather than filtered in place: a group is its topics, and a heading
  // over an empty fold is a row that opens onto nothing.
  return all
    .map(g => ({ ...g, topics: g.topics.filter(t => only.has(t.id)) }))
    .filter(g => g.topics.length > 0)
}

export function StepWhat({ draft, onPick, onPickKind, onFreeText, onClearTopic, initialQuery = '', vertical, onlyTopics = [], narrowed = false, tiles = [], initialCategory = '' }: {
  draft: Draft
  /** ⚠️ WHICH DOOR THEY CAME THROUGH — and it is the only thing that decides
   *  what this screen offers (owner, 2026-08-18, approving „ა": the door picks
   *  the world and the wizard never asks again).
   *
   *  Before this the accordion drew every browsable group in one list, so
   *  „სასკოლო საგნები" sat three rows above „სანტექნიკა" and somebody with
   *  water on their kitchen floor was shown school subjects. Two products, one
   *  undifferentiated list — the exact mixing the owner named („კატეგორიები
   *  კარგად უნდა გაიმიჯნოს, რომ არ აირიოს").
   *
   *  It narrows this SCREEN. It changes nothing that is stored: the draft, the
   *  row and the queue are one system, deliberately. */
  vertical: Vertical
  onPick: (topicId: string) => void
  /** ⚠️ THE SECOND HALF OF THIS SCREEN (2026-08-18). „აირჩიე ტიპი" used to be a
   *  page of its own, asked immediately after the question it depends on — so
   *  somebody who tapped „ხელშეკრულება" pressed Next only to be asked what they
   *  meant by it. The kinds now appear under the chosen topic, in place, and
   *  only when the topic is genuinely ambiguous. */
  onPickKind: (kind: RequestKindName) => void
  /** They typed something the catalogue cannot name. Their sentence becomes the
   *  description and the topic becomes „სხვა" — see the no-match branch. */
  onFreeText: (text: string) => void
  /** Undo the topic tap and go back to searching/browsing. The kind question
   *  REPLACES the browse list (see the `awaitingKind` branch), so this is the
   *  only way out of it — and on step one the wizard draws no „უკან". */
  onClearTopic: () => void
  /** Handed over from the home band's own field — see app/request/page for why
   *  it seeds the search and deliberately does NOT pick a topic. */
  initialQuery?: string
  /**
   * ⚠️ THE PROVIDER'S OWN TOPICS, when the visitor arrived from their profile
   * (`?to=` — 2026-08-19). Somebody standing on an electrician's page has
   * already narrowed the world by tapping that electrician; offering them 31
   * groups afterwards asks them to find the answer they just gave.
   *
   * It narrows the BROWSE list and the search hits, and it opens the panel — a
   * folded catalogue of three rows is a catalogue nobody needs folding.
   *
   * ⚠️ „სხვა" STAYS, AND SO DOES THE FREE-TEXT ESCAPE. A person can want
   * something this provider does not list, and the honest answer is a request
   * that reaches somebody else — not a screen with no way out. Empty array =
   * no provider, and this screen is exactly what it was.
   */
  onlyTopics?: string[]
  /** The spheres, drawn under the field. Server-resolved (app/request/page):
   *  VISIBLE, populated, busiest first — the home page's own rule, so a tile
   *  can never open onto „ვერ ვიპოვეთ". Empty = draw none, which is what every
   *  caller other than the intake wants. */
  tiles?: CatTile[]
  /** A sphere the visitor named on the home band (`?category=`), validated in
   *  app/request/page. It seeds the same filter a tile tap sets — the panel
   *  opens on that sphere's topics — and empty changes nothing. */
  initialCategory?: string
  /**
   * ⚠️ WAS THE LIST NARROWED TO A PERSON THE CLIENT ALREADY CHOSE?
   *
   * This exists because `onlyTopics` stopped being able to answer that on
   * 2026-08-30, and nothing noticed for three days. The prop used to carry one
   * thing — a `?to=` provider's own trades — so „it is non-empty" and „a
   * provider was chosen" were the same fact, and the panel opened itself on the
   * strength of it. Then `covered` (every topic with a live provider, the whole
   * roster's) began arriving through the SAME prop, and `covered` is never
   * empty — so the browse panel opened on arrival for every visitor to
   * /request.
   *
   * That is precisely the screen the owner removed on 2026-08-19, holding a
   * screenshot of it: „როცა ჩათს მოსაძებნად დაჭერ, მაშინ იშლებოდეს ქვევით…
   * და არა ესე ჩამოწერილი." The field asks for a sentence; a wall of folded
   * groups under it asks the visitor to browse instead, and the loud invitation
   * was the wrong one again.
   */
  narrowed?: boolean
}) {
  // Seeded, not controlled: after the first paint this field belongs entirely
  // to the person typing in it. A `useEffect` syncing it back to the prop would
  // fight them on every keystroke of a client-side navigation.
  const [q, setQ] = useState(initialQuery)
  /**
   * Is the catalogue out?
   *
   * ⚠️ OPENED BY THE TAP, NEVER BY THE FOCUS. The `pointer: fine` effect below
   * focuses this field on arrival so a mouse user can type immediately — if
   * focus also opened the panel, every desktop visitor would land on exactly
   * the printed catalogue this revision removed, and the change would be a
   * phone-only change. So the openers are the deliberate ones: a tap on the
   * field, the first character typed, ArrowDown, and the browse line.
   *
   * Seeded open when the home band handed over a real query, because then the
   * hits ARE the answer to a question already asked — and when the list was
   * narrowed to a provider the client already picked, because then it is short
   * and it IS the question. Never on `onlyTopics` alone: see `narrowed` above
   * for the three days that condition was silently true for everybody.
   */
  const [open, setOpen] = useState(initialQuery.trim().length >= 2 || narrowed || !!initialCategory)
  // Opened on the ONE group a narrowed list usually has — with the catalogue
  // already down to this provider's own trades, a fold to press is ceremony.
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    /* Arriving with a sphere named opens its fold, for the reason a tile tap
       does: a closed heading repeating the word just tapped trades one tap for
       another. */
    if (initialCategory) {
      return bestGroupFor(vertical, new Set(TOPICS_BY_CATEGORY[initialCategory] ?? []))
    }
    if (!narrowed) return null
    const gs = narrowedGroups(vertical, new Set(onlyTopics))
    return gs.length === 1 ? gs[0].id : null
  })
  // Keyboard focus within the hit list. -1 = nothing chosen; Enter then takes
  // the FIRST hit, because a person who typed „ქიმია" and hit Enter meant the
  // obvious thing and making them arrow down to say so is ceremony.
  const [activeIx, setActiveIx] = useState(-1)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  /** ⚠️ THE SPHERE THE VISITOR TAPPED, and it is a FILTER on this screen, not
   *  an answer stored anywhere. The draft has no category field: the sphere is
   *  DERIVED from the chosen topic server-side (lib/requests → serviceRequestRow
   *  reads `categorySlugOfTopic`), which is why tapping a tile narrows the list
   *  and still leaves the person to name the actual thing they need. */
  const [catSlug, setCatSlug] = useState<string | null>(initialCategory || null)

  /** The narrowing, as a set — empty means „no narrowing", never „nothing".
   *
   *  ⚠️ TWO NARROWINGS, AND THEY INTERSECT. `onlyTopics` is „this provider's
   *  trades" and comes from outside; `catSlug` is „this sphere" and is chosen
   *  here. Somebody who arrived from an accountant's profile AND tapped
   *  „სამართალი" must be shown what that person does under law, not everything
   *  under law — so the tile can only ever narrow further, never widen. */
  const only = useMemo(() => {
    const base = new Set(onlyTopics)
    if (!catSlug) return base
    const inCat = TOPICS_BY_CATEGORY[catSlug] ?? []
    return base.size ? new Set(inCat.filter(id => base.has(id))) : new Set(inCat)
  }, [onlyTopics, catSlug])
  const hits = useMemo(() => {
    const all = searchAllTopics(q)
    return only.size ? all.filter(h => only.has(h.topic.id)) : all
  }, [q, only])
  /** The kinds this topic honestly carries. One (or none) means the topic
   *  answered the question by itself and nothing is drawn. */
  const ambiguous = useMemo(
    () => (draft.topic ? kindsOfTopic(draft.topic) : []),
    [draft.topic],
  )
  const searching = q.trim().length >= 2

  // ⚠️ THE DOOR'S OWN WORDS AND THE DOOR'S OWN LIST. One question that fits
  // both verticals fits neither: „რა გჭირდება?" is what you ask somebody who is
  // shopping, and a person with water on their kitchen floor is not shopping.
  const copy = VERTICAL_COPY[vertical]
  const groups = useMemo(() => narrowedGroups(vertical, only), [vertical, only])

  // ⚠️ FOCUS ONLY WHERE FOCUS IS FREE. A static `autoFocus` opened the phone
  // keyboard on arrival — and the keyboard covers the bottom half of the
  // screen, i.e. exactly the examples and the fold headings that exist to show
  // somebody who does not yet know what to type WHAT THERE IS TO TYPE. On a
  // mouse, focus costs nothing and saves a click; `pointer: fine` is the query
  // that separates the two, not a user-agent string.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus()
  }, [])

  // A tap anywhere else closes it. `pointerdown` and not `click`: a click that
  // starts inside the panel and ends outside (a flicked scroll on a phone) is
  // not a dismissal, and `pointerdown` on the panel simply never fires this.
  // The listener only exists while the panel does.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const onSearchKey = (e: React.KeyboardEvent) => {
    // Escape folds the catalogue back up and leaves the caret where it is.
    // `preventDefault` because on a `type="search"` field WebKit's own Escape
    // ALSO empties the box — so one press would undo both the panel and the
    // sentence, and only one of those was asked for.
    if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      setActiveIx(-1)
      return
    }
    // Down from a closed field is the keyboard's version of the tap.
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!searching || hits.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown'
        ? Math.min(activeIx + 1, hits.length - 1)
        : Math.max(activeIx - 1, 0)
      setActiveIx(next)
      // Keep the highlighted row on screen without yanking the page.
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onPick(hits[Math.max(0, activeIx)].topic.id)
    }
  }

  // Enter on a query that matched NOTHING carries the sentence forward, rather
  // than doing nothing — the keyboard path to the same button the no-match
  // branch draws. `onSearchKey` returns early when there are no hits, so this
  // is a separate handler and not a branch inside it.
  const onNoMatchKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !searching || hits.length > 0) return
    e.preventDefault()
    onFreeText(q.trim())
  }

  /**
   * The topic is chosen and it carries more than one kind — so the screen's
   * live question is no longer „რა გჭირდება" but „რა სახის დახმარება", and the
   * browse list has nothing left to say.
   *
   * ⚠️ IT REPLACES THE LIST RATHER THAN SITTING UNDER IT (2026-08-18, second
   * pass). Measured on the live page at 1440×900: the „ხელშეკრულება" chip is at
   * y=302 and the question it raises rendered at y=2078 — 1776px below the tap,
   * on a 900px viewport, with 31 accordion rows in between. So the tap looked
   * like it did NOTHING: a chip changed colour, the progress bar moved 2%, and
   * the question was two and a half screens away. On a phone it is worse.
   *
   * Splitting the kinds back onto their own screen was the other way out and it
   * is the one this file already rejected — the two halves of one decision
   * belong on one page. They still are. What is gone is the two thousand pixels
   * between them.
   */
  const awaitingKind = draft.topic !== '' && ambiguous.length > 1

  if (awaitingKind) {
    return (
      <div>
        {/* The answer so far, in the transcript's OWN language — the same quiet
            underlined chip _transcript draws for every later screen, so the
            record reads as one thing whether it is on step one or step five.
            It is also the only way back: the wizard draws no „უკან" on step
            one, because until this moment there was nothing to go back to. */}
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={onClearTopic}
            aria-label={`შეცვლა: ${topicLabel(draft.topic)}`}
            className="text-meta text-ink-600 hover:text-ink-900 underline decoration-ink-200 hover:decoration-ink-400 underline-offset-4 transition-colors duration-fast"
          >
            {topicLabel(draft.topic)}
          </button>
        </div>

        <h2 className="font-display text-h3 font-bold text-ink-900">რა სახის დახმარება?</h2>
        <div className="mt-3">
          <StepPick
            options={ambiguous.map(k => ({ id: k, label: KIND[k].label, hint: KIND[k].hint }))}
            value={draft.kind}
            onPick={id => onPickKind(id as RequestKindName)}
          />
        </div>
      </div>
    )
  }

  return (
    <div ref={boxRef}>
      <div className="relative">
        <Icon.search className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          // The tap IS the opener — see `open` above for why focus is not.
          onPointerDown={() => setOpen(true)}
          onChange={e => { setQ(e.target.value); setActiveIx(-1); setOpen(true) }}
          onKeyDown={e => { onSearchKey(e); onNoMatchKey(e) }}
          role="combobox"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          aria-autocomplete="list"
          aria-activedescendant={open && searching && activeIx >= 0 ? `${PANEL_ID}-hit-${activeIx}` : undefined}
          className={INPUT}
          placeholder={copy.placeholder}
        />
      </div>

      {!open && (
        // ⚠️ THE ONE THING LEFT UNDER THE FIELD, and it is a sentence, not a
        // list. „I opened a search box and do not know what to type" is a real
        // state — it is what the (retired) six example chips and the printed
        // accordion were both answering. It is answered here by the
        // placeholder's real example plus this line: the browse path is named,
        // so nobody has to guess that tapping the field reveals one, and it
        // costs one row instead of thirty-one.
        //
        // ⚠️ AND IT WAS REPLACED BY AN INLINE CATEGORY LIST FOR ONE AFTERNOON
        // (2026-09-02, reverted the same day). The void under this line was
        // real — ~350px on the first screen of the intake — and the fix tried
        // was the control /join and /work/profile had just settled on: the
        // categories, on the page, chosen rather than disclosed. First as a
        // scrolling strip („ეს გადასქროლი უფრო არაკომფორტული იქნება ვფიქრობ" —
        // correct, seven items fit and a strip hides them), then wrapped. The
        // owner did not want either: „არა, არ მომწონს, დააბრუნე როგორც იყო."
        //
        // So the line stands, and what it is defending is worth writing down
        // rather than rediscovering: this screen's job is to get ONE sentence
        // typed. A grid of categories under the field is a second question
        // competing with the first, and the first is the one that produces a
        // request somebody can actually route. The empty space below is the
        // cost of that focus, not an oversight.
        <button
          type="button"
          onClick={() => { setOpen(true); inputRef.current?.focus() }}
          /* ⚠️ `min-h-10` AND `-ml-1 px-1` — THE TAP TARGET, NOT THE TYPE
             (2026-09-02, found by measuring the intake on a phone). The line
             is `text-meta` and sat 17px tall: a control the whole browse path
             hangs off, under half the 40px floor CLAUDE.md rule 3 sets, on the
             one screen a client cannot skip. The height is added to the BOX and
             not to the text — the underline still hugs the words, so nothing
             about how it reads changes. `-ml-1 px-1` widens the same way while
             keeping the text optically flush with the field above it. */
          className="mt-3 -ml-1 inline-flex min-h-10 items-center gap-1.5 px-1 text-meta text-ink-600 hover:text-ink-900 underline decoration-ink-200 hover:decoration-ink-400 underline-offset-4 transition-colors duration-fast"
        >
          ან აირჩიე ყველა კატეგორიიდან
          <Icon.chevD aria-hidden className="w-3.5 h-3.5" />
        </button>
      )}

      {/* ── THE SPHERES, ON THE PAGE ────────────────────────────────────────
          ⚠️ THIS IS THE SECOND TIME, AND THE FIRST TIME THE OWNER SENT IT BACK
          (2026-09-04). On 2026-09-02 the void under the field — ~350px on the
          first screen of the intake — was filled with the categories as a
          scrolling strip and then as a wrapped list, and both were rejected
          the same day: „არა, არ მომწონს, დააბრუნე როგორც იყო." The note that
          replaced them argued that a grid under the field is a second question
          competing with the first, and that the empty space is the cost of
          focus rather than an oversight.

          What changed is not the argument, it is the material. Those attempts
          drew NAMES; this draws the plates the home page already prints —
          photograph, sphere mark and the measured `priceFrom` — which is the
          control /join and /work/profile settled on and the shape every
          reference product in this category uses under its search
          (servisebi.ge, Airtasker, Fiverr). The owner reviewed it on a draft
          route first („რაიმე ცარიელ გვერდზე ჯერ"), cut two other blocks that
          were drawn beside it, and asked for this one on the real screen.

          ⚠️ A TILE NARROWS, IT DOES NOT ANSWER. The draft has no category
          field — the sphere is derived from the topic server-side — so a tap
          opens the panel filtered to that sphere and the person still names
          the thing they need. Six taps become two, and nothing is stored that
          the wizard would then have to keep in step. */}
      {!open && !searching && tiles.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map(c => {
            const photo = categoryPhoto(c.slug)
            return (
              <li key={c.slug}>
                <button
                  type="button"
                  /* ⚠️ THE FOLD OPENS WITH IT, and without this line the tile
                     saved nothing: tapping „სამართალი" filtered the panel and
                     then showed a CLOSED group heading called „სამართალი", so
                     the visitor traded one tap for another and read the same
                     word twice. The groups are computed here rather than read
                     from `groups`, which still holds the previous render's
                     narrowing at this moment — the stale-closure lesson this
                     wizard has already paid for once. Opening the first is
                     right even when a sphere spans several: the person named
                     the sphere, so its topics are what they came to see. */
                  onClick={() => {
                    setCatSlug(c.slug)
                    setOpen(true)
                    const inCat = TOPICS_BY_CATEGORY[c.slug] ?? []
                    const base = new Set(onlyTopics)
                    const next = base.size ? new Set(inCat.filter(id => base.has(id))) : new Set(inCat)
                    setOpenGroup(bestGroupFor(vertical, next))
                  }}
                  /* ⚠️ ONE HUE, NOT EIGHT (2026-09-04). These plates were drawn
                     with `tileHue(i)` — the home page's eight-hue OKLCH family
                     — and the owner, holding the six of them: „ეს ერთი ბრენდის
                     ფერი ხომ არი, ყოს, ძალიან ჭრელია."
                     The palette itself is good and it stays where it belongs.
                     What it could not justify HERE is that the hue carries
                     nothing: `TILE_HUES`'s own note says it is „ASSIGNED BY
                     POSITION, NOT BY SLUG… Position is honest about being
                     arbitrary". Six arbitrary colours on the first screen of
                     the funnel is decoration, and CLAUDE.md's design line is
                     two colours — brand green and the ink ramp.
                     So the plate is one green for all six, and the rest of the
                     colour comes from the PHOTOGRAPHS — which is what every
                     reference product in this category does anyway.

                     ⚠️ `brand-100` AND NOT `brand-50`, and that is measured.
                     The first version used the ramp's lightest step and the
                     owner's answer was „ჩვენი მწვანე რომ გამოვიყენოთ ჯობია" —
                     correct, because #ECF7F3 against this page's #FBF9F5 ground
                     measures 1.04, and the eye needs about 1.10 to see a
                     surface at all. It was our green in the token and white on
                     the screen. `brand-100` measures 1.18 against the ground
                     and still carries ink-900 at 15.53 and the price line at
                     7.77 — so it reads as green and costs nothing. */
                  className="group flex h-full w-full flex-col overflow-hidden rounded-card border border-brand-200 bg-brand-100 text-left text-ink-900 transition-[transform,box-shadow] duration-mid ease-out-quart hover:shadow-card-hover motion-safe:hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  <span className="relative block h-[84px] overflow-hidden bg-white/40">
                    {photo && (
                      <>
                        {/* Decorative: the name is right under it. */}
                        <Image src={photo} alt="" aria-hidden fill sizes="(min-width:640px) 200px, 45vw" className="object-cover" />
                        {/* One wash at one opacity over every picture is what
                            makes six stock photographs read as a family rather
                            than a collage — the home page's own reasoning, with
                            the family's colour now fixed. */}
                        <span aria-hidden className="absolute inset-0 bg-brand-100 opacity-[0.22]" />
                      </>
                    )}
                    <span
                      aria-hidden
                      className="absolute bottom-2 left-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-700 shadow-xs"
                    >
                      {categoryIcon(c.slug, 'w-4 h-4')}
                    </span>
                  </span>
                  <span className="block px-3 pb-3 pt-2.5">
                    <span className="block font-display text-small font-bold leading-snug">{c.name}</span>
                    {typeof c.priceFrom === 'number' && c.priceFrom > 0 && (
                      <span className="mt-0.5 block text-meta tabular-nums text-ink-500">{c.priceFrom}₾-დან</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && (
        <div
          id={PANEL_ID}
          className="mt-3 rounded-card border border-ink-200 bg-white overflow-hidden shadow-pop motion-safe:animate-fade-in-fast"
        >
          {searching ? (
            hits.length > 0 ? (
              // Search hits are ROWS, not chips: labels legitimately repeat
              // across directions („ბუღალტერია" is a subject to learn AND a
              // service to hire), so every hit carries its category — the
              // context a bare chip cannot show.
              <div
                ref={listRef}
                role="listbox"
                aria-label="ნაპოვნი კატეგორიები"
                className={`${PANEL_SCROLL} divide-y divide-ink-100`}
              >
                {hits.map((h, i) => (
                  <button
                    key={`${h.group.id}:${h.topic.id}`}
                    id={`${PANEL_ID}-hit-${i}`}
                    role="option"
                    type="button"
                    onClick={() => onPick(h.topic.id)}
                    onMouseEnter={() => setActiveIx(i)}
                    aria-selected={i === activeIx}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-[background-color,transform] duration-fast motion-safe:active:scale-[0.99] ${
                      i === activeIx ? 'bg-ink-50' : 'hover:bg-ink-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-body font-semibold text-ink-900 no-caps">{h.topic.label}</span>
                      <span className="block text-meta text-ink-500">{h.group.label}</span>
                    </span>
                    <Icon.chevR className="w-4 h-4 text-ink-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              // ⚠️ NO MATCH IS NOT A DEAD END, AND IT USED TO BE ONE. This
              // branch said „ზუსტად ეს ვერ ვიპოვეთ — აირჩიე „სხვა" და აღწერაში
              // დაწერე" and offered a chip. Owner, 2026-08-17, having typed the
              // most ordinary sentence there is — „მჭირდება სახლის დალაგება":
              // the catalogue has no cleaning topic, so a real person with a
              // real job and money to spend was told to go and file it
              // themselves.
              //
              // That is our filing problem handed to the visitor, which is the
              // one thing the header of this file says the whole screen was
              // rebuilt to stop doing.
              //
              // ⚠️ THEIR SENTENCE IS THE REQUEST NOW. The button carries the
              // words they typed, sends them on as the description, and files
              // the topic as „სხვა" — which is TRUE, not a fudge: it is a
              // request this catalogue cannot name, and an operator phones
              // every request anyway. Nobody is asked to translate their need
              // into our vocabulary.
              //
              // What we lose is the sphere, so it routes to everyone rather
              // than to a filed expert — the same honest outcome a school
              // subject already gets. What we gain is the request.
              <div className="p-4">
                <p className="text-body text-ink-700">ამ სახელით ვერ ვიპოვეთ — მაგრამ მაინც მოგვწერე.</p>
                <button
                  type="button"
                  onClick={() => onFreeText(q.trim())}
                  className="mt-3 w-full text-left rounded-card border border-brand-600 bg-brand-50 px-5 py-4 flex items-center gap-4 transition-[background-color,transform] duration-fast motion-safe:active:scale-[0.99] hover:bg-brand-100"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-body font-semibold text-ink-900 break-words no-caps">
                      {/* The closer is a plain ASCII quote, as everywhere else on the
                          site — wrapped in an expression only because a bare one in
                          JSX TEXT trips react/no-unescaped-entities. Same glyph,
                          same copy; nothing the owner wrote has changed. */}
                      „{q.trim()}{'"'}
                    </span>
                    <span className="block text-small text-ink-600 mt-0.5">გავაგრძელოთ ამით</span>
                  </span>
                  <Icon.chevR aria-hidden className="w-4 h-4 text-brand-600 shrink-0" />
                </button>
              </div>
            )
          ) : (
            /* ⚠️ THE SCROLL AREA HOLDS THE GROUPS AND NOTHING ELSE
               (2026-08-31). „სხვა" used to sit INSIDE it, and measured live on
               /request at both 500px and 1440px the panel's max-height landed
               part-way through that chip — the escape hatch for somebody whose
               job is in none of the eight groups was a half-visible pill you
               had to scroll a nested list to reach. It is pinned under the
               scroll area now: always on screen, still last, still after
               everything it is a resort from. */
            <>
            {/* ⚠️ THE WAY BACK OUT OF A SPHERE (2026-09-04). Tapping a tile
                filters this panel to one sphere, and without this row that
                filter is a trap: „სამართალი" hides the other five and nothing
                on screen says why the list got short or how to widen it. The
                row names the filter and undoes it in one tap — and it is drawn
                only when a tile put it there, so the ordinary browse panel is
                untouched. */}
            {catSlug && (
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-2.5">
                <p className="min-w-0 truncate text-meta text-ink-600">
                  {tiles.find(t => t.slug === catSlug)?.name ?? 'კატეგორია'}
                </p>
                <button
                  type="button"
                  onClick={() => setCatSlug(null)}
                  className="-my-2 shrink-0 py-2 text-meta font-display font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 transition-colors duration-fast hover:decoration-brand-400"
                >
                  ყველა კატეგორია
                </button>
              </div>
            )}
            <div className={PANEL_SCROLL}>
              {/* ⚠️ BROWSABLE, NOT ALL (2026-08-18). Four of the eight service
                  groups are closed at launch — see requestTopics →
                  LIVE_SERVICE_GROUP_IDS. `searchAllTopics` above still searches
                  the full catalogue on purpose: somebody who TYPES „გადაზიდვა"
                  gets filed correctly and reaches the admin queue, which is a
                  better outcome than OTHER and is also the only measurement we
                  will have of which group to open next. */}
              <div className="divide-y divide-ink-100">
                {groups.map(g => {
                  // `expanded`, not `open` — the panel's own `open` is in
                  // scope here and shadowing it inside the list it draws is how
                  // a later edit ends up toggling the wrong thing.
                  const expanded = openGroup === g.id
                  return (
                    <div key={g.id}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpenGroup(expanded ? null : g.id)}
                        className={`w-full text-left px-4 h-12 flex items-center gap-3 transition-colors duration-fast ${
                          // The open row keeps a tint while its children are
                          // out, so the parent of the indented list is legible
                          // as their parent rather than as one more row.
                          expanded ? 'bg-brand-50' : 'hover:bg-ink-50'
                        }`}
                      >
                        {/* ⚠️ THE ICON COLUMN (2026-09-02). Owner, from a
                            competitor's category list: „ესე დავამატოთ აიქონები
                            შესაბამისი კატეგორიის." Thirty-one Georgian phrases
                            in a column gave somebody who does not know our
                            vocabulary nothing to aim at.
                            `topicGroupMark` returns null for a group it has no
                            honest mark for, and then the row simply has none —
                            see the note there for why that is better than a
                            default drawing. The 20px box is reserved either
                            way, so the labels stay on one left edge. */}
                        {/* ⚠️ BRAND, NOT INK (2026-09-02, owner: „ცოტა ბრენდის
                            ფერში ხომ არ შევალამაზოთ"). `brand-600` is a
                            STROKE on white here, not a filled surface, so
                            CLAUDE.md rule 2's „fills start at 600" is not what
                            governs it — what governs it is that a meaningful
                            graphic needs 3:1 against its background, and 600
                            clears that with room. The open row goes a shade
                            darker so the parent of the indented list reads as
                            the one you are inside. */}
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                          expanded ? 'text-brand-800' : 'text-brand-600'
                        }`}>
                          {topicGroupMark(g.id)}
                        </span>
                        {/* `no-caps` — see _stepPick. The accordion headings are
                            buttons, so the „case" feature shouted every group
                            name. */}
                        <span className="min-w-0 flex-1 font-display text-body font-semibold text-ink-900 truncate no-caps">
                          {g.label}
                        </span>
                        {/* ⚠️ NOT SHOWN ON THE TRADES DOOR (2026-08-18). This
                            tag existed to tell a browser „this is learning
                            territory" while learning, consultation and trades
                            shared one list. On a list that is entirely one
                            vertical it repeats the heading above it on every
                            single row — noise where it used to be orientation.
                            It still earns its place on the expert door, where a
                            group may be learning or consultation and the
                            difference changes what you get. */}
                        {vertical === 'EXPERT' && g.kinds.length === 1 && (
                          <span className="text-meta text-ink-400 shrink-0">{KIND[g.kinds[0]].label}</span>
                        )}
                        <Icon.chevD
                          className={`w-4 h-4 text-ink-400 shrink-0 transition-transform duration-fast ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {/* ⚠️ INDENTED ROWS, NOT A BAG OF CHIPS (2026-09-02, from
                          the same screenshot). The children were wrapping pills
                          under the heading, which reads as a separate cluster
                          that happens to sit below it; the reference stacks
                          them as ROWS, indented past the parent's icon, so the
                          hierarchy is visible in the left edge alone.
                          They carry the PARENT's mark, greyed — which is what
                          the reference does and is right here for the opposite
                          of its reason: a topic has no mark of its own, and
                          repeating the family's says „still inside სამართალი"
                          rather than pretending to name the topic.
                          `pl-12` = the row's `px-4` plus the 20px icon plus its
                          12px gap: the labels land exactly under the parent's
                          label. */}
                      {expanded && (
                        <div className="pb-2 motion-safe:animate-fade-in-fast">
                          {g.topics.map(t => {
                            const on = draft.topic === t.id
                            return (
                              <button
                                key={t.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => onPick(t.id)}
                                className={`w-full min-h-11 pl-12 pr-4 flex items-center gap-3 text-left transition-colors duration-fast ${
                                  on ? 'bg-brand-50' : 'hover:bg-ink-50'
                                }`}
                              >
                                {/* The family's mark, quieter — `brand-400`, not
                                    the `ink-300` it was: at ink the column
                                    read as disabled rather than as secondary.
                                    It repeats on purpose (see the note above);
                                    what keeps it from competing with the parent
                                    is the shade and the indent, not a different
                                    drawing. */}
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-brand-400">
                                  {topicGroupMark(g.id, 'w-4 h-4')}
                                </span>
                                <span className={`min-w-0 flex-1 font-display text-body no-caps ${
                                  on ? 'font-semibold text-brand-900' : 'text-ink-800'
                                }`}>
                                  {t.label}
                                </span>
                                {on && <Icon.check aria-hidden className="h-4 w-4 shrink-0 text-brand-700" />}
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

              {/* „სხვა" closes the list, as it always has: it is the last
                  resort, so it sits after everything it is a resort from — and
                  OUTSIDE the scroll, so the list can never bury it. */}
              <div className="px-4 py-4 border-t border-ink-100 bg-white">
                <Chip t={OTHER_TOPIC} on={draft.topic === OTHER_TOPIC.id} onPick={onPick} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ⚠️ `StepKindPick` LIVED HERE AND IS GONE (2026-08-17). It was a four-line
   wrapper that mapped `kindsOfTopic(topic)` to StepPick rows — and when the
   number keys arrived, RequestWizard had to build that same mapping again so
   the keyboard and the screen could share one list. Two copies of one mapping
   is the drift this file has been bitten by before, so the wrapper went and the
   wizard's `options` is the single source. The kind screen renders through the
   same StepPick every other tap screen does.

   What it taught, kept: that screen used to draw its OWN row — `p-6` instead of
   `py-4`, `text-h3` instead of `text-body`, and a chevron nobody else had. One
   wizard, two row designs, for the same shape of question. Do not reintroduce
   either. */
