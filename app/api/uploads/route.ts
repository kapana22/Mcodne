import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { prisma } from '@/lib/prisma'

// Byte limits — kept in sync with client-side gates so the UX matches what
// the server actually enforces. Images cover avatars + apply-flow ID / selfie
// photos; certificates cover diplomas (PDF or image scan); videos cover the
// apply-flow intro clip.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024        // 8 MB — avatars, ID, selfie
const MAX_CERT_BYTES = 25 * 1024 * 1024        // 25 MB — diploma PDF / image
const MAX_VIDEO_BYTES = 100 * 1024 * 1024      // 100 MB — intro video
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024   // 8 MB — generic message file

const ALLOWED_IMG = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_CERT = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const ALLOWED_ATTACH = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

type Kind = 'avatar' | 'certificate' | 'video' | 'idDoc' | 'selfie' | 'attachment'

// Returns the real MIME sniffed from the leading bytes, or null if unrecognized.
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF89a') return 'image/gif'
  if (buf.length >= 6 && buf.toString('ascii', 0, 6) === 'GIF87a') return 'image/gif'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf'
  return null
}

// True when the file's real (sniffed) type is in the allow-list for this kind.
function magicBytesMatch(buf: Buffer, allowed: Set<string>): boolean {
  const real = sniffMime(buf)
  return real !== null && allowed.has(real)
}

function limitsFor(kind: Kind): { max: number; allowed: Set<string> } {
  switch (kind) {
    case 'avatar':
    case 'idDoc':
    case 'selfie':
      return { max: MAX_IMAGE_BYTES, allowed: ALLOWED_IMG }
    case 'certificate':
      return { max: MAX_CERT_BYTES, allowed: ALLOWED_CERT }
    case 'video':
      return { max: MAX_VIDEO_BYTES, allowed: ALLOWED_VIDEO }
    default:
      return { max: MAX_ATTACHMENT_BYTES, allowed: ALLOWED_ATTACH }
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const rl = rateLimit(`upload:${user.id}`, 20, 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'RATE_LIMITED', retryInSec: rl.retryInSec }, { status: 429 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'INVALID' }, { status: 400 })

  const kind = String(form.get('kind') ?? 'attachment') as Kind

  // Intro videos moved to YouTube-embed only: tutors paste a YouTube URL on
  // their profile and we render it via a nocookie iframe. Uploading raw video
  // files to Postgres as base64 data URLs bloated the DB and was never
  // sustainable. Reject any lingering upload calls with a clear hint.
  if (kind === 'video') {
    return NextResponse.json(
      { ok: false, error: 'VIDEO_UPLOAD_DISABLED', hint: 'Paste a YouTube URL on your tutor profile instead.' },
      { status: 410 },
    )
  }

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ ok: false, error: 'NO_FILE' }, { status: 400 })

  const { max, allowed } = limitsFor(kind)

  if (file.size > max) {
    return NextResponse.json({ ok: false, error: 'TOO_LARGE', maxBytes: max }, { status: 400 })
  }
  if (!allowed.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'BAD_TYPE', allowed: [...allowed] }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())

  // Content sniffing: the browser-declared `file.type` is attacker-controllable,
  // so verify the actual magic bytes match one of the allowed types. Blocks
  // storing arbitrary bytes (e.g. HTML/script) under a spoofed image MIME.
  if (!magicBytesMatch(buf, allowed)) {
    return NextResponse.json({ ok: false, error: 'BAD_CONTENT' }, { status: 400 })
  }

  const dataUrl = `data:${file.type};base64,${buf.toString('base64')}`

  if (kind === 'avatar') {
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: dataUrl } })
    return NextResponse.json({ ok: true, url: dataUrl })
  }
  return NextResponse.json({ ok: true, url: dataUrl, fileName: file.name, size: file.size, type: file.type })
}
