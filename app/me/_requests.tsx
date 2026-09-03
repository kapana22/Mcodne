// /me — the client's own service requests: every one of them, as wide rows.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („Client Space"). What
// it was: a single bordered box with hairline-divided rows, each carrying the
// headline, „topic · N შეთავაზება", and the shared RequestStatusPill printing
// an ADMIN word („დამოწმებული"). What the canvas makes it: separate cards, one
// per request, each a headline over a quiet meta line, with a filled state pill
// and a named action on the right — „ნახე" / „გახსენი" / „შეაფასე".
//
// ⚠️ AND THE PILL STOPPED SPEAKING ADMIN. `STATUS_LABEL`'s own comment calls it
// „the admin's words for each state"; a client reading „დამოწმებული" on their
// own request learns nothing about whether anybody has answered. The state is
// derived once, in lib/myRequests → clientRequestState, so the pill and the
// action word cannot disagree — and every word in it already existed in the
// product (REQUEST_STATIONS, STATUS_LABEL).
//
// ⚠️ EACH ROW OPENS THE REQUEST'S OWN PAGE, not a list anchor. It used to link
// to `/me/requests#<ref>` — a scroll position on a summary of itself. The
// request room is where the offers, the thread and the ★ picker live.
//
// ⚠️ AND SINCE 2026-09-02 IT OPENS THE ROOM'S /me ADDRESS, not /request/<ref>.
// Owner: „ესე დახტუნავს ძალიან." The old link took a signed-in client out of
// this workspace and into the intake's bare shell — a centred logo, no rail, no
// way back — for the same screen. `clientRequestHref` (lib/requests) is the one
// place that choice is made; the room itself is one component either way.
//
// It fetched its own rows until 2026-08-30, from `/api/me/requests?limit=3`
// after mount — owner: „ნახევარს ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება." The
// server page holds these rows now, so this is a pure renderer and the list is
// in the first paint or not at all.

import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { clientRequestHref, gel } from '@/lib/requests'
import { clientRequestState, type MyRequestRow } from '@/lib/myRequests'
import { topicGroupMark } from '@/lib/topicMarks'
import { ClientRequestPill } from '@/components/requests/StatusPills'

/** The quiet line under the headline. Every part is MEASURED or absent: the
 *  shelf the request sits on, who was chosen, and the cheapest figure actually
 *  quoted. The canvas repeats „3 შეთავაზება" here as well as in the pill —
 *  dropped, because a count printed twice on one row is one fact taking two
 *  slots, and the slot is what carries the price. */
function metaLine(r: MyRequestRow): string {
  /* ⚠️ NOT THE TOPIC WHEN THE TOPIC IS ALREADY THE HEADLINE (2026-09-02).
     `requestHeadline` (lib/requests) prints the client's OWN words and falls
     back to the topic label when there are none — and a request filed by
     picking „ბინის დალაგება" out of the intake's list has none, which is the
     commonest way one is filed. So the row read:

         ბინის დალაგება
         ბინის დალაგება              [ველოდები]  გახსენი

     the same three words twice, 4px apart. Found by filing a request as a new
     client and looking at the list; it is also visible in both rows of the
     owner's own 2026-09-02 screenshot („SMM და სოციალური ქსელები", twice).

     The topic stays whenever it says something the headline does not — which
     is every request somebody actually described. */
  const parts = r.topicLabel === r.headline ? [] : [r.topicLabel]
  if (r.chosenName) parts.push(`არჩეული: ${r.chosenName}`)
  if (r.lowestOfferGel !== null) parts.push(`${gel(r.lowestOfferGel)}-დან`)
  return parts.join(' · ')
}

