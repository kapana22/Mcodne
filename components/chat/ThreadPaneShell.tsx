// THE CONVERSATION PANE'S FRAME — who you are talking to, what about, and the
// way back to the work. Presentation only: it runs no query and reads no
// column, so neither side's rules can leak into the other's through it.
//
// ⚠️ PORTED FROM THE OWNER'S „Messages" ARTBOARD (2026-08-31), which draws this
// header once and uses it on both sides: a 44px disc, the name at 16/700, one
// quiet metadata line, and a „სამუშაო" button on the right. That button is the
// part that was missing — the pane named the job in prose and offered no way to
// open it, so answering a question about a price meant leaving the inbox by the
// rail and finding the row again.
//
// ⚠️ THE TWO CALLERS ARE SEPARATE FILES ON PURPOSE. The provider's pane
// (OfferThreadPane) must never read `publicRef` — it is the client's credential
// and tests/requests pins that file against the columns it may select. The
// client's pane (ClientThreadPane) MUST read it, because it is their own key and
// it is what /api/request-chat authenticates them by. Merging them would put
// both selects in one file and turn a compile-time separation into a comment.

import { Avatar } from '@/components/Avatar'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'

/** The „this is not yours, or it is gone" state. Deliberately the same wording
 *  for both causes — a pane that distinguishes them tells a stranger which
 *  offer ids exist. */
export function NotFoundPane({ backHref }: { backHref: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-500 mb-3">
        <Icon.warn className="w-6 h-6" />
      </span>
      <div className="font-display text-body-lg font-semibold text-ink-800">მიმოწერა ვერ მოიძებნა</div>
      <p className="text-small text-ink-500 mt-1">წაიშალა, ან არ არის შენი.</p>
      <div className="mt-4"><Btn variant="secondary" size="sm" href={backHref}>სიაში დაბრუნება</Btn></div>
    </div>
  )
}

export function ThreadPaneShell({ peerName, meta, backHref, job, children }: {
  /** Already decided by the caller — „კლიენტი" until the choice is made on one
   *  side (lib/inboxRows → offerPeerName), the provider's real name on the
   *  other. This component never masks anything, because it is never handed
   *  anything to mask. */
  peerName: string
  /** The quiet line: topic · price · status. */
  meta: string
  /** Where „უკან" goes on a phone — the list, in the caller's own room. */
  backHref: string
  /** The artboard's right-hand button. Null where there is nowhere to send
   *  somebody: a link that 404s is worse than no link. */
  job?: { href: string; label: string } | null
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-ink-100 flex items-center gap-3">
        <Btn variant="ghost" size="sm" href={backHref} className="lg:hidden -ml-2 shrink-0">უკან</Btn>
        {/* No photo, on either side. A masked client HAS no face to show, and a
            stock one beside a real name reads as a fake identity (the invariant
            tests/regression-invariants pins); on the client's side the account
            avatar is a base64 blob that a pane would pay ~32KB to display. The
            primitive's own glyph is what the artboard draws anyway. */}
        <Avatar size={44} name={peerName} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-body-lg font-bold text-ink-900 truncate">{peerName}</div>
          {/* ⚠️ IT WRAPS, IT NO LONGER TRUNCATES (2026-09-01). This line is the
              JOB — „ბინის დალაგება · 90₾/სთ · მიღებული" — and it is the only
              thing on the screen that says which of two conversations under one
              topic this is. An ellipsis on a phone ate the price and the status
              and left the topic, which is the half that does NOT tell them
              apart. Two lines is the whole line; the header grows by 16px on
              the narrowest screen and by nothing at all on a desktop, where the
              column is wide enough that this never wraps. */}
          <p className="mt-0.5 text-meta text-ink-500 line-clamp-2">{meta}</p>
        </div>
        {job && (
          /* ⚠️ ON A PHONE TOO, SINCE 2026-09-01 — it was `hidden sm:inline-flex`
             and that reintroduced, on the one device where finding your way
             back is hardest, exactly the gap this button was added to close:
             the pane named the job and offered no way to open it. It matters
             most on the client's side, where the job page is where an offer is
             ACCEPTED — from a thread on a phone that was four steps away
             through a room with no link to it. `sm` rather than `md` so the two
             controls flanking the header are the same size and the name keeps
             its width; `sm` is h-10 below the `sm` breakpoint, which is the tap
             floor exactly. */
          <Btn variant="secondary" size="sm" href={job.href} className="shrink-0">
            {job.label}
          </Btn>
        )}
      </div>

      {children}
    </div>
  )
}
