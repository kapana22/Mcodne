// Resolving a letter's words at send time: the code's default, overridden by
// whatever the owner has typed in /admin → ტექსტები.
//
// ⚠️ IT RIDES `getSiteTextMap`, NOT A QUERY OF ITS OWN. That map is already
// cached across requests and already dropped the instant somebody saves a
// string (lib/siteText → SITE_TEXT_TAG), so an edit is live on the next letter
// with no second cache to reason about and no second thing to invalidate.
//
// ⚠️ AND IT NEVER THROWS. A letter is sent from a background `after()` on a
// path the user has already been answered on; copy that cannot be read must
// mean the SHIPPED WORDS, never a failed send. Same promise lib/siteText makes
// to the page renderer, kept for the same reason — and it is what lets the
// tests call these builders with no database at all.

import { MESSAGE_TEXT_DEFAULTS, messageTextKey } from './messageTextDefs'

/** `t(outboundKey, part, vars?)` — the string, with `{placeholders}` filled. */
export type MessageT = (outboundKey: string, part: string, vars?: Record<string, string>) => string

/**
 * Fill `{name}` holes. A value that is missing leaves the hole EMPTY rather
 * than printing the placeholder: an owner who deletes `{ref}` from a subject
 * has made an editorial choice, and a subject reading „მოთხოვნა მივიღეთ — {ref}"
 * in somebody's inbox is the worst of both answers.
 */
function fill(s: string, vars?: Record<string, string>): string {
  if (!s.includes('{')) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '')
}

export async function messageText(): Promise<MessageT> {
  let overrides: Record<string, string> = {}
  try {
    const { getSiteTextMap } = await import('./siteText')
    overrides = await getSiteTextMap()
  } catch {
    // No database, no Next request context (a test), a timeout — all the same
    // answer: the words the code shipped with.
    overrides = {}
  }
  return (outboundKey, part, vars) => {
    const key = messageTextKey(outboundKey, part)
    const raw = overrides[key] ?? MESSAGE_TEXT_DEFAULTS[key] ?? ''
    return fill(raw, vars)
  }
}

/** The defaults only — for a caller with no `await` to spare (scripts, tests). */
export const messageTextSync: MessageT = (outboundKey, part, vars) =>
  fill(MESSAGE_TEXT_DEFAULTS[messageTextKey(outboundKey, part)] ?? '', vars)