function RequestRow({ r }: { r: MyRequestRow }) {
  const state = clientRequestState(r)
  const meta = metaLine(r)
  return (
    <li>
      <Link
        href={clientRequestHref(r.publicRef)}
        className={`flex flex-wrap items-center gap-4 sm:gap-5 rounded-card border bg-white px-5 sm:px-6 py-5 transition-colors duration-fast hover:border-ink-300 ${
          // The canvas gives the row with something waiting on it a green edge —
          // the only differentiated border in the list, so „somebody answered"
          // is legible from the far side of the page without reading a word.
          state.tone === 'offers' ? 'border-brand-200' : 'border-ink-100'
        }`}
      >
        {/* ⚠️ THE FAMILY'S MARK (2026-09-02, owner: „კიდევ შეიძლება დამატება
            სადმე, რომ უფრო ლამაზი და მხიარული იყოს").
            It is here and not on every list on the site because here it does
            WORK: a client with four requests open is scanning for one of them,
            and a plumbing job and a cleaning job are two words that start the
            same way and one glance apart. The mark is what the eye lands on
            before it reads.
            `brand-600` on the brand-50 plate, and nothing when the topic has no
            family (see topicGroupMark) — the plate is still drawn so the
            headlines keep one left edge. */}
        {/* ⚠️ VISIBLE ON A PHONE TOO, AND IT WAS `hidden sm:flex` FOR ONE
            COMPILE (2026-09-02). Hiding it below `sm` was reasoning from the
            desktop down — „the small screen has less room" — and it is exactly
            backwards for this control: the phone is where a list is scanned
            with a thumb and where a mark earns the most. Measured on the row:
            the plate is 40px, the headline „ბინის დალაგება" needs 150 of the
            remaining ~470, and the state pill and the action word were never
            near the edge.
            40px on a phone, 44 from `sm` — the 40px floor is the floor here
            too, even though the plate is not itself tappable: the whole row is
            the target and this sits inside it. */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-600 sm:h-11 sm:w-11">
          {topicGroupMark(r.groupId, 'w-5 h-5')}
        </span>
        <span className="min-w-[200px] flex-1">
          {/* The person's own words, not the category — three rows of one topic
              were three identical lines. See requestHeadline. */}
          <span className="block font-display text-h3 font-bold tracking-[-0.01em] text-ink-900">{r.headline}</span>
          {/* Empty when the headline already said everything (see metaLine) —
              and then it is not drawn at all rather than drawn blank, or the
              row keeps a line of height for a sentence that is not there. */}
          {meta && <span className="mt-1 block text-small tabular-nums text-ink-500">{meta}</span>}
        </span>
        <ClientRequestPill tone={state.tone} label={state.label} />
        <span className="shrink-0 whitespace-nowrap font-display text-body font-bold text-brand-700">
          {state.cta}
        </span>
      </Link>
    </li>
  )
}

export function MyRequestsSection({ rows, requestHref }: {
  rows: MyRequestRow[]
  /** The intake, or null when FEATURE_REQUESTS is off — read once by the server
   *  page so this card and the rail's button cannot disagree about whether the
   *  subsystem exists. */
  requestHref: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <ul className="flex flex-col gap-4">
          {rows.map(r => <RequestRow key={r.id} r={r} />)}
        </ul>
      )}

      {/* ⚠️ THE DASHED CARD IS ALSO THE EMPTY STATE, and that is why it is not
          <EmptyState>. The canvas draws it under a full list („კიდევ რამე
          გჭირდება?"); a client with no requests meets the same card, and the
          only honest change is the question — they have not asked for anything
          yet, so „კიდევ" (again) would be wrong. One card, one door, whichever
          of the two screens this is. */}
      {requestHref && (
        <Card padding="none" className="flex flex-wrap items-center gap-5 border-dashed p-6">
          <div className="min-w-[240px] flex-1">
            <div className="font-display text-body-lg font-bold text-ink-900">
              {rows.length > 0 ? 'კიდევ რამე გჭირდება?' : 'რა გჭირდება?'}
            </div>
            <p className="mt-1.5 text-body leading-[1.6] text-ink-600">
              ერთი წინადადება — ფასს თავად შემოგთავაზებენ.
            </p>
          </div>
          {/* `dark`, not `primary`: the rail's „ახალი მოთხოვნა" is already the
              green one and it is on screen at the same time. The canvas gives
              this card the ink fill for exactly that reason — two brand-filled
              buttons on one screen say nothing about which comes first. */}
          <Btn href={requestHref} variant="dark" size="lg" className="h-12">
            დაწერე
          </Btn>
        </Card>
      )}

      {/* ⚠️ THE SCREEN WITH NO LIST AND NO DOOR (2026-09-01). `requestHref` is
          null in two cases and until today both of them rendered NOTHING under
          the title: a deployment with FEATURE_REQUESTS off, and — the one that
          actually happens — somebody who SELLS here, for whom app/me/page now
          withholds the intake because /request refuses them anyway. Signed in
          as a provider with no requests, /me was the words „ჩემი მოთხოვნები"
          over an empty column.

          „ჯერ არაფერია" is the product's own sentence for this and it is
          literally true here, unlike on the queue where it had to be qualified
          (app/work/(provider)/requests): this person has no requests at all.
          NO CTA, and that is the point — the card above IS the call to action
          and it is drawn for everybody who may press it. */}
      {rows.length === 0 && !requestHref && (
        <EmptyState illustration="bookings" title="ჯერ არაფერია" />
      )}
    </div>
  )
}
