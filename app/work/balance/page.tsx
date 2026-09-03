// /work/balance — WHERE THE NUMBER COMES FROM. („ბალანსი", 2026-09-01.)
//
// ⚠️ IT DID NOT EXIST UNTIL TODAY, AND `CREDITS_ENFORCED` HAS BEEN TRUE THE
// WHOLE TIME. Owner, looking at his own workspace: „ეს 65₾ საიდან მოვიდა…
// ბალანსის სისტემას გვერდი არ აქვს." The balance was drawn in three places —
// the top-bar pill, the strip on /work, the profile bar in the rail — and not
// one of them could answer that question, because all three print the TOTAL.
// A rule that spends somebody's money has to be readable by the person whose
// money it is; until this page there was nowhere to read it.
//
// ⚠️ THE PACKAGES ARE WRITTEN AND STILL DO NOT SHOW (2026-09-03). This note
// used to end „It arrives when the flag does", and that is now literally what
// the code says: `CREDIT_PACKS` exists in lib/credits with the research behind
// its ladder, and the block below renders only where `PAYMENTS_LIVE` is true.
// The flag is false, so today the page is unchanged and the honest state is
// preserved — a price list for something nobody can buy is still a lie, and a
// buy button with no checkout behind it is a worse one.
//
// What is left to wire when the card arrives: the `onClick`/href of the three
// buttons. Everything they need — the price, what lands, how many contacts, the
// bonus — is computed here already.
//
// ⚠️ THE LEDGER IS THE PAGE. The three notes at the top are the rules and the
// task list is the plan, but the thing that answers „საიდან მოვიდა" is the list
// of movements — one row per `CreditEntry`, in the order they happened, each
// with the words `creditReasonLabel` gives it. Everything above the ledger is a
// summary OF the ledger; nothing here holds a second copy of the arithmetic.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { getCurrentUser } from '@/lib/auth'
import { providersOn } from '@/lib/requests'
import { PAYMENTS_LIVE } from '@/lib/flags'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { fmtKaDateTime } from '@/lib/kaDate'
import { balanceOf, profileFacts } from '@/lib/creditsServer'
import {
  gelLabel, contactsLabel, contactCostRangeLabel, creditTasks, earnedTasks, taskHref, creditReasonLabel,
  completeness, CREDIT_TASKS_TOTAL,
  CREDIT_PACKS, packBonusPct, packContacts,
  CONTACT_COST_NOTE, CONTACT_REFUND_NOTE, OFFER_FREE_NOTE, JOB_DONE_NOTE,
  type CreditTaskKey,
} from '@/lib/credits'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ბალანსი — მცოდნე',
  robots: { index: false, follow: false },
}

