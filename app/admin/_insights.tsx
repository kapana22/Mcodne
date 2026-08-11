'use client'
import { useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { fmtKaDateTime } from '@/lib/kaDate'
import {
  TabHeader, PeriodSwitch, SubTabs, SectionCard, RowList,
  Stat, AdminEmpty, AdminError, AdminLoading, CopyBtn, OpenBtn,
} from './_parts'
import { ProfileViewsSection } from './_profileViews'
import { ExpertsAttentionSection } from './_expertsAttention'

/* Behavioural insights.
 *
 * WHY THIS TAB EXISTS: the panel could already say how many users, bookings and
 * reviews exist — the things that HAPPENED. It could not say what people tried
 * to do and failed. Two questions decide whether this marketplace grows:
 *
 *   1. „რას ეძებენ და ვერ პოულობენ?" Every zero-result search is a client who
 *      arrived with intent and left with nothing, and the query they typed names
 *      the expert we are missing. That list is a recruitment plan.
 *   2. „სად ვკარგავთ ჯავშანს?" — and, crucially, whether the loss is OUR bug or
 *      the design's fault. A server error and a quiet abandon are different
 *      problems with different fixes; one number hides both.
 *
 * ── WHY IT IS SPLIT IN THREE (2026-08-11, owner's audit) ──────────────────
 * Everything above stayed true, and the tab kept growing to serve it: fifteen
 * blocks, twenty-three stat tiles, two charts and five lists on ONE scroll. The
 * cost was not length, it was CATEGORY MIXING — the rows a person can act on
 * (someone to write to, an expert to nudge) sat between roughly twenty
 * aggregates that are only ever read. On the day this was written, the single
 * most valuable thing on the page was one named row, and finding it meant
 * scrolling past the whole marketplace's statistics.
 *
 * So the page now answers ONE question at a time:
 *   ხალხი    — names, with an action next to each. Nothing aggregate.
 *   მოთხოვნა — what people want that we do not have. Recruitment.
 *   ძაბრი    — where the flow loses people, and whose fault it is.
 *
 * It is deliberately NOT three sidebar tabs: the panel already has seventeen,
 * and these three are one job seen from three angles. One fetch still feeds all
 * three, so switching is instant and the period switch applies to all of them.
 *
 * Loaded on open, on period change, and on manual refresh — never polled. */

type Insights = {
  days: number
  retentionDays: number
  search: { total: number; zero: number; zeroShare: number | null }
  categories: { slug: string; name: string; searches: number; experts: number; bookings: number }[]
  repeat: { clients: number; returning: number }
  prev: { attempts: number; created: number }
  slowResponders: { slug: string | null; fullName: string | null; medianMin: number; sampleN: number }[]
  browse: { searches: number; profileViews: number; bookingOpens: number }
  concentration: { bookings: number; experts: number; topShare: number | null }
  waiting: { slug: string | null; fullName: string | null; days: number }[]
  hours: { demand: number[]; supply: number[] }
  cancelBy: { STUDENT: number; TUTOR: number; ADMIN: number; unknown: number }
  zeroQueries: { q: string; n: number; lastAt: string }[]
  funnel: {
    attempts: number
    steps: { key: string; n: number }[]
    outcomes: { failed: number; noSlots: number; abandoned: number }
  }
  failureCodes: { code: string; n: number }[]
  apply: {
    attempts: number
    steps: { key: string; n: number }[]
    outcomes: { failed: number; abandoned: number }
    dropoffs: {
      userId: string; fullName: string | null; email: string
      phone: string | null; lastStep: number; catCount: number | null; lastAt: string
      /** The field that refused them, or null when nothing did. */
      blockCode: string | null
    }[]
  }
  /** Visible experts whose profile is under 100% — unbookable ones first. */
  experts: {
    slug: string | null; fullName: string | null; email: string
    percent: number; unbookable: boolean; hasVideo: boolean; bioLen: number
    missing: string[]
  }[]
}

const APPLY_STEP_LABEL: Record<string, string> = {
  opened: '/apply გახსნა',
  profile: 'პროფილი შეავსო',
  pricing: 'ფასი დაადო',
  submitted: 'განაცხადი გააგზავნა',
}

// Where they were standing when they stopped — read off the last event's `step`.
const APPLY_LAST_STEP: Record<number, string> = {
  1: 'პროფილზე',
  2: 'ფასზე',
  3: 'გაგზავნის ეკრანზე',
}

/**
 * Why they could not continue — the field, in the applicant's words rather than
 * ours. Codes come from ApplyClient's BLOCK_CODE map.
 *
 * A missing code is NOT „no problem": it means nobody pressed „გაგრძელება" and
 * got refused, i.e. they left while the form still looked fine. That is the
 * design question, and it reads differently from a wall — so the row says so
 * explicitly instead of leaving a blank the reader has to interpret.
 */
const APPLY_BLOCK_LABEL: Record<string, string> = {
  NAME_REQUIRED: 'სახელი ვერ შეავსო',
  EMAIL_INVALID: 'ელფოსტა ვერ შეიყვანა',
  PHONE_INVALID: 'ტელეფონის ნომერზე შეჩერდა',
  CATEGORY_REQUIRED: 'სფერო ვერ აირჩია',
  HEADLINE_INVALID: 'ერთ წინადადებაზე შეჩერდა',
  PHOTO_REQUIRED: 'ფოტო ვერ ატვირთა',
  BIO_TOO_SHORT: 'აღწერა ვერ დაწერა',
  PRICE_REQUIRED: 'ფასი ვერ დაადო',
  UNKNOWN: 'ვალიდაციამ შეაჩერა',
}

// Gap ids come from lib/profileScore — the SAME ids the expert's own dashboard
// shows, so a nudge here and the checklist they open say the same thing.
const GAP_LABEL: Record<string, string> = {
  headline: 'სათაური',
  bio: 'ბიო',
  specialty: 'სპეციალობა',
  price: 'ფასი',
  languages: 'ენები',
  avatar: 'ფოტო',
  certificates: 'სერტიფიკატი',
  education: 'განათლება',
  experience: 'გამოცდილება',
  availability: 'თავისუფალი დრო',
}

const STEP_LABEL: Record<string, string> = {
  opened: 'ჯავშნის ფანჯარა გაიხსნა',
  time: 'დრო აირჩია',
  details: 'დეტალები შეავსო',
  created: 'ჯავშანი შეიქმნა',
}

// Server error codes as an admin should read them. An unmapped one falls back to
// the raw constant — which is still actionable, just less kind.
const CODE_LABEL: Record<string, string> = {
  NO_AVAILABILITY: 'არჩეული დრო თავისუფალი აღარ იყო',
  NO_SLOT: 'ასეთი დრო არ არსებობს',
  OVERLAP: 'ამ დროს უკვე აქვს ჯავშანი',
  SELF_BOOKING: 'საკუთარ თავს ჯავშნის',
  LIMIT: 'ერთდროული ჯავშნების ლიმიტი',
  RATE_LIMIT: 'ძალიან ბევრი მცდელობა',
  UNAUTHORIZED: 'ავტორიზაცია გაწყდა',
  SERVER: 'სერვერის შეცდომა',
}

const PCT = (share: number) => Math.round(share * 100) + '%'
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

/** An expert's name, linked to the public profile when there is one. */
const ExpertName = ({ slug, fullName }: { slug: string | null; fullName: string | null }) => {
  const name = fullName?.trim() || 'უსახელო'
  return slug
    ? <a href={`/tutors/${slug}`} target="_blank" rel="noopener noreferrer" className="font-display text-small font-bold text-ink-900 hover:text-brand-700 transition-colors duration-fast truncate">{name}</a>
    : <span className="font-display text-small font-bold text-ink-900 truncate">{name}</span>
}

/* One zero-result query. „Easy to act on" means the admin can, without leaving
   the row: see exactly what the client saw (the same search, live), and copy the
   words to paste into an outreach message or a recruiting note. */
const ZeroRow = ({ q, n, lastAt }: { q: string; n: number; lastAt: string }) => (
  <div className="py-3 px-4 sm:px-5 flex items-center justify-between gap-3 flex-wrap">
    <div className="min-w-0 flex-1">
      <div className="font-display text-body font-semibold text-ink-900 break-words">„{q}“</div>
      <div className="text-meta text-ink-600 mt-0.5">
        {n} ძებნა · ბოლოს {fmtKaDateTime(new Date(lastAt))}
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <OpenBtn href={`/tutors?q=${encodeURIComponent(q)}`} label="ძებნის ნახვა" />
      <CopyBtn value={q} />
    </div>
  </div>
)

/* ═══════════ საათები — a chart that says what to DO ══════════════════════
 *
 * It was 24 bare columns with `aria-hidden` and a `title` carrying only the
 * hour: no number was readable by eye or by screen reader, so the one thing it
 * could tell you („people search at 14:00 and nobody is free then") had to be
 * eyeballed off two stacked bars. The bars stayed — they are the fastest way to
 * see a shape — but the finding is now written out in words underneath, which
 * is also the accessible alternative rather than a second, hidden copy.
 */
const HoursChart = ({ demand: rawD, supply: rawS }: { demand: number[]; supply: number[] }) => {
  // Normalised to exactly 24 slots. A short array from the API would otherwise
  // divide `undefined` and paint `height: NaN%`, which renders as a full-height
  // bar — i.e. an invented peak, the one failure mode a chart must not have.
  const demand = Array.from({ length: 24 }, (_, h) => rawD[h] ?? 0)
  const supply = Array.from({ length: 24 }, (_, h) => rawS[h] ?? 0)
  const dm = Math.max(...demand, 1)
  const sm = Math.max(...supply, 1)
  const peakN = Math.max(...demand)
  const peak = peakN > 0 ? demand.indexOf(peakN) : null
  // Hours somebody searched in and nobody published time for — the gap that one
  // message to one expert closes. Three at most: a list of nine is a wall again.
  const gaps = demand
    .map((n, h) => ({ h, n }))
    .filter(x => x.n > 0 && supply[x.h] === 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
  const hh = (h: number) => String(h).padStart(2, '0') + ':00'

  return (
    <>
      <div className="flex items-end gap-[2px] h-24" role="img" aria-label={
        peak === null
          ? 'ამ პერიოდში ძებნა არ ყოფილა'
          : `ყველაზე მეტს ${hh(peak)} საათზე ეძებენ`
      }>
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="flex-1 flex flex-col justify-end gap-[2px] h-full"
            title={`${hh(h)} — ${demand[h]} ძებნა, ${supply[h]} თავისუფალი დრო`}
          >
            <div className="bg-ink-900 rounded-t-[2px]" style={{ height: (demand[h] / dm) * 55 + '%' }} />
            <div className="bg-brand-200 rounded-t-[2px]" style={{ height: (supply[h] / sm) * 40 + '%' }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-micro text-ink-400 mt-1.5 tabular-nums">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>

      {/* The reading, in words. This IS the chart's text alternative. */}
      <div className="mt-4 pt-4 border-t border-ink-100 space-y-1.5">
        {peak !== null && (
          <p className="text-small text-ink-700">
            პიკი — <span className="font-display font-bold text-ink-900 tabular-nums">{hh(peak)}</span>,
            {' '}{peakN} ძებნა.{' '}
            {supply[peak] > 0
              ? <span className="text-ink-600">ამ საათზე თავისუფალი დროც არის.</span>
              : <span className="text-danger-700 font-semibold">ამ საათზე თავისუფალი დრო არავის აქვს.</span>}
          </p>
        )}
        {gaps.length > 0 && (
          <p className="text-small text-ink-700">
            ძებნაა, დრო კი არა:{' '}
            <span className="font-display font-semibold text-ink-900 tabular-nums">
              {gaps.map(g => `${hh(g.h)} (${g.n})`).join(' · ')}
            </span>
          </p>
        )}
      </div>
    </>
  )
}

/* ═══════════ pane 1: ხალხი ═══════════════════════════════════════════════ */
const PeoplePane = ({ d }: { d: Insights }) => {
  // Experts who CAN take a booking but look thin. The ones who cannot are the
  // section above (<ExpertsAttentionSection>), which knows things this list does
  // not — how many setup reminders they have already had, and how many views
  // their dead end swallowed. Splitting them this way is what removed the
  // duplicate: the same five people used to be listed here and on „სისტემა".
  const thin = d.experts.filter(e => !e.unbookable)

  return (
    <>
      <SectionCard
        eyebrow="ექსპერტად რეგისტრაცია"
        title="ვის მისწერო"
        sub={
          d.apply.attempts === 0
            ? 'ვინც განაცხადი დაიწყო და არ დაასრულა.'
            : <>ვინც განაცხადი დაიწყო და არ დაასრულა. ამ პერიოდში {d.apply.attempts} დაიწყო, {d.apply.steps.find(s => s.key === 'submitted')?.n ?? 0} დაასრულა — ერთი მიწერა ხშირად აბრუნებს.</>
        }
      >
        {d.apply.dropoffs.length === 0 ? (
          <AdminEmpty
            ok={d.apply.attempts > 0}
            text={d.apply.attempts === 0
              ? `ბოლო ${d.days} დღეში ექსპერტად რეგისტრაცია არავის დაუწყია.`
              : 'ვინც დაიწყო, ყველამ დაასრულა.'}
          />
        ) : (
          <RowList>
            {d.apply.dropoffs.map(u => (
              <div key={u.userId} className="p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="font-display text-small font-bold text-ink-900 truncate">
                    {u.fullName?.trim() || 'უსახელო'}
                  </div>
                  <div className="text-meta text-ink-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span className="truncate">{u.email}</span>
                    {/* Phone renders ONLY if the account has one — the
                        half-filled form is never read for this. */}
                    {u.phone?.trim() && <><span className="text-ink-300">·</span><span className="tabular-nums">{u.phone.trim()}</span></>}
                  </div>
                </div>
                <div className="text-meta text-ink-600 shrink-0">
                  გაჩერდა <span className="font-display font-semibold text-ink-900">{APPLY_LAST_STEP[u.lastStep] ?? `ნაბიჯი ${u.lastStep}`}</span>
                  {typeof u.catCount === 'number' && u.catCount > 0 && <> · {u.catCount} სფერო</>}
                  {/* The reason, when there was one. Warning-toned because a
                      wall is ours to remove, while a quiet exit is a question
                      to think about. */}
                  <span className="block mt-0.5">
                    {u.blockCode ? (
                      <span className="text-warning-800 font-display font-semibold">
                        {APPLY_BLOCK_LABEL[u.blockCode] ?? u.blockCode}
                      </span>
                    ) : (
                      <span className="text-ink-400">შეცდომა არ მოსვლია</span>
                    )}
                  </span>
                </div>
                <div className="text-meta text-ink-400 tabular-nums shrink-0">{fmtKaDateTime(new Date(u.lastAt))}</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`mailto:${u.email}`}
                    className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 text-ink-800 font-display text-small font-semibold inline-flex items-center transition-colors duration-fast"
                  >
                    მიწერა
                  </a>
                  <CopyBtn value={u.email} />
                </div>
              </div>
            ))}
          </RowList>
        )}
      </SectionCard>

      {/* Moved here from „სისტემა" (2026-08-11). It was the named list behind
          that tab's counts, but the people ON it are the same people this tab
          is about — and being in two places meant two different answers to
          „who needs chasing" depending on which tab you opened. */}
      <SectionCard
        eyebrow="ექსპერტები"
        title="ვინ ვერ იღებს ჯავშანს"
        sub="გამოქვეყნებული პროფილი, რომელსაც სერვისი ან თავისუფალი დრო არ აქვს — ყოველი მისი ნახვა ჩიხია."
      >
        <ExpertsAttentionSection />
      </SectionCard>

      {thin.length > 0 && (
        <SectionCard
          eyebrow="პროფილები"
          title="ვის რა აკლია"
          sub="იჯავშნება, მაგრამ ნაკლულია. ცარიელი პროფილი არც ძებნაში ჩნდება კარგად, არც სტუდენტს არწმუნებს."
        >
          <RowList>
            {thin.map(e => (
              <div key={e.email || e.slug} className="p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <ExpertName slug={e.slug} fullName={e.fullName} />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {e.missing.map(id => (
                      <span
                        key={id}
                        className="inline-flex items-center h-5 px-2 rounded-pill border border-ink-200 text-ink-600 font-display text-micro font-semibold"
                      >
                        {GAP_LABEL[id] ?? id}
                        {id === 'bio' && ` (${e.bioLen})`}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-display text-body font-bold tabular-nums ${e.percent < 60 ? 'text-danger-700' : 'text-ink-900'}`}>{e.percent}%</div>
                  <div className="text-micro text-ink-400 uppercase">სისრულე</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`mailto:${e.email}`}
                    className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 text-ink-800 font-display text-small font-semibold inline-flex items-center transition-colors duration-fast"
                  >
                    მიწერა
                  </a>
                  <CopyBtn value={e.email} />
                </div>
              </div>
            ))}
          </RowList>
        </SectionCard>
      )}

      {d.waiting.length > 0 && (
        <SectionCard
          eyebrow="ექსპერტები"
          title="ვინ ელოდება პირველ ჯავშანს"
          sub="დამტკიცებიდან დღემდე. ვინც დიდხანს ელოდება, აღარ ბრუნდება."
        >
          <RowList>
            {d.waiting.map((e, i) => (
              <div key={e.slug ?? `w${i}`} className="p-3 sm:p-4 flex items-center justify-between gap-4">
                <ExpertName slug={e.slug} fullName={e.fullName} />
                <span className={`font-display text-small font-semibold tabular-nums shrink-0 ${e.days >= 21 ? 'text-danger-700' : 'text-ink-700'}`}>{e.days} დღე</span>
              </div>
            ))}
          </RowList>
        </SectionCard>
      )}

      {d.slowResponders.length > 0 && (
        <SectionCard
          eyebrow="პასუხის დრო"
          title="ვინ აყოვნებს პასუხს"
          sub="მიმოწერაზე პასუხის მედიანა. მინიმუმ 3 შეტყობინება."
        >
          <RowList>
            {/* Keyed by index, not by a random number. It used to fall back to
                `Math.random()` when an expert had no slug, which makes a fresh
                key on every render — React threw the row away and rebuilt it,
                so the copy button's „დაკოპირდა" vanished mid-flash. */}
            {d.slowResponders.map((e, i) => (
              <div key={e.slug ?? `s${i}`} className="p-3 sm:p-4 flex items-center justify-between gap-4">
                <ExpertName slug={e.slug} fullName={e.fullName} />
                <span className="font-display text-small font-semibold tabular-nums text-ink-700 shrink-0">
                  {e.medianMin >= 60 ? `${Math.round(e.medianMin / 60)} სთ` : `${e.medianMin} წთ`}
                </span>
              </div>
            ))}
          </RowList>
        </SectionCard>
      )}
    </>
  )
}

/* ═══════════ pane 2: მოთხოვნა ════════════════════════════════════════════ */
const DemandPane = ({ d }: { d: Insights }) => {
  const share = d.search.zeroShare

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat n={String(d.search.total)} label="ძებნა სულ" sub={`ბოლო ${d.days} დღეში`} />
        <Stat n={String(d.search.zero)} label="ვერაფერი იპოვა" sub="ექსპერტის გარეშე დარჩენილი ძებნა" bad={d.search.zero > 0} />
        <Stat
          n={share === null ? '—' : PCT(share)}
          label="უშედეგო ძებნის წილი"
          sub={share === null ? 'ჯერ ძებნა არ ყოფილა' : 'რაც მაღალია, მით მეტი სტუდენტი მიდის ხელცარიელი'}
          bad={share !== null && share >= 0.25}
        />
      </div>

      {/* The most actionable list in the product. */}
      <SectionCard
        eyebrow="ძებნა"
        title="რასაც ეძებენ და ვერ პოულობენ"
        sub="ეს სია ასახელებს ექსპერტებს, რომლებიც პლატფორმას აკლია. სიხშირით დალაგებული."
      >
        {d.zeroQueries.length === 0
          ? <AdminEmpty ok text={`ბოლო ${d.days} დღეში ყველა ძებნამ იპოვა ექსპერტი.`} />
          : <RowList>{d.zeroQueries.map(r => <ZeroRow key={r.q} q={r.q} n={r.n} lastAt={r.lastAt} />)}</RowList>}
      </SectionCard>

      {d.categories.length > 0 && (
        <SectionCard
          eyebrow="სფეროები"
          title="სად არის მოთხოვნა და სად — ექსპერტი"
          sub="ძებნა — რამდენჯერ მოძებნეს ეს სფერო. ექსპერტი — რამდენის დაჯავშნა შეიძლება ახლა."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px] text-small">
              <thead>
                <tr className="text-left border-b border-ink-200">
                  <th className="pb-2 font-display text-micro font-semibold uppercase text-ink-500">სფერო</th>
                  <th className="pb-2 pl-3 text-right font-display text-micro font-semibold uppercase text-ink-500">ძებნა</th>
                  <th className="pb-2 pl-3 text-right font-display text-micro font-semibold uppercase text-ink-500">ექსპერტი</th>
                  <th className="pb-2 pl-3 text-right font-display text-micro font-semibold uppercase text-ink-500">ჯავშანი</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {d.categories.map(c => {
                  // Searched for, nobody bookable — the row that is a decision.
                  const gap = c.searches > 0 && c.experts === 0
                  return (
                    <tr key={c.slug} className={gap ? 'bg-danger-50/40' : undefined}>
                      <td className="py-2.5 pr-3">
                        <a href={`/categories/${c.slug}`} target="_blank" rel="noopener noreferrer" className="font-display font-semibold text-ink-900 hover:text-brand-700 transition-colors duration-fast">{c.name}</a>
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-ink-700">{c.searches}</td>
                      <td className={`py-2.5 pl-3 text-right tabular-nums font-semibold ${gap ? 'text-danger-700' : 'text-ink-900'}`}>{c.experts}</td>
                      <td className="py-2.5 pl-3 text-right tabular-nums text-ink-700">{c.bookings}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {(d.hours.demand.some(Boolean) || d.hours.supply.some(Boolean)) && (
        <SectionCard
          eyebrow="საათები"
          title="როდის ეძებენ და როდის არიან თავისუფლები"
          sub="მუქი — ძებნა. ღია — გამოქვეყნებული დრო. საათი, სადაც ძებნაა და დრო არა, ერთი წერილით სწორდება."
        >
          <HoursChart demand={d.hours.demand} supply={d.hours.supply} />
        </SectionCard>
      )}

      {d.concentration.bookings > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Stat
            n={d.concentration.topShare == null ? '—' : PCT(d.concentration.topShare)}
            label="სამ ექსპერტზე მოდის"
            sub={`${d.concentration.bookings} ჯავშანი, ${d.concentration.experts} ექსპერტზე გადანაწილებული`}
            bad={(d.concentration.topShare ?? 0) > 0.7}
          />
        </div>
      )}
    </>
  )
}

/* ═══════════ pane 3: ძაბრი ═══════════════════════════════════════════════ */
const FunnelPane = ({ d, days }: { d: Insights; days: number }) => {
  const f = d.funnel
  const now = pct(f.steps.find(s => s.key === 'created')?.n ?? 0, f.attempts)
  const was = pct(d.prev.created, d.prev.attempts)

  return (
    <>
      {/* The pane's headline. „შეცდომაზე გაწყდა" deliberately is NOT here even
          though it is the sharpest number: it appears below with its sibling
          outcomes, where „our bug / dead end / walked away" only mean anything
          side by side. Repeating it at the top would double-count it by eye. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          n={`${now}%`}
          label="ჯავშნამდე მისული"
          sub={d.prev.attempts === 0 ? 'წინა პერიოდში მცდელობა არ ყოფილა' : d.days === 1 ? `გუშინ — ${was}%` : `წინა ${d.days} დღეში — ${was}%`}
          bad={d.prev.attempts > 0 && now - was < 0}
        />
        <Stat
          n={`${pct(d.repeat.returning, d.repeat.clients)}%`}
          label="დაბრუნებული კლიენტი"
          sub={`${d.repeat.returning} ${d.repeat.clients}-დან ერთზე მეტჯერ დაჯავშნა`}
        />
        <Stat
          n={String(d.cancelBy.TUTOR + d.cancelBy.STUDENT)}
          label="გაუქმებული ჯავშანი"
          sub={`ექსპერტმა ${d.cancelBy.TUTOR}, კლიენტმა ${d.cancelBy.STUDENT}`}
          bad={d.cancelBy.TUTOR > d.cancelBy.STUDENT}
        />
      </div>

      {/* The step BEFORE the booking funnel. Placed above it deliberately: the
          funnel starts at „opened the booking sheet", so on its own it cannot
          tell „nobody sees this expert" from „people see them and leave". */}
      <SectionCard
        eyebrow="ძებნიდან ჯავშნამდე"
        title="სად ჩერდებიან"
        sub="ჯავშნის ძაბრი მხოლოდ მას შემდეგ იწყება, რაც ფანჯარა გაიხსნა. ეს სამი ციფრი მანამდე იყურება."
      >
        <div className="grid grid-cols-3 gap-3">
          {([['ძებნა', d.browse.searches], ['პროფილი გახსნა', d.browse.profileViews], ['ჯავშანი გახსნა', d.browse.bookingOpens]] as const).map(([l, n]) => (
            <div key={l} className="rounded-card border border-ink-200 p-4">
              <div className="font-display text-h2 font-bold tabular-nums text-ink-900 leading-none">{n}</div>
              <div className="text-meta text-ink-600 mt-1.5 leading-snug">{l}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Loads independently of the rest of this tab (its own fetch, its own
          error state), so a slow query here never blanks the page. */}
      <SectionCard
        eyebrow="პროფილები"
        title="ვინ ნახა და ვინ დაჯავშნა"
        sub="ნახვა და ჯავშანი ერთ რიგში — რიგზე დაჭერით ჩანს, კონკრეტულად ვინ ნახა."
      >
        <ProfileViewsSection days={days} />
      </SectionCard>

      <SectionCard
        eyebrow="ჯავშანი"
        title="ჯავშნის ძაბრი"
        sub={`${f.attempts} მცდელობა ბოლო ${d.days} დღეში. თითოეული ნაბიჯი გვიჩვენებს, რამდენმა მიაღწია მას — და რამდენი დაიკარგა წინა ნაბიჯსა და მას შორის.`}
      >
        {f.attempts === 0 ? (
          <AdminEmpty text={`ბოლო ${d.days} დღეში ჯავშნის ფანჯარა არავის გაუხსნია.`} />
        ) : (
          <>
            {f.steps.map((s, i) => {
              const prev = i > 0 ? f.steps[i - 1].n : null
              const lost = prev === null ? 0 : prev - s.n
              const base = f.steps[0].n || f.attempts
              return (
                <div key={s.key}>
                  {prev !== null && (
                    <div className="pl-1 py-1.5 text-meta text-ink-600 tabular-nums">
                      {lost > 0
                        ? <span className="text-danger-700 font-semibold">−{lost} ({pct(lost, prev)}%)</span>
                        : <span>დანაკარგის გარეშე</span>}
                    </div>
                  )}
                  <div className="py-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-small font-semibold text-ink-900">{STEP_LABEL[s.key] ?? s.key}</span>
                      <span className="font-display text-small font-bold tabular-nums text-ink-900">
                        {s.n}<span className="text-ink-500 font-semibold"> · {pct(s.n, base)}%</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-pill bg-ink-100 overflow-hidden">
                      <div className="h-full bg-ink-900" style={{ width: `${pct(s.n, base)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}

            {/* The whole point of the split: „blocked by us" is a bug report,
                „left on their own" is a design problem. */}
            <div className="mt-5 pt-4 border-t border-ink-100">
              <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-2">დაუსრულებელი მცდელობები</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat n={String(f.outcomes.failed)} label="შეცდომით შეწყდა" sub="სერვერმა უარი თქვა — ეს ჩვენი ბუგია" bad={f.outcomes.failed > 0} />
                <Stat n={String(f.outcomes.noSlots)} label="თავისუფალი დრო არ იყო" sub="ჩიხი, რომელიც სტუდენტს არ აურჩევია" bad={f.outcomes.noSlots > 0} />
                <Stat n={String(f.outcomes.abandoned)} label="თავად მიატოვა" sub="შეცდომის გარეშე გავიდა — ეს დიზაინის საკითხია" />
              </div>
            </div>

            {d.failureCodes.length > 0 && (
              <div className="mt-5 pt-4 border-t border-ink-100">
                <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-2">რა შეცდომებია</div>
                {d.failureCodes.map(c => (
                  <div key={c.code} className="py-2 border-b border-ink-100 last:border-0 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-display text-small font-semibold text-ink-900">{CODE_LABEL[c.code] ?? c.code}</div>
                      <div className="font-mono text-meta text-ink-500 mt-0.5 truncate">{c.code}</div>
                    </div>
                    <span className="shrink-0 font-display text-meta font-bold tabular-nums text-danger-700">{c.n}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* The application funnel's AGGREGATE half. The named rows it produces
          („ვის მისწერო") live on the ხალხი pane — a person to write to is not a
          statistic and does not belong in the same reading. */}
      {d.apply.attempts > 0 && (
        <SectionCard
          eyebrow="ექსპერტად რეგისტრაცია"
          title="სად წყდება განაცხადი"
          sub="ვინც /apply გახსნა და რომელ ნაბიჯამდე მივიდა."
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {d.apply.steps.map(st => (
              <Stat
                key={st.key}
                n={String(st.n)}
                label={APPLY_STEP_LABEL[st.key] ?? st.key}
                sub={`${pct(st.n, d.apply.attempts)}% დაწყებულთაგან`}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat
              n={String(d.apply.outcomes.abandoned)}
              label="ჩუმად მიატოვა"
              sub="შეცდომა არ იყო — ეს დიზაინის საკითხია"
              bad={d.apply.outcomes.abandoned > 0}
            />
            <Stat
              n={String(d.apply.outcomes.failed)}
              label="შეცდომაზე გაწყდა"
              sub="ჩვენი მხარეს პრობლემა — გასწორებადია"
              bad={d.apply.outcomes.failed > 0}
            />
          </div>
        </SectionCard>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════ */

type Pane = 'people' | 'demand' | 'funnel'

const PANE_COPY: Record<Pane, { title: string; sub: string }> = {
  people: {
    title: 'ვის უნდა მისწერო',
    sub: 'სახელები, რომლებზეც დღეს შეიძლება იმოქმედო — ვინც განაცხადი ვერ დაასრულა, ვის პროფილს რამე აკლია, ვინ ჯავშანს ელოდება.',
  },
  demand: {
    title: 'რას ეძებენ და ვერ პოულობენ',
    sub: 'მოთხოვნა და მიწოდება ერთმანეთის გვერდით — რას ეძებენ, რა გვაქვს და რომელი ექსპერტი გვაკლია.',
  },
  funnel: {
    title: 'სად ვკარგავთ ხალხს',
    sub: 'ძებნიდან ჯავშნამდე. თითოეულ ნაბიჯზე ჩანს, ჩვენი შეცდომა იყო თუ ადამიანი თავად წავიდა.',
  },
}

export function InsightsSection() {
  const [d, setD] = useState<Insights | null>(null)
  const [pane, setPane] = useState<Pane>('people')
  const [days, setDays] = useState(7)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async (period = days) => {
    setBusy(true); setErr(false)
    try {
      const r = await fetch(`/api/admin/insights?days=${period}`, { cache: 'no-store' })
      if (!r.ok) { setErr(true); return }
      setD(await r.json())
    } catch { setErr(true) } finally { setBusy(false) }
  }
  useEffect(() => { load(days) }, [days])

  // Badges are the reason the section bar earns its height: „3" next to ხალხი
  // means three names are waiting, and you learn that without opening anything.
  const peopleCount = d
    ? d.apply.dropoffs.length + d.experts.filter(e => !e.unbookable).length + d.waiting.length + d.slowResponders.length
    : undefined

  return (
    <>
      <TabHeader
        eyebrow="ინსაითები"
        title={PANE_COPY[pane].title}
        sub={PANE_COPY[pane].sub}
        actions={
          <>
            <PeriodSwitch value={days} onChange={setDays} options={[1, 7, 30]} />
            <Btn variant="secondary" size="sm" onClick={() => load(days)} disabled={busy}>
              {busy ? 'იტვირთება…' : 'განახლება'}
            </Btn>
          </>
        }
      />

      <SubTabs
        value={pane}
        onChange={setPane}
        tabs={[
          { id: 'people', label: 'ხალხი', count: peopleCount },
          { id: 'demand', label: 'მოთხოვნა', count: d?.zeroQueries.length },
          { id: 'funnel', label: 'ძაბრი' },
        ]}
      />

      {/* While a period change is in flight the previous period's numbers are
          still on screen. Dimmed + aria-busy they read as „being replaced";
          left alone they read as this period's answer, which is false until
          the response lands. */}
      <div
        className={`px-6 lg:px-8 py-6 space-y-5 ${d && busy ? 'opacity-60 transition-opacity duration-fast' : ''}`}
        aria-busy={busy || undefined}
      >
        {err && <AdminError message="მონაცემები ვერ ჩაიტვირთა." onRetry={() => load(days)} />}
        {!d && !err && <AdminLoading />}

        {d && pane === 'people' && <PeoplePane d={d} />}
        {d && pane === 'demand' && <DemandPane d={d} />}
        {d && pane === 'funnel' && <FunnelPane d={d} days={days} />}

        {/* WHO IS COUNTED — stated on the page, not just in the query.
            Until 2026-08-05 the funnels counted the operator's own clicks: 55 of
            132 booking flows came from the two ADMIN accounts, which is how this
            panel reported „132 attempts → 2 bookings" and meant nothing by it.
            A dashboard's only asset is that its numbers can be trusted, so the
            exclusion is visible rather than implied. Anonymous flows are still
            counted — they cannot be told apart from a real visitor, and dropping
            them would swap one distortion for another.
            Moved to the FOOT of the page: it is a caveat about how to read the
            numbers, and at the top it was the first thing on a tab whose first
            thing should be the work. */}
        {d && (
          <p className="text-meta text-ink-500 leading-snug pt-2">
            ADMIN ანგარიშების მოქმედებები არ ითვლება; ანონიმური ვიზიტები ითვლება — ისინი ნამდვილი ვიზიტორისგან არ განსხვავდება.
            ქცევის მონაცემები ინახება {d.retentionDays} დღე. ძებნის სექცია მხოლოდ ძებნის ველში აკრეფილს ინახავს;
            რეგისტრაციის სექციაში კონტაქტი ანგარიშიდან მოდის, არა ნახევრად შევსებული ფორმიდან.
          </p>
        )}
      </div>
    </>
  )
}
