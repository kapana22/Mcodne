'use client'
// „მოაგვარე?" — the last screen of the client's journey.
//
// ⚠️ FROM THE OWNER'S DESIGN CANVAS (2026-09-01, „Request Room v2" → artboard
// 3 „დახურვა"). It replaces two controls that used to sit inside the accepted
// offer's card: a secondary „დასრულდა" button and, once that was pressed, a
// star picker under a hairline. Both were correct and both were invisible —
// they were the fourth and fifth things in a card whose first three were a
// price, a paragraph and a conversation.
//
// The canvas turns them into ONE question with the answers spelled out, which
// is also the honest shape: „დასრულდა" asked the client to confirm a fact
// about somebody else's work with a verb, and the answer they most often have
// („ჯერ არა") had no button at all — so the screen they were given was one
// they could only leave by ignoring.
//
// ⚠️ THE CANVAS DRAWS THREE ANSWERS AND THIS SCREEN DRAWS TWO. „დიახ,
// სხვაგან" — resolved off the platform — has no route behind it: the only
// client-callable closes are `cancel` (which refuses the moment an offer
// exists, deliberately: a provider has written a real answer and been charged
// for it) and `done` (which credits the provider for finishing the job and
// would be a lie here). A card that records nothing is the „control that
// promises what the server refuses" this subsystem refuses in three other
// files, so it waits for POST /api/requests/[ref]/close rather than shipping
// as a button that does nothing.
//
// ⚠️ „ჯერ არა" CARRIES NO NUMBER. The canvas writes „მოთხოვნა ღია დარჩება
// კიდევ 7 დღე" and nothing in this codebase counts seven of anything: the real
// clock is lib/offerLifecycle — one reminder 14 days after acceptance, a
// silent close at 21 — and neither is „7 დღე" nor is either measurable from
// this screen, which does not know when the offer was accepted. So the clause
// goes and the sentence keeps what is true.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { REVIEW_BODY_MAX } from '@/lib/offerLifecycle'
import { errText } from './OfferList'