export default async function Page() {
  /* ⚠️ `notFound()`, NOT `redirect` — measured on production 2026-09-01. This
     page shipped with /work/jobs's gate (`requireUser` → /signin) and was the
     only address under /work that ANSWERED an anonymous request: /work,
     /work/profile and /work/account all 404, and this one 307'd to the sign-in
     page, which tells a stranger the route exists. The workspace not announcing
     itself is deliberate — see PROVIDER_PATH_PREFIXES — and three pages against
     one is not a tie. It follows its neighbours in this folder. */
  const user = await getCurrentUser()
  if (!user) notFound()

  const viewer = providersOn() ? await requestsViewer() : null
  // An empty balance page says „you have spent nothing" to somebody who never
  // could — and, on an address that does not exist for them, says it out loud.
  if (!viewer?.providerAllowed || viewer.provider === null) notFound()

  await ensureDbReady()

  const [balance, facts, entries] = await Promise.all([
    balanceOf(user.id),
    profileFacts(user.id),
    // ⚠️ `take` IS A CAP AND NOT A PAGE. A provider who has opened two hundred
    // contacts is a provider we want to hear about; until anybody is near it,
    // paging this list is a control with nothing behind it. The cap exists so
    // one query can never become a slow page.
    prisma.creditEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, amountTetri: true, reason: true, createdAt: true },
    }),
  ])

  const earned = new Set<CreditTaskKey>(earnedTasks(facts))
  const tasks = creditTasks()
  const percent = completeness(facts)
  const unearnedTetri = tasks.filter(t => !earned.has(t.key)).reduce((n, t) => n + t.tetri, 0)

  return (
    <div>
      <PageHeader
        className="mb-5"
        title="ბალანსი"
        sub="რა შემოვიდა, რა გავიდა, და რით იზრდება."
      />

      {/* ── The number, and the only thing it buys ─────────────────────────
          „65₾" is what it is; „65 კონტაქტი" is what it does, and the second is
          the one that decides anything. The pairing is the strip's on /work —
          the same arithmetic (`contactsAffordable`), so the two can never
          disagree. */}
      <Card>
        <p className="text-meta text-ink-500">ბალანსი</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-display font-extrabold tabular-nums leading-none text-ink-900">
            {gelLabel(balance)}
          </span>
          <span className="text-body text-ink-600 tabular-nums">
            {contactsLabel(balance) || 0} კონტაქტი · {contactCostRangeLabel()} თითო
          </span>
        </p>
      </Card>

      {/* ── The three packages ────────────────────────────────────────────
          ⚠️ THE MIDDLE ONE IS MARKED, AND THAT IS THE RESEARCH RATHER THAN
          decoration: Bark and Thumbtack both sell credits on a sliding scale
          and both point at a middle tier. The mark says which one the platform
          thinks is the sensible buy; it does not make it louder than the
          balance above it.
          The bonus and the contact count are COMPUTED from the two amounts
          (lib/credits → packBonusPct, packContacts) rather than typed beside
          them: a hand-written „+20%" next to a pair of numbers is two facts
          that can disagree, and only one of them moves money. */}
      {PAYMENTS_LIVE && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {CREDIT_PACKS.map(p => {
            const bonus = packBonusPct(p)
            return (
              <Card key={p.key} className={p.key === 'STANDARD' ? 'border-brand-300' : undefined}>
                <div className="flex items-center gap-2">
                  <span className="font-display text-body font-bold text-ink-900">{p.label}</span>
                  {bonus > 0 && (
                    <span className="inline-flex h-[22px] items-center rounded-pill border border-brand-200 bg-brand-50 px-2.5 text-micro font-bold tabular-nums text-brand-700">
                      +{bonus}%
                    </span>
                  )}
                </div>
                <p className="mt-2 font-display text-h1 font-extrabold tabular-nums leading-none text-ink-900">
                  {gelLabel(p.priceTetri)}
                </p>
                <p className="mt-1.5 text-small tabular-nums text-ink-600">
                  {gelLabel(p.creditTetri)} ბალანსი · {packContacts(p)} კონტაქტი
                </p>
                <Btn size="sm" className="mt-3 w-full" disabled>
                  ყიდვა
                </Btn>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── The rules, in the site's own sentences ─────────────────────────
          Every line below is an exported constant from lib/credits, printed
          where the provider is rather than only where the charge happens. That
          is the point of importing them instead of retyping them: the offer
          form, the contact button and this page cannot drift into three
          different prices. */}
      <Card className="mt-4">
        <Eyebrow as="h2" tone="muted">როგორ მუშაობს</Eyebrow>
        <ul className="mt-3 flex flex-col gap-2.5">
          {[
            { sign: 'free', text: 'მოთხოვნის კითხვა უფასოა.' },
            { sign: 'free', text: OFFER_FREE_NOTE },
            { sign: 'out', text: CONTACT_COST_NOTE },
            { sign: 'in', text: JOB_DONE_NOTE },
            { sign: 'free', text: CONTACT_REFUND_NOTE },
          ].map(r => (
            <li key={r.text} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  r.sign === 'in' ? 'bg-brand-600' : r.sign === 'out' ? 'bg-ink-300' : 'bg-ink-200'
                }`}
              />
              <span className="text-body leading-relaxed text-ink-700">{r.text}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ── The one-off grants, all six, ticked or not ─────────────────────
          ⚠️ THE WHOLE LIST, UNLIKE THE STRIP ON /work. That one draws exactly
          one task on purpose — a checklist of six on a home screen is homework.
          This is the page somebody opens BECAUSE they asked where the number
          came from, so the answer is the whole table, with the paid rows still
          on it: „ატვირთე ფოტო +15₾" is only an explanation of the balance while
          it is still visible after it is earned. */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Eyebrow as="h2" tone="muted">პროფილის ბონუსი</Eyebrow>
          <p className="text-small text-ink-600 tabular-nums">
            {gelLabel(CREDIT_TASKS_TOTAL - unearnedTetri)} / {gelLabel(CREDIT_TASKS_TOTAL)} · პროფილი {percent}%
          </p>
        </div>
        <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
          {tasks.map(t => {
            const on = earned.has(t.key)
            return (
              <li key={t.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span
                  aria-hidden
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    on ? 'bg-brand-600 text-white' : 'border border-ink-200 bg-white'
                  }`}
                >
                  {on && <Icon.check aria-hidden className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-[160px] flex-1">
                  <span className={`block font-display text-body font-semibold ${on ? 'text-ink-500' : 'text-ink-900'}`}>
                    {t.label}
                  </span>
                  {!on && <span className="block text-meta leading-snug text-ink-500">{t.why}</span>}
                </span>
                <span className={`shrink-0 font-display text-body font-bold tabular-nums ${on ? 'text-ink-400' : 'text-brand-700'}`}>
                  +{gelLabel(t.tetri)}
                </span>
                {/* The button only where there is something to do. A row that is
                    already paid needs no door — and six doors would make a
                    finished profile look unfinished. */}
                {!on && (
                  <Btn href={taskHref(t.key)} size="sm" variant="secondary" className="shrink-0">
                    შევსება
                  </Btn>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      {/* ── The movements — the actual answer to „საიდან მოვიდა" ───────────── */}
      <Card className="mt-4">
        <Eyebrow as="h2" tone="muted">მოძრაობა</Eyebrow>
        {entries.length === 0 ? (
          <p className="mt-3 text-body text-ink-500">ჯერ არაფერი მოძრაობს.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
            {entries.map(e => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink-900">{creditReasonLabel(e.reason)}</span>
                  <span className="block text-meta text-ink-500">{fmtKaDateTime(e.createdAt, { year: true })}</span>
                </span>
                {/* ⚠️ THE SIGN IS DRAWN, NOT INFERRED FROM THE COLOUR. Green for
                    a grant and grey for a spend is a hierarchy somebody with a
                    colour deficiency does not receive; the „+" and „−" are the
                    fact, and the colour only agrees with them. */}
                <span className={`shrink-0 font-display text-body font-bold tabular-nums ${
                  e.amountTetri >= 0 ? 'text-brand-700' : 'text-ink-700'
                }`}>
                  {e.amountTetri >= 0 ? '+' : '−'}{gelLabel(Math.abs(e.amountTetri))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
