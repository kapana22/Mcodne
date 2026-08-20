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
  topicLabel,
  type Topic, type TopicGroup, type RequestKindName, type Vertical,
} from '@/lib/requests'
import { StepPick } from './_stepPick'
import type { Draft } from './_model'

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
function narrowedGroups(vertical: Vertical, only: Set<string>): TopicGroup[] {
  const all = browseGroupsFor(vertical)
  if (!only.size) return all
  // Rebuilt rather than filtered in place: a group is its topics, and a heading
  // over an empty fold is a row that opens onto nothing.
  return all
    .map(g => ({ ...g, topics: g.topics.filter(t => only.has(t.id)) }))
    .filter(g => g.topics.length > 0)
}

export function StepWhat({ draft, onPick, onPickKind, onFreeText, onClearTopic, initialQuery = '', vertical, onlyTopics = [] }: {
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
   * hits ARE the answer to a question already asked.
   */
  const [open, setOpen] = useState(initialQuery.trim().length >= 2 || onlyTopics.length > 0)
  // Opened on the ONE group a narrowed list usually has — with the catalogue
  // already down to this provider's own trades, a fold to press is ceremony.
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    if (onlyTopics.length === 0) return null
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
  /** The narrowing, as a set — empty means „no narrowing", never „nothing". */
  const only = useMemo(() => new Set(onlyTopics), [onlyTopics])
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
        <button
          type="button"
          onClick={() => { setOpen(true); inputRef.current?.focus() }}
          className="mt-3 inline-flex items-center gap-1.5 text-meta text-ink-600 hover:text-ink-900 underline decoration-ink-200 hover:decoration-ink-400 underline-offset-4 transition-colors duration-fast"
        >
          ან აირჩიე კატეგორიებიდან
          <Icon.chevD aria-hidden className="w-3.5 h-3.5" />
        </button>
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
                      „{q.trim()}"
                    </span>
                    <span className="block text-small text-ink-600 mt-0.5">გავაგრძელოთ ამით</span>
                  </span>
                  <Icon.chevR aria-hidden className="w-4 h-4 text-brand-600 shrink-0" />
                </button>
              </div>
            )
          ) : (
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
                        className="w-full text-left px-4 h-12 flex items-center gap-3 hover:bg-ink-50 transition-colors duration-fast"
                      >
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
                      {expanded && (
                        <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2 motion-safe:animate-fade-in-fast">
                          {g.topics.map(t => <Chip key={t.id} t={t} on={draft.topic === t.id} onPick={onPick} />)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* „სხვა" closes the list, as it always has: it is the last
                  resort, so it sits after everything it is a resort from —
                  inside the panel now, because the closed screen is the field
                  and nothing else. */}
              <div className="px-4 py-4 border-t border-ink-100">
                <Chip t={OTHER_TOPIC} on={draft.topic === OTHER_TOPIC.id} onPick={onPick} />
              </div>
            </div>
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
