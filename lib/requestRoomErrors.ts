// What the CLIENT'S request room says when an action comes back 409.
//
// ⚠️ WHY IT IS A MODULE AND NOT A FUNCTION IN THE SCREEN (2026-09-02). It was
// exported from `app/request/[ref]/OfferList.tsx` and imported by `_close.tsx`
// beside it — already shared, and already the right sentence in both places.
// What that shape cost was a test: a `'use client'` component cannot be
// imported by a node test, so the only way to check these answers was to grep
// the source for the shape of its `switch`. That assertion broke the moment the
// switch became a map, with the codes, the screen and the sentences unchanged —
// the exact „pinning the wrong thing" CLAUDE.md warns about.
//
// A pure module is importable by both screens AND by tests/offerLifecycle,
// which now CALLS this instead of reading it.

import { actionError } from './actionErrors'

/**
 * ⚠️ ALL THREE ARE „THE PAGE IS OUT OF DATE", NOT „SOMETHING BROKE", and the
 * wording carries that: somebody decided, finished or reviewed this in another
 * tab or on another device, and nothing went wrong. An error voice here would
 * be telling the reader to worry about a race they cannot see and did not lose.
 */
export const errText = (code?: string) => actionError(code, {
  // The conditional-claim answer: somebody already decided this request.
  ALREADY_DECIDED: 'ეს მოთხოვნა უკვე დახურულია — გვერდი განაახლე.',
  // The done/review claims: the page is out of date, not broken. Two codes,
  // one sentence, because the difference between them is ours and not theirs.
  ALREADY_DONE: 'უკვე შესრულებულია — გვერდი განაახლე.',
  ALREADY_REVIEWED: 'უკვე შესრულებულია — გვერდი განაახლე.',

  /* ── „დარეკვა" refused (2026-09-03) ──────────────────────────────────────
     Both codes mean the SAME thing to the reader and neither is their doing:
     the provider has no number on file, or their balance could not carry the
     charge the call spends. The card does not draw the button in either case
     (lib/creditsServer → callableProviders), so a client only reaches these by
     losing a race — the balance emptied between the page loading and the tap.

     ⚠️ THE SENTENCE IS BORROWED, NOT WRITTEN. „ვერ შესრულდა — სცადე თავიდან"
     would be advice that cannot work, and the copy is the owner's (CLAUDE.md),
     so this reuses the shared „the page is out of date" line — which is exactly
     what happened. If these deserve their own words, they are the owner's to
     write; the code is ready for them. */
  CANNOT_CALL: actionError('CHANGED'),
  NO_PHONE: actionError('CHANGED'),
})
