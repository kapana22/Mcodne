// /work — THE WORKSPACE HOME.
//
// ⚠️ WHAT THIS REPLACED (2026-08-20). This route used to live inside the
// `(expert)` group and render a SESSION dashboard: today's lesson, the month's
// calendar, how many free minutes had been published. Two things were wrong
// with it, and the second is the one that mattered:
//
//   · IT MEASURED THE HALF THAT IS NOT HAPPENING. Measured that day: 0 active
//     bookings against 6050 published slots, and `request_opened` 366 against
//     `booking_flow_opened` 198. A home screen that counts sessions tells a
//     provider their business is empty when it is not.
//   · A WORK-ONLY PROVIDER HAD NO HOME AT ALL. The (expert) layout redirected
//     them straight to /work/requests, so the first screen of their workspace
//     was a queue with no context and no balance.
//
// ⚠️ IT SITS OUTSIDE THE ROUTE GROUP AND CARRIES ITS OWN GATE, exactly like
// /work/services: `(provider)` 404s anybody the allowlist does not name, which
// is right for the queue and wrong for the home. Signed in, and selling
// something. 404 and never 403: a 403 tells a stranger the page is real.
//
// ⚠️ THE SESSION DASHBOARD IS GONE (2026-08-24) with the product it measured —
// which is what the note above already said about the version before it.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { isProvider as sellsHere } from '@/lib/capabilities'
import { requestsViewer, providerQueueScope } from '@/lib/requestsServer'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { queueWhere } from '@/lib/requestRouting'
import { PROVIDER_ROUTE, requestsOn } from '@/lib/requests'
import { creditTasks, completeness, taskHref, gelLabel, contactsLabel, TETRI, type CreditTaskKey } from '@/lib/credits'
import { balanceOf, profileFacts } from '@/lib/creditsServer'
import { earnedTasks } from '@/lib/credits'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmServicesNote } from './_components/ConfirmServicesNote'
import { CreditStrip } from './_components/CreditStrip'
import Link from 'next/link'
import { Card } from '@/components/Card'
import { tileHue } from '@/app/_home/data'

// Re-verified on every request, like the two group layouts beside it: this page
// must never be served from a render that outlived a session or a capability.
export const dynamic = 'force-dynamic'

// ⚠️ „— მცოდნე" (2026-09-01). This was the ONE screen in either room whose tab
// carried no site name: /work/jobs, /work/balance, /work/profile, /work/account
// and all three /me pages end in it. Measured today by reading the ten served
// <title>s. The name itself is `SPACE_LABEL.PROVIDER` (lib/roles) and is
// unchanged — it is what the user menu calls this room.
export const metadata: Metadata = { title: 'სამუშაო სივრცე — მცოდნე', robots: { index: false, follow: false } }

