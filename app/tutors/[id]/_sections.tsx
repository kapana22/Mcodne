'use client'
// /tutors/[id] — the read-only profile sections: about, services,
// certificates, education, experience.

import { useState } from 'react'
import { safeHttpUrl } from '@/lib/safeUrl'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { orderedTiers, tierPriceLabel, type ConsultationItem } from '@/components/booking/slots'
import { CertThumb, VerifiedMark } from './_bits'
import { TutorDetail } from './_data'

/* ───── Specs strip — compact stats row ───── */
/* SpecsGrid (sessions · response time · years) was DELETED 2026-07-29.
 *
 * It restated three facts the identity header already carried, in a heavier
 * type size — the same number appeared up to three times on one desktop screen
 * (header, this strip, the booking rail's stat-trio), so none of them read as
 * authoritative. It also could not survive our own data: of the ten live
 * experts, ZERO have a measured response time, nine have zero sessions, and
 * four have none of the three — for them a bordered section rendered one lone
 * number or nothing at all.
 *
 * No comparable marketplace runs such a strip: MentorCruise and ADPList lead
 * with photo + role-at-company, Preply leads with the intro video. Identity and
 * the video are what a first-time buyer evaluates; counters are what a mature
 * marketplace adds later. Don't reintroduce it — if a number is worth showing,
 * it belongs in exactly one place, at the weight it deserves.
 */

