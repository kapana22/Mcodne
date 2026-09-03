// EVERY WORD THE SITE TEXTS. The SMS half of lib/emailTemplates.
//
// Owner, 2026-09-02: „და ტექსტი რა იგზავნება ეგ სადაა". It was one function
// buried in lib/requestJobs, beside the job that happened to send it — findable
// only by knowing where to look, which is not what „the copy is the owner's"
// means. Email copy has had one address since the beginning; this is the same
// address for the other channel.
//
// ⚠️ EVERY BUILDER HERE MUST FIT ONE PART. Georgian is UCS-2: 70 characters in
// one part, 67 each after that, and every part is billed (lib/sms → smsParts).
// tests/outbound checks the ones with fixed wording; a builder that takes a
// long label can still spill, which is why the variable goes LAST in each and
// nothing follows it but the address.
//
// ⚠️ AND NONE OF THEM CARRIES AN `MC-` REFERENCE. The public reference is a
// credential — 25 bits opening a page that holds somebody's phone number — and
// CLAUDE.md forbids printing it into a provider's notification. A text only has
// to make somebody look; they sign in and find the thing themselves.

import { messageText } from './messageText'

/**
 * The same news as the letter, in one SMS part.
 *
 * ⚠️ IT CARRIES NO `MC-` REFERENCE, and that is rule 5 rather than brevity. The
 * public reference is a credential — 25 bits that open a page holding somebody's
 * phone number — and it must never be printed into a provider's notification.
 * The provider signs in and finds the request in their own room; the text only
 * has to make them look.
 *
 * ⚠️ AND IT STAYS UNDER 70 CHARACTERS. Georgian is UCS-2, so 71 costs two parts
 * and every part is billed (lib/sms → smsParts). A long topic label will push it
 * over on its own, which is why the label is the LAST thing before the link and
 * nothing follows it but the address.
 */
export async function verifiedRequestSms(topicLabel: string): Promise<string> {
  const t = await messageText()
  return t('request.verified.provider', 'sms', { topic: topicLabel })
}

