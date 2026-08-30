// THE BALANCE, WHERE IT IS SPENT.
//
// ⚠️ IT LIVES ON THE WORKSPACE HOME, AND SINCE 2026-08-21 IT IS NO LONGER THE
// ONLY PLACE THE NUMBER APPEARS. The original argument — „a balance beside the
// work is a reason to finish the profile" — is still why the STRIP is here:
// this is the screen where the decision to spend is made, the queue is one tap
// away, and the strip is the only thing that carries the next task and what it
// pays. What the argument got wrong was reach: /work is one screen out of
// forty, so the number itself now also rides in the top bar's signed-in cluster
// (components/CreditPill), where a provider passes it on every page.
//
// The division is deliberate and worth keeping: the PILL is a readout — four
// characters, no task, no verb — and the STRIP is the explanation. Never grow
// the pill into a second strip, and never let the strip's number and the pill's
// disagree: both read `balanceOf`, which sums the one ledger.
//
// ⚠️ THE UNIT ON SCREEN IS WHAT THE BALANCE BUYS, NOT A NUMBER. „85₾" is the
// currency and it is deliberately lari (lib/credits: a token is an abstraction,
// „85₾" is one a provider already understands), but what they actually want to
// know is how many times they can act. So the number is translated.
//
// ⚠️ AND THE UNIT CHANGED ON 2026-08-21. It read „17 შეთავაზება" while an offer
// cost 5₾; the owner moved the price onto the client's CONTACT and made the
// offer free, so it reads „85 კონტაქტი" — the same translation, of the only
// thing a balance now buys. Never print an offer count here again: telling a
// provider their balance is worth N answers, when answering is free, is telling
// them something that is not true.
//
// ⚠️ AND IT MAY NEVER READ AS CASH. No „ანაზღაურება", no „შენი ფული", no
// withdrawal. The wording rules live at the top of lib/credits and are pinned
// by tests/credits — this component is the main thing they were written for.
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { gelLabel, contactsAffordable, CONTACT_COST_TETRI, JOB_DONE_NOTE } from '@/lib/credits'

export function CreditStrip({ balanceTetri, percent, nextTask, editHref }: {
  balanceTetri: number
  /** 0–100, the SAME arithmetic as the grant — see lib/credits → completeness. */
  percent: number
  /** The most valuable unearned task, or null when the profile is finished. */
  nextTask: { label: string; tetri: number; why: string } | null
  /** Where that task is answered — it differs by capability, see the caller. */
  editHref: string
}) {
  const contacts = contactsAffordable(balanceTetri)
  return (
    <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-meta text-ink-500">ბალანსი</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="font-display text-h1 font-bold text-ink-900 tabular-nums leading-none">{gelLabel(balanceTetri)}</span>
          {/* The translation. „85₾" is what it is; „17 შეთავაზება" is what it
              does, and the second is the one that decides anything. */}
          <span className="text-small text-ink-600 tabular-nums">
            {contacts} კონტაქტი · {gelLabel(CONTACT_COST_TETRI)} თითო
          </span>
        </p>
      </div>

      {nextTask ? (
        <div className="min-w-0 flex items-center gap-4">
          <div className="min-w-0">
            <p className="text-meta text-ink-500 tabular-nums">პროფილი {percent}%</p>
            {/* ONE task, the most valuable unearned one — a checklist of six on
                the home screen is homework. The rest are on the profile page,
                which is where they are answered. */}
            <p className="mt-0.5 text-small text-ink-900">
              <span className="font-display font-semibold">{nextTask.label}</span>
              <span className="text-brand-700 font-display font-semibold tabular-nums"> +{gelLabel(nextTask.tetri)}</span>
            </p>
            <p className="text-meta text-ink-500 leading-snug">{nextTask.why}</p>
          </div>
          <Btn href={editHref} className="shrink-0">შევსება</Btn>
        </div>
      ) : (
        /* ⚠️ THE ONE SCREEN THAT HAS TO ANSWER „და მერე?" (2026-08-21). A
           finished profile means every one-off grant is paid, so this is
           precisely the person for whom the number can now only go down — and
           until today the strip's answer to them was „პროფილი სრულადაა
           შევსებული" and nothing else. The earn-back is the whole of the loop
           and it is a fact, not a pitch: one sentence, from lib/credits, so the
           25₾ is spelled in one place. */
        <div className="min-w-0">
          <p className="text-small text-ink-600">პროფილი სრულადაა შევსებული.</p>
          <p className="mt-0.5 text-meta text-brand-700 font-display font-semibold">{JOB_DONE_NOTE}</p>
        </div>
      )}
    </Card>
  )
}
