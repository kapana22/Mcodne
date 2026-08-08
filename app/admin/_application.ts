/* Pure helpers for the expert-application moderation panel.
 *
 * WHY a separate module: the moderation view used to read `professionData`
 * with `Object.entries(...).map(([k, v]) => String(v))` — for the real shape
 * (`services` is an array of objects) that renders literally
 * „[object Object],[object Object]" inside a `truncate`, and the panel showed
 * nothing at all for the fields the applicant actually filled in. Shaping that
 * blob and deciding what is MISSING are pure decisions, so they live here where
 * `tests/admin-application-review.test.ts` can pin them against the real DB
 * shape instead of being buried in JSX.
 *
 * `resolveVerifiedGrant` is imported by PATCH /api/applications/[id] — it is
 * the single place that decides whether the „გადამოწმებული" badge is granted,
 * so the default (NEVER auto-verify) cannot drift between UI and server.
 *
 * No React, no Prisma, no browser APIs: safe on both sides of the boundary.
 */

/* ═══════════ certificates / documents ═══════════════════════════════════ */

export type ApplicationCertificate = { title: string; url: string }

export type ApplicationDocs = {
  idDocUrl?: string | null
  selfieUrl?: string | null
  certificates?: unknown
}

/** `TutorApplication.certificates` is an untyped Json column — rows in prod are
 *  either `null` or `[{ title, url }]`. Anything else is dropped rather than
 *  crashing the panel on `c.title.trim()`. */
export function normalizeCertificates(raw: unknown): ApplicationCertificate[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((c: any) => ({
      title: typeof c?.title === 'string' ? c.title.trim() : '',
      url: typeof c?.url === 'string' ? c.url.trim() : '',
    }))
    .filter(c => c.title || c.url)
    .map(c => ({ title: c.title || 'უსახელო ფაილი', url: c.url }))
}

/** A readable file label for an upload. Stored files are frequently base64
 *  `data:` URLs with no name at all, so we synthesize „webp · 9 KB" rather than
 *  printing a 12 000-character string at the moderator; http(s) uploads show
 *  their last path segment. */
export function fileLabel(url: string | null | undefined): string {
  const u = (url ?? '').trim()
  if (!u) return 'ფაილი არ არის'
  const data = /^data:([^;,]+)/i.exec(u)
  if (data) {
    const ext = data[1].split('/')[1] ?? data[1]
    // base64 encodes 3 bytes per 4 chars — close enough for a size hint.
    const payload = u.slice(u.indexOf(',') + 1)
    const kb = Math.max(1, Math.round((payload.length * 3) / 4 / 1024))
    return `${ext.toUpperCase()} · ${kb} KB`
  }
  try {
    const path = new URL(u, 'https://x.invalid').pathname
    const last = path.split('/').filter(Boolean).pop()
    if (last) return decodeURIComponent(last).slice(0, 64)
  } catch { /* fall through to the raw string */ }
  return u.slice(0, 64)
}

/** True when the application carries ANY evidence a moderator could have
 *  looked at — a certificate/diploma scan, or the legacy ID/selfie pair.
 *  This is what „გადამოწმებული" is supposed to rest on. */
export function hasVerificationDocument(docs: ApplicationDocs | null | undefined): boolean {
  if (!docs) return false
  if (typeof docs.idDocUrl === 'string' && docs.idDocUrl.trim()) return true
  if (typeof docs.selfieUrl === 'string' && docs.selfieUrl.trim()) return true
  return normalizeCertificates(docs.certificates).some(c => !!c.url)
}

/* ═══════════ professionData ═════════════════════════════════════════════ */

export type ProfessionService = {
  name: string
  desc: string
  minutes: number | null
  price: number | null
  free: boolean
}

export type ProfessionSummary = {
  headline: string | null
  languages: string[]
  services: ProfessionService[]
  /** Every OTHER key in the blob (legacy apply flows wrote `reFocus`,
   *  `ageGroups`, `platforms`), flattened to a readable line so a moderator
   *  never has to open the raw JSON to see an answer. */
  extras: { key: string; label: string; value: string }[]
  isEmpty: boolean
}

const EXTRA_LABELS: Record<string, string> = {
  reFocus: 'ფოკუსი',
  ageGroups: 'ასაკობრივი ჯგუფები',
  platforms: 'პლატფორმები',
  specializations: 'სპეციალიზაციები',
  certifications: 'სერტიფიკატები',
  industries: 'ინდუსტრიები',
  requestedCategory: 'მოთხოვნილი სფერო',
}

function flatten(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(' · ')
  if (typeof v === 'object') {
    const parts = Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => { const s = flatten(val); return s ? `${k}: ${s}` : '' })
      .filter(Boolean)
    return parts.join(', ')
  }
  if (typeof v === 'boolean') return v ? 'კი' : 'არა'
  return String(v).trim()
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Real prod shape (verified against all 10 rows, 2026-07-29):
 *  `{ headline: string, languages: string[], services: { name, desc, dur, price, free }[] }`
 *  — plus one legacy row carrying `{ reFocus, ageGroups, platforms }` and one
 *  row where the whole column is null. */
