// Branded transactional email templates (Georgian). Each builder returns
// { subject, html }. Inline styles only — email clients strip <style>/external
// CSS. Brand green #2F9C86 (the logo teal), neutral ink, no external assets.

import { SUPPORT_EMAIL } from './supportEmails'
import { fmtKaDateTime, type KaDateOpts } from './kaDate'
import { topicLabel } from './requestTopics'

const BASE = 'https://mcodne.ge'

/**
 * A link to a page that REQUIRES A SESSION, routed through sign-in.
 *
 * ⚠️ THE BUG THIS EXISTS FOR (2026-08-17, owner holding the dead link). Every
 * provider-side surface answers `notFound()` rather than redirecting — a
 * deliberate rule, and the right one: a redirect to /signin tells a stranger
 * guessing URLs that the page is real and worth coming back to with an account.
 *
 * But an EMAIL RECIPIENT is not a stranger guessing URLs. We sent them the
 * link. And on the phone or the browser where they were not signed in, that
 * link answered „page not found" — for a request we had just told them about,
 * with nothing on the screen suggesting signing in would help. The rule that
 * protects the subsystem from strangers was punishing the exact person it was
 * written to serve.
 *
 * /signin resolves it without weakening anything: it is a PUBLIC page, so
 * landing on it reveals nothing about whether the target exists, and it already
 * 307s a visitor who turns out to have a live session straight through to
 * `redirect` (app/signin/page.tsx, validated by safeInternalPath). So:
 *   · signed in   → bounced onward, never sees the form
 *   · signed out  → signs in, lands exactly on the thing the email was about
 *   · a stranger  → a sign-in page, and no information
 *
 * ⚠️ NOT FOR CLIENT LINKS. /request/<ref> is reachable with NO account at all —
 * possession of the reference is the client's identity, by design — so sending
 * a client through sign-in would invent a wall the product spent its whole
 * design removing. Client emails link direct. This is for /provider and /admin.
 */
function gatedLink(path: string): string {
  return `${BASE}/signin?redirect=${encodeURIComponent(path)}`
}

const BRAND = '#2F9C86'
const INK = '#1c1a17'
const MUTED = '#6b6862'

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

