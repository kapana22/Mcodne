// YouTube URL parsing — shared between the client-side apply form (live
// validation while typing) and the server-side POST /api/applications
// handler (final check + normalization before persisting).
//
// Returns the 11-character video ID for any of YouTube's public URL forms:
//   • https://youtube.com/watch?v=<id>
//   • https://www.youtube.com/watch?v=<id>&t=…
//   • https://m.youtube.com/watch?v=<id>
//   • https://youtu.be/<id>
//   • https://www.youtube.com/shorts/<id>
//   • https://www.youtube.com/embed/<id>
//   • https://www.youtube.com/live/<id>
// Users can also paste the bare 11-char ID; we accept that too.

export function extractYouTubeId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const url = raw.trim()
  if (!url) return null
  // Direct-ID shortcut
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v')
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
      const parts = u.pathname.split('/').filter(Boolean)
      if (
        ['shorts', 'embed', 'live'].includes(parts[0]) &&
        parts[1] &&
        /^[a-zA-Z0-9_-]{11}$/.test(parts[1])
      ) {
        return parts[1]
      }
    }
    return null
  } catch {
    return null
  }
}

// Full canonical watch URL for a given ID. We normalize submissions to this
// shape so admins always see the same link format in the moderation queue.
export function canonicalYouTubeUrl(id: string): string {
  return `https://youtu.be/${id}`
}
