// POST /api/requests — a client describes a problem.
//
// Shaped on app/api/business/lead/route.ts, which is this site's other gated
// form endpoint, and it keeps that file's two decisions:
//
//   1. THE GATE RUNS FIRST — before the rate-limit bucket, before the body is
//      read, before any DB work. A caller who may not see this subsystem must
//      not learn anything from it, including how fast it rate-limits. 404 and
//      never 403: a 403 confirms the endpoint is there.
//
//   2. IT WRITES A ROW FIRST, and the mail is a notification ABOUT that row.
//      /api/contact only emails, and a dropped SMTP delivery there loses the
//      message with nothing to recover from. A request is the deliverable here
//      — it is the only record that somebody wanted something — so the write
//      decides the response and the mail goes out afterwards via after().

import { NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureDbReady } from '@/lib/dbBoot'
import {
  ServiceRequestInput, serviceRequestRow,
  budgetLabel, timingLabel, formatLabel, cityLabel, topicLabel, extrasLabels, KIND,
} from '@/lib/requests'
import { requestsViewer, createServiceRequest } from '@/lib/requestsServer'
import { resolveRequestTarget } from '@/lib/requestTarget'
import { inviteProviderToRequest } from '@/lib/requestInvite'
import { accountForRequest } from '@/lib/requestAccount'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { sendMail } from '@/lib/mailer'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
import { triageFlags, triageNote } from '@/lib/requestTriage'
import { requestReceivedClientEmail } from '@/lib/emailTemplates'
import { mailVerifiedRequest } from '@/lib/requestJobs'
import { notifyMany } from '@/lib/notify'
import { ROLE } from '@/lib/roles'

