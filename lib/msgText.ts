// Message-text display hygiene, shared by inbox previews and chat bubbles.
//
// React already escapes text nodes, so HTML injection is not the concern here.
// The concern is *visual* injection: message bodies are arbitrary user input
// and may contain characters that break layout or spoof surrounding UI —
// bidi override marks (U+202E flips the reading direction of everything after
// it, a classic filename-spoof trick), zero-width characters that defeat
// truncation ellipses, and C0/C1 control characters that render as tofu.
// These never carry legitimate meaning in a chat message, so they are dropped
// at render time (stored rows keep the original bytes).

// Bidi embedding/override/isolate marks (U+202A–202E, U+2066–2069),
// zero-width chars (U+200B–200F), Arabic letter mark, BOM.
const INVISIBLES = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u061C\uFEFF]/g
// C0/C1 controls except \n (U+000A) and \t (U+0009), kept for bubble line breaks.
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/** Multi-line variant for chat bubbles: keeps newlines/tabs, drops the rest. */
export function sanitizeMsgBody(s?: string | null): string {
  if (!s) return ''
  return s.replace(INVISIBLES, '').replace(CONTROLS, '')
}

// The composer stores attachment-only sends as "📎 <name>" in `body` (the API
// requires a non-empty body). Previews detect that marker and swap it for a
// clean label instead of echoing the raw filename pattern.
const ATTACHMENT_MARKER = /^📎\s*/

export type MsgPreview = {
  /** Single-line, invisible-free text ready for a truncating container. */
  text: string
  /** True when the message is an attachment send (with or without caption). */
  isAttachment: boolean
}

/**
 * Preview for inbox rows and notification-style surfaces: sanitizes, collapses
 * all whitespace runs (incl. newlines) to single spaces, and normalizes
 * attachment-only bodies to a friendly label. `hasFile` comes from the row's
 * fileUrl when the caller has it; the 📎 marker covers legacy callers that
 * only see `body`.
 */
export function msgPreview(body?: string | null, hasFile?: boolean): MsgPreview {
  const cleaned = sanitizeMsgBody(body).replace(/\s+/g, ' ').trim()
  const stripped = cleaned.replace(ATTACHMENT_MARKER, '').trim()
  if (ATTACHMENT_MARKER.test(cleaned)) {
    // Attachment send — show the caption/filename without the raw 📎 marker,
    // or a generic label when there's nothing else.
    return { text: stripped || 'მიმაგრებული ფაილი', isAttachment: true }
  }
  return { text: cleaned, isAttachment: !!hasFile }
}

// The API caps message bodies at 2000 chars (see app/api/messages/route.ts).
// Composers must enforce the same limit — a 4000-char maxLength let users
// type past the server cap and fail with a generic error.
export const MSG_MAX_LEN = 2000

/** Maps POST /api/messages error codes to actionable Georgian copy. */
export function sendErrorText(code?: string | null, retryInSec?: number): string {
  switch (code) {
    case 'RATE_LIMITED':
      return `ძალიან ბევრი შეტყობინება ზედიზედ — სცადე ${retryInSec ?? 60} წამში.`
    case 'EMAIL_NOT_VERIFIED':
      return 'გაგზავნისთვის ჯერ დაადასტურე ელფოსტა — პარამეტრები → ელფოსტა.'
    case 'INVALID':
      return `შეტყობინება ვერ გაიგზავნა — მაქსიმუმ ${MSG_MAX_LEN} სიმბოლო.`
    case 'UNSAFE_FILE_URL':
      return 'ამ ფაილის მიბმა ვერ მოხერხდა — სცადე სხვა ფაილი.'
    default:
      return 'შეტყობინება ვერ გაიგზავნა — სცადე თავიდან.'
  }
}
