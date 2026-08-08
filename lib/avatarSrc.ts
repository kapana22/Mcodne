/**
 * Turns a stored avatar into something a payload can carry cheaply.
 *
 * `User.avatarUrl` holds a `data:` URI (files live in Postgres, not a bucket).
 * Shipping that string is what made /tutors 556KB of HTML — see the measurement
 * in app/api/avatars/[id]/route.ts. This replaces it with a URL to that route,
 * which the browser caches once and reuses on every later page.
 *
 * USE IT IN EVERY LIST PAYLOAD. Passing the raw value through is the bug this
 * exists to prevent, and it is invisible: the page looks identical, it is just
 * half a megabyte heavier and uncacheable.
 *
 * Values that are already ordinary URLs (Google sign-in) pass through
 * untouched — there is nothing to save and a redirect would only add a hop.
 */

/**
 * A short, stable fingerprint of the stored bytes. It only has to change when
 * the photo changes, so a cheap non-cryptographic hash over a slice is enough —
 * and a slice keeps this O(1) on a 40KB base64 string.
 */
function fingerprint(v: string): string {
  let h = 2166136261
  const head = v.slice(0, 256)
  const tail = v.slice(-256)
  const s = `${v.length}:${head}${tail}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function avatarSrc(userId: string | null | undefined, stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!/^data:/i.test(stored)) return stored
  if (!userId) return stored
  return `/api/avatars/${userId}?v=${fingerprint(stored)}`
}