export default async function WorkHome() {
  const user = await getCurrentUser()
  if (!user) notFound()
  await ensureDbReady()

  const [provider, viewer] = await Promise.all([sellsHere(user.id), requestsViewer()])
  // ⚠️ ONE CONDITION SINCE 2026-08-24. It was two — „holds CONSULT" or „holds
  // WORK and is allowed" — and the first let somebody with a consultation
  // profile in. There is one profile now; `providerAllowed` still rides along
  // because an admin and a company member reach the queue by another door.
  const isProvider = provider && viewer.providerAllowed
  if (!isProvider && !viewer.providerAllowed) notFound()

  // ⚠️ THE GRANT MOVED UP TO THE SHELL (2026-08-21) — app/work/layout.tsx runs it
  // for every workspace screen, so a provider who fills a field in the services
  // editor is paid without first walking to this page. It used to run HERE and
  // only here, which is why nobody had a balance: this was the one screen the
  // service half was never routed to. The layout renders before this page, so
  // the numbers below are already current.
  const facts = await profileFacts(user.id)
  // ⚠️ READ OFF `facts`, NEVER QUERIED HERE. tests/requestQueue §F: this page
  // may not grow its own serviceProfile query, or the queue narrowing has two
  // sources that can disagree. `profileFacts` already reads the row.
  const unconfirmed = !facts.servicesConfirmed
  const earned = new Set<CreditTaskKey>(earnedTasks(facts))
  const [balance, scope] = await Promise.all([
    balanceOf(user.id),
    providerQueueScope(user),
  ])

  // The four counts, each one the question the cell asks. Everything is scoped
  // to this person: `queueWhere(scope)` is the SAME narrowing the queue page
  // and the nav badge apply, so the number here and the list there cannot
  // disagree — see lib/requestRouting.
  //
  // ⚠️ THE PAUSE TEST THAT USED TO SIT IN THIS GUARD IS GONE, and its absence
  // is the fix rather than an omission. It read `svc?.available !== false`,
  // which was a SECOND copy of a rule the narrowing already owns — and the
  // reason the helper exists at all is that two copies of this rule produced
  // two answers. A paused viewer now matches nothing through the clause, on
  // all three screens, for one reason.
  const mine = queueWhere(scope)
  const [openRequests, waiting, inHand, unread] = await Promise.all([
    isProvider && requestsOn()
      ? prisma.serviceRequest.count({
          where: { status: 'VERIFIED', offerCount: { lt: prisma.serviceRequest.fields.offerLimit }, ...mine },
        })
      : Promise.resolve(0),
    isProvider
      ? prisma.requestOffer.count({ where: { expertUserId: user.id, status: 'SENT' } })
      : Promise.resolve(0),
    isProvider
      ? prisma.requestOffer.count({ where: { expertUserId: user.id, status: 'ACCEPTED', doneAt: null } })
      : Promise.resolve(0),
    prisma.requestMessage.count({
      where: { fromClient: true, readByProviderAt: null, offer: { expertUserId: user.id } },
    }),
  ])

  /* ⚠️ THE FOUR-CELL BOARD STOOD HERE AND IT IS THE SAME FOUR NUMBERS
     (removed 2026-08-29). „ახალი მოთხოვნები · პასუხს ველოდები · ხელში მაქვს ·
     წაუკითხავი" — the first three are now the stages of one screen
     (app/work/_components/WorkTabs) and the fourth is the rail's own badge, so
     the home was a second place to learn a set of counts that are printed
     beside the work they belong to. Owner: „ერთი ნაკადი გახდეს", and: „ძალიან
     მარტივი და კომფორტული იყოს… რომ არ დაიბნეს."

     What a home is FOR is the one thing to do next. That is the band below:
     the queue when there is one, and otherwise the quiet truth. The two rows
     under it are a summary, not a second inbox — they carry no link, because
     every one of them is one click away in the rail. */
  const nextUp = isProvider && openRequests > 0
    ? { n: openRequests, label: 'მოთხოვნა შენს სერვისებზე', href: `${PROVIDER_ROUTE}/requests`, cta: 'ნახე' }
    : unread > 0
      ? { n: unread, label: 'წაუკითხავი შეტყობინება', href: '/work/messages', cta: 'გახსენი' }
      : null

  // The most valuable UNEARNED task — one, not a checklist. See CreditStrip.
  const tasks = creditTasks()
  const next = tasks.filter(t => !earned.has(t.key)).sort((a, b) => b.tetri - a.tetri)[0] ?? null

  return (
    <div>
      <PageHeader
        className="mb-6"
        title={`გამარჯობა${user.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}`}
        sub={openRequests > 0
          ? `${openRequests} ახალი მოთხოვნა გელოდება`
          : unread > 0
            ? `${unread} წაუკითხავი შეტყობინება`
            : 'დღეს ახალი არაფერია.'}
      />

      <div className="space-y-6">
        {/* FIRST on the page, above the balance and the board. It is the only
            thing here that asks the reader for something we cannot do for them,
            and it is the reason their card looks like three other people’s. */}
        {unconfirmed && <ConfirmServicesNote />}
        {/* ⚠️ ONLY WHERE THE RAIL IS NOT (2026-08-30). The rail now carries the
            balance's other half permanently — „კიდევ 40 ₾ პროფილის
            შევსებისთვის" — and the top bar carries the number itself
            (components/CreditPill). On a wide screen this card was therefore a
            THIRD statement of the same money on one page, with a second button
            to the same editor. It is not deleted, because the rail is
            `hidden lg:flex`: below that width this card is the ONLY place the
            unearned grant is said, and deleting it would fix a desktop
            duplicate by blinding every phone. One instance per viewport. */}
        <div className="lg:hidden">
        <CreditStrip
          balanceTetri={balance}
          percent={completeness(facts)}
          nextTask={next ? { label: next.label, tetri: next.tetri, why: next.why } : null}
          // ⚠️ THE EDITOR THAT OWNS THAT TASK, not the one that suits that
          // person (2026-08-21). This branched on the capability while a master
          // had no profile page — their photo and sentence lived inside „ჩემი
          // სერვისები", so one address answered everything. Both halves now open
          // one editor for the whole row since 2026-08-30 (`taskHref`), and
          // the button follows the task: see lib/credits → taskHref.
          editHref={next ? taskHref(next.key) : '/work/profile'}
        />
        </div>

        {/* ── THE ONE THING TO DO NEXT ──────────────────────────────────
            ⚠️ REBUILT 2026-08-31 FROM THE OWNER'S DESIGN CANVAS („mcodne.ge
            პროფილის რედიზაინი" → Work Profile). It was a pale `brand-50` link
            card that read like a notice; the canvas makes it the page's one
            dark surface with a gold action on it. The CONTENT is unchanged —
            the queue when there is one, otherwise the quiet truth — because
            that decision („ერთი ნაკადი გახდეს… რომ არ დაიბნეს") is the owner's
            own and was right.

            ⚠️ THE GOLD BUTTON IS THE ONE PLACE THE ACCENT BECOMES A CONTROL.
            ink-900 on #EFD48A measures 13.9:1; white or green on this gradient
            does not carry. Same rule as the profile's status band. */}
        {nextUp ? (
          <div className="relative overflow-hidden rounded-panel bg-[radial-gradient(120%_160%_at_8%_0%,#26806E_0%,#1E6656_46%,#123A31_100%)] px-6 py-7 text-white sm:px-8">
            <div className="flex flex-wrap items-center gap-6">
              <div className="min-w-[240px] flex-1">
                <p className="font-display text-micro font-bold uppercase text-white/60">ახლა ერთი საქმეა</p>
                <p className="mt-2 font-display text-h2 font-extrabold tracking-[-0.02em] tabular-nums">
                  {nextUp.n} {nextUp.label}
                </p>
                {/* ⚠️ NO PRICE ON THE ANSWER. Sending an offer costs nothing;
                    `CONTACT_COST_TETRI` is what OPENING A CLIENT'S CONTACT
                    costs, and saying „პასუხი — 1₾" here would put a price on
                    the wrong act. The balance is the true and useful fact. */}
                <p className="mt-2 max-w-[520px] text-body leading-[1.55] text-white/[0.76]">
                  ბალანსზე {gelLabel(balance)} გაქვს.
                </p>
              </div>
              <Link
                href={nextUp.href}
                style={{ backgroundColor: '#EFD48A' }}
                className="inline-flex h-[52px] shrink-0 items-center rounded-field px-6 font-display text-body-lg font-extrabold text-ink-900 transition-[filter] duration-fast hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
              >
                {nextUp.cta}
              </Link>
            </div>
          </div>
        ) : (
          <Card>
            <p className="text-body text-ink-700">დღეს ახალი არაფერია. მოთხოვნა როგორც კი გადამოწმდება, აქ გამოჩნდება.</p>
          </Card>
        )}

        {/* ── WHAT IS IN FLIGHT, AND WHAT IT COSTS TO ANSWER ────────────────
            Two panels side by side, the canvas's shape. „რა მიდის" carries no
            links — every one of its rows is one click away in the rail, two
            inches to the left. */}
        <div className="grid gap-4 lg:grid-cols-2">
          {(waiting > 0 || inHand > 0) && (
            <section className="rounded-panel border border-ink-100 bg-white p-6 sm:p-7">
              <h2 className="font-display text-h3 font-extrabold tracking-[-0.01em] text-ink-900">რა მიდის</h2>
              <div className="mt-4 border-t border-ink-100">
                {waiting > 0 && (
                  <div className="flex items-center gap-3.5 border-b border-ink-100 py-3.5 last:border-b-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-pill bg-ink-300" />
                    <span className="flex-1 text-body text-ink-800">გაგზავნილი შეთავაზება, პასუხს ველოდები</span>
                    <span className="font-display text-body-lg font-extrabold tabular-nums text-ink-900">{waiting}</span>
                  </div>
                )}
                {inHand > 0 && (
                  <div className="flex items-center gap-3.5 py-3.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-pill bg-brand-500" />
                    <span className="flex-1 text-body text-ink-800">ხელში მაქვს</span>
                    <span className="font-display text-body-lg font-extrabold tabular-nums text-ink-900">{inHand}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ⚠️ THE BALANCE PANEL IS DESKTOP-ONLY, AND `CreditStrip` ABOVE IS
              THE PHONE'S (`lg:hidden`). One instance per viewport — the rail
              carries the same two facts permanently from `lg` up, so a third
              statement of one number was what this page had before.
              ⚠️ NO TOP-UP CHIPS. The canvas draws „შევსება: 10₾ · 25₾ · 50₾".
              Measured 2026-08-31: the ONLY routes that write a balance are
              `/api/admin/users/[id]/credits` and the company one — a provider
              cannot add to their own balance at all, and `PAYMENTS_LIVE` is
              false. Three buttons that do nothing is a control that lies. */}
          <section className="hidden flex-col rounded-panel border border-ink-100 bg-white p-6 sm:p-7 lg:flex">
            <h2 className="font-display text-h3 font-extrabold tracking-[-0.01em] text-ink-900">ბალანსი</h2>
            <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
              <span className="font-display text-display font-extrabold tracking-[-0.03em] tabular-nums text-ink-900">
                {gelLabel(balance)}
              </span>
              {/* 🔒 DERIVED, NOT DECORATIVE — what that money actually opens
                  (lib/credits → contactsAffordable). */}
              {contactsLabel(balance) && (
                <span className="text-body text-ink-500 tabular-nums">
                  = {contactsLabel(balance)} კლიენტის კონტაქტი
                </span>
              )}
            </div>
            <div className="flex-1" />
            {next && (
              <Link
                href={taskHref(next.key)}
                style={{ backgroundColor: tileHue(1).bg, borderColor: tileHue(1).border }}
                className="mt-5 block rounded-tile border p-4 transition-[filter] duration-fast hover:brightness-[0.98]"
              >
                <p className="font-display text-body font-bold text-ink-900 tabular-nums">
                  {next.label} — +{next.tetri / TETRI}₾
                </p>
                <p className="mt-1 text-meta leading-[1.5] text-ink-600">{next.why}</p>
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
