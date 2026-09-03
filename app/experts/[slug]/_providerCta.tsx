// /experts/[slug] — the PROVIDER profile's rail: the price, the one action,
// and three facts about how this person answers.
//
// ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge პროფილის
// რედიზაინი" → Public Profile). What it was: a card holding a button and a
// three-clause paragraph, with the whole priced service list underneath it and
// a labelled facts table above. What the canvas makes it: „ფასი იწყება — 60₾",
// the button, one short line, and three measured rows. The service list moved
// back into the wide column where it belongs (see _providerBlocks), and the
// facts table's two rows became chips in the hero card.
//
// ⚠️ THE PRICE IS BACK ON THE PROFILE, AND THAT REVERSES 2026-08-19. The note
// in _providerHero read „NO PRICE HERE — a service is quoted after somebody
// looks at the job, and a figure nobody stands behind is worse than none",
// citing the owner's „არ იცის კლიენტმა რამდენი ღირს სერვისი". The canvas puts
// „ფასი იწყება" in 30px type at the top of the rail, which is the owner's own
// newer call — and the two are reconcilable: what is printed is `priceFromGel`,
// the LOWEST figure this provider actually named themselves (a priced service,
// else `priceFrom`, else the callout fee). Nobody is quoted a number they did
// not write. 🔒 A provider who named none of the three gets „ფასი შეთანხმებით"
// instead — never a ₾0, never a guess.
//
// ⚠️ THE CTA IS GATED, THE PAGE IS NOT. The page reads `requestsOn()` once and
// renders this only when the subsystem exists (lib/requests); on a deployment
// where it does not, the profile still stands — it is an indexable page and a
// URL that 404s teaches the crawler to distrust the file. Same rule as
// app/experts/page.tsx and ./_tradeLanding.tsx.
//
// ⚠️ THE BUTTON IS ADDRESSED. `requestHrefFor` adds `?to=<slug>`; the wizard
// names them in its chrome, skips the „რა გჭირდება" question their trades
// already answer, and the endpoint opens the INVITED thread with them the
// moment the request is written (`offerLimit: 1`). Somebody who thinks they are
// posting to a market behaves like it — they write once, vaguely, and wait for
// quotes. Somebody who knows they are writing to one person writes to them.
//
// ⚠️ THE WORD IS „მიიღე შეთავაზება" AND IT REPLACES „დატოვე მოთხოვნა". The old
// one was argued for on 2026-08-21 („რეალურად მოთხოვნას უგზავნი და უტოვებ
// ლიდს… „დატოვე" carries the return") and it was a good argument. The canvas
// says „მიიღე შეთავაზება", which carries the return even more plainly — it
// names what the reader GETS rather than what they do — and it is the same
// verb the home page's hero now uses, so one journey says one thing twice.

import { Btn } from '@/components/Btn'
import { requestHrefFor } from './_providerData'
import { SaveProviderBtn } from '@/components/SaveProviderBtn'
import { answeredLabel, replyLabel, type ResponseStat } from '@/lib/responseStats'
import type { ProviderProfileData } from './_providerData'

export function ProviderCta({
  provider,
  stat,
  enabled,
}: {
  provider: ProviderProfileData
  /** MEASURED from the offer journal (lib/responseStats), or undefined when
   *  this provider has never been written to. */
  stat?: ResponseStat
  /** Does the intake exist on this deployment? The PRICE and the facts are
   *  content and are drawn either way; only the button is gated. */
  enabled: boolean
}) {
  /* 🔒 EVERY ROW HERE IS MEASURED OR IT IS NOT DRAWN — CLAUDE.md rule 6. The
     canvas fills these three with „2 საათში", „18 / 20" and „2024-დან"; the
     first two are real medians over this provider's own answered leads, above
     a sample floor, and the third is the year their profile row was created.
     Most profiles will show only the third for a while, and a rail with one
     honest row is the correct look for a young marketplace. */
  const rows: { k: string; v: string }[] = []
  const reply = replyLabel(stat)
  if (reply) rows.push({ k: 'პასუხობს', v: reply.replace(/^პასუხობს\s+/, '') })
  const answered = answeredLabel(stat)
  if (answered) rows.push({ k: 'უპასუხოდ არ ტოვებს', v: answered })
  rows.push({ k: 'პლატფორმაზეა', v: `${provider.since}-დან` })

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-panel border border-ink-100 bg-white p-6 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-meta text-ink-400">
            {provider.priceFromGel !== null ? 'ფასი იწყება' : 'ფასი'}
          </span>
          <span className="font-display text-display font-extrabold tracking-[-0.02em] tabular-nums text-ink-900">
            {provider.priceFromGel !== null
              ? `${provider.priceFromGel}₾`
              /* 🔒 „ask" is a way of working, not a missing field. */
              : <span className="text-h3 font-bold">შეთანხმებით</span>}
          </span>
        </div>

        {enabled && (
          <Btn href={requestHrefFor(provider)} variant="primary" size="lg" className="mt-5 h-[54px] w-full">
            მიიღე შეთავაზება
          </Btn>
        )}

        {/* ⚠️ THE TWO CLAIMS LEFT IN THIS LINE ARE EACH TRUE AND EACH CHECKED,
            and the third one that used to be here („სხვას არ ეჩვენება") is
            folded into the first. „უფასოა" — the intake charges the client
            nothing, anywhere. „ტელეფონს მხოლოდ ის ხედავს, ვისაც შენ აირჩევ" —
            the masking rule in lib/requestChat, unchanged; the number is opened
            by the provider PAYING for the contact after the client picks them.
            Nothing here promises a phone call. */}
        <p className="mt-3 text-meta leading-[1.55] text-ink-500">
          უფასოა. მოთხოვნა პირდაპირ ამ პროფილს მიდის, ტელეფონს კი მხოლოდ ის
          ხედავს, ვისაც შენ აირჩევ.
        </p>

        <dl className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-4">
          {rows.map(r => (
            <div key={r.k} className="flex items-baseline justify-between gap-3">
              <dt className="text-meta text-ink-500">{r.k}</dt>
              <dd className="whitespace-nowrap font-display text-small font-bold tabular-nums text-ink-900">{r.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ⚠️ THE SHORTLIST HAD NO WAY IN UNTIL 2026-08-26 — `POST /api/favorites`
          had no caller anywhere, while „შენახული" kept its slot in the bottom
          nav, the top bar and the client room. Secondary by construction: the
          request is the action, saving is the „not yet". It renders only for a
          signed-in client (see the component). */}
      <SaveProviderBtn providerId={provider.id} />
    </div>
  )
}
