// THE BALANCE, WHERE IT IS SPENT.
//
// ⚠️ IT LIVES ON THE WORKSPACE HOME AND NOWHERE ELSE (2026-08-20), because
// this is the screen where the decision to spend is made — the queue is one tap
// away and every offer costs. A balance on a settings page is a number nobody
// reads; a balance beside the work is a reason to finish the profile.
//
// ⚠️ THE UNIT ON SCREEN IS AN OFFER, NOT A NUMBER. „85₾" is the currency and it
// is deliberately lari (lib/credits: a token is an abstraction, „85₾" is one a
// provider already understands), but what they actually want to know is how
// many times they can answer. So the number is translated: „17 შეთავაზება".
//
// ⚠️ AND IT MAY NEVER READ AS CASH. No „ანაზღაურება", no „შენი ფული", no
// withdrawal. The wording rules live at the top of lib/credits and are pinned
// by tests/credits — this component is the main thing they were written for.
import { Btn } from '@/components/Btn'
import { Card } from '@/components/Card'
import { gelLabel, offersAffordable, OFFER_COST_TETRI } from '@/lib/credits'

export function CreditStrip({ balanceTetri, percent, nextTask, editHref }: {
  balanceTetri: number
  /** 0–100, the SAME arithmetic as the grant — see lib/credits → completeness. */
  percent: number
  /** The most valuable unearned task, or null when the profile is finished. */
  nextTask: { label: string; tetri: number; why: string } | null
  /** Where that task is answered — it differs by capability, see the caller. */
  editHref: string
}) {
  const offers = offersAffordable(balanceTetri)
  return (
    <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-meta text-ink-500">ბალანსი</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="font-display text-h1 font-bold text-ink-900 tabular-nums leading-none">{gelLabel(balanceTetri)}</span>
          {/* The translation. „85₾" is what it is; „17 შეთავაზება" is what it
              does, and the second is the one that decides anything. */}
          <span className="text-small text-ink-600 tabular-nums">
            {offers} შეთავაზება · {gelLabel(OFFER_COST_TETRI)} თითო
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
        <p className="text-small text-ink-600">პროფილი სრულადაა შევსებული.</p>
      )}
    </Card>
  )
}
