'use client'
import { useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime } from '@/lib/kaDate'
import { copyToClipboard } from '@/lib/clipboard'
import { Eyebrow } from '@/components/Eyebrow'
import { Card } from '@/components/Card'
import { TabHeader, PeriodSwitch } from './_parts'
import { ProfileViewsSection } from './_profileViews'

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
const SUB = (bookings: number, experts: number) => bookings + ' ჯავშანი, ' + experts + ' ექსპერტზე გადანაწილებული'
const CANCEL = (tutor: number, student: number) => 'ექსპერტმა ' + tutor + ', კლიენტმა ' + student
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

const Stat = ({ n, label, sub, bad }: { n: string; label: string; sub: string; bad?: boolean }) => (
  <div className="rounded-card border border-ink-200 bg-white p-5">
    <div className={`font-display text-h2 font-bold tabular-nums leading-none ${bad ? 'text-danger-700' : 'text-ink-900'}`}>{n}</div>
    <div className="font-display text-small font-semibold text-ink-900 mt-1.5">{label}</div>
    <div className="text-meta text-ink-600 mt-0.5 leading-snug">{sub}</div>
  </div>
)

const Empty = ({ text }: { text: string }) => (
  <div className="rounded-card border border-ink-200 bg-white px-5 py-6 flex items-center gap-3">
    <Icon.search className="w-4 h-4 text-ink-400 shrink-0" />
    <span className="text-small text-ink-600">{text}</span>
  </div>
)

/* One zero-result query. „Easy to act on" means the admin can, without leaving
   the row: see exactly what the client saw (the same search, live), and copy the
   words to paste into an outreach message or a recruiting note. */
/** Copy-to-clipboard with its own „დაკოპირდა" confirmation — same pattern as
 *  the zero-query row below, so both read identically. */
