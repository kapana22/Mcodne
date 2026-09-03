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


/* ═══════════ the client's two texts (2026-09-03) ════════════════════════
 *
 * ⚠️ THEY EXIST BECAUSE THE INTAKE STOPPED ASKING FOR AN EMAIL. Owner:
 * „კონტაქტის ველიდან ამოვიღოთ მელი." A client who never registers now leaves a
 * name and a number, so everything the six client letters used to carry has to
 * fit through one channel — and two of the six are the ones that cannot be
 * allowed to go silent: „we have it, here is your page" and „somebody
 * answered".
 *
 * ⚠️ AND THESE TWO DO CARRY THE `MC-` REFERENCE, WHICH THE FILE HEADER FORBIDS.
 * The carve-out is real and it is narrow. That rule is about a PROVIDER's
 * notification: the reference is 25 bits opening a page that holds SOMEBODY
 * ELSE'S phone number, so it must never travel to a person it does not belong
 * to. Here it travels to the number the client typed into their own request —
 * the same address, the same person, and exactly what `request.received.client`
 * has always put in their inbox as `rowCode`. Withholding it would leave a
 * client with no account and no email holding no way back to their own request
 * at all, which is not a privacy win, it is losing the request.
 */

/** „we have it — here is your page". The one message that carries the code. */
export async function requestReceivedSms(ref: string): Promise<string> {
  const t = await messageText()
  return t('request.received.client', 'sms', { ref })
}

/** „somebody answered" — the whole product, in one part. */
export async function offerArrivedSms(ref: string): Promise<string> {
  const t = await messageText()
  return t('request.offerArrived.client', 'sms', { ref })
}
