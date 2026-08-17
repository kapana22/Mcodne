// Shared URL-safety helper.
//
// React auto-escapes text content, but it does NOT sanitize the `href`
// attribute — a value like `javascript:alert(document.cookie)` or
// `data:text/html,<script>…</script>` is placed verbatim into the anchor and
// executes on click, in the victim's authenticated origin. Any URL that
// originates from user input (message attachments, tutor-supplied links,
// certificate/document scans) must be run through `safeHttpUrl` before it is
// used as an href.
//
// This centralizes the check that was previously inlined only in
// app/admin/page.tsx (`safeDocHref`) so every surface applies the same rule.

// Schemes we consider safe to navigate to from a clickable link. Note the
// deliberate exclusion of `javascript:`, `vbscript:`, `file:`, and bare
// `data:` (only `data:image/*` is allowed, for inline image previews we render
// ourselves). Relative/app-internal paths (`/...`) are allowed.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|data:image\/|\/)/i

/**
 * Returns the URL unchanged when it uses a safe, navigable scheme; otherwise
 * returns `undefined` so the resulting `<a>` is non-navigable (no href) rather
 * than an interpreted `javascript:`/`data:text/html` payload.
 */
export function safeHttpUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  const trimmed = u.trim()
  return SAFE_HREF.test(trimmed) ? trimmed : undefined
}

/**
 * Server-side scheme guard for stored URLs (e.g. message `fileUrl`). Stricter
 * than the render guard on navigable schemes — `mailto:`/`tel:`/relative paths
 * make no sense for a stored attachment and are rejected — and limited to the
 * exact inline forms /api/uploads emits: `data:image/*` previews and base64
 * PDFs. The PDF form is required because the composer advertises (and
 * /api/uploads accepts) PDF attachments, while this guard used to reject them,
 * so every PDF send 400'd with UNSAFE_FILE_URL after a full 8 MB round-trip.
 * `;base64,` is mandatory on the PDF branch: a bare `data:application/pdf,…`
 * text payload is nothing we ever store, and the strict anchored form keeps the
 * allow-list from widening in any other direction (`data:text/html` and every
 * other `data:` type stay rejected). Returns `null` when the URL is unsafe so
 * the caller can 400.
 */
export function safeStoredFileUrl(u?: string | null): string | null {
  if (!u) return null
  const trimmed = u.trim()
  return /^(https?:\/\/|data:image\/|data:application\/pdf;base64,)/i.test(trimmed) ? trimmed : null
}

/**
 * Exactly the shapes /api/uploads emits — nothing else may be STORED as a
 * document scan.
 *
 * The two guards above answer „is this safe to render/navigate to". This one
 * answers a narrower question: „did we produce this?". It matters because
 * `Certificate.fileUrl` cannot be `z.string().url()` (a real diploma is a
 * megabyte-long `data:` URI, and the `.url()` ceiling is what once made every
 * upload fail) — so the column had no scheme rule at all, and /api/certificates
 * /[id]/file hands an `https://…` value straight to `NextResponse.redirect`.
 * That made mcodne.ge a redirector to any destination an expert cared to type.
 *
 * There is no object storage: every scan the product creates is base64 inline,
 * so refusing external URLs at the door costs nothing and closes it. Rows
 * written before this rule are unaffected — the read route still serves them.
 */
export function isUploadedFileUrl(u?: string | null): boolean {
  if (!u) return false
  return /^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/i.test(u.trim())
}

/** The image-only half of the rule above — for columns that reach an `<img
 *  src>` and a serving route (B2BService.imageUrl). A PDF is a legitimate
 *  certificate scan but never a card picture, so the two allow-lists differ. */
export function isUploadedImageUrl(u?: string | null): boolean {
  if (!u) return false
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u.trim())
}
