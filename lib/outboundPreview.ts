// WHAT THE MESSAGE ACTUALLY SAYS — rendered from the real builders, for the
// admin tab.
//
// Owner, 2026-09-02: „და ტექსტი რა იგზავნება ეგ სადაა". It was in two places,
// both of them code: lib/emailTemplates (twenty builders returning
// { subject, html }) and one line in lib/requestJobs. Neither was visible from
// /admin, which sits badly beside CLAUDE.md's own rule that the copy is the
// owner's — you cannot own what you cannot read.
//
// ⚠️ IT CALLS THE REAL BUILDER. Nothing here restates a subject line or copies
// a sentence; every string below comes out of the function that actually sends,
// with sample values in the holes. A preview that is TYPED rather than RENDERED
// drifts the first time somebody edits the template, and then it lies — quietly,
// on the one screen an operator opens to check what goes out.
//
// ⚠️ THE SAMPLE VALUES ARE VISIBLY FAKE. „ნიმუში" and MC-XXXXX rather than a
// plausible name and reference: an operator must never be unsure whether they
// are looking at a template or at somebody's real message.

import {
  welcomeEmail, googleLinkedEmail, newProviderApplicationAdminEmail,
  providerApprovedEmail, providerRevisionEmail, providerRejectedEmail,
  adminDirectMessageEmail, requestVerifiedProviderEmail, offerArrivedClientEmail,
  requestReceivedClientEmail, requestClosedNoOffersClientEmail,
  contactRefundedProviderEmail, offerAcceptedProviderEmail, requestThreadEmail,
  requestChatEmail, offerDoneClientEmail, offerDoneProviderEmail,
  offerDoneReminderClientEmail,
} from './emailTemplates'
import { verifiedRequestSms } from './smsTemplates'
import { messageTextSync } from './messageText'

/** Obviously-fake stand-ins for the holes in a template. */
const S = {
  name: 'ნიმუში ნიმუშიძე',
  ref: 'MC-XXXXX',
  topic: 'ბინის დალაგება',
  note: '(ადმინის კომენტარი)',
  preview: '(წერილის პირველი სტრიქონი…)',
}

export type OutboundPreview = {
  /** The subject line, exactly as the builder writes it. Null for SMS-only. */
  subject: string | null
  /** The body, HTML stripped to readable text. */
  body: string
  /** The SMS, when this message sends one. */
  sms?: string
  /** Where the words live, so an edit knows which file to open. */
  source: string
}

/** HTML → the words, in order, with the structure kept as line breaks. */
function textOf(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/td)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&mdash;/g, '—')
    .replace(/&[a-z]+;/gi, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
}

const mail = (m: { subject: string; html: string }, source: string): OutboundPreview =>
  ({ subject: m.subject, body: textOf(m.html), source })

const TPL = 'lib/emailTemplates.ts'

/**
 * The preview for one registered message, or null when its words are written
 * inline at the route that sends it rather than in a shared builder.
 *
 * ⚠️ NULL IS AN HONEST ANSWER AND THE TAB PRINTS IT AS ONE. Six messages — the
 * codes, the three inbox forms and the broadcast — build their own HTML where
 * they are sent, and inventing a preview for them would be inventing copy.
 */
export async function previewOf(key: string): Promise<OutboundPreview | null> {
  switch (key) {
    case 'auth.welcome':        return mail(await welcomeEmail(S.name), TPL)
    case 'auth.googleLinked':   return mail(await googleLinkedEmail(S.name), TPL)

    case 'request.received.client':
      return mail(await requestReceivedClientEmail({ publicRef: S.ref, topicLabel: S.topic }), TPL)
    case 'request.offerArrived.client':
    case 'request.offerDigest.client':
      return mail(await offerArrivedClientEmail({
        publicRef: S.ref, topicLabel: S.topic, priceLabel: '150 ₾',
        priceIncludes: '(რას მოიცავს ფასი)', providerName: S.name, offerCount: 2,
      }), TPL)
    case 'request.closedNoOffers.client':
      return mail(await requestClosedNoOffersClientEmail({ publicRef: S.ref, topicLabel: S.topic }), TPL)
    case 'request.done.client':
      return mail(await offerDoneClientEmail({ publicRef: S.ref, topicLabel: S.topic }), TPL)
    case 'request.doneReminder.client':
      return mail(await offerDoneReminderClientEmail({ publicRef: S.ref, topicLabel: S.topic }), TPL)

    case 'request.verified.provider': {
      const m = mail(await requestVerifiedProviderEmail({
        topicLabel: S.topic, kindLabel: 'სერვისი', budgetLabel: '100–200 ₾',
        timingLabel: 'რაც შეიძლება მალე', requestId: 'xxxxxxxx',
      }), TPL)
      // The one message that also texts. Its words live beside the job that
      // sends them, not in the template file — said here so an edit finds them.
      return { ...m, sms: await verifiedRequestSms(S.topic), source: `${TPL} · lib/smsTemplates.ts` }
    }
    case 'request.offerAccepted.provider':
      return mail(await offerAcceptedProviderEmail({ topicLabel: S.topic }), TPL)
    case 'request.done.provider':
      return mail(await offerDoneProviderEmail({ topicLabel: S.topic }), TPL)
    case 'request.contactRefunded.provider':
      return mail(await contactRefundedProviderEmail({ topicLabel: S.topic, amountLabel: '5 ₾' }), TPL)

    case 'thread.message':
      return mail(await requestThreadEmail({ toStaff: false, publicRef: S.ref, preview: S.preview }), TPL)
    case 'inbox.threadCopy':
      return mail(await requestThreadEmail({ toStaff: true, publicRef: S.ref, preview: S.preview }), TPL)
    case 'chat.message':
      return mail(await requestChatEmail({ toProvider: true, topic: S.topic, publicRef: S.ref, preview: S.preview }), TPL)

    case 'application.new.admin':
      return mail(await newProviderApplicationAdminEmail({
        name: S.name, kind: 'EXPERT', company: null,
        services: [S.topic], areas: ['თბილისი'], phone: '5XXXXXXXX', email: 'nimushi@example.com',
      }), TPL)
    case 'application.approved': return mail(await providerApprovedEmail({ name: S.name, note: null }), TPL)
    case 'application.revision': return mail(await providerRevisionEmail({ name: S.name, note: S.note }), TPL)
    case 'application.rejected': return mail(await providerRejectedEmail({ name: S.name, note: S.note }), TPL)

    case 'admin.directMessage':
      return mail(await adminDirectMessageEmail({
        name: S.name, subject: '(ადმინის სათაური)', body: '(ადმინის ტექსტი)', template: null,
      }), TPL)

    case 'test.manual':
      return { subject: null, body: '—', sms: 'მცოდნე: სატესტო შეტყობინება. კოდი 4321', source: 'scripts/sms-test.ts' }

    /* Written where they are sent. Named rather than previewed — see above. */
    case 'auth.otpVerify':
    case 'auth.otpReset':      return { subject: null, body: '', source: 'app/api/auth/otp/send/route.ts' }
    case 'auth.passwordReset': return { subject: null, body: '', source: 'app/api/auth/reset/request/route.ts' }
    case 'inbox.contact':      return { subject: null, body: '', source: 'app/api/contact/route.ts' }
    case 'inbox.help':         return { subject: null, body: '', source: 'app/api/help/message/route.ts' }
    case 'inbox.newRequest':   return { subject: null, body: '', source: 'app/api/requests/route.ts' }
    case 'admin.broadcast':    return { subject: null, body: '', source: 'app/api/admin/broadcast/send/route.ts' }
    default: return null
  }
}
