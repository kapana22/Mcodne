import { avatarSrc } from '@/lib/avatarSrc'

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

// AVATARS ARE NO LONGER SHIPPED INLINE — they became a URL (2026-08-01).
//
// This function used to NULL any stored avatar above 128KB, which had two
// costs: an expert with a detailed photo silently rendered as initials, and
// every avatar UNDER the ceiling still travelled as base64 inside the payload,
// repeated once per card. Measured: /tutors was 556KB of HTML against 59KB for
// the home page, and a ~259ms network floor applies to every request, so bytes
// were the only thing left worth cutting.
//
// Now the data URI is replaced with `/api/avatars/<id>?v=<fingerprint>`, which
// the browser fetches once and reuses everywhere. Nothing is dropped, so the
// initials-instead-of-photo regression is gone with it; see lib/avatarSrc.ts
// and app/api/avatars/[id]/route.ts.

export function stripAvatar<T extends { id?: string; avatarUrl?: string | null }>(
  u: T | null | undefined,
): T | null | undefined {
  if (!u || !u.avatarUrl) return u
  const src = avatarSrc(u.id, u.avatarUrl)
  return src === u.avatarUrl ? u : ({ ...u, avatarUrl: src } as T)
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
