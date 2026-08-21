// /work — THE WORKSPACE HOME, for whoever holds either capability.
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
// ⚠️ IT SITS OUTSIDE BOTH ROUTE GROUPS AND CARRIES ITS OWN GATE, exactly like
// /work/services and for the same reason: `(expert)` requires the EXPERT role
// and `(provider)` 404s anybody the allowlist does not name, so neither is
// right for a page BOTH must open. The gate below is the two old gates kept
// side by side — signed in, and holding at least one capability. 404 and never
// 403: a 403 tells a stranger the page is real.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { capabilitiesOf } from '@/lib/capabilities'
import { requestsViewer } from '@/lib/requestsServer'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { routingWhere } from '@/lib/serviceProfile'
import { PROVIDER_ROUTE, requestsOn } from '@/lib/requests'
import { creditTasks, completeness, type CreditTaskKey } from '@/lib/credits'
import { balanceOf, profileFacts } from '@/lib/creditsServer'
import { earnedTasks } from '@/lib/credits'
import { PageHeader } from '@/components/PageHeader'
import { CreditStrip } from './_components/CreditStrip'
import { DayBoard, type BoardCell } from './_components/DayBoard'
import { SessionDashboard } from './_components/SessionDashboard'

// Re-verified on every request, like the two group layouts beside it: this page
// must never be served from a render that outlived a session or a capability.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'სამუშაო სივრცე', robots: { index: false, follow: false } }

export default async function WorkHome() {
  const user = await getCurrentUser()
  if (!user) notFound()
  await ensureDbReady()

  const caps = await capabilitiesOf(user.id)
  const viewer = await requestsViewer()
  const isProvider = caps.includes('WORK') && viewer.providerAllowed
  const isExpert = caps.includes('CONSULT')
  if (!isProvider && !isExpert) notFound()

  // ⚠️ THE GRANT MOVED UP TO THE SHELL (2026-08-21) — app/work/layout.tsx runs it
  // for every workspace screen, so a provider who fills a field in the services
  // editor is paid without first walking to this page. It used to run HERE and
  // only here, which is why nobody had a balance: this was the one screen the
  // service half was never routed to. The layout renders before this page, so
  // the numbers below are already current.
  const facts = await profileFacts(user.id)
  const earned = new Set<CreditTaskKey>(earnedTasks(facts))
  const [balance, svc] = await Promise.all([
    balanceOf(user.id),
    isProvider
      ? prisma.serviceProfile.findFirst({
          where: { OR: [{ userId: user.id }, { company: { members: { some: { userId: user.id } } } }] },
          select: { services: true, areas: true, available: true },
        })
      : Promise.resolve(null),
  ])

  // The four counts, each one the question the cell asks. Everything is scoped
  // to this person: `routingWhere` is the SAME narrowing the queue page applies,
  // so the number here and the list there cannot disagree.
  const mine = routingWhere(svc) ?? {}
  const [openRequests, waiting, inHand, unread] = await Promise.all([
    isProvider && svc?.available !== false && requestsOn()
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

  const cells: BoardCell[] = []
  if (isProvider) {
    cells.push(
      { href: `${PROVIDER_ROUTE}/requests`, label: 'ახალი მოთხოვნები', n: openRequests, quiet: 'ჯერ არაფერია', icon: 'list', urgent: true },
      { href: `${PROVIDER_ROUTE}/offers`, label: 'პასუხს ველოდები', n: waiting, quiet: 'გაგზავნილი არაფერია', icon: 'send' },
    )
  }
  cells.push(
    { href: '/work/jobs', label: 'ხელში მაქვს', n: inHand, quiet: 'მიმდინარე არაფერია', icon: 'calendar' },
    { href: '/work/messages', label: 'წაუკითხავი', n: unread, quiet: 'ყველაფერი წაკითხულია', icon: 'chat', urgent: true },
  )

  // The most valuable UNEARNED task — one, not a checklist. See CreditStrip.
  // ⚠️ THE WORDING FOLLOWS THE CAPABILITY, the amount does not (lib/credits).
  // „ატვირთე სერტიფიკატი" is meaningless to somebody who cleans flats; the same
  // 20₾ says „ატვირთე ნამუშევრის ფოტო" on their half. CONSULT wins when a
  // person holds both, because that profile is the one with more fields in it.
  const tasks = creditTasks(isExpert ? 'CONSULT' : 'WORK')
  const next = tasks.filter(t => !earned.has(t.key)).sort((a, b) => b.tetri - a.tetri)[0] ?? null

  return (
    <div>
      <PageHeader
        className="mb-6"
        eyebrow="სამუშაო სივრცე"
        title={`გამარჯობა${user.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}`}
        sub={openRequests > 0
          ? `${openRequests} ახალი მოთხოვნა გელოდება`
          : unread > 0
            ? `${unread} წაუკითხავი შეტყობინება`
            : 'დღეს ახალი არაფერია.'}
      />

      <div className="space-y-6">
        <CreditStrip
          balanceTetri={balance}
          percent={completeness(facts)}
          nextTask={next ? { label: next.label, tetri: next.tetri, why: next.why } : null}
          // The editor that owns those fields. /work/profile is inside the
          // (expert) group and would bounce a WORK-only provider straight back
          // out; /work/services is the page BOTH can open, and it is where a
          // provider's about, photo, trades, areas and prices actually live.
          editHref={isExpert ? '/work/profile' : '/work/services'}
        />

        <DayBoard cells={cells} />

        {/* The sessions half — only for somebody who actually takes bookings,
            and BELOW the board rather than around it. See SessionDashboard. */}
        {isExpert && <SessionDashboard />}
      </div>
    </div>
  )
}
