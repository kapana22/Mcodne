'use client'
// Step 1 — „რა გჭირდება?". One search box; categories unfold under it.
//
// THE THUMBTACK/PROFI ENTRY, adopted deliberately (owner, 2026-08-14:
// „ჩასაწერი უნდა იყოს და მერე კატეგორიები უნდა იშლებოდეს"): the person types
// what they need IN THEIR OWN WORDS and the system does the classifying. The
// previous revision opened on three abstract cards — asking somebody to file
// their problem under our taxonomy before they had even named it, which is our
// filing problem exported to the visitor.
//
// TWO ROADS, ONE TAP. Typing searches every direction at once (the stemmer
// handles Georgian declension, so „ქიმიის" finds ქიმია); a person who does not
// know the word browses the folded categories instead — recognition over
// recall, both ending on the same topic tap. The tap advances; the kind is
// derived from the topic and asked about ONLY when genuinely ambiguous
// (see _model → withTopic / stepVisible).
//
// THE CATEGORIES ARE AN ACCORDION, not a chip wall. 132 topics rendered flat
// was two screens of pills on a phone — scanning them was the machine's job
// pushed onto the reader. Folded groups show 23 recognisable headings; one tap
// opens the one that matches. One group open at a time: the accordion is a
// table of contents, and a table of contents with three chapters open is a
// wall again.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  TOPIC_GROUPS, searchAllTopics, OTHER_TOPIC, KIND, kindsOfTopic,
  SUGGESTED_TOPICS,
  type Topic, type TopicGroup, type RequestKindName,
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

