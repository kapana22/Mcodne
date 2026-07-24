// Files (avatars, videos, the apply-flow profession JSON) live INLINE in Postgres
// text/JSON columns — there is no object storage yet — so a single TutorProfile
// row can weigh several MB. List endpoints `include` the whole profile per row,
// so one heavy legacy row bloats the entire payload (the same class of bug as
// the 9.4 MB base64 avatar that stalled chats).
//
// These helpers strip the known-heavy fields AFTER the query, mirroring the
// per-field guards already in app/api/tutors/[id]/route.ts. They intentionally
// only null/remove blobs the list & dashboard views never render — every small
// field the UI reads (headline, price, rating, category, name, short videoUrl)
// is preserved, so this is zero-risk to callers.

// A 256px webp avatar is ~5–10 KB; anything materially larger is a legacy,
// un-resized upload. The UI always has an initials fallback, so nulling it is safe.
const AVATAR_MAX = 16_384

export function stripAvatar<T extends { avatarUrl?: string | null }>(
  u: T | null | undefined,
): T | null | undefined {
  if (!u || !u.avatarUrl) return u
  if (u.avatarUrl.startsWith('data:') && u.avatarUrl.length > AVATAR_MAX) {
    return { ...u, avatarUrl: null }
  }
  return u
}

// A joined TutorProfile (as returned by `include`, with a nested `user`).
export function stripTutorBlobs<T extends Record<string, any>>(
  tutor: T | null | undefined,
): T | null | undefined {
  if (!tutor) return tutor
  // professionData is unbounded apply-flow JSON that no list view renders.
  const { professionData: _drop, ...rest } = tutor as any
  return {
    ...rest,
    // New rows store a short YouTube URL here (kept, browse embeds it). Only
    // legacy base64 `data:` videos — which can't be embedded anyway — are heavy.
    videoUrl:
      rest.videoUrl && String(rest.videoUrl).startsWith('data:') ? null : rest.videoUrl,
    user: stripAvatar(rest.user),
  } as T
}
