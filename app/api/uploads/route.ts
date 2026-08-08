import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Byte limits — kept in sync with client-side gates so the UX matches what
// the server actually enforces. Images cover avatars + apply-flow ID / selfie
// photos; certificates cover diplomas (PDF or image scan); videos cover the
// apply-flow intro clip.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024        // 8 MB — avatars, ID, selfie
const MAX_COVER_BYTES = 20 * 1024 * 1024       // 20 MB — blog cover, see below
const MAX_CERT_BYTES = 25 * 1024 * 1024        // 25 MB — diploma PDF / image
const MAX_VIDEO_BYTES = 100 * 1024 * 1024      // 100 MB — intro video
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024   // 8 MB — generic message file

const ALLOWED_IMG = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_CERT = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const ALLOWED_ATTACH = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

type Kind = 'avatar' | 'cover' | 'certificate' | 'video' | 'idDoc' | 'selfie' | 'attachment'

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
    // Covers get a bigger INPUT allowance than other photos even though they
    // produce the smallest output: the server hard-crops every one to 1200×675,
    // so the source size costs nothing but transient memory — while a 48MP
    // phone photo straight off a modern camera lands at 10–15 MB and would
    // otherwise be rejected for being too good.
    case 'cover':
      return { max: MAX_COVER_BYTES, allowed: ALLOWED_IMG }
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

  // ── Downscale images BEFORE base64-encoding ──────────────────────────────
  // Files are stored inline as `data:` URIs (no object storage yet), so an
  // un-resized upload becomes a multi-MB row that is then EMBEDDED in every API
  // payload the user/file appears in. A single 9.4 MB base64 avatar made chat
  // threads 7.5 MB (the sender's avatar is repeated per message) and 30-40s to
  // load. Cap every stored image: avatars to a 512px square, other photos to
  // 1600px. PDFs and GIFs pass through untouched.
  //
  // AVATAR SIZE, measured — do not lower this again without re-measuring. The
  // browse card renders a 128px square (112px on mobile), so a 3x DPR phone asks
  // for 384px; the old 256px cap (whose comment claimed avatars "render <=64px")
  // is what let a blurry-banner regression ship. 512px @ q78/effort6 costs ~24 KB
  // (~32 KB base64) for a typical portrait and ~39 KB (~52 KB base64) worst case
  // for a very high-detail photo, versus ~11 KB (~15 KB base64) at 256 q82.
  // Quality drops 82 -> 78 because the extra pixels already carry the sharpness;
  // effort 6 + smartSubsample buy another ~8% for a few ms at upload time.
  // Clients crop to a square first (components/AvatarCropper.tsx); `fit: cover`
  // stays as the guard for anything that doesn't.
  const realMime = sniffMime(buf)
  let outBuf: Buffer = buf
  let outType = file.type
  if (kind === 'avatar' && realMime?.startsWith('image/')) {
    try {
      outBuf = await sharp(buf).rotate()
        .resize(512, 512, { fit: 'cover' })
        .webp({ quality: 78, effort: 6, smartSubsample: true })
        .toBuffer()
      outType = 'image/webp'
    } catch { /* fall back to the original bytes if sharp can't decode it */ }
  } else if (kind === 'cover' && realMime?.startsWith('image/')) {
    // BLOG COVERS. Wide crop, and hard-bounded on purpose: these live as base64
    // in the Post row and the /blog index renders every one of them at once, so
    // a careless 4MB phone photo would be paid for eight times on the page that
    // is supposed to sell the writing. 1200×675 webp lands around 60–110KB and
    // is still sharp on a 2× display at card size.
    try {
      outBuf = await sharp(buf).rotate()
        .resize(1200, 675, { fit: 'cover' })
        .webp({ quality: 76, effort: 6, smartSubsample: true })
        .toBuffer()
      outType = 'image/webp'
    } catch { /* fall back to the original bytes if sharp can't decode it */ }
  } else if (realMime?.startsWith('image/') && realMime !== 'image/gif') {
    // Attachments / ID / selfie / certificate photos — bound the longest edge so
    // a phone photo isn't a multi-MB base64 blob. Keep aspect; never upscale.
    try {
      outBuf = await sharp(buf).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
      outType = 'image/jpeg'
    } catch { /* fall back to the original bytes */ }
  }
  const dataUrl = `data:${outType};base64,${outBuf.toString('base64')}`

  if (kind === 'avatar') {
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: dataUrl } })
    return NextResponse.json({ ok: true, url: dataUrl })
  }
  return NextResponse.json({ ok: true, url: dataUrl, fileName: file.name, size: outBuf.length, type: outType })
}