const CopyEmail = ({ email }: { email: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => { if (await copyToClipboard(email)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
      className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display text-meta font-semibold inline-flex items-center transition-colors duration-fast"
    >
      {copied ? 'დაკოპირდა' : 'კოპირება'}
    </button>
  )
}

const ZeroRow = ({ q, n, lastAt }: { q: string; n: number; lastAt: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <div className="py-3 px-4 sm:px-5 border-b border-ink-100 last:border-0 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="font-display text-body font-semibold text-ink-900 break-words">„{q}“</div>
        <div className="text-meta text-ink-600 mt-0.5">
          {n} ძებნა · ბოლოს {fmtKaDateTime(new Date(lastAt))}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={`/tutors?q=${encodeURIComponent(q)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="h-11 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display text-small font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast"
        >
          <Icon.external className="w-3.5 h-3.5" /> ძებნის ნახვა
        </a>
        <button
          type="button"
          onClick={async () => { if (await copyToClipboard(q)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
          className="h-11 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 text-ink-700 font-display text-small font-semibold inline-flex items-center transition-colors duration-fast"
        >
          {copied ? 'დაკოპირდა' : 'კოპირება'}
        </button>
      </div>
    </div>
  )
}

export function InsightsSection() {
  const [d, setD] = useState<Insights | null>(null)
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

  const f = d?.funnel
  const share = d?.search.zeroShare ?? null

  return (
    <>
      <TabHeader
        eyebrow="ინსაითები"
        title="რას ეძებენ და სად იკარგებიან"
        sub="ქცევის მონაცემები — რა ვერ იპოვეს ძებნაში და ჯავშნის რომელ ნაბიჯზე გვწყდება ხალხი."
        actions={
          <>
            <PeriodSwitch value={days} onChange={setDays} options={[1, 7, 30]} />
            <Btn variant="secondary" size="sm" onClick={() => load(days)} disabled={busy}>
              {busy ? 'იტვირთება…' : 'განახლება'}
            </Btn>
          </>
        }
      />

      <div className="px-6 lg:px-8 py-6 space-y-8">
        {err && (
          <div className="rounded-card border border-danger-200 p-4 text-small text-danger-700">
            მონაცემები ვერ ჩაიტვირთა. <button type="button" onClick={() => load(days)} className="underline underline-offset-2 font-semibold hover:text-danger-900 transition-colors duration-fast">სცადე თავიდან</button>
          </div>
        )}

        {/* WHO IS COUNTED — stated on the page, not just in the query.
            Until 2026-08-05 the funnels counted the operator's own clicks: 55 of
            132 booking flows came from the two ADMIN accounts, which is how this
            panel reported „132 attempts → 2 bookings" and meant nothing by it.
            A dashboard's only asset is that its numbers can be trusted, so the
            exclusion is visible rather than implied. Anonymous flows are still
            counted — they cannot be told apart from a real visitor, and dropping
            them would swap one distortion for another. */}
        <p className="text-meta text-ink-500 leading-snug">
          ADMIN ანგარიშების მოქმედებები არ ითვლება. ანონიმური ვიზიტები ითვლება — ისინი ნამდვილი ვიზიტორისგან არ განსხვავდება.
        </p>

        {/* ── PEOPLE FIRST ────────────────────────────────────────────────
            Reordered 2026-08-05. These two sections carry the only rows on this
            tab that can be ACTED on — a person to write to, an expert to nudge —
            and they used to sit last, behind roughly fifteen aggregate numbers.
            The day this order was changed, the most valuable thing on the page
            was one named row (an applicant stopped on step 1, twice, two days
            apart) and it was below the fold. Aggregates say what happened;
            these say what to do, so they go on top. */}
        {/* ── Expert-application funnel ──────────────────────────────────
            The panel could see SUBMITTED applications and nothing else. Someone
            who opened /apply and closed the tab left no trace: the draft is
            localStorage-only. „Two applied" and „twenty started, two finished"
            are opposite problems and looked identical here. */}
        {d && (
          <section className="rounded-card border border-ink-200 bg-white p-5 sm:p-6">
            <Eyebrow className="mb-1">ექსპერტად რეგისტრაცია</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">სად წყდება განაცხადი</h3>
            <p className="text-small text-ink-600 mt-1 leading-relaxed">
              ვინც დაიწყო და არ დაასრულა — სახელით. ერთი მიწერა ხშირად აბრუნებს.
            </p>

            {d.apply.attempts === 0 ? (
              <div className="mt-5"><Empty text="ამ პერიოდში ექსპერტად რეგისტრაცია არავის დაუწყია." /></div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
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

                {d.apply.dropoffs.length > 0 && (
                  <div className="mt-6">
                    <Eyebrow tone="muted" className="mb-2">ვის მისწერო ({d.apply.dropoffs.length})</Eyebrow>
                    <div className="rounded-card border border-ink-200 divide-y divide-ink-100 overflow-hidden">
                      {d.apply.dropoffs.map(u => (
                        <div key={u.userId} className="p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-2 bg-white">
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
                            {/* The reason, when there was one. Warning-toned
                                because a wall is ours to remove, while a quiet
                                exit is a question to think about. */}
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
                              className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 text-ink-800 font-display text-meta font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast"
                            >
                              მიწერა
                            </a>
                            <CopyEmail email={u.email} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Expert profile gaps ─────────────────────────────────────────
            Scored with lib/profileScore — the same 10 weighted checks the expert
            sees on their own dashboard, so admin and expert can never disagree
            about what „complete" means. Sorted unbookable-first: booking is
            slot-gated, so no published time beats every other gap. */}
        {d && (
          <div className="grid sm:grid-cols-2 gap-4">
            {(() => {
              const now = pct(d.funnel.steps.find(s => s.key === 'created')?.n ?? 0, d.funnel.attempts)
              const was = pct(d.prev.created, d.prev.attempts)
              const diff = now - was
              return (
                <Stat
                  n={`${now}%`}
                  label="ჯავშნამდე მისული"
                  sub={d.prev.attempts === 0 ? 'წინა პერიოდში მცდელობა არ ყოფილა' : d.days === 1 ? `გუშინ — ${was}%` : `წინა ${d.days} დღეში — ${was}%`}
                  bad={d.prev.attempts > 0 && diff < 0}
                />
              )
            })()}
            <Stat
              n={`${pct(d.repeat.returning, d.repeat.clients)}%`}
              label="დაბრუნებული კლიენტი"
              sub={`${d.repeat.returning} ${d.repeat.clients}-დან ერთზე მეტჯერ დაჯავშნა`}
            />
          </div>
        )}

        {d && d.slowResponders.length > 0 && (
          <Card as="section">
            <Eyebrow className="mb-1">პასუხის დრო</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">ვინ აყოვნებს პასუხს</h3>
            <p className="text-small text-ink-600 mt-1 leading-relaxed">
              მიმოწერაზე პასუხის მედიანა. მინიმუმ 3 შეტყობინება.
            </p>
            <div className="mt-5 rounded-card border border-ink-200 divide-y divide-ink-100 overflow-hidden">
              {d.slowResponders.map(e => (
                <div key={e.slug ?? e.fullName ?? Math.random()} className="p-3 sm:p-4 flex items-center justify-between gap-4 bg-white">
                  {e.slug
                    ? <a href={`/tutors/${e.slug}`} target="_blank" rel="noopener noreferrer" className="font-display text-small font-bold text-ink-900 hover:text-brand-700 transition-colors duration-fast truncate">{e.fullName?.trim() || 'უსახელო'}</a>
                    : <span className="font-display text-small font-bold text-ink-900 truncate">{e.fullName?.trim() || 'უსახელო'}</span>}
                  <span className="font-display text-small font-semibold tabular-nums text-ink-700 shrink-0">
                    {e.medianMin >= 60 ? `${Math.round(e.medianMin / 60)} სთ` : `${e.medianMin} წთ`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {d && (
          <Card as="section">
            <Eyebrow className="mb-1">ძებნიდან ჯავშნამდე</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">სად ჩერდებიან</h3>
            <p className="text-small text-ink-600 mt-1 leading-relaxed">
              ჯავშნის ძაბრი მხოლოდ მას შემდეგ იწყება, რაც ფანჯარა გაიხსნა. ეს სამი ციფრი მანამდე იყურება.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[['ძებნა', d.browse.searches], ['პროფილი გახსნა', d.browse.profileViews], ['ჯავშანი გახსნა', d.browse.bookingOpens]].map(([l, n]) => (
                <div key={String(l)} className="rounded-card border border-ink-200 p-4">
                  <div className="font-display text-h2 font-bold tabular-nums text-ink-900 leading-none">{String(n)}</div>
                  <div className="text-meta text-ink-600 mt-1.5 leading-snug">{String(l)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {d && d.concentration.bookings > 0 && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Stat
              n={d.concentration.topShare == null ? '—' : PCT(d.concentration.topShare)}
              label="სამ ექსპერტზე მოდის"
              sub={SUB(d.concentration.bookings, d.concentration.experts)}
              bad={(d.concentration.topShare ?? 0) > 0.7}
            />
            <Stat
              n={String(d.cancelBy.TUTOR + d.cancelBy.STUDENT)}
              label="გაუქმებული ჯავშანი"
              sub={CANCEL(d.cancelBy.TUTOR, d.cancelBy.STUDENT)}
              bad={d.cancelBy.TUTOR > d.cancelBy.STUDENT}
            />
          </div>
        )}

        {d && d.waiting.length > 0 && (
          <Card as="section">
            <Eyebrow className="mb-1">ექსპერტები</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">ვინ ელოდება პირველ ჯავშანს</h3>
            <p className="text-small text-ink-600 mt-1 leading-relaxed">
              დამტკიცებიდან დღემდე. ვინც დიდხანს ელოდება, აღარ ბრუნდება.
            </p>
            <div className="mt-5 rounded-card border border-ink-200 divide-y divide-ink-100 overflow-hidden">
              {d.waiting.map(e => (
                <div key={(e.slug ?? '') + e.days} className="p-3 sm:p-4 flex items-center justify-between gap-4 bg-white">
                  {e.slug
                    ? <a href={"/tutors/" + e.slug} target="_blank" rel="noopener noreferrer" className="font-display text-small font-bold text-ink-900 hover:text-brand-700 transition-colors duration-fast truncate">{e.fullName?.trim() || 'უსახელო'}</a>
                    : <span className="font-display text-small font-bold text-ink-900 truncate">{e.fullName?.trim() || 'უსახელო'}</span>}
                  <span className={"font-display text-small font-semibold tabular-nums shrink-0 " + (e.days >= 21 ? 'text-danger-700' : 'text-ink-700')}>{e.days} დღე</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {d && (d.hours.demand.some(Boolean) || d.hours.supply.some(Boolean)) && (
          <Card as="section">
            <Eyebrow className="mb-1">საათები</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">როდის ეძებენ და როდის არიან თავისუფლები</h3>
            <p className="text-small text-ink-600 mt-1 leading-relaxed">
              მუქი — ძებნა. ღია — გამოქვეყნებული დრო. საათი, სადაც ძებნაა და დრო არა, ერთი წერილით სწორდება.
            </p>
            <div className="mt-5 flex items-end gap-[2px] h-24" aria-hidden>
              {Array.from({ length: 24 }, (_, h) => {
                const dm = Math.max(...d.hours.demand, 1), sm = Math.max(...d.hours.supply, 1)
                return (
                  <div key={h} className="flex-1 flex flex-col justify-end gap-[2px] h-full" title={h + ':00'}>
                    <div className="bg-ink-900 rounded-t-[2px]" style={{ height: (d.hours.demand[h] / dm) * 55 + '%' }} />
                    <div className="bg-brand-200 rounded-t-[2px]" style={{ height: (d.hours.supply[h] / sm) * 40 + '%' }} />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-micro text-ink-400 mt-1.5 tabular-nums">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
            </div>
          </Card>
        )}

        {d && d.categories.length > 0 && (
          <Card as="section">
            <Eyebrow className="mb-1">სფეროები</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">სად არის მოთხოვნა და სად — ექსპერტი</h3>
            <p className="text-small text-ink-600 mt-1 leading-relaxed">
              ძებნა — რამდენჯერ მოძებნეს ეს სფერო. ექსპერტი — რამდენის დაჯავშნა შეიძლება ახლა.
            </p>

            <div className="mt-5 overflow-x-auto">
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
          </Card>
        )}

        {d && d.experts.length > 0 && (
          <section className="rounded-card border border-ink-200 bg-white p-5 sm:p-6">
            <Eyebrow className="mb-1">ექსპერტების პროფილები</Eyebrow>
            <h3 className="font-display text-h3 font-bold text-ink-900 tracking-tight">ვის რა აკლია</h3>
            <p className="text-small text-ink-600 mt-1 leading-relaxed">
              ცარიელი პროფილი არც ძებნაში ჩნდება კარგად, არც სტუდენტს არწმუნებს. „თავისუფალი დრო“ ყველაზე მწვავეა — მის გარეშე ჯავშანი ფიზიკურად შეუძლებელია.
            </p>

            <div className="mt-5 rounded-card border border-ink-200 divide-y divide-ink-100 overflow-hidden">
              {d.experts.map(e => (
                <div key={e.email || e.slug} className="p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-2 bg-white">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {e.slug
                        ? <a href={`/tutors/${e.slug}`} target="_blank" rel="noopener noreferrer" className="font-display text-small font-bold text-ink-900 hover:text-brand-700 transition-colors duration-fast truncate">{e.fullName?.trim() || 'უსახელო'}</a>
                        : <span className="font-display text-small font-bold text-ink-900 truncate">{e.fullName?.trim() || 'უსახელო'}</span>}
                      {e.unbookable && (
                        <span className="inline-flex items-center h-5 px-2 rounded-pill border border-danger-200 text-danger-700 font-display text-micro font-bold uppercase">
                          ვერ იჯავშნება
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {e.missing.map(id => (
                        <span
                          key={id}
                          className={`inline-flex items-center h-5 px-2 rounded-pill border font-display text-micro font-semibold ${
                            id === 'availability' ? 'border-danger-200 text-danger-700' : 'border-ink-200 text-ink-600'
                          }`}
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
                      className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 text-ink-800 font-display text-meta font-semibold inline-flex items-center transition-colors duration-fast"
                    >
                      მიწერა
                    </a>
                    <CopyEmail email={e.email} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


        {/* ── Search health. The rate, not just the raw count: 40 empty searches
            out of 40 is a broken catalogue, out of 4000 it is noise. */}
        {d && (
          <section>
            <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-3">ძებნის მდგომარეობა</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat n={String(d.search.total)} label="ძებნა სულ" sub={`ბოლო ${d.days} დღეში`} />
              <Stat n={String(d.search.zero)} label="ვერაფერი იპოვა" sub="ექსპერტის გარეშე დარჩენილი ძებნა" bad={d.search.zero > 0} />
              <Stat
                n={share === null ? '—' : `${Math.round(share * 100)}%`}
                label="უშედეგო ძებნის წილი"
                sub={share === null ? 'ჯერ ძებნა არ ყოფილა' : 'რაც მაღალია, მით მეტი სტუდენტი მიდის ხელცარიელი'}
                bad={share !== null && share >= 0.25}
              />
            </div>
          </section>
        )}

        {/* ── The step BEFORE the booking funnel. Placed above it deliberately:
            the funnel starts at „opened the booking sheet", so on its own it
            cannot tell „nobody sees this expert" from „people see them and
            leave". Loads independently of the rest of this tab (its own fetch,
            its own error state), so a slow query here never blanks the page. */}
        <section>
          <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-3">ვინ ნახა და ვინ დაჯავშნა</div>
          <ProfileViewsSection days={days} />
        </section>

        {/* ── The most actionable list in the product. */}
        {d && (
          <section>
            <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-1">ძებნა, რომელმაც ვერაფერი იპოვა</div>
            <p className="text-meta text-ink-600 mb-3 leading-snug max-w-[680px]">
              ეს სია ასახელებს ექსპერტებს, რომლებიც პლატფორმას აკლია. სიხშირით დალაგებული — ზემოთ ის, რასაც ყველაზე ხშირად ეძებენ და ვერ პოულობენ.
            </p>
            {d.zeroQueries.length === 0
              ? <Empty text={`ბოლო ${d.days} დღეში ყველა ძებნამ იპოვა ექსპერტი.`} />
              : (
                <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
                  {d.zeroQueries.map(r => <ZeroRow key={r.q} q={r.q} n={r.n} lastAt={r.lastAt} />)}
                </div>
              )}
          </section>
        )}

        {/* ── The booking funnel. */}
        {f && (
          <section>
            <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-1">ჯავშნის ძაბრი</div>
            <p className="text-meta text-ink-600 mb-3 leading-snug max-w-[680px]">
              {f.attempts} მცდელობა ბოლო {d?.days} დღეში. თითოეული ნაბიჯი გვიჩვენებს, რამდენმა მიაღწია მას — და რამდენი დაიკარგა წინა ნაბიჯსა და მას შორის.
            </p>
            {f.attempts === 0
              ? <Empty text={`ბოლო ${d?.days} დღეში ჯავშნის ფანჯარა არავის გაუხსნია.`} />
              : (
                <div className="rounded-card border border-ink-200 bg-white p-5">
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

                  {/* The whole point of the split: „blocked by us" is a bug
                      report, „left on their own" is a design problem. */}
                  <div className="mt-5 pt-4 border-t border-ink-100">
                    <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-2">დაუსრულებელი მცდელობები</div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Stat n={String(f.outcomes.failed)} label="შეცდომით შეწყდა" sub="სერვერმა უარი თქვა — ეს ჩვენი ბუგია" bad={f.outcomes.failed > 0} />
                      <Stat n={String(f.outcomes.noSlots)} label="თავისუფალი დრო არ იყო" sub="ჩიხი, რომელიც სტუდენტს არ აურჩევია" bad={f.outcomes.noSlots > 0} />
                      <Stat n={String(f.outcomes.abandoned)} label="თავად მიატოვა" sub="შეცდომის გარეშე გავიდა — ეს დიზაინის საკითხია" />
                    </div>
                  </div>

                  {d && d.failureCodes.length > 0 && (
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
                </div>
              )}
          </section>
        )}



        {d && (
          <p className="text-meta text-ink-500 leading-snug">
            ქცევის მონაცემები ინახება {d.retentionDays} დღე. ძებნის სექცია მხოლოდ ძებნის ველში აკრეფილს ინახავს;
            რეგისტრაციის სექციაში კონტაქტი ანგარიშიდან მოდის, არა ნახევრად შევსებული ფორმიდან.
          </p>
        )}
      </div>
    </>
  )
}