// Shared shell: header wordmark, white card, optional CTA button, muted footer.
function shell(opts: {
  heading: string
  bodyHtml: string
  cta?: { label: string; href: string }
  /** Footer kicker. Defaults to „ავტომატური შეტყობინება", which is true of every
   *  template here EXCEPT the hand-written admin message — telling someone to
   *  reply and then labelling the mail automated is a small lie. */
  footerNote?: string
}): string {
  const { heading, bodyHtml, cta } = opts
  const footerNote = opts.footerNote ?? 'ავტომატური შეტყობინება'
  const button = cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${esc(cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:10px;">${esc(cta.label)}</a>
       </td></tr>`
    : ''
  return `<!doctype html>
<html lang="ka"><body style="margin:0;padding:0;background:#f4f3f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:8px 4px 16px;">
          <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">mcodne</span>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #e6e4e0;border-radius:14px;padding:28px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:20px;font-weight:800;color:${INK};letter-spacing:-0.01em;padding-bottom:12px;">${esc(heading)}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:${INK};">${bodyHtml}</td></tr>
            ${button}
          </table>
        </td></tr>
        <tr><td style="padding:16px 4px;font-size:12px;line-height:1.6;color:${MUTED};">
          mcodne — კონსულტაციები ექსპერტებთან.<br>
          ${esc(footerNote)} · <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};">${SUPPORT_EMAIL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;">${text}</p>`
}

// ── The one way to print a session time OUTSIDE the app ──────────────────────
// The server runs TZ=Asia/Tbilisi, so `fmtKaDateTime` already yields Tbilisi
// wall-clock — but a bare „28 ივლ · 11:00" is read in an inbox, next to an app
// that renders the SAME instant in the reader's own browser zone. For anyone
// outside Georgia those two disagree by hours with nothing on screen saying so,
// which is a silent missed-session bug rather than a cosmetic one. So every
// time string that leaves the server — email bodies AND the notify() bodies the
// booking routes write — goes through this, never through fmtKaDateTime alone.
export const TZ_LABEL = 'თბილისის დროით'
export function fmtWhenTz(d: Date, opts?: KaDateOpts): string {
  return `${fmtKaDateTime(d, opts)} (${TZ_LABEL})`
}

// A labelled detail row (used in booking/reminder emails).
function detail(rows: { label: string; value: string }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border-top:1px solid #eee;">
    ${rows.map(r => `<tr>
      <td style="padding:8px 0;font-size:13px;color:${MUTED};width:40%;border-bottom:1px solid #f0efec;">${esc(r.label)}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:600;color:${INK};border-bottom:1px solid #f0efec;">${esc(r.value)}</td>
    </tr>`).join('')}
  </table>`
}

export function welcomeEmail(name: string) {
  const first = (name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'კეთილი იყოს მობრძანება 👋',
    html: shell({
      heading: first ? `${esc(first)}, კეთილი იყოს შენი მობრძანება!` : 'კეთილი იყოს შენი მობრძანება!',
      bodyHtml:
        p('დარეგისტრირდი <b>მცოდნეზე</b> — აქ შენს საკითხზე პირდაპირ ექსპერტს ესაუბრები.') +
        p('აირჩიე ექსპერტი, დაჯავშნე დრო და ისაუბრე ვიდეოზე.'),
      cta: { label: 'იპოვე ექსპერტი', href: `${BASE}/tutors` },
    }),
  }
}

// Sent when Google sign-in links to an account whose email had NEVER been
// verified, which costs that account its stored password — see lib/googleLink.ts
// for why that is the only safe reading of two credentials claiming one address.
//
// This mail is not a courtesy. The user is losing a credential they may have
// been using, so silence would read as „my password randomly stopped working";
// and in the case the revocation exists for — someone else had registered this
// address — this is the ONLY signal the real owner ever gets that it happened.
// The CTA therefore goes to password recovery, not to the home page.
export function googleLinkedEmail(name: string) {
  const first = (name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'უსაფრთხოება — ანგარიშში Google-ით შეხვედი',
    html: shell({
      heading: first ? `${esc(first)}, ანგარიშში Google-ით შეხვედი` : 'ანგარიშში Google-ით შეხვედი',
      bodyHtml:
        p('შენი ელფოსტა აქამდე დადასტურებული არ იყო, ამიტომ უსაფრთხოებისთვის <b>ძველი პაროლი გავაუქმეთ</b> და ყველა გახსნილი სესია დავხურეთ.') +
        p('ამიერიდან ანგარიშში Google-ით შედი. თუ პაროლითაც გინდა შესვლა, დააყენე ახალი — ეს ერთი წუთის საქმეა.') +
        p(`თუ ეს შენ არ ყოფილხარ, მაშინვე მოგვწერე: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`),
      cta: { label: 'ახალი პაროლის დაყენება', href: `${BASE}/signin?view=reset` },
    }),
  }
}

// Sent to every ADMIN the moment an application arrives. Until 2026-08-03 a
// submission only rang the in-app bell, which nobody sees unless they are
// already inside /admin — so an applicant could wait days for a decision that
// was simply never noticed. The body carries enough to triage from the inbox
// (who, what field, how long they have worked, what they charge) and the CTA
// lands directly on the moderation queue.
export function newApplicationAdminEmail(o: {
  name: string; specialty: string; city?: string | null
  yearsExp?: number | null; rate?: number | null; email?: string | null; phone?: string | null
}) {
  const rows: { label: string; value: string }[] = [
    { label: 'სფერო', value: o.specialty || '—' },
    { label: 'გამოცდილება', value: o.yearsExp != null ? `${o.yearsExp} წელი` : '—' },
    { label: 'ფასი', value: o.rate != null ? `₾${o.rate}` : '—' },
    { label: 'ქალაქი', value: o.city || '—' },
    { label: 'ელფოსტა', value: o.email || '—' },
    { label: 'ტელეფონი', value: o.phone || '—' },
  ]
  return {
    // The applicant's name rides in the subject, so strip CR/LF — a header
    // injection here would be user-controlled.
    subject: `ახალი განაცხადი — ${String(o.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60)}`,
    html: shell({
      heading: 'ახალი განაცხადი მოდერაციაში',
      bodyHtml: p(`<b>${esc(o.name)}</b> გამოგზავნა განაცხადი ექსპერტად.`) + detail(rows),
      cta: { label: 'გახსენი მოდერაცია', href: `${BASE}/admin#moderation` },
      footerNote: 'ადმინის შეტყობინება',
    }),
  }
}

// Sent the moment an application is APPROVED. The one thing that turns a fresh
// expert into a bookable one is published free time (booking is slot-gated), so
// this email is about the calendar — not about „finishing the profile". Subject
// is a static string, so no CR/LF stripping is needed; the moderator's optional
// note is body-only and escaped like every other interpolated value.
export function applicationApprovedEmail(o: { name: string; note?: string }) {
  const first = (o.name || '').trim().split(/\s+/)[0] || ''
  return {
    subject: 'განაცხადი დამტკიცდა — გახსენი შენი თავისუფალი დრო',
    html: shell({
      heading: first ? `${esc(first)}, დამტკიცდი — ახლა ხარ ექსპერტი` : 'დამტკიცდი — ახლა ხარ ექსპერტი',
      bodyHtml:
        p('პროფილი ცოცხალია და ძებნაში ჩანს.') +
        p('ერთი ნაბიჯიღა დარჩა: <b>გახსენი შენი თავისუფალი დრო</b>. სანამ განრიგში დროს არ გამოაქვეყნებ, დაჯავშნა არავის შეუძლია.') +
        (o.note ? p(`<span style="color:${MUTED};">მოდერატორის კომენტარი:</span> ${esc(o.note)}`) : ''),
      cta: { label: 'დროის გამოქვეყნება', href: `${BASE}/tutor/schedule` },
    }),
  }
}

export function bookingConfirmedEmail(o: { studentName: string; expertName: string; topic: string; whenText: string; bookingId: string }) {
  return {
    subject: 'ჯავშანი დადასტურდა ✅',
    html: shell({
      heading: 'შენი ჯავშანი დადასტურდა',
      bodyHtml:
        p(`${esc(o.expertName)}-მა დაადასტურა ჯავშანი.`) +
        detail([
          { label: 'ექსპერტი', value: o.expertName },
          { label: 'თემა', value: o.topic },
          { label: 'დრო', value: o.whenText },
        ]) +
        p('დანიშნულ დროზე ერთი დაწკაპუნებით შეხვალ ვიდეოოთახში.'),
      cta: { label: 'ჯავშნის ნახვა', href: `${BASE}/student/bookings/${o.bookingId}` },
    }),
  }
}

// Sent to the EXPERT the moment a client files a new booking request. The
// expert must accept/decline within 24h or the cleanup cron auto-cancels it —
// so this email is time-sensitive, not just a courtesy ping.
export function bookingRequestEmail(o: {
  studentName: string
  topic: string
  whenText: string
  /** Request-based booking: the client NAMED this time; it is not in the
   *  expert's published schedule. Without saying so, the expert reads an
   *  unfamiliar time as a calendar bug. */
  proposedByStudent?: boolean
  /** Their 2nd/3rd choice, already formatted. Listing them here is the whole
   *  point of collecting more than one: the expert decides in the email
   *  instead of opening a thread to negotiate. */
  alternateWhenTexts?: string[]
}) {
  const alts = o.alternateWhenTexts?.filter(Boolean) ?? []
  return {
    subject: 'ახალი მოთხოვნა 🔔',
    html: shell({
      heading: 'ახალი ჯავშნის მოთხოვნა',
      bodyHtml:
        p(`${esc(o.studentName)}-მა მოგთხოვა კონსულტაცია. უპასუხე 24 საათში — წინააღმდეგ შემთხვევაში ჯავშანი ავტომატურად გაუქმდება.`) +
        (o.proposedByStudent
          ? p('დროები კლიენტმა შემოგვთავაზა — ისინი შენს გამოქვეყნებულ განრიგში არაა.')
          : '') +
        detail([
          { label: 'სტუდენტი', value: o.studentName },
          { label: 'თემა', value: o.topic },
          { label: alts.length ? 'სასურველი დრო' : 'დრო', value: o.whenText },
          ...alts.map((w, i) => ({ label: `ალტერნატივა ${i + 1}`, value: w })),
        ]),
      cta: { label: 'ჯავშნის ნახვა', href: `${BASE}/tutor/bookings` },
    }),
  }
}

// The ~1h reminder — the ACTIONABLE one (still time to prepare, reschedule or
// warn the other side). The detail table now names the counterpart and the
// length: „who am I meeting and how long does this take" is exactly what someone
// re-reads a reminder for, and it was the one thing the table didn't say.
export function sessionReminderEmail(o: { name: string; counterpartName: string; topic: string; whenText: string; durationText?: string; href: string }) {
  return {
    subject: 'სესია მალე იწყება ⏰',
    html: shell({
      heading: 'შენი სესია მალე იწყება',
      bodyHtml:
        p(`მალე გაქვს კონსულტაცია ${esc(o.counterpartName)}-თან.`) +
        detail([
          { label: 'ვისთან', value: o.counterpartName },
          { label: 'თემა', value: o.topic },
          { label: 'დრო', value: o.whenText },
          ...(o.durationText ? [{ label: 'ხანგრძლივობა', value: o.durationText }] : []),
        ]),
      cta: { label: 'სესიის გახსნა', href: `${BASE}${o.href}` },
    }),
  }
}

// Sent to the CLIENT a few hours after a completed session that has no review
// yet (see lib/postSession). One message carries both jobs: the review CTA is
// the button, and — only when the client has nothing else booked with that
// expert — a single soft line invites them back. No urgency, no claims about
// what the rating will do for anyone; the subject is a static string, so no
// CR/LF stripping is needed.
export function reviewNudgeEmail(o: {
  name: string
  expertName: string
  topic: string
  whenText: string
  href: string
  rebookHref?: string
}) {
  const first = (o.name || '').trim().split(/\s+/)[0]
  return {
    subject: 'როგორ ჩაიარა სესიამ?',
    html: shell({
      heading: first ? `${esc(first)}, როგორ ჩაიარა?` : 'როგორ ჩაიარა სესიამ?',
      bodyHtml:
        p(`${esc(o.expertName)}-თან სესია დასრულდა. თუ ორი წუთი გაქვს, დატოვე შეფასება — სხვებს არჩევანში დაეხმარება.`) +
        detail([
          { label: 'ექსპერტი', value: o.expertName },
          { label: 'თემა', value: o.topic },
          { label: 'დრო', value: o.whenText },
        ]) +
        (o.rebookHref
          ? p(`<span style="color:${MUTED};">თუ სასარგებლო იყო — <a href="${esc(BASE + o.rebookHref)}" style="color:${BRAND};">ხელახლა დაჯავშნე ${esc(o.expertName)}-თან</a>.</span>`)
          : ''),
      cta: { label: 'შეფასების დატოვება', href: `${BASE}${o.href}` },
    }),
  }
}

// Sent to the EXPERT while a booking request is STILL ALIVE and unanswered (see
// lib/expertEscalation). The creation ping („ახალი მოთხოვნა") used to be the only
// one — a single missed email meant the client got no reply and the request was
// auto-cancelled in silence. This is the escalation: it names how long is left
// and says plainly that it disappears on its own.
//
// `leftText` is computed from the real remaining time, never a stage constant —
// the deadline is min(created + 24h, startAt), so a short-notice request has far
// less than the nominal window. Both SUBJECTs are static per-urgency strings —
// nothing interpolated — so there is no CR/LF injection surface to strip; every
// caller-supplied value is escaped (directly or via detail()).
export function expertRequestEscalationEmail(o: {
  expertName: string
  studentName: string
  topic: string
  whenText: string
  /** „დაახლოებით 12 საათი" — how long until it auto-cancels. */
  leftText: string
  /** The last stage: the wording stops nudging and starts warning. */
  final?: boolean
  href: string
}) {
  const first = (o.expertName || '').trim().split(/\s+/)[0]
  const lead = o.final
    ? `${esc(o.studentName)}-ის მოთხოვნას ჯერ არ გიპასუხია. დარჩა <b>${esc(o.leftText)}</b> — შემდეგ ჯავშანი ავტომატურად გაუქმდება და სტუდენტი სხვას მიმართავს.`
    : `${esc(o.studentName)}-ის მოთხოვნა კვლავ შენს პასუხს ელოდება. დარჩა <b>${esc(o.leftText)}</b> — პასუხის გარეშე ჯავშანი ავტომატურად გაუქმდება.`
  return {
    subject: o.final ? 'ბოლო შეხსენება — მოთხოვნა მალე გაუქმდება' : 'მოთხოვნა შენს პასუხს ელოდება',
    html: shell({
      heading: first
        ? `${esc(first)}, ${o.final ? 'ბოლო შანსია პასუხის გასაცემად' : 'მოთხოვნა უპასუხოდ დარჩა'}`
        : (o.final ? 'ბოლო შანსია პასუხის გასაცემად' : 'მოთხოვნა უპასუხოდ დარჩა'),
      bodyHtml:
        p(lead) +
        detail([
          { label: 'სტუდენტი', value: o.studentName },
          { label: 'თემა', value: o.topic },
          { label: 'დრო', value: o.whenText },
          { label: 'დარჩა', value: o.leftText },
        ]) +
        p(`<span style="color:${MUTED};">უარის თქმაც პასუხია — თუ ეს დრო არ გამოგდგება, უარყავი და სტუდენტი მაშინვე სხვა დროს აირჩევს.</span>`),
      cta: { label: 'მოთხოვნაზე პასუხი', href: `${BASE}${o.href}` },
    }),
  }
}

// ── Activation: approved, live, but not bookable ─────────────────────────────
// The counterpart to applicationApprovedEmail. „You are approved" is only half
// the truth when the profile still has no service or no free times — the expert
// believes they are open for business while every visitor hits a dead button.
// Deliberately plain and specific: one blocker, one fix, one link. See
// lib/expertActivation for the schedule and the why.
export function expertActivationEmail(o: {
  name: string
  blocker: 'slots' | 'service'
  /** Last of the three nudges — say so, and stop. */
  final?: boolean
  href: string
}) {
  const first = (o.name || '').trim().split(/\s+/)[0]
  const what = o.blocker === 'service'
    ? {
        lead: 'შენი პროფილი გამოქვეყნებულია, მაგრამ <b>სერვისი არ გაქვს დამატებული</b> — ჯავშნის ღილაკს გასაყიდი არაფერი აქვს, ამიტომ დაჯავშნა ვერავინ შეძლებს.',
        step: 'დაამატე ერთი კონსულტაცია — სახელი, ხანგრძლივობა და ფასი. ერთი წუთის საქმეა.',
        cta: 'სერვისის დამატება',
      }
    : {
        // „აღარ გაქვს", not „არ მიგითითებია" — the same wording the in-app alert
        // uses (app/tutor/_components/AlertsStack), and for the same reason:
        // since 2026-08-03 this also reaches experts whose published windows
        // simply RAN OUT. Telling someone who added 42 times that they never
        // added any is both wrong and slightly insulting.
        lead: 'შენი პროფილი გამოქვეყნებულია, მაგრამ <b>თავისუფალი დრო აღარ გაქვს</b> — სტუდენტი პროფილს ხედავს, დაჯავშნა კი არ შეუძლია.',
        step: 'მონიშნე მომავალი კვირის რამდენიმე დრო, როცა თავისუფალი ხარ. დროები ნებისმიერ მომენტში იცვლება.',
        cta: 'დროების მითითება',
      }
  return {
    subject: o.final ? 'ბოლო შეხსენება — შენი პროფილი ჯავშანს ვერ იღებს' : 'შენი პროფილი ჯავშანს ვერ იღებს',
    html: shell({
      heading: first ? `${esc(first)}, ერთი ნაბიჯიღა დარჩა` : 'ერთი ნაბიჯიღა დარჩა',
      bodyHtml:
        p(what.lead) +
        p(what.step) +
        (o.final
          ? p(`<span style="color:${MUTED};">ეს ბოლო შეხსენებაა — მეტს აღარ მოგწერთ. თუ ახლა დრო არ გაქვს, პროფილი ადგილზე დაგრჩება და ნებისმიერ დროს დაასრულებ.</span>`)
          : ''),
      cta: { label: what.cta, href: `${BASE}${o.href}` },
    }),
  }
}

// ── Mid-lifecycle booking changes ────────────────────────────────────────────
// ONE builder for every booking event that used to be in-app-only: the expert
// declining a request, either side cancelling, a no-show flagged in either
// direction, and all three reschedule events (proposed / accepted / rejected).
//
// Why one template and not seven: they are the same message shape — „something
// moved on a booking you already know about, here is what and when" — and the
// events that matter most are exactly the ones that STOP the reminder pipeline.
// An expert cancelling a CONFIRMED 17:00 session at 14:00 makes the booking
// leave the reminder query (it filters status='CONFIRMED'), so without this mail
// the client's last signal is the old confirmation and they show up to an empty
// room.
//
// Every SUBJECT is a static per-kind string — nothing interpolated — so unlike
// newMessageEmail below there is no CR/LF injection surface to strip. All
// caller-supplied values are escaped (via esc() inside detail()/the leads).
// `whenText` is expected to come from fmtWhenTz above, so it carries its zone.
export type BookingChangeKind =
  | 'request_sent'
  | 'declined'
  | 'canceled'
  | 'no_show'
  | 'reschedule_proposed'
  | 'reschedule_accepted'
  | 'reschedule_rejected'

export type BookingChangeOpts = {
  /** The other human on the booking, from the RECIPIENT's point of view. */
  counterpartName: string
  topic: string
  /** Current/original session time — always via fmtWhenTz. */
  whenText: string
  /** Proposed or newly-agreed time (reschedule kinds only). */
  newWhenText?: string
  /** Who acted. Ergative for `canceled` / `reschedule_proposed` („ექსპერტმა",
   *  „სტუდენტმა", „ადმინისტრატორმა"); GENITIVE for `no_show`, which reads
   *  „<...>ის თქმით" so it also works for the person who filed it („შენი"). */
  actorLabel?: string
  /** Free-text cancel/reschedule reason, shown as its own row. */
  reason?: string | null
  /** One extra sentence under the lead — what this recipient should do next. */
  note?: string
  /** Site-relative path; the CTA is always rendered absolute (BASE + href). */
  href: string
  ctaLabel?: string
}

const CHANGE_COPY: Record<BookingChangeKind, { subject: string; heading: string; cta: string }> = {
  request_sent:          { subject: 'მოთხოვნა გაიგზავნა',      heading: 'მოთხოვნა გაიგზავნა',        cta: 'ჯავშნის ნახვა' },
  declined:              { subject: 'ჯავშანი ვერ დადასტურდა',  heading: 'ჯავშანი ვერ დადასტურდა',    cta: 'სხვა დროის არჩევა' },
  canceled:              { subject: 'ჯავშანი გაუქმდა',          heading: 'ჯავშანი გაუქმდა',            cta: 'ჯავშნის ნახვა' },
  no_show:               { subject: 'სესია არ შედგა',           heading: 'სესია არ შედგა',             cta: 'ჯავშნის ნახვა' },
  reschedule_proposed:   { subject: 'გადადების მოთხოვნა',       heading: 'დროის გადატანა ითხოვეს',     cta: 'პასუხის გაცემა' },
  reschedule_accepted:   { subject: 'ახალი დრო დადასტურდა',     heading: 'ახალი დრო დადასტურდა',       cta: 'ჯავშნის ნახვა' },
  reschedule_rejected:   { subject: 'გადადება უარყოფილია',      heading: 'გადადება უარყოფილია',        cta: 'ჯავშნის ნახვა' },
}

export function bookingChangedEmail(kind: BookingChangeKind, o: BookingChangeOpts) {
  const who = esc(o.counterpartName)
  const actor = esc(o.actorLabel || 'მეორე მხარემ')
  const lead: Record<BookingChangeKind, string> = {
    request_sent: `${who}-ს გაეგზავნა შენი მოთხოვნა. პასუხს 24 საათში მიიღებ — თუ ამ დროში არ დაადასტურებს, ჯავშანი ავტომატურად უქმდება.`,
    declined: `${who}-მა ვერ დაადასტურა ეს მოთხოვნა — სესია არ შედგება.`,
    canceled: `${actor} გააუქმა ეს კონსულტაცია. დანიშნულ დროზე შეხვედრა აღარ შედგება.`,
    no_show: `${esc(o.actorLabel || 'მეორე მხარის')} თქმით, სესია არ შედგა.`,
    reschedule_proposed: `${actor} ითხოვს ამ კონსულტაციის სხვა დროზე გადატანას. სანამ არ უპასუხებ, ძველი დრო დადასტურებულად აღარ ითვლება.`,
    reschedule_accepted: `${who}-მა დაეთანხმა გადადებას — სესია ახალ დროზეა.`,
    reschedule_rejected: `${who}-მა უარყო გადადება. დრო უცვლელი დარჩა.`,
  }
  // Reschedule kinds show BOTH times, so the recipient can see what moved where;
  // everything else shows the one time the message is about.
  const rows: { label: string; value: string }[] = [
    { label: 'ვისთან', value: o.counterpartName },
    { label: 'თემა', value: o.topic },
  ]
  if (kind === 'reschedule_proposed') {
    rows.push({ label: 'ახლანდელი დრო', value: o.whenText })
    if (o.newWhenText) rows.push({ label: 'შემოთავაზებული დრო', value: o.newWhenText })
  } else if (kind === 'reschedule_accepted') {
    rows.push({ label: 'ახალი დრო', value: o.newWhenText || o.whenText })
  } else {
    rows.push({ label: 'დრო', value: o.whenText })
  }
  if (o.reason) rows.push({ label: 'მიზეზი', value: o.reason })

  const copy = CHANGE_COPY[kind]
  return {
    subject: copy.subject,
    html: shell({
      heading: copy.heading,
      bodyHtml: p(lead[kind]) + detail(rows) + (o.note ? p(`<span style="color:${MUTED};">${esc(o.note)}</span>`) : ''),
      cta: { label: o.ctaLabel || copy.cta, href: `${BASE}${o.href}` },
    }),
  }
}

// The IMMINENT reminder — sent when the session is minutes away, on top of the
// ~1h one above. Deliberately NOT the same builder: the subject has to read as a
// different message at a glance, or two near-identical mails ~45 min apart look
// like a duplicate send. It also never names a number of minutes — the sweep
// delivers it anywhere in a 5–20 min band, so „5 წუთში" would be wrong most of
// the time. This one is a doorbell (join now); the 1h one stays the actionable
// „you have something today" mail.
export function sessionImminentEmail(o: { counterpartName: string; topic: string; whenText: string; href: string }) {
  return {
    subject: 'შეხვედრის ოთახი გელოდება',
    html: shell({
      // Heading differs from the ~1h mail's („შენი სესია მალე იწყება") as hard as
      // the subject does — the two arrive ~45 min apart and must not read as the
      // same message sent twice.
      heading: 'სესია იწყება — შედი ოთახში',
      bodyHtml:
        p(`კონსულტაცია ${esc(o.counterpartName)}-თან სულ მალე იწყება. ოთახში შესვლა ერთი დაწკაპუნებაა.`) +
        detail([
          { label: 'ვისთან', value: o.counterpartName },
          { label: 'თემა', value: o.topic },
          { label: 'დრო', value: o.whenText },
        ]),
      cta: { label: 'ოთახში შესვლა', href: `${BASE}${o.href}` },
    }),
  }
}

// ── Admin → ONE user, written by hand (admin panel „მიწერე") ────────────────
// Every other builder in this file is a template with a static subject and a
// couple of interpolated system values. This one is different in kind: BOTH the
// subject and the body are free text an operator typed into a form, so it is
// the one place where the escaping rules are load-bearing rather than habit.
//   · subject → sanitizeSubject() (CR/LF stripped: a newline in a mail header
//     splices in an extra header — the classic injection) and it is ALSO the
//     in-app notification title, so the route reuses the same helper.
//   · body    → esc()-ed first, then split into paragraphs. The only markup a
//     typed body can ever produce is <p> and <br>, both emitted by us.
// The caller sets replyTo to SUPPORT_EMAIL — the point of this message is that
// the recipient can hit Reply and reach a human, not a noreply void.
export type AdminMessageTemplate = 'expert' | 'info' | 'blank'

export const ADMIN_MESSAGE_SUBJECT_MAX = 120
export const ADMIN_MESSAGE_BODY_MAX = 4000

// Where the message TAKES the person: the email CTA and the in-app notification
// href are the same destination. Kept server-side (never accepted from the
// request body) so a typed message can't be turned into an arbitrary link.
const ADMIN_MESSAGE_DEST: Record<AdminMessageTemplate, { href: string; ctaLabel: string }> = {
  expert: { href: '/apply',         ctaLabel: 'ექსპერტად რეგისტრაცია' },
  info:   { href: '/settings',      ctaLabel: 'ანგარიშის გახსნა' },
  blank:  { href: '/notifications', ctaLabel: 'შეტყობინების ნახვა' },
}

export function adminMessageDestination(t?: string | null): { href: string; ctaLabel: string } {
  // Explicit allowlist rather than `MAP[t] ?? MAP.blank`: an indexed lookup with
  // '__proto__' (or 'constructor') resolves through the prototype chain and
  // returns a truthy object, which would sail past the ?? and yield href
  // `undefined`. Comparing against the three literals cannot do that.
  const key: AdminMessageTemplate = t === 'expert' || t === 'info' ? t : 'blank'
  return ADMIN_MESSAGE_DEST[key]
}

/** One line, no header-splitting characters. Used for the mail subject AND the
 *  notification title, so both stay identical to what the admin typed. */
export function sanitizeSubject(s: string): string {
  return String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

export function adminDirectMessageEmail(o: {
  name: string
  subject: string
  body: string
  template?: AdminMessageTemplate | string | null
}) {
  const first = (o.name || '').trim().split(/\s+/)[0]
  const subject = sanitizeSubject(o.subject)
  const dest = adminMessageDestination(o.template)
  // Blank-line separated blocks become paragraphs; single newlines become <br>.
  // esc() runs BEFORE the <br> substitution, so the only tags here are ours.
  const bodyBlocks = o.body
    .split(/\r?\n\s*\r?\n/)
    .map(b => b.trim())
    .filter(Boolean)
    .map(b => p(esc(b).replace(/\r?\n/g, '<br>')))
    .join('')
  return {
    subject: subject || 'შეტყობინება მცოდნესგან',
    html: shell({
      heading: first ? `${esc(first)}, გამარჯობა` : 'გამარჯობა',
      bodyHtml:
        (subject ? p(`<b>${esc(subject)}</b>`) : '') +
        bodyBlocks +
        p(`<span style="color:${MUTED};">უპასუხე პირდაპირ ამ წერილს — ჩვენს ფოსტაზე მოვა და ცოცხალი ადამიანი წაიკითხავს.</span>`),
      cta: { label: dest.ctaLabel, href: `${BASE}${dest.href}` },
      footerNote: 'მცოდნეს გუნდი',
    }),
  }
}

export function newMessageEmail(o: { name: string; fromName: string; preview: string; href: string }) {
  return {
    subject: `ახალი შეტყობინება — ${o.fromName.replace(/[\r\n]+/g, ' ').trim()}`,
    html: shell({
      heading: `${esc(o.fromName)}-მა მოგწერა`,
      bodyHtml:
        p(`<span style="color:${MUTED};">„</span>${esc(o.preview)}<span style="color:${MUTED};">“</span>`),
      cta: { label: 'პასუხის გაცემა', href: `${BASE}${o.href}` },
    }),
  }
}

/* ═══════════ the requests subsystem (2026-08-14) ═══════════════════════════
 *
 * THREE MAILS, AND EACH ONE IS THE LOOP-CLOSER FOR A PERSON WHO IS NOT ON THE
 * SITE. The speed-to-lead research is unambiguous — the share of clients who go
 * with the FIRST responder is ~78%, and a lead answered after 30 minutes is
 * ~21× less likely to qualify — and an in-app bell only reaches somebody
 * already sitting on the page. Same reasoning as newApplicationAdminEmail
 * above, which exists because a bell nobody saw once cost applicants days.
 *
 * ⚠️ NO CLIENT CONTACT IN THE PROVIDER MAILS, for the same reason the provider
 * screens carry none: the contact opening on acceptance IS the product. The
 * mail says what the work is and where to answer it — never who is asking.
 */

/** To every allowlisted provider the moment a request is VERIFIED. */
export function requestVerifiedProviderEmail(o: {
  topicLabel: string
  kindLabel: string
  budgetLabel: string
  timingLabel: string
  requestId: string
}) {
  return {
    subject: `ახალი მოთხოვნა — ${o.topicLabel}`,
    html: shell({
      heading: 'ახალი მოთხოვნა',
      bodyHtml:
        detail([
          { label: 'რა', value: o.topicLabel },
          { label: 'ტიპი', value: o.kindLabel },
          { label: 'ბიუჯეტი', value: o.budgetLabel },
          { label: 'ვადა', value: o.timingLabel },
        ]) +
        // The one line that matters after the facts: places are limited and the
        // first answers win — true, and the reason to open the mail now.
        p('ადგილები შეზღუდულია — პირველი შეთავაზებები იგებენ.'),
      cta: { label: 'ნახე და შესთავაზე', href: gatedLink(`/provider/requests/${o.requestId}`) },
    }),
  }
}

/** To the CLIENT each time an offer lands. They usually have no account — this
 *  link is their only door back in, so it is the mail's whole body. */
export function offerArrivedClientEmail(o: {
  publicRef: string
  topicLabel: string
  priceLabel: string
  providerName: string
  offerCount: number
}) {
  return {
    subject: `ახალი შეთავაზება — ${o.publicRef}`,
    html: shell({
      heading: 'ახალი შეთავაზება მოგივიდა',
      bodyHtml:
        detail([
          { label: 'მოთხოვნა', value: `${o.topicLabel} · ${o.publicRef}` },
          { label: 'ვისგან', value: o.providerName },
          { label: 'ფასი', value: o.priceLabel },
        ]) +
        p(o.offerCount > 1
          ? `სულ ${o.offerCount} შეთავაზება გაქვს — შეადარე და აირჩიე.`
          : 'ნახე დეტალები და თუ მოგეწონება, აირჩიე.'),
      cta: { label: 'შეთავაზებების ნახვა', href: `${BASE}/request/${o.publicRef}` },
    }),
  }
}

/**
 * „Nobody answered" — to the client, when their request closes unanswered.
 *
 * ⚠️ THIS IS THE ONLY MAIL THAT CARRIES BAD NEWS, and it exists because the
 * alternative was worse: a request with no offers sat for STALE_OPEN_DAYS and
 * was then set CLOSED by the cron in silence. The person who described their
 * problem, left a number and waited two weeks was never told that nobody came —
 * and because a closed request also closes their thread with us, the moment
 * they stopped hearing from us was the same moment they lost the only place
 * they could ask why.
 *
 * Plain, and it does not apologise in paragraphs: what they need is the fact,
 * and a way back in. The CTA is a NEW request rather than the old page —
 * the old one is closed, and sending somebody to a dead screen to read „closed"
 * is the same silence with an extra click.
 */
export function requestClosedNoOffersClientEmail(o: {
  publicRef: string
  topicLabel: string
}) {
  return {
    subject: `ვერ მოგიძებნეთ ექსპერტი — ${o.publicRef}`,
    html: shell({
      heading: 'ამ მოთხოვნაზე შეთავაზება არ მოვიდა',
      bodyHtml:
        detail([
          { label: 'მოთხოვნა', value: `${o.topicLabel} · ${o.publicRef}` },
        ]) +
        p('ვცადეთ, მაგრამ ამ მიმართულებით თავისუფალი ექსპერტი ვერ მოვძებნეთ. მოთხოვნა დავხურეთ.') +
        p('თუ პირობები შეიცვალა — ბიუჯეტი, ვადა ან ფორმატი — გამოგვიგზავნე ახალი მოთხოვნა და თავიდან ვცდით.'),
      cta: { label: 'ახალი მოთხოვნა', href: `${BASE}/request` },
    }),
  }
}

/** To the chosen provider when the client accepts. The page it links to is
 *  where the contact now lives — the mail itself still carries none, so a
 *  forwarded or mis-addressed mail leaks nothing. */
export function offerAcceptedProviderEmail(o: { topicLabel: string }) {
  return {
    subject: 'შენი შეთავაზება აირჩიეს 🎉',
    html: shell({
      heading: 'შენი შეთავაზება აირჩიეს',
      bodyHtml:
        // ⚠️ NO publicRef (2026-08-17). It used to be printed here in brackets.
        // It is the CLIENT'S CREDENTIAL, not a reference number — see
        // app/provider/requests/[id]/page — and a mail is the easiest place in
        // the system to read one off and keep it.
        p(`კლიენტმა აირჩია შენი შეთავაზება — <b>${esc(o.topicLabel)}</b>.`) +
        p('კლიენტის კონტაქტი უკვე შენს გვერდზეა. დაუკავშირდი მალე — ის ამას ელოდება.'),
      cta: { label: 'კონტაქტის ნახვა', href: gatedLink('/provider/offers') },
    }),
  }
}

/**
 * „You have a new message" — the same mail to both sides, addressed
 * differently.
 *
 * ⚠️ THE PREVIEW IS THE POST-MASK BODY. Whatever the contact firewall removed
 * (lib/requestChat → maskContacts) is already gone by the time this is built,
 * so a number a sender tried to slip past the platform cannot ride out in the
 * notification email instead — which would be the firewall with a hole in the
 * one channel that leaves the site.
 */
/**
 * The PLATFORM thread — the client and us, not the client and a provider.
 *
 * A separate template rather than a flag on the one below, because the sentence
 * that matters is different in kind. „ექსპერტმა გიპასუხა" is about somebody the
 * reader chose to talk to; this one is about the platform they are waiting on,
 * and to the operator it is a job rather than a notification. The CTA differs
 * too — staff land in the panel, the client on their own page.
 */
export function requestThreadEmail(o: {
  toStaff: boolean
  publicRef: string
  preview: string
}) {
  const href = o.toStaff ? gatedLink('/admin?tab=requests') : `${BASE}/request/${o.publicRef}`
  const preview = o.preview.length > 140 ? `${o.preview.slice(0, 140)}…` : o.preview
  return {
    subject: o.toStaff
      ? `[მცოდნე] შეტყობინება მოთხოვნაზე ${o.publicRef}`
      : `პასუხი — ${o.publicRef}`,
    html: shell({
      heading: o.toStaff ? 'კლიენტი წერს' : 'გიპასუხეთ',
      bodyHtml:
        p(o.toStaff
          ? `მოთხოვნა ${esc(o.publicRef)} — კლიენტმა მიმოწერაში დაწერა.`
          : 'შენს მოთხოვნაზე გიპასუხეთ.') +
        `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${BRAND};background:#f7f9f8;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(preview)}</blockquote>`,
      cta: { label: 'პასუხის გაცემა', href },
    }),
  }
}

export function requestChatEmail(o: {
  toProvider: boolean
  topic: string
  publicRef: string
  preview: string
}) {
  const href = o.toProvider ? gatedLink('/provider/offers') : `${BASE}/request/${o.publicRef}`
  // Trimmed to a glance. A full message in the body is a message nobody comes
  // back to the site to answer — and answering is the point.
  const preview = o.preview.length > 140 ? `${o.preview.slice(0, 140)}…` : o.preview
  return {
    // ⚠️ THE SUBJECT FORKS ON THE AUDIENCE, and only for this reason: the
    // reference is the CLIENT'S credential. In their own inbox it is the thing
    // that opens their request and belongs there; in a provider's inbox it is a
    // key to somebody else's account, sitting in a searchable archive forever.
    subject: o.toProvider
      ? `ახალი შეტყობინება — ${topicLabel(o.topic)}`
      : `ახალი შეტყობინება — ${o.publicRef}`,
    html: shell({
      heading: 'ახალი შეტყობინება',
      bodyHtml:
        p(o.toProvider
          ? 'კლიენტმა მოგწერა შენს შეთავაზებაზე.'
          : 'ექსპერტმა გიპასუხა.') +
        `<blockquote style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${BRAND};background:#f7f9f8;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(preview)}</blockquote>`,
      cta: { label: 'პასუხის გაცემა', href },
    }),
  }
}
