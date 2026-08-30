// /provider/requests/[id] — the full request, the contact, and the form.
//
// Same contact rule as the list it came from: the row is shaped by
// `providerRequestView` (lib/requests) and the client's name, phone and email
// are not parameters of that function.
//
// ⚠️ AND THAT IS EXACTLY WHY THIS PAGE HAS A SECOND SELECT (2026-08-21). The
// client's contact is now something a provider BUYS — 1₾ once per request, POST
// /api/provider/requests/[id]/contact — so this screen has to be able to show
// it. It does so without widening `ProviderRequestRow`: the three columns are
// fetched by their own query, `CLIENT_CONTACT_SELECT`, which is reachable only
// inside `if (unlocked)`. A rule enforced by what is FETCHED is a rule a future
// render cannot forget; a nullable field on the shared row would be one a
// future render forgets on its first day.

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  providerRequestView, timeAgoKa, KIND, kindOf,
  CLIENT_CONTACT_SELECT, clientContactView, type ClientContact,
} from '@/lib/requests'
import { requestsViewer } from '@/lib/requestsServer'
import { contactUnlocked, contactCountOf } from '@/lib/creditsServer'
import { PageHeader } from '@/components/PageHeader'
import { Eyebrow } from '@/components/Eyebrow'
import { Card } from '@/components/Card'
import { Btn } from '@/components/Btn'
import { RequestMessage } from './_message'
import { ContactCard } from './_contact'
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
      // ⚠️ THE ONE SCREEN THAT MAY SELECT THE BLOBS (2026-08-29). `photos` is a
      // `String[]` of base64 data URIs — a list payload must never carry it
      // (see prisma/schema) — and this is the DETAIL page for exactly one
      // request, which is the whole reason it may. It is also the screen where
      // the photos do their work: a provider naming a price wants to see the
      // tap, not read about it.
      photos: true,
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

  // ── The contact: has this provider paid for it? ──────────────────────────
  //
  // ⚠️ THE LEDGER IS THE AUTHORISATION, not this page. `contactUnlocked` reads
  // the one row `contactKey(requestId)` writes (lib/creditsServer), so „may I
  // see this number" has exactly one answer and it is the same one the charge
  // wrote. Only when it says yes are the columns fetched at all.
  //
  // ⚠️ A COMPANY MEMBER IS NEVER UNLOCKED, because they can never be charged —
  // the ledger is keyed on a USER and a company's lead must not come out of a
  // personal balance. The endpoint refuses them with COMPANY_UNSUPPORTED and
  // this simply never asks; measured 2026-08-21, no company holds active
  // request access.
  const expertUserId = p?.kind === 'EXPERT' ? p.userId : null
  const unlocked = expertUserId ? await contactUnlocked(expertUserId, row.id) : false
  const contact: ClientContact | null = unlocked
    ? clientContactView(await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: row.id },
        select: CLIENT_CONTACT_SELECT,
      }))
    : null
  // How many providers already hold this client's number. Display only — the
  // cap is claimed inside the INSERT, because a count read before a write loses
  // to a second tab (CLAUDE.md's fourth rule).
  const contactsTaken = await contactCountOf(row.id)

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

        {/* ── What it looks like ──────────────────────────────────────────
            ⚠️ ABOVE THE CONTACT AND ABOVE THE FORM, because it is what the
            price is being named FOR. A provider reads the sentence, looks at
            the picture, and writes a figure; putting the photos after the offer
            form would put them after the decision. Nothing is drawn when there
            are none — a heading over an empty row is the page apologising for
            somebody (2026-08-29). */}
        {r.photos.length > 0 && (
          <section>
            <Eyebrow tone="muted" className="mb-3">ფოტო კლიენტისგან</Eyebrow>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {r.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="w-full aspect-[4/3] object-cover rounded-card border border-ink-200 bg-ink-100"
                />
              ))}
            </div>
          </section>
        )}

        {/* ── The client's contact ────────────────────────────────────────
            ⚠️ BEFORE THE OFFER FORM, NOT AFTER IT (owner, 2026-08-21). The
            provider reads the job — free — decides it is worth a call, pays 1₾,
            and may then phone, or bid, or do nothing. The order on the screen is
            the order of the decision.

            Shown while the request is live and this provider could still buy it,
            and shown for ever once they have: a number they paid for must not
            disappear because the client later chose somebody else. An admin and
            a company member see nothing here — neither can be charged. */}
        {expertUserId && (contact || outcome === 'OPEN') && (
          <ContactCard
            requestId={r.id}
            offerLimit={row.offerLimit}
            taken={contactsTaken}
            initial={contact}
          />
        )}

        {/* ── What happened, and the one place to go next ──────────────────
            Four states, one card. WON links to /work/offers because that is
            where the conversation with the client is. It used to say „the
            client's phone number is there"; on 2026-08-21 the number stopped
            being shown anywhere (owner: „არ უჩანდეს ეგრევე ტელეფონი"), so both
            the sentence and the button label say the thread instead. */}
        {outcome === 'WON' ? (
          <Card className="border-brand-300">
            <h2 className="font-display text-h3 font-bold text-ink-900 tracking-tight">კლიენტმა შენ აგირჩია</h2>
            <p className="mt-2 text-body text-ink-600">მიმოწერა შეთავაზებებშია — იქ შეათანხმეთ დანარჩენი.</p>
            <div className="mt-4">
              <Btn href="/work/offers" size="sm">მიმოწერა</Btn>
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
