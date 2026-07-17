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
 * than the render guard: only `http(s):` and inline `data:image/*` are accepted
 * — `mailto:`/`tel:`/relative paths make no sense for a stored attachment and
 * are rejected. Returns `null` when the URL is unsafe so the caller can 400.
 */
export function safeStoredFileUrl(u?: string | null): string | null {
  if (!u) return null
  const trimmed = u.trim()
  return /^(https?:\/\/|data:image\/)/i.test(trimmed) ? trimmed : null
}
