'use client'
import { useMemo, useState } from 'react'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { EmptyState } from '@/components/EmptyState'
import type { FaqGroup } from '@/lib/helpTopics'
import { normalize, tokens } from '@/lib/helpSearch'

// /help — the FAQ, as the owner's „How It Works + Help" canvas draws it: a pill
// search field over a stack of white cards, each with a +/− chip, and the open
// one outlined in brand-200 (#ADDBCF in the canvas — it IS brand-200).
//
// ⚠️ THE CONTENT DID NOT MOVE AND MUST NOT. `lib/helpTopics` is still the one
// list; app/help/page.tsx resolves it ONCE with `resolveGroups(map)` and hands
// the result both to this component and to the FAQPage JSON-LD. That single
// resolution is what stops the visible answer and the answer Google is served
// drifting apart — the failure tests/siteTexts pins. This file is presentation
// and nothing else: it receives resolved groups and renders them.
//
// ⚠️ IT IS <details>, SO IT WORKS WITH NO JAVASCRIPT. The canvas wires the
// accordion to component state; native disclosure gets the same behaviour plus
// keyboard operation, screen-reader semantics and Ctrl+F finding a collapsed
// answer, for free. `name="faq"` makes it EXCLUSIVE (one open at a time, the
// canvas's behaviour) in browsers that support it and simply allows several
// open in those that do not — a degradation nobody can notice.
//
// The only thing that needs JavaScript is the search field, and it is
// deliberately the only thing that does: with scripting off the field is inert
// and all 25 answers are still on the page, in their groups, all readable.

/** How a card announces itself when it is open. brand-200 is the canvas's
 *  #ADDBCF, exactly.
 *
 *  ⚠️ `open:` AND NOT `group-open:`. The `group` class is on this very element,
 *  and `group-open:` compiles to `.group[open] &` — an ANCESTOR selector, so on
 *  the element that carries the class it is dead code. `open:` is `&[open]`,
 *  which is what „this card is open" means. `group` is still needed: the chip
 *  inside DOES read it. And a variant is emitted after the plain utility, so
 *  brand-200 genuinely beats `border-ink-100` here — unlike two bare
 *  border-colour utilities on one element, which resolve by Tailwind's scale
 *  order (the trap components/Card documents for its `edge` prop). */
const CARD =
  'group rounded-card border border-ink-100 bg-white transition-colors duration-fast ' +
  'open:border-brand-200 open:shadow-card'

/** The +/− chip. Two bars; the upright one fades out when the card opens, so
 *  the plus BECOMES a minus rather than being swapped for a different glyph.
 *  `aria-hidden` — <summary> already announces its own expanded state, and a
 *  screen reader that also hears „plus" is being told the same thing twice. */
const Sign = () => (
  <span
    aria-hidden
    className="w-8 h-8 shrink-0 rounded-btn bg-ink-75 text-ink-700 inline-flex items-center justify-center"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="w-4 h-4">
      <path d="M5 12h14" />
      <path d="M12 5v14" className="origin-center transition-opacity duration-fast group-open:opacity-0" />
    </svg>
  </span>
)

export function HelpFaq({ groups }: { groups: FaqGroup[] }) {
  const [q, setQ] = useState('')

  // The same normaliser the help widget matches with (lib/helpSearch), so
  // „ფასები" finds „ფასი" here exactly as it does there — one stemmer, two
  // readers. Deliberately a plain AND-over-tokens filter rather than
  // `searchAnswer`: that function picks the ONE best answer for a question, and
  // what a person wants from a field above a list is the list, narrowed.
  const shown = useMemo(() => {
    const terms = tokens(q)
    if (terms.length === 0) return groups
    return groups
      .map(g => ({
        ...g,
        items: g.items.filter(it => {
          const hay = normalize(`${it.q} ${it.a}`)
          return terms.every(t => hay.includes(t))
        }),
      }))
      .filter(g => g.items.length > 0)
  }, [groups, q])

  const count = shown.reduce((n, g) => n + g.items.length, 0)

  return (
    <>
      <label className="mt-5 flex items-center gap-3 h-14 px-5 rounded-pill border border-ink-200 bg-white focus-within:border-brand-400">
        <span className="sr-only">მოძებნე კითხვა</span>
        <Icon.search className="w-5 h-5 shrink-0 text-ink-500" />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="მოძებნე კითხვა"
          className="flex-1 min-w-0 border-0 outline-none bg-transparent text-body-lg text-ink-900 placeholder:text-ink-500"
        />
      </label>

      {/* Read aloud, not seen: a filter that silently shortens a list tells a
          sighted reader what happened and a screen-reader user nothing. */}
      <p role="status" aria-live="polite" className="sr-only">
        {q.trim() ? `${count} პასუხი` : ''}
      </p>

      {count === 0 ? (
        <EmptyState
          className="mt-5"
          icon={<Icon.search className="w-6 h-6" />}
          title="ვერ ვიპოვეთ"
          description="სცადე სხვა სიტყვა, ან მოგვწერე."
          cta={{ label: 'მოგვწერე', href: '/contact' }}
        />
      ) : (
        <div className="mt-5 space-y-9">
          {shown.map(g => (
            <section key={g.title}>
              <Eyebrow className="mb-3">{g.title}</Eyebrow>
              <div className="space-y-2.5">
                {/* ⚠️ KEYED BY THE TOPIC'S OWN `id`, NEVER BY INDEX. The list
                    is FILTERED, so the third card is a different question
                    before and after a keystroke; an index key would hand the
                    open card's DOM — and its open state — to whatever question
                    took that position. `id` is permanent by lib/helpTopics'
                    own rule. */}
                {g.items.map(f => (
                  <details key={f.id} name="faq" className={CARD}>
                    {/* `list-none` + the WebKit marker rule kill the native
                        triangle; the chip is the affordance. The row is the
                        whole card width and ~64px tall, well over the 40px tap
                        floor — the 32px chip is decoration inside it, never the
                        target. */}
                    <summary className="flex items-center gap-4 p-5 sm:p-6 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <span className="flex-1 font-display text-h3 font-bold text-ink-900 tracking-tight leading-snug">
                        {f.q}
                      </span>
                      <Sign />
                    </summary>
                    {/* No `max-w-prose` here. The card is already the measure —
                        `size="content"` caps this column at 820px, which is a
                        sane line length for body text. Capping the container
                        AND the text left ~440px of white beside every answer. */}
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6 -mt-1 text-body-lg text-ink-700 leading-relaxed">
                      {f.a}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