export async function POST(req: Request) {
  const viewer = await requestsViewer()
  if (!viewer.clientAllowed) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }

  // Same budget as /api/contact and /api/business/lead: 5 an hour is generous
  // for a real person and hostile to a script. Keyed by IP because the form is
  // fillable without an account.
  const ip = clientIp(req)
  const rl = rateLimit(`service-request:${ip}`, 5, 60 * 60)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec },
      { status: 429 },
    )
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_JSON' }, { status: 400 })
  }

  // THE SAME schema the form validated with (lib/requests). A crafted POST is
  // judged by exactly the rules the browser applied, never by a second
  // hand-written copy — the gap that has silently broken two features here.
  const parsed = ServiceRequestInput.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })
  }

  // ── The honeypot ─────────────────────────────────────────────────────────
  // A field no human ever sees; anything in it came from something filling
  // every input on the page. Answered with `ok: true` and NO row: telling a bot
  // it was caught teaches whoever wrote it which field to skip next time, and
  // there is nobody on the other end to inform. Nothing real is lost — a human
  // cannot reach this branch.
  if ((parsed.data.website ?? '') !== '') {
    // `account` is present so this answer is shaped exactly like a real
    // no-email submit — the branch exists to be indistinguishable.
    return NextResponse.json({ ok: true, publicRef: null, rejected: false, account: 'NONE' })
  }

  const row = serviceRequestRow(parsed.data)

  // ── The sphere, DERIVED and then verified ────────────────────────────────
  // The person chose a TOPIC („ხელშეკრულება"); the sphere it belongs to comes
  // from lib/requestTopics, not from the body — nobody filling this form should
  // have to know the catalogue's filing system, and a client-supplied id would
  // be a value to validate for no gain.
  //
  // The slug is still looked up rather than trusted: the vocabulary can name a
  // sphere that has since been hidden or renamed, and a stale mapping must
  // leave the request unfiled rather than fail it. `null` is a normal outcome —
  // it means nobody on this platform is filed under what this person asked for,
  // which is precisely the thing worth measuring.
  await ensureDbReady()

  const category = row.categorySlug
    ? await prisma.category.findFirst({
        where: { slug: row.categorySlug, status: 'VISIBLE' },
        select: { id: true, name: true },
      }).catch(() => null)
    : null

  // ── THE BUDGET FLOOR IS GONE (2026-08-18) ────────────────────────────────
  //
  // It refused a request outright when its budget band was the lowest one, and
  // it was the single biggest hole in the funnel: 7 of 21 requests — ONE IN
  // THREE — were rejected on arrival, four of them 20₾ lessons. Those are not
  // bad requests. A 20₾ lesson is what a school pupil's budget looks like, and
  // a Georgian tutor taking 20₾ is a normal transaction that this platform was
  // refusing to carry.
  //
  // ⚠️ AND THE COMPETITION SETTLES IT. sheniani.ge — the closest local
  // reference — has no budget field AT ALL; their intake asks for a priority
  // („ეკონომიური / სწრაფი / პრემიუმი") and lets the tradesperson quote. We were
  // losing a third of our demand to a question they do not even ask.
  //
  // Owner, 2026-08-18: „ზღვარი მოხსენი."
  //
  // WHAT SURVIVES, deliberately:
  //   · the BANDS. A budget is still asked for and still stored — it is what an
  //     expert needs in order to bid, and losing it would make every offer a
  //     guess. It simply no longer disqualifies anybody.
  //   · `budgetIsBelowFloor` itself, and the `floor: true` flag it reads. The
  //     wizard still SHOWS a warning on that band (see RequestWizard) so
  //     somebody choosing it knows what to expect. Telling a person what is
  //     likely and refusing to take their money are different acts, and only
  //     the second one was wrong.
  //
  // The constant stays so the shape of this handler and its response contract
  // („rejected" is read by the form) do not change on the way through.
  const rejected = false

  // ── Does a person have to look at this before any expert does? ───────────
  // Until 2026-08-18 the answer was always yes, and that made the operator's
  // phone call the longest pause in the product — a request sent at 23:00 sat
  // untouched until morning while its sender watched „ვამოწმებთ" pulse. The
  // call is not gone; it is now the exception. See lib/requestTriage for why
  // every flag is a fact rather than a score.
  //
  // The repeat count is the one input this rule cannot compute for itself. A
  // narrow window on purpose: „four requests this hour" is worth a look, „four
  // requests this year" is a returning customer.
  const recentFromPhone = await prisma.serviceRequest.count({
    where: {
      phone: row.phone,
      createdAt: { gte: new Date(Date.now() - 3_600_000) },
    },
  })
  const flags = triageFlags({
    kind: parsed.data.kind,
    budgetBand: parsed.data.budgetBand,
    topic: parsed.data.topic,
    description: row.description ?? '',
    phone: row.phone,
    recentFromPhone,
  })
  // REJECTED wins over everything: a request under the floor is answered, not
  // routed, whatever else is true about it.
  const autoVerified = !rejected && flags.length === 0

  // The write decides the response. If this throws, the person is told it
  // failed and can send again — the honest outcome, because nothing was
  // recorded.
  // `categorySlug` is a lookup key, not a column — it is resolved to an id
  // above and must not reach the writer.
  const { categorySlug: _slug, ...columns } = row
  const created = await createServiceRequest({
    ...columns,
    categoryId: category?.id ?? null,
    // ⚠️ VERIFIED WITHOUT A HUMAN, when nothing was flagged. „Verified" has
    // always meant „somebody spoke to them", and this widens it to „nothing
    // about this needs a call first" — which is the honest reading of what the
    // status gates: whether experts may see it. The operator still phones every
    // row; they simply no longer stand in front of it.
    status: rejected ? 'REJECTED' : autoVerified ? 'VERIFIED' : 'NEW',
    // Set here rather than by the admin, because the lifecycle clock measures
    // from it (lib/requestRouting → the nudge and close timers all read
    // `verifiedAt`). An auto-verified row with a null stamp would never be
    // nudged and never close.
    ...(autoVerified ? { verifiedAt: new Date() } : {}),
    // The operator's queue must say WHY this one is waiting, or „NEW" is just a
    // pile. Written into the note they already read.
    ...(flags.length ? { adminNote: triageNote(flags) } : {}),
    // Attached when a signed-in account submitted it. At stage 1 that is
    // usually the tester; the column exists so the client's own history is
    // findable later without them retyping a reference.
    userId: viewer.user?.id ?? null,
  })

  // ── The person they came from ────────────────────────────────────────────
  //
  // ⚠️ THE SAME CODE PATH THE ROOM'S „მიწერე" BUTTON USES, not a second one:
  // lib/requestInvite writes the INVITED offer and everything it guarantees
  // holds here too — no price, no place consumed against `offerLimit`, not
  // acceptable, contact still masked, and the provider gets the notification
  // they already get today. A visitor who tapped somebody's „გამოაგზავნე
  // მოთხოვნა" now lands in a room that already has that person's thread in it,
  // instead of one that is empty until somebody happens to bid.
  //
  // ⚠️ THE SLUG IS RE-RESOLVED HERE. The browser sent a public address, not a
  // decision — this asks the database again, against the catalogue's own
  // visibility rule, so a crafted body can only ever name somebody the site
  // already lists in public.
  //
  // ⚠️ AND IT NEVER FAILS THE REQUEST. An unknown slug, a company-owned profile
  // with nobody to write to, a provider not on the allowlist, a REJECTED row:
  // every one of them is a thread that does not open, and none of them is a
  // reason to lose the request that was just written. The endpoint answers the
  // same either way — the invite is an extra, and the row is the deliverable.
  const toRaw = typeof (json as { to?: unknown })?.to === 'string' ? (json as { to: string }).to : null
  if (toRaw) {
    try {
      const target = await resolveRequestTarget(toRaw, row.kind === 'SERVICE' ? 'SERVICE' : 'EXPERT')
      if (target?.userId) {
        await inviteProviderToRequest(
          { id: created.id, status: rejected ? 'REJECTED' : autoVerified ? 'VERIFIED' : 'NEW', topic: row.topic },
          target.userId,
        )
        // ⚠️ ADDRESSED, NOT BROADCAST (2026-08-20). Owner: „თუ მცოდნესთან
        // აგზავნის, მხოლოდ მცოდნესთან უნდა მივიდეს."
        //
        // Until today a request that named somebody still went out to everybody:
        // `offerLimit` stayed at its default 3 and the provider queue had no
        // exclusion, so a client who had read this person's page, seen „ბინის
        // დალაგება — 90₾" and pressed „დაკვეთა" got two cold quotes from
        // strangers — and learned that the price they read was not a price. The
        // „შენ აგირჩია" badge the provider now sees was true and useless: chosen,
        // and still in a race.
        //
        // `offerLimit: 1` IS the exclusion, and deliberately so: it is one
        // existing column, every surface already reads it (`placesLeft`,
        // `requestIsOpen`, the queue's own `offerCount < offerLimit` filter), and
        // it is the single value the client's „გავხსნა სხვებისთვის?" button
        // raises back to 3. No new column, no new state machine, nothing to keep
        // in step. The INVITED row still consumes no place (lib/requestInvite),
        // so the one place stays open for the person it was addressed to.
        //
        // Written as an UPDATE rather than a field on `create` because the
        // target is re-resolved against the database AFTER the row exists — the
        // rule this whole block is built on: the request is the deliverable and
        // must survive a failed invite. If the invite throws, the request stays
        // a normal open one, which is the honest fallback.
        await prisma.serviceRequest.update({
          where: { id: created.id },
          data: { offerLimit: 1 },
        }).catch(() => {})
      }
    } catch { /* best-effort: the request is the deliverable */ }
  }

  // ── The account, made in parallel ────────────────────────────────────────
  // AFTER the write, deliberately: the request is the deliverable and must
  // survive anything that happens here. See lib/requestAccount for the four
  // outcomes — the one that matters is that a KNOWN email attaches the request
  // but never opens a session.
  //
  // Not inside after(): creating the session sets a cookie, and a cookie
  // written after the response has flushed reaches nobody.
  const account = await accountForRequest({
    signedInUserId: viewer.user?.id ?? null,
    email: row.email,
    contactName: row.contactName,
    phone: row.phone,
  })
  if (account.userId && account.userId !== viewer.user?.id) {
    // Best-effort: an unlinked request is still a request, and the admin panel
    // reads the contact fields either way.
    await prisma.serviceRequest
      .update({ where: { id: created.id }, data: { userId: account.userId } })
      .catch(() => null)
  }

  // …and the notification AFTER the response has flushed. Mail costs a remote
  // round-trip and the sender should not wait for it; a failure here loses a
  // notification, never the request — the row is committed and the admin queue
  // reads the table, not the inbox.
  //
  // A REJECTED request is deliberately NOT mailed: nobody is going to phone it,
  // so a mail about it is a mail that trains the reader to ignore the subject
  // line. It is still in the panel under its own filter.
  // ⚠️ AUTOMATIC, AND IT CAN ONLY EVER REACH PEOPLE YOU ADDED BY HAND.
  //
  // Owner, 2026-08-18: „ამ ეტაპზე ავტომატიზირებული იყოს, თუმცა მხოლოდ ხელით
  // შექმნილ ექსპერტებს გაუგზავნე." The second half needs no switch — it is how
  // the audience is built. `routableProviders()` reads `RequestAccess`, a table
  // nothing populates but an admin, so „everybody" here has never meant every
  // account on the site; it means every person on a list somebody curated. A
  // request cannot reach a stranger because there are no strangers on it.
  //
  // ⚠️ AND THE OPERATOR STILL HAS THE WHEEL, IN PARALLEL. This is the automatic
  // path; POST /api/admin/requests/[id] is the manual one — an explicit list of
  // recipients, repeatable, audited per run. Neither replaces the other: the
  // automatic send stops requests dying in the queue, the manual send is how you
  // reach somebody who joined afterwards, or how you send one request to every
  // chemistry teacher on purpose.
  //
  // After the response: the sender should not wait on a fan-out of emails, and a
  // failure here loses notifications rather than the request.
  if (autoVerified) {
    after(async () => {
      try { await mailVerifiedRequest(created.id) } catch { /* best-effort */ }
    })
  }
  // ⚠️ THE CLIENT'S OWN RECEIPT, AND IT GOES FIRST (2026-08-18). Until now this
  // endpoint mailed exactly one address — the operator's — so somebody who
  // closed the tab before an offer arrived had no route back to their own
  // request: the code lived only on the screen they had just closed. The
  // address has been REQUIRED since 2026-08-17 „because every client
  // notification is an email"; this was the notification that was missing.
  //
  // Sent even on a REJECTED request. Being told „we cannot help at this budget"
  // and being told nothing at all are different things, and the thread on their
  // page is open precisely so a refused person can ask „და 300₾-ზე?" — a thread
  // they cannot find is a thread that is not open.
  if (row.email) {
    const to = row.email
    after(async () => {
      try {
        await sendMail({
          to,
          ...requestReceivedClientEmail({
            publicRef: created.publicRef,
            topicLabel: topicLabel(parsed.data.topic),
          }),
        })
      } catch { /* best-effort; the request is committed either way */ }
    })
  }

  if (!rejected) {
    // ── The admins' bell (D10, 2026-08-19) ─────────────────────────────────
    // The same ping app/api/applications sends as APPLICATION_NEW: the row is
    // in the queue either way, but a queue nobody is told about is read when
    // somebody happens to open /admin. REQUEST_NEW is not pref-gated (lib/
    // notify) — an ops signal to staff, not marketing. Best-effort, after the
    // response, like every notification here.
    after(async () => {
      try {
        const admins = await prisma.user.findMany({ where: { role: ROLE.ADMIN }, select: { id: true } })
        await notifyMany(admins.map(a => a.id), {
          type: 'REQUEST_NEW',
          title: 'ახალი მოთხოვნა',
          body: `${created.publicRef} · ${topicLabel(row.topic)}`,
          href: '/admin#requests',
        })
      } catch { /* best-effort */ }
    })
    after(async () => {
      try {
        const esc = escapeHtml
        const lines: [string, string | null][] = [
          ['კოდი', created.publicRef],
          ['ტიპი', KIND[parsed.data.kind].label],
          ['რა', topicLabel(row.topic)],
          // Named as „—" rather than omitted when the topic maps nowhere: an
          // absent line reads as „not asked", and this one WAS asked and came
          // back empty, which is the interesting answer.
          ['კატეგორია', category?.name ?? '— (ამ კატეგორიაში ექსპერტი არ გვყავს)'],
          ['ბიუჯეტი', budgetLabel(parsed.data.kind, row.budgetMin, row.budgetMax)],
          [KIND[parsed.data.kind].timingLabel, timingLabel(parsed.data.kind, row.timing)],
          ...extrasLabels(parsed.data.kind, row.topic, row.details).map(e => [e.label, e.value] as [string, string | null]),
          ['ფორმატი', formatLabel(row.format)],
          ['ქალაქი', cityLabel(row.city)],
          ['სახელი', row.contactName],
          ['ტელეფონი', row.phone],
          ['ელფოსტა', row.email],
        ]
        const html = `
          <div style="font-family:sans-serif;line-height:1.6;color:#181B20">
            <h2 style="margin:0 0 12px">ახალი მოთხოვნა — მცოდნე</h2>
            ${lines.filter(([, v]) => v).map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v!)}</p>`).join('')}
            ${row.description ? `<hr style="border:none;border-top:1px solid #DCDFE4;margin:16px 0" />
            <p style="white-space:pre-wrap">${esc(row.description)}</p>` : ''}
          </div>`
        const text = lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
          + (row.description ? `\n\n${row.description}` : '')

        await sendMail({
          // The same destination as the contact form and the B2B lead:
          // CONTACT_INBOX overrides, and the fallback is the one advertised
          // support address, read from lib/supportEmails and never typed as a
          // literal. Deliberately NOT a new REQUESTS_INBOX variable — a second
          // address to configure is a second address to forget, and it is the
          // same person reading all three.
          to: process.env.CONTACT_INBOX || SUPPORT_EMAIL,
          // Reply-To = the person who wrote in, so hitting Reply answers them.
          // It is user input, so it becomes a header only after CR/LF stripping
          // — an unvalidated string here is a header-injection hole. The value
          // already passed zod's .email(), which admits no newline.
          replyTo: row.email?.replace(/[\r\n]/g, '').trim() || undefined,
          subject: `[მცოდნე] მოთხოვნა ${created.publicRef}`,
          html,
          text,
        })
      } catch { /* email is best-effort — the row is what matters */ }
    })
  }

  // `rejected` is returned so the form can say so plainly instead of promising
  // a call that will not come. The reference goes back either way — it is their
  // own record, and a refused request is still a request they made.
  return NextResponse.json({
    ok: true,
    publicRef: created.publicRef,
    rejected,
    // ⚠️ WHETHER A PERSON STILL HAS TO READ IT BEFORE ANYBODY ELSE DOES
    // (2026-08-18). The thanks screen said „დაგირეკავთ მითითებულ ნომერზე" to
    // everybody — which stopped being true the day triage started releasing
    // clean requests automatically. Most senders are now told about their
    // request within seconds and nobody phones them, so the one sentence they
    // read on the way out was describing a step that had already been skipped.
    //
    // The screen needs the answer and cannot compute it: `triageFlags` runs
    // here, against a repeat-count only the database knows.
    autoVerified,
    // What the thanks screen says about the account. Never the userId — the
    // browser has no use for it and it is somebody's identifier.
    account: account.outcome,
  })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