export function summarizeProfessionData(raw: unknown): ProfessionSummary {
  const empty: ProfessionSummary = { headline: null, languages: [], services: [], extras: [], isEmpty: true }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const d = raw as Record<string, unknown>

  const headline = typeof d.headline === 'string' && d.headline.trim() ? d.headline.trim() : null

  const languages = Array.isArray(d.languages)
    ? d.languages.map(l => (typeof l === 'string' ? l.trim() : flatten(l))).filter(Boolean)
    : []

  const services: ProfessionService[] = Array.isArray(d.services)
    ? d.services
      .map((s: any) => ({
        name: typeof s?.name === 'string' ? s.name.trim() : '',
        desc: typeof s?.desc === 'string' ? s.desc.trim() : '',
        minutes: num(s?.dur),
        price: num(s?.price),
        free: s?.free === true || num(s?.price) === 0,
      }))
      .filter(s => s.name || s.desc)
    : []

  const extras = Object.entries(d)
    .filter(([k]) => k !== 'headline' && k !== 'languages' && k !== 'services')
    .map(([k, v]) => ({ key: k, label: EXTRA_LABELS[k] ?? k, value: flatten(v) }))
    .filter(e => e.value)

  return {
    headline,
    languages,
    services,
    extras,
    isEmpty: !headline && !languages.length && !services.length && !extras.length,
  }
}

/* ═══════════ „what is missing" ══════════════════════════════════════════ */

/* An empty slot rendered as nothing is indistinguishable from a field that
   does not exist — the moderator cannot tell „no photo uploaded" from „we
   never ask for a photo". Every gap is therefore named out loud. */
export type MissingPart = { key: string; label: string }

export type ApplicationForReview = {
  avatarUrl?: string | null
  phone?: string | null
  city?: string | null
  motivation?: string | null
  linkedinUrl?: string | null
  websiteUrl?: string | null
  introVideoUrl?: string | null
  introVideoId?: string | null
  professionData?: unknown
  docs?: ApplicationDocs | null
}

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0

export function missingApplicationParts(a: ApplicationForReview): MissingPart[] {
  const out: MissingPart[] = []
  const pd = summarizeProfessionData(a.professionData)
  if (!filled(a.avatarUrl)) out.push({ key: 'photo', label: 'ფოტო არ აქვს ატვირთული' })
  if (!hasVerificationDocument(a.docs)) out.push({ key: 'document', label: 'დოკუმენტი (დიპლომი / სერტიფიკატი) არ არის მიმაგრებული' })
  if (!filled(a.introVideoUrl) && !filled(a.introVideoId)) out.push({ key: 'video', label: 'ინტრო ვიდეო არ არის' })
  if (!filled(a.phone)) out.push({ key: 'phone', label: 'ტელეფონი არ არის მითითებული' })
  if (!filled(a.city)) out.push({ key: 'city', label: 'ქალაქი არ არის მითითებული' })
  if (!filled(a.linkedinUrl) && !filled(a.websiteUrl)) out.push({ key: 'links', label: 'LinkedIn-ი და ვებგვერდი არ არის' })
  if (!filled(a.motivation)) out.push({ key: 'motivation', label: '„შესახებ“ ტექსტი ცარიელია' })
  if (!pd.headline) out.push({ key: 'headline', label: 'სათაური (headline) არ არის' })
  if (!pd.services.length) out.push({ key: 'services', label: 'სერვისები და ფასები არ არის' })
  if (!pd.languages.length) out.push({ key: 'languages', label: 'ენები არ არის მითითებული' })
  return out
}

/* ═══════════ the „გადამოწმებული" decision ═══════════════════════════════ */

export type VerifiedGrant = {
  /** Whether TutorProfile.verified should be set on approval. */
  grant: boolean
  /** Whether a document was actually attached at the moment of the decision —
   *  written into the audit row so „why is this person verified?" stays
   *  answerable months later. */
  hadDocument: boolean
  /** grant === true while nothing was attached: the moderator vouched
   *  out-of-band. Deliberately allowed (not blocked) but always recorded. */
  grantedWithoutDocument: boolean
}

/**
 * Resolve the moderator's badge choice.
 *
 * STRICT on purpose: only a literal `true` grants the badge. `undefined` (an
 * older client, a bulk approve, any caller that never thought about it) and
 * every truthy-but-not-boolean value („true", 1, {}) resolve to NO badge.
 * „გადამოწმებული" is a public trust signal on every card — it must only ever
 * appear because a human deliberately ticked it while the documents were on
 * screen, never as the fallthrough of a missing field.
 */
export function resolveVerifiedGrant(
  choice: unknown,
  docs: ApplicationDocs | null | undefined,
): VerifiedGrant {
  const grant = choice === true
  const hadDocument = hasVerificationDocument(docs)
  return { grant, hadDocument, grantedWithoutDocument: grant && !hadDocument }
}
