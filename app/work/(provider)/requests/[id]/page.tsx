// /provider/requests/[id] — the full request, and the form to answer it.
//
// Same contact rule as the list it came from: the row is shaped by
// `providerRequestView` (lib/requests) and the client's name, phone and email
// are not parameters of that function. The only thing this page adds over the
// card is the whole description and the form.

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import { providerRequestView, timeAgoKa, KIND, kindOf } from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { RequestMessage } from './_message'
import { OfferForm } from './OfferForm'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // The layout already gated the segment; this call is for the provider
  // IDENTITY, which decides whether the form is drawn and whether their own
  // offer already exists.
  const viewer = await requestsViewer()
  // ⚠️ THE ALLOWLIST, CHECKED HERE TOO (2026-08-17). This call used to be for
  // the provider IDENTITY only, leaving the segment layout as the single
  // enforcement point for the whole detail page — and lib/requestsServer says
  // plainly that neither layer may be load-bearing alone.
  if (!viewer.providerAllowed) notFound()
  const { id } = await params

  await ensureDbReady()

  const row = await prisma.serviceRequest.findUnique({
    where: { id },
    select: {
      // ⚠️ NOT publicRef — it is the client's credential and no provider
      // surface may hold it, let alone render it. See lib/requests →
      // ProviderRequestRow.
      id: true, kind: true, topic: true, description: true,
      budgetMin: true, budgetMax: true, budgetUnit: true,
      timing: true, format: true, city: true, status: true, details: true,
      offerCount: true, offerLimit: true, createdAt: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  })
  if (!row) notFound()

  // Has this provider already answered? One offer per provider per request is a
  // database constraint (the two unique indexes), so the form would fail with
  // ALREADY_OFFERED — telling them beforehand is the difference between a
  // screen that knows what it is showing and one that finds out on submit.
  //
  // Read BEFORE the visibility rule below, because on a settled request it IS
  // the visibility rule.
  // ⚠️ AN INVITED ROW IS NOT AN ANSWER (2026-08-18). Since a client can now
  // write to an expert before anybody has bid, this provider may already OWN a
  // row on this request without having offered anything — and without the
  // filter below the page would tell them „უკვე გაქვს გაგზავნილი" and hide the
  // form, so the one expert the client actually reached out to would be the one
  // expert who could not answer with a price.
  const p = viewer.provider
  const mine = p
    ? await prisma.requestOffer.findFirst({
        where: {
          requestId: row.id,
          status: { not: 'INVITED' },
          ...(p.kind === 'EXPERT' ? { expertUserId: p.userId } : { companyId: p.companyId }),
        },
        select: { id: true, status: true },
      })
    : null

  // ── WHO MAY OPEN THIS, BY STATUS ─────────────────────────────────────────
  //
  // ⚠️ THIS USED TO BE `status !== 'VERIFIED' → notFound()`, and that one line
  // killed the link the moment the client chose somebody (owner, 2026-08-17).
  // The notification a provider receives points HERE; accepting an offer moves
  // the request to MATCHED; so the winner's own link 404s at exactly the moment
  // it starts to matter — and every provider who bid and lost gets a wall
  // instead of an answer.
  //
  // NEW and REJECTED still 404 for everyone, unchanged and for the original
  // reason: nobody has read them yet, they may be spam, and „this exists but
  // you cannot see it" is information a bidder has no use for.
  //
  // MATCHED and CLOSED are visible to the people who have a stake in them — a
  // provider who actually made an offer, and an admin. Not to a passer-by:
  // that would turn a settled request into a browsable archive of what other
  // people asked for.
  const isAdmin = viewer.user?.role === 'ADMIN'
  const settled = row.status === 'MATCHED' || row.status === 'CLOSED'
  const mayOpen =
    row.status === 'VERIFIED' ||
    (settled && (mine !== null || isAdmin))
  if (!mayOpen) notFound()

  const r = providerRequestView(row)
  // What this provider is looking at, in one word — the card on the right and
  // the sub-line under the title must agree, and deriving both from one value
  // is how they stay agreeing.
  const outcome: 'OPEN' | 'WON' | 'LOST' | 'SETTLED' =
    !settled ? 'OPEN'
    : mine?.status === 'ACCEPTED' ? 'WON'
    : mine ? 'LOST'
    : 'SETTLED'

  return (
    <>
      <div className="mb-5">
        <Btn href="/work/requests" variant="ghost" size="sm" iconLeft={<span aria-hidden>←</span>}>
          ყველა მოთხოვნა
        </Btn>
      </div>

      {/* ⚠️ THE CLIENT'S REFERENCE IS NOT PRINTED ON THIS PAGE, AND MUST NEVER
          BE (2026-08-17). `publicRef` is not a display code — it is the
          client's ENTIRE credential: possession of it authorises reading their
          thread with us, writing to us AS them, and POSTing
          /api/requests/<ref>/accept, which settles the request and opens the
          contact. The eyebrow below used to read `${kindLabel} · ${publicRef}`,
          so every allowlisted provider read it on every VERIFIED request
          BEFORE bidding — and could then accept their own offer on the client's
          behalf. Nothing else was needed: the accept route authorises on the
          reference alone, by design, because the client has no account.
          A provider needs no code. They arrive by a link carrying the request
          id, and the topic is what they recognise it by. */}
      <PageHeader
        // The category is the eyebrow's job, beside the kind: the TITLE is what
        // the client wrote, so this page and the card it was opened from say
        // the same thing. See requestHeadline in lib/requests.
        eyebrow={`${r.kindLabel} · ${r.topicLabel}`}
        title={r.headline}
        // „N ადგილი" is an invitation to bid, so it is said only while bidding
        // is possible. On a settled request the same line would be an invitation
        // to a table that is no longer laid.
        sub={outcome === 'OPEN'
          ? `${timeAgoKa(r.createdAt)} · ${r.placesLeft} ადგილი ${r.offerLimit}-დან${
              r.offerLimit - r.placesLeft === 0 ? ' · ჯერ შეთავაზება არ არის' : ''
            }`
          : `${timeAgoKa(r.createdAt)} · დახურულია`}
      />

      {/* ── ONE COLUMN, NOT TWO (2026-08-17) ───────────────────────────────
          It was `1fr / 400px`: the request on the left, the offer form parked in
          a right rail. That layout says the two are separate objects a provider
          consults side by side — and they are not. One is what somebody asked;
          the other is the answer to it. Stacked, in a reading column, the page
          reads in the order the work happens: read the message, write the reply.

          720 rather than the shell's full width for the ordinary reason a
          conversation is narrow — at 1280 the message bubble ran to a line
          length nobody reads comfortably, and the form's two number fields sat
          marooned in a rail with white space either side (owner, 2026-08-17:
          the screen „უფრო კომფორტული" is the one that looks like a chat). */}
      <div className="mt-6 max-w-[720px] flex flex-col gap-6">
        <RequestMessage
          topicLabel={r.topicLabel}
          description={r.description}
          createdAt={r.createdAt}
          facts={[
            { label: 'ბიუჯეტი', value: r.budgetLabel },
            { label: r.kind === 'LEARNING' ? 'სიხშირე' : r.kind === 'SERVICE' ? 'როდის' : 'ვადა', value: r.timingLabel },
            ...r.extras.map(e => ({ label: e.label, value: e.value })),
            // ⚠️ NO „ფორმატი" ON A SERVICE. The kind decides it — somebody has
            // to be in the room — so the row would print „ადგილზე" on every
            // single one, which is a line that has never told anybody anything.
            // The city, which DOES vary, stays.
            ...(r.kind === 'SERVICE' ? [] : [{ label: 'ფორმატი', value: r.formatLabel }]),
            { label: 'ქალაქი', value: r.cityLabel },
          ]}
        />

        {/* ── What happened, and the one place to go next ──────────────────
            Four states, one card. WON links to /provider/offers because that is
            where the client's phone number is — `clientContactFor` is the only
            thing allowed to reveal it, and it lives there. Repeating the number
            here would be a second place that rule has to hold. */}
        {outcome === 'WON' ? (
          <Card className="border-brand-300">
            <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">კლიენტმა შენ აგირჩია</h2>
            <p className="mt-2 text-body text-ink-600">კონტაქტი გახსნილია — შეთავაზებებში ნახავ.</p>
            <div className="mt-4">
              <Btn href="/work/offers" size="sm">კონტაქტი და მიმოწერა</Btn>
            </div>
          </Card>
        ) : outcome === 'LOST' ? (
          <Card>
            <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">კლიენტმა სხვა აირჩია</h2>
            {/* Said plainly and once. The same sentence the closed thread shows,
                so a provider is not told two different things about one outcome. */}
            <p className="mt-2 text-body text-ink-600">ეს მოთხოვნა დახურულია.</p>
            <div className="mt-4">
              <Btn href="/work/requests" variant="secondary" size="sm">ყველა მოთხოვნა</Btn>
            </div>
          </Card>
        ) : outcome === 'SETTLED' ? (
          // Only an admin reaches this — a provider with no offer on a settled
          // request was 404ed above.
          <Card>
            <p className="text-body text-ink-600">მოთხოვნა დახურულია.</p>
          </Card>
        ) : mine ? (
          <Card>
            <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">უკვე გაქვს გაგზავნილი</h2>
            <p className="mt-2 text-body text-ink-600">კლიენტი თუ აგირჩევს, შეტყობინებას მიიღებ.</p>
            <div className="mt-4">
              <Btn href="/work/offers" variant="secondary" size="sm">ჩემი შეთავაზებები</Btn>
            </div>
          </Card>
        ) : p ? (
          <OfferForm
            requestId={r.id}
            kind={r.kind}
            budgetMin={row.budgetMin}
            budgetMax={row.budgetMax}
            unitLabel={KIND[kindOf(r.kind)].unitLabel}
          />
        ) : (
          // The admin case. The shell already says it at the top; repeating it
          // where the form would be is what stops them looking for one.
          <Card>
            <p className="text-body text-ink-600">შეთავაზების დაწერა ადმინს არ შეუძლია.</p>
          </Card>
        )}
      </div>
    </>
  )
}
