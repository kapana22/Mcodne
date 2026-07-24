import sharp from 'sharp'

// Avatars are stored inline as base64 `data:` URIs (no object storage yet). The
// upload path (app/api/uploads) already downscales to a 256px webp square, but
// PATCH /api/me also accepts an avatarUrl directly — normalize it the SAME way
// here so no write path can persist a multi-MB avatar that then rides along in
// every list payload. https URLs and non-image data pass through untouched; if
// sharp can't decode the bytes we keep the original string.
export async function normalizeAvatar(v: string): Promise<string> {
  if (!v.startsWith('data:image/')) return v
  const comma = v.indexOf(',')
  if (comma < 0) return v
  let buf: Buffer
  try {
    buf = Buffer.from(v.slice(comma + 1), 'base64')
  } catch {
    return v
  }
  try {
    const out = await sharp(buf)
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer()
    return `data:image/webp;base64,${out.toString('base64')}`
  } catch {
    return v
  }
}
