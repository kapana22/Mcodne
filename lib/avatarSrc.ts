/**
 * Turns a stored avatar into something a payload can carry cheaply.
 *
 * `User.avatarUrl` holds a `data:` URI (files live in Postgres, not a bucket).
 * Shipping that string is what made /experts 556KB of HTML — see the measurement
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

/**
 * The same URL `avatarSrc` builds, for a caller that deliberately never SELECTED
 * the column — a list query, or the one-row profile query.
 *
 * ⚠️ WHY THIS EXISTS SEPARATELY (2026-08-24). The catalogue and the provider
 * profile both fall back to the account avatar when a migrated professional has
 * no uploaded `photoUrl`, and both did it by selecting `user.avatarUrl` and
 * handing the stored value straight to the page. On a 27-card catalogue that is
 * ~860KB of base64 no cache can ever reuse — the exact defect the file above
 * exists to prevent, and invisible, because the faces render perfectly.
 *
 * So the SHAPE of the avatar is asked in SQL and the bytes are never read:
 *
 *   NULL                       → no avatar
 *   an ordinary https URL      → pass it through (Google sign-in; nothing to save)
 *   a `data:` URI              → this route, versioned
 *
 * `v` is a fingerprint computed by the caller’s SQL over the length plus the
 * head and tail of the stored string — the same slice-based trick `fingerprint`
 * uses above, and for the same reason: it must change when the photo changes and
 * must not cost a hash of 40KB per row.
 */
export function avatarRouteSrc(
  userId: string | null | undefined,
  shape: { plain: string | null; hasBlob: boolean; v: string | null } | null | undefined,
): string | null {
  if (!shape) return null
  if (shape.plain) return shape.plain
  if (!shape.hasBlob || !userId) return null
  return `/api/avatars/${userId}${shape.v ? `?v=${shape.v}` : ""}`
}

/**
 * The SQL that answers the three questions above for one aliased "User" row,
 * without the column ever entering the payload. Interpolated, never
 * parameterised: it names a table alias, not a value.
 */
export const AVATAR_SHAPE_SQL = (u: string) => `
  CASE WHEN ${u}."avatarUrl" LIKE 'data:%' THEN NULL ELSE ${u}."avatarUrl" END AS "avatarPlain",
  (${u}."avatarUrl" LIKE 'data:%')                                             AS "avatarHasBlob",
  CASE WHEN ${u}."avatarUrl" LIKE 'data:%'
       THEN substr(md5(length(${u}."avatarUrl")::text || left(${u}."avatarUrl", 256) || right(${u}."avatarUrl", 256)), 1, 8)
  END                                                                          AS "avatarV"`