/* ───── About ───── */
export const AboutSection = ({ tutor }: { tutor: TutorDetail | null }) => {
  // A long bio is a wall of text on a phone. Below lg we clamp to ~8 lines
  // and offer an explicit expand; desktop keeps the full text (the right
  // rail balances it there). Hooks run unconditionally (before any return).
  const [bioExpanded, setBioExpanded] = useState(false)
  if (!tutor) return null
  const bio = tutor.bio ?? tutor.user.bio
  // The headline is printed in the identity header, ~300px above. Repeating it
  // here as a large pull-quote made the same sentence the two most prominent
  // pieces of text on the page. About = the bio; no bio, no section.
  if (!bio) return null
  // Split bio into paragraphs by double newline or period-space+capital.
  const paragraphs = bio ? bio.split(/\n\n+/).filter(p => p.trim()) : []
  const isLong = (bio?.length ?? 0) > 420
  return (
    <section id="overview" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <Eyebrow className="mb-4">ჩემ შესახებ</Eyebrow>
      {paragraphs.length > 0 && (
        <>
          <div className={`space-y-4 text-body-lg text-ink-700 leading-[1.65] max-w-[640px] whitespace-pre-wrap ${isLong && !bioExpanded ? 'max-lg:line-clamp-[8]' : ''}`}>
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {isLong && (
            <button
              type="button"
              onClick={() => setBioExpanded(v => !v)}
              className="lg:hidden mt-3 h-11 -ml-1 px-1 inline-flex items-center gap-1.5 font-display text-small font-semibold text-brand-700 no-caps"
              aria-expanded={bioExpanded}
            >
              {bioExpanded ? 'ჩაკეცვა' : 'სრულად წაკითხვა'}
              <Icon.chevD className={`w-4 h-4 transition-transform duration-fast ${bioExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </>
      )}
    </section>
  )
}

/* ───── Services — takes tutor.consultations from API ─────
   ConsultationItem type comes from components/booking/slots (shared with the
   booking flow's tier step). Each card's „აირჩიე“ opens the shared flow with
   that tier preselected (DESIGN_FIX_PROMPT 1.2). */
export const ServicesSection = ({ consultations, onBook }: { consultations: ConsultationItem[]; onBook: (s: ConsultationItem) => void }) => {
  if (!consultations || consultations.length === 0) return null
  // Shared ordering: flagship (longest PAID) first, free intro last. Raw payload
  // order could lead with a free 15-min tier, which reads as the main offer.
  const tiers = orderedTiers(consultations)
  return (
    <section id="services" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow className="mb-3">სერვისები</Eyebrow>
          <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">როგორ დაგეხმარები</h2>
        </div>
        <span className="text-meta text-ink-500 font-display tabular-nums">{consultations.length} სერვისი · ფიქსირებული ფასი</span>
      </div>

      <div className="mt-7 grid sm:grid-cols-2 gap-3">
        {tiers.map((s, i) => (
          <article key={s.id} className="rounded-card border border-ink-200 bg-white p-5 hover:border-ink-300 hover-lift flex flex-col">
            <div className="font-display text-meta font-bold text-brand-700 tabular-nums mb-2">{String(i+1).padStart(2, '0')}</div>
            <h3 className="font-display text-body-lg font-bold text-ink-900 tracking-tight leading-tight">{s.title}</h3>
            {s.description && <p className="text-small text-ink-600 mt-2 leading-[1.55] flex-1">{s.description}</p>}
            <div className="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
              <div>
                <Eyebrow tone="muted">{s.minutes} წუთი</Eyebrow>
                {/* tierPriceLabel, not „₾{price}“ — a free intro tier used to
                    render as „₾0", which reads like a broken price, not a gift. */}
                <div className="font-display text-h3 font-bold text-ink-900 tabular-nums leading-none mt-1">{tierPriceLabel(s)}</div>
              </div>
              <button type="button" onClick={() => onBook(s)} className="h-11 px-4 rounded-btn bg-brand-50 hover:bg-brand-600 hover:text-white border border-brand-200 hover:border-brand-600 text-brand-700 font-display font-semibold text-meta tracking-wide inline-flex items-center gap-1 transition-colors duration-fast">
                აირჩიე
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ───── Certificates ───── */
// `fileUrl` no longer travels in the payload (a base64 diploma would add
// megabytes to every profile response) — `hasFile` says a scan exists and the
// bytes come from /api/certificates/<id>/file. `fileUrl` stays optional for
// legacy externally-hosted links.
type CertItem = { id: string; title: string; issuer?: string | null; year: number; fileUrl?: string | null; hasFile?: boolean; verified: boolean }
type EduItem = { id: string; school: string; degree: string; field: string | null; startYear: number; endYear: number | null }
type ExpItem = { id: string; company: string; role: string; startYear: number; endYear: number | null; description: string | null }

export const CertificatesSection = ({ items }: { items: CertItem[] }) => {
  // ── Rows with NO document do not render (2026-07-31) ──────────────────────
  // A certificate whose entire content is „IMG_2763 · 2026" is not a credential,
  // it is the residue of a failed upload: a zod `max(500)` on `fileUrl` silently
  // rejected every base64 diploma before 2026-07-29, so those rows kept the
  // camera's filename as their title and nothing else. Framed under a heading
  // that promises „დიპლომები და სერტიფიკატები" and „გადამოწმებული აღინიშნება",
  // an empty frame does not read as neutral — it reads as a credential that
  // failed to verify, which is worse than showing nothing.
  //
  // NOTHING IS DELETED. This filters the RENDER only; the row stays in the DB
  // and reappears the moment the expert uploads the scan (which is what
  // lib/expertActivation nudges them to do). No expert-authored text is touched.
  //
  // `href` is resolved once here rather than per-branch below, so the list and
  // the anchors can never disagree about whether a document exists.
  const withFile = (items ?? [])
    .map(c => ({ c, href: c.hasFile ? `/api/certificates/${c.id}/file` : safeHttpUrl(c.fileUrl) }))
    .filter((x): x is { c: CertItem; href: string } => !!x.href)
  // Every row lacked a file → the section as a whole has nothing to prove, so it
  // is absent rather than an empty heading over blank space.
  if (withFile.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow className="mb-3">სერტიფიკატები</Eyebrow>
          <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">დიპლომები და სერტიფიკატები</h2>
        </div>
        <span className="text-meta text-ink-500 font-display inline-flex items-center gap-1.5">
          <Icon.shieldCheck className="w-3.5 h-3.5 text-brand-600" />
          გადამოწმებული აღინიშნება
        </span>
      </div>

      {/* Cards with a real preview, not text pills. A diploma is a VISUAL trust
          signal — rendering it as „IMG_2763.jpeg · მითითებული არ არის · 2026"
          threw that away and looked broken. The scan loads per-certificate from
          its own cacheable URL, so nothing heavy enters the profile payload. */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {withFile.map(({ c, href }) => {
          // `href` is guaranteed by the filter above — legacy rows carry an
          // external https link, new ones are served by id, and rows with
          // neither never reach this map.
          const inner = (
            <>
              <div className="aspect-[4/3] w-full bg-ink-50 border-b border-ink-100 overflow-hidden flex items-center justify-center">
                <CertThumb src={href} alt={c.title} />
              </div>
              <div className="p-3">
                <div className="font-display text-small font-bold text-ink-900 leading-snug line-clamp-2">{c.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-meta text-ink-500">
                  {/* An empty issuer renders as NOTHING. It used to be the
                      literal string „მითითებული არ არის", stored in the column
                      and shown as if the expert had written it. */}
                  {c.issuer?.trim() && <span className="truncate">{c.issuer.trim()}</span>}
                  {c.issuer?.trim() && <span className="text-ink-300">·</span>}
                  <span className="tabular-nums shrink-0">{c.year}</span>
                  {c.verified && <VerifiedMark size={14} title="გადამოწმებული სერტიფიკატი" />}
                </div>
              </div>
            </>
          )
          // Always an anchor now: the file-less branch that used to render a
          // dead <div> here is unreachable, because those rows are filtered out
          // above rather than shown as an empty frame.
          return (
            <a
              key={c.id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-card border border-ink-200 bg-white overflow-hidden block hover-lift transition-all duration-fast"
              aria-label={`${c.title} — გახსნა`}
            >
              {inner}
            </a>
          )
        })}
      </div>
    </section>
  )
}

export const EducationSection = ({ items }: { items: EduItem[] }) => {
  if (!items || items.length === 0) return null
  return (
    <section className="mt-14 lg:mt-16 pt-10 border-t border-ink-100">
      <Eyebrow className="mb-3">განათლება</Eyebrow>
      <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">ფორმალური საფუძველი</h2>

      <ol className="mt-6 relative space-y-5 pl-6">
        <span className="absolute left-[7px] top-2 bottom-2 w-px bg-ink-200" aria-hidden />
        {items.map(e => (
          <li key={e.id} className="relative">
            <span className="absolute left-[-24px] top-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 ring-4 ring-white" />
            <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">{e.school}</div>
            <div className="text-small text-ink-700 mt-0.5">{e.degree}{e.field ? ` · ${e.field}` : ''}</div>
            <div className="text-meta text-ink-500 tabular-nums mt-0.5">{e.startYear} – {e.endYear ?? 'დღემდე'}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export const ExperienceSection = ({ items }: { items: ExpItem[] }) => {
  if (!items || items.length === 0) return null
  return (
    <section id="experience" className="mt-14 lg:mt-16 pt-10 border-t border-ink-100 scroll-mt-24">
      <Eyebrow className="mb-3">გამოცდილება</Eyebrow>
      <h2 className="font-display text-h2 lg:text-h1 font-bold tracking-[-0.022em] text-ink-900 leading-tight">სამუშაო ისტორია</h2>

      <div className="mt-6 grid sm:grid-cols-2 gap-3">
        {items.map(x => (
          <article key={x.id} className="rounded-card border border-ink-200 bg-white p-4">
            <div className="font-display text-body font-bold text-ink-900 leading-snug">{x.role}</div>
            <div className="text-small text-ink-700 mt-0.5">{x.company}</div>
            <div className="text-meta text-ink-500 tabular-nums mt-1">{x.startYear} – {x.endYear ?? 'ახლა'}</div>
            {x.description && <p className="mt-2 text-small text-ink-600 leading-[1.55]">{x.description}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}