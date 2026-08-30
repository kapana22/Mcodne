'use client'
// The home page's TOPIC RAIL — one slow, continuous pass of what people
// actually come here to buy, riding the bottom edge of the hero band.
//
// ⚠️ IT WAS A RAIL OF EXPERT CARDS UNTIL 2026-08-21. The design canvas
// („მცოდნე — მთავარი გვერდი") moves the roster DOWN into „ახლა ხელმისაწვდომია"
// — six real cards, at rest, readable — and gives this strip the job it is
// actually good at: naming the CATEGORY of need, in the reader's own words, in
// motion, at the periphery. Two rails of cards, one drifting and one still,
// said the same thing twice and the drifting copy was the one you could not
// read a price on.
//
// ⚠️ WHY A RAIL AND NOT A CAROUSEL, because the difference is the whole point.
// A carousel SWAPS content on a timer: NN/g's work on them is blunt — auto
// advancing draws banner blindness and almost nobody sees past the first slide,
// so two thirds of what you put in it is shown to nobody. A rail hides nothing.
// Every chip is on screen and reachable; the track simply drifts, and the
// reader's eye takes what it wants at the speed it wants.
//
// It is also the one piece of PERIPHERAL motion this page has. That is what
// separates a page that feels alive from one that feels animated at: 38 seconds
// for a full pass is slow enough that it never pulls the eye off a sentence,
// present enough that the page is never dead. Owner, 2026-08-20, on the
// entrance-only draft that preceded it: „ძალიან მოძველებული დიზაინი".
//
// ⚠️ THE TRACK HOLDS THE LIST TWICE. `.marquee-track` translates -50%, so the
// second copy is exactly where the first was when the cycle restarts — that is
// what makes the seam invisible. Halve the list and the rail jumps.
//
// ⚠️ PAUSES ON HOVER. Motion under a cursor that is trying to read a word is
// the one place a rail becomes hostile, and it is also where somebody has
// decided to look. The whole track stops while a pointer is on it.
//
// ⚠️ THE WORDS ARE NOT TYPED HERE. They are `SUGGESTED_TOPICS` — the same eight
// the intake's what-step opens with (lib/requestTopics), whose ORDER is itself
// the product statement: professional deliverable → project → everyday service
// → learning. Retyping them would be a second, drifting copy of the site's
// fastest sentence about itself; pinned by tests/requests.test.ts.

import Link from 'next/link'
import { SUGGESTED_TOPICS } from '@/lib/requestTopics'

export function ServiceRail() {
  const chips = SUGGESTED_TOPICS
  // Under four the seam shows however slowly it drifts — draw nothing rather
  // than a short loop visibly restarting.
  if (chips.length < 4) return null

  // The list twice — see the note above. `key` carries the pass so React does
  // not reconcile the two copies into one.
  const track = [...chips, ...chips]

  return (
    /* ⚠️ `motion-reduce:overflow-x-auto` — A REDUCED-MOTION READER MUST STILL
       REACH EVERY CHIP. `.marquee-track` lives entirely inside globals.css's
       `prefers-reduced-motion: no-preference` block, so for that reader the
       ANIMATION is not the only thing that disappears: `display:flex` and
       `width:max-content` go with it. Measured at 390px — the eight chips
       stopped being a rail and wrapped into five ragged rows. The layout is
       restored below (`flex w-max` on the track, unconditionally); this turns
       the seamless clip into a scrollable one for the same reader, because a
       static `overflow-hidden` row would simply cut the last chips off with no
       way to get at them. */
    <div className="relative mt-8 sm:mt-9 overflow-hidden motion-reduce:overflow-x-auto border-t border-ink-200/60 py-4 group">
      {/* The edges fade into the hero's own ground rather than cutting the
          chips off at a hard line — the seam is the one thing that gives a
          rail away. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 z-10 w-16 pointer-events-none bg-gradient-to-r from-ink-75 to-transparent sm:w-24"
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 z-10 w-16 pointer-events-none bg-gradient-to-l from-ink-75 to-transparent sm:w-24"
      />

      {/* `flex w-max` is NOT a duplicate of `.marquee-track` — it is the half of
          it that must survive `prefers-reduced-motion: reduce`. The class keeps
          owning the animation; these two own the shape. */}
      <div className="marquee-track flex w-max gap-2.5 group-hover:[animation-play-state:paused]">
        {track.map((t, i) => (
          /* → the CATALOGUE's own search, not the intake. A chip is a browse
             gesture („show me who does this"), and /experts?q= is the one
             address that answers it; the intake is the header's action for
             the reader who would rather describe the job. */
          <Link
            key={`${t.id}-${i}`}
            href={`/experts?q=${encodeURIComponent(t.label)}`}
            // aria-hidden on the SECOND copy: it is the same eight chips again,
            // and a screen reader that reads them twice is reading a rendering
            // trick out loud.
            aria-hidden={i >= chips.length}
            tabIndex={i >= chips.length ? -1 : undefined}
            /* ⚠️ h-10 ON A PHONE, h-9 ABOVE IT (2026-08-21). CLAUDE.md rule 3:
               anything tappable is ≥40px, and a bare `h-9` is 36. This rail is
               a MOVING target — it is a marquee, so the four pixels are worth
               more here than on a chip that holds still. Measured at 390px:
               eight reachable chips, every one 36px tall, none carrying
               `.tap-area`. Same `h-10 sm:h-9` step the catalogue card's own
               CTA already uses, so the desktop design is unchanged. */
            className="shrink-0 inline-flex h-10 sm:h-9 items-center whitespace-nowrap rounded-pill border border-ink-200 bg-white/75 px-4 text-small text-ink-500
                       transition-[color,border-color,transform] duration-fast ease-out-quart
                       hover:border-brand-300 hover:text-ink-800 motion-safe:hover:-translate-y-px
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