export function StepWhat({ draft, onPick, onPickKind, onFreeText, initialQuery = '' }: {
  draft: Draft
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
  /** Handed over from the home band's own field — see app/request/page for why
   *  it seeds the search and deliberately does NOT pick a topic. */
  initialQuery?: string
}) {
  // Seeded, not controlled: after the first paint this field belongs entirely
  // to the person typing in it. A `useEffect` syncing it back to the prop would
  // fight them on every keystroke of a client-side navigation.
  const [q, setQ] = useState(initialQuery)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  // Keyboard focus within the hit list. -1 = nothing chosen; Enter then takes
  // the FIRST hit, because a person who typed „ქიმია" and hit Enter meant the
  // obvious thing and making them arrow down to say so is ceremony.
  const [activeIx, setActiveIx] = useState(-1)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hits = useMemo(() => searchAllTopics(q), [q])
  /** The kinds this topic honestly carries. One (or none) means the topic
   *  answered the question by itself and nothing is drawn. */
  const ambiguous = useMemo(
    () => (draft.topic ? kindsOfTopic(draft.topic) : []),
    [draft.topic],
  )
  const searching = q.trim().length >= 2

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

  const onSearchKey = (e: React.KeyboardEvent) => {
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

  return (
    <div>
      <div className="relative">
        <Icon.search className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={e => { setQ(e.target.value); setActiveIx(-1) }}
          onKeyDown={e => { onSearchKey(e); onNoMatchKey(e) }}
          role="combobox"
          aria-expanded={searching && hits.length > 0}
          aria-autocomplete="list"
          className={INPUT}
          placeholder="მაგ. ქიმია, ინგლისური, ხელშეკრულება, ლოგო…"
        />
      </div>

      {searching ? (
        hits.length > 0 ? (
          // Search hits are ROWS, not chips: labels legitimately repeat across
          // directions („ბუღალტერია" is a subject to learn AND a service to
          // hire), so every hit carries its category — the context a bare chip
          // cannot show.
          <div ref={listRef} className="mt-5 rounded-card border border-ink-200 bg-white divide-y divide-ink-100 overflow-hidden">
            {hits.map((h, i) => (
              <button
                key={`${h.group.id}:${h.topic.id}`}
                type="button"
                onClick={() => onPick(h.topic.id)}
                onMouseEnter={() => setActiveIx(i)}
                aria-selected={i === activeIx}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-[background-color,transform] duration-fast motion-safe:active:scale-[0.99] ${
                  i === activeIx ? 'bg-ink-50' : 'hover:bg-ink-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-body font-semibold text-ink-900">{h.topic.label}</span>
                  <span className="block text-meta text-ink-500">{h.group.label}</span>
                </span>
                <Icon.chevR className="w-4 h-4 text-ink-300 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          // ⚠️ NO MATCH IS NOT A DEAD END, AND IT USED TO BE ONE. This branch
          // said „ზუსტად ეს ვერ ვიპოვეთ — აირჩიე „სხვა" და აღწერაში დაწერე"
          // and offered a chip. Owner, 2026-08-17, having typed the most
          // ordinary sentence there is — „მჭირდება სახლის დალაგება": the
          // catalogue has no cleaning topic, so a real person with a real job
          // and money to spend was told to go and file it themselves.
          //
          // That is our filing problem handed to the visitor, which is the one
          // thing the header of this file says the whole screen was rebuilt to
          // stop doing.
          //
          // ⚠️ THEIR SENTENCE IS THE REQUEST NOW. The button carries the words
          // they typed, sends them on as the description, and files the topic
          // as „სხვა" — which is TRUE, not a fudge: it is a request this
          // catalogue cannot name, and an operator phones every request anyway.
          // Nobody is asked to translate their need into our vocabulary.
          //
          // What we lose is the sphere, so it routes to everyone rather than to
          // a filed expert — the same honest outcome a school subject already
          // gets. What we gain is the request.
          <div className="mt-5">
            <p className="text-body text-ink-700">ამ სახელით ვერ ვიპოვეთ — მაგრამ მაინც მოგვწერე.</p>
            <button
              type="button"
              onClick={() => onFreeText(q.trim())}
              className="mt-3 w-full text-left rounded-card border border-brand-600 bg-brand-50 px-5 py-4 flex items-center gap-4 transition-[background-color,transform] duration-fast motion-safe:active:scale-[0.99] hover:bg-brand-100"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-display text-body font-semibold text-ink-900 break-words">
                  „{q.trim()}"
                </span>
                <span className="block text-small text-ink-600 mt-0.5">გავაგრძელოთ ამით</span>
              </span>
              <Icon.chevR aria-hidden className="w-4 h-4 text-brand-600 shrink-0" />
            </button>
          </div>
        )
      ) : (
        <div className="mt-6">
          {/* ── Six examples, one tap each ────────────────────────────────
              The blank-start fix. See lib/requestTopics → SUGGESTED_TOPICS for
              why these six and why the label is „მაგალითად" and not a claim
              about what people search for. Above the fold headings, because a
              heading has to be opened before it teaches anything and this row
              does not. */}
          <p className="text-meta text-ink-500">მაგალითად</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_TOPICS.map(t => <Chip key={t.id} t={t} on={draft.topic === t.id} onPick={onPick} />)}
          </div>

          <div className="mt-6 rounded-card border border-ink-200 bg-white divide-y divide-ink-100 overflow-hidden">
            {TOPIC_GROUPS.map(g => {
              const open = openGroup === g.id
              return (
                <div key={g.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenGroup(open ? null : g.id)}
                    className="w-full text-left px-4 h-12 flex items-center gap-3 hover:bg-ink-50 transition-colors duration-fast"
                  >
                    <span className="min-w-0 flex-1 font-display text-body font-semibold text-ink-900 truncate">
                      {g.label}
                    </span>
                    {/* The direction a group belongs to, said once on the header
                        — a browser should know „this is learning territory"
                        before unfolding it. Groups with both kinds say nothing:
                        the disambiguation step will ask, and a two-word hedge
                        here answers nothing. */}
                    {g.kinds.length === 1 && (
                      <span className="text-meta text-ink-400 shrink-0">{KIND[g.kinds[0]].label}</span>
                    )}
                    <Icon.chevD
                      className={`w-4 h-4 text-ink-400 shrink-0 transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2 motion-safe:animate-fade-in-fast">
                      {g.topics.map(t => <Chip key={t.id} t={t} on={draft.topic === t.id} onPick={onPick} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-4">
            <Chip t={OTHER_TOPIC} on={draft.topic === OTHER_TOPIC.id} onPick={onPick} />
          </div>
        </div>
      )}

      {/* ── …and what kind of help, when the topic does not say ─────────────
          Only for a topic that honestly carries more than one — most do not,
          and `withTopic` has already resolved those, so this appears exactly
          where a question exists. It is the same StepPick every other tap
          screen uses; a second row design for one question is the drift the
          note at the bottom of this file was written about. */}
      {ambiguous.length > 1 && (
        <div className="mt-6 motion-safe:animate-slide-in-b">
          <h2 className="font-display text-h3 font-bold text-ink-900">რა სახის დახმარება?</h2>
          <div className="mt-3">
            <StepPick
              options={ambiguous.map(k => ({ id: k, label: KIND[k].label, hint: KIND[k].hint }))}
              value={draft.kind}
              onPick={id => onPickKind(id as RequestKindName)}
            />
          </div>
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