export function CloseRequest({
  publicRef, offerId, providerName, done, canReview, onBack,
}: {
  publicRef: string
  offerId: string
  /** Who the client chose — the first answer names them, because „დიახ" on its
   *  own is an answer to a question about a person nobody named. */
  providerName: string
  /** `doneAt` is already stamped — by this client on an earlier visit, or by
   *  the provider from their own screen. The question is then answered and
   *  only the rating is left, so the answer cards are not drawn. */
  done: boolean
  /** The request has an account to sign a review as (lib/offerLifecycle →
   *  reviewGate). Without one the picker is not drawn: a form that can only
   *  ever answer NO_ACCOUNT is not a form. */
  canReview: boolean
  /** „ჯერ არა" — back to the offers, where the conversation is. */
  onBack: () => void
}) {
  const router = useRouter()
  const [answer, setAnswer] = useState<number | null>(done ? 0 : null)
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The ★ block appears under the FIRST answer only — the canvas's own rule,
  // and the product's: a job that was not finished by this provider has
  // nothing to rate, and a rating box under „ჯერ არა" would be asking somebody
  // to score work that has not happened.
  const showReview = canReview && answer === 0

  const submit = async () => {
    if (busy || answer === null) return
    // „ჯერ არა" is a real answer and it writes nothing: the request stays open,
    // the thread stays live, the reminder clock keeps running.
    if (answer === 1) { onBack(); return }

    setBusy(true)
    setError(null)
    try {
      if (!done) {
        const res = await fetch(`/api/requests/${publicRef}/offers/${offerId}/done`, { method: 'POST' })
        const j = await res.json().catch(() => ({}))
        // ⚠️ ALREADY_DONE IS NOT A FAILURE HERE. The provider may have marked
        // the same job finished a minute ago from their own screen; the claim
        // is theirs (lib/offerLifecycle → markDoneWhere) and this client's
        // answer is still „yes, it is done". What follows — the review — is the
        // part that has not happened yet.
        if (!res.ok && j?.error !== 'ALREADY_DONE') { setError(errText(j?.error)); setBusy(false); return }
      }
      if (showReview && rating > 0) {
        const res = await fetch(`/api/requests/${publicRef}/offers/${offerId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, body: body.trim() }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || !j.ok) { setError(errText(j?.error)); setBusy(false); return }
      }
      // Re-read from the server rather than patching state: the stamp, the
      // review and what the page draws next are all decided there.
      router.refresh()
    } catch {
      setError(errText()); setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
      <div>
        <h1 className="font-display text-h1 font-extrabold leading-tight tracking-[-0.025em] text-balance">
          {done ? `როგორ იმუშავა ${providerName}?` : 'მოაგვარე?'}
        </h1>
        <p className="mt-3 text-body-lg leading-relaxed text-ink-600">
          ერთი კითხვა — ამის მიხედვით ვხვდებით, ვინ მუშაობს კარგად.
        </p>
      </div>

      {!done && (
        // One field with two values, so it is a radio group and not two
        // toggles — the same grammar the provider's price-kind control uses.
        <div role="radiogroup" aria-label="მოაგვარე?" className="flex flex-col gap-2.5">
          {/* ⚠️ THE NAME, NOT „ექსპერტთან" WITH A CASE ENDING GLUED ON. The
              canvas writes „დიახ, ექსპერტთან 1" over placeholder data; the same
              sentence over a real name would have to inflect it („გიორგისთან"
              / „დავითთან"), and no template can do that in Georgian. The name
              alone answers „who", and the line under it answers „what". */}
          {[
            { label: `დიახ, ${providerName}`, sub: 'სამუშაო შესრულდა' },
            { label: 'ჯერ არა', sub: 'მოთხოვნა ღია დარჩება' },
          ].map((a, n) => (
            <button
              key={a.label}
              type="button"
              role="radio"
              aria-checked={answer === n}
              onClick={() => setAnswer(n)}
              // `no-caps`: globals.css renders every <button> in mtavruli, and
              // an answer card is a sentence with a second sentence under it,
              // not a control label.
              className={`no-caps flex w-full items-center gap-4 rounded-card border p-5 text-left transition-colors duration-fast ${
                answer === n ? 'border-brand-200 bg-white' : 'border-ink-100 bg-white hover:border-ink-200'
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-pill border ${
                  answer === n ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-300 bg-white text-transparent'
                }`}
              >
                <Icon.check className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-body-lg font-bold text-ink-900">{a.label}</span>
                <span className="mt-0.5 block text-small leading-relaxed text-ink-500">{a.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {showReview && (
        <div className="rounded-card border border-ink-100 bg-white p-5 sm:p-6">
          {/* The canvas heads this block with the question. In the „already
              done" state the h1 above IS that question, and printing it twice
              on a 560px column is a heading talking to itself. */}
          {!done && (
            <div className="font-display text-body font-bold text-ink-900">როგორ იმუშავა {providerName}?</div>
          )}
          <div className={`flex items-center gap-1 ${done ? '' : 'mt-3'}`}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} ვარსკვლავი`}
                aria-pressed={rating === n}
                className={`inline-flex w-10 h-10 items-center justify-center rounded-btn transition-colors duration-fast ${rating >= n ? 'text-warning-500' : 'text-ink-300 hover:text-ink-400'}`}
              >
                <Icon.star aria-hidden className="w-7 h-7" />
              </button>
            ))}
          </div>
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value.slice(0, REVIEW_BODY_MAX))}
            maxLength={REVIEW_BODY_MAX}
            placeholder="ერთი წინადადება — არასავალდებულო"
            aria-label="შეფასება"
            className="mt-3.5 h-12 w-full rounded-field border border-ink-200 bg-ink-50 px-4 text-body text-ink-900 placeholder-ink-400 outline-none transition-colors duration-fast focus:border-brand-500"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-small font-medium text-danger-700">{error}</p>
      )}

      <Btn
        size="lg"
        className="w-full"
        onClick={submit}
        disabled={answer === null || busy || (done && rating === 0)}
        aria-busy={busy}
      >
        {busy ? 'ინახება…' : 'გაგზავნა'}
      </Btn>

      {/* The way back, and the ONLY one in the „already done" state — where the
          answer cards (and with them „ჯერ არა") are not drawn. A screen that
          asks for a rating and cannot be left is a screen that gets a rating
          nobody meant. */}
      {done && (
        <button
          type="button"
          onClick={onBack}
          className="tap-area mx-auto inline-flex min-h-10 items-center px-2 text-small font-semibold text-ink-500 underline underline-offset-2 transition-colors duration-fast hover:text-ink-800"
        >
          ჯერ არა
        </button>
      )}
    </div>
  )
}
