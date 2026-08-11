'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { fmtKaDateTime } from '@/lib/kaDate'
import { AdminError, AdminLoading, TabHeader } from './_parts'

/* System health.
 *
 * WHY THIS TAB EXISTS: the Railway cleanup cron reported „Completed" every 15
 * minutes for days while the maintenance sweep never actually ran — it called
 * the endpoint without a valid secret, got the harmless self-doc page back, and
 * curl (no `-f`) exited 0. Session reminders, message reminders, review nudges,
 * stale-booking cleanup and auto-complete were ALL silently dark, and a real
 * confirmed session went by with neither party reminded. Nothing anywhere
 * surfaced it. This page is what surfaces it. */

type Health = {
  sweep: { ranAt: string | null; minutesAgo: number | null; stale: boolean; ok: boolean | null; result: unknown; staleAfterMin: number }
  config: {
    paymentsLive: boolean; cleanupSecretSet: boolean; mailerMode: string; mailFrom: string
    gaFromDb: boolean; gaFromEnv: boolean; trgmInstalled: boolean; timezone: string
  }
  attention: {
    expertsWithoutAvailability: number; expertsWithoutService: number; liveExperts: number; pendingApplications: number
    bookingsAwaitingExpert: number; openDisputes: number; sessionsNext24h: number
  }
}

const Row = ({ label, value, meaning, bad }: { label: string; value: string; meaning: string; bad?: boolean }) => (
  <div className="py-3 border-b border-ink-100 last:border-0 flex items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="font-display text-small font-semibold text-ink-900">{label}</div>
      <div className="text-meta text-ink-600 mt-0.5 leading-snug">{meaning}</div>
    </div>
    <span className={`shrink-0 font-display text-meta font-bold tabular-nums ${bad ? 'text-danger-700' : 'text-ink-900'}`}>
      {value}
    </span>
  </div>
)

const Count = ({ n, label, sub, href, warn }: { n: number; label: string; sub: string; href?: string; warn?: boolean }) => {
  const body = (
    <>
      <div className={`font-display text-h2 font-bold tabular-nums leading-none ${warn && n > 0 ? 'text-danger-700' : 'text-ink-900'}`}>{n}</div>
      <div className="font-display text-small font-semibold text-ink-900 mt-1.5">{label}</div>
      <div className="text-meta text-ink-600 mt-0.5 leading-snug">{sub}</div>
    </>
  )
  const cls = 'rounded-card border border-ink-200 bg-white p-5 block'
  return href ? <Link href={href} className={`${cls} hover:border-ink-300 transition-colors duration-fast`}>{body}</Link> : <div className={cls}>{body}</div>
}

export function SystemSection() {
  const [d, setD] = useState<Health | null>(null)
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  // Loaded on open + manual refresh only — a dashboard that polls would hammer
  // its own health endpoint, which is a poor way to prove health.
  const load = async () => {
    setBusy(true); setErr(false)
    try {
      const r = await fetch('/api/admin/health', { cache: 'no-store' })
      if (!r.ok) { setErr(true); return }
      setD(await r.json())
    } catch { setErr(true) } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])

  const s = d?.sweep
  const c = d?.config
  const a = d?.attention
  // The headline must go red for BOTH failure modes: a sweep that hasn't run
  // (stale) AND a sweep that ran but reported failure (ok === false). Keying on
  // `stale` alone showed green while every run was erroring.
  const sweepBad = !!s && (s.stale || s.ok === false)

  return (
    <>
      <TabHeader
        eyebrow="სისტემა"
        title="სისტემის მდგომარეობა"
        sub="ავტომატური სამუშაოები, კონფიგურაცია და ის ციფრები, რომლებზეც რეაგირება სჭირდება."
        actions={<Btn variant="secondary" size="sm" onClick={load} disabled={busy}>{busy ? 'იტვირთება…' : 'განახლება'}</Btn>}
      />

      <div className="px-6 lg:px-8 py-6 space-y-6">
        {err && <AdminError message="მდგომარეობა ვერ ჩაიტვირთა." onRetry={load} />}
        {!d && !err && <AdminLoading />}

        {/* ── Sweep health — the headline. A stale sweep must be impossible to miss. */}
        {s && (
          <section className={`rounded-card border p-5 ${sweepBad ? 'border-danger-300' : 'border-ink-200'} bg-white`}>
            <div className="flex items-start gap-3">
              <span className={`w-9 h-9 rounded-btn inline-flex items-center justify-center shrink-0 ${sweepBad ? 'text-danger-700 border border-danger-200' : 'text-brand-700 border border-brand-200'}`}>
                <Icon.clock className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-h3 font-bold text-ink-900 tracking-tight">
                  {s.stale
                    ? 'ავტომატური სამუშაო არ სრულდება'
                    : s.ok === false
                      ? 'ავტომატური სამუშაო ეშვება, მაგრამ შეცდომით სრულდება'
                      : 'ავტომატური სამუშაო მუშაობს'}
                </div>
                <p className="mt-1 text-small text-ink-700 leading-[1.55]">
                  {s.ranAt
                    ? <>ბოლოს შესრულდა {fmtKaDateTime(new Date(s.ranAt))} — {s.minutesAgo} წუთის წინ.</>
                    : <>არასდროს შესრულებულა.</>}
                  {' '}ნორმაა ყოველ 15 წუთში.
                </p>

                {s.stale && (
                  <div className="mt-3 rounded-btn border border-danger-200 p-3.5 text-meta text-ink-800 leading-[1.6]">
                    <div className="font-display font-bold text-danger-700 mb-1">ამ დროს არ იგზავნება არც ერთი შეხსენება</div>
                    სესიის შეხსენება, წაუკითხავი მიმოწერის შეხსენება, შეფასების მოთხოვნა, უპასუხო ჯავშნების გაუქმება — ყველა ჩერდება.
                    <div className="mt-2">
                      შეამოწმე Railway → <span className="font-mono">cleanup-cron</span> → Start Command. სწორი ბრძანებაა:
                      <div className="mt-1.5 font-mono text-micro bg-ink-50 border border-ink-200 rounded-btn p-2 break-all">
                        curl -fsS -X POST -H &quot;Authorization: Bearer $CLEANUP_SECRET&quot; https://mcodne.ge/api/internal/cleanup
                      </div>
                      <div className="mt-1.5">
                        <span className="font-mono">-f</span>-ის გარეშე curl წარმატებას აბრუნებს 401-ზეც — სწორედ ამან დამალა გაუმართაობა დღეების განმავლობაში.
                      </div>
                    </div>
                  </div>
                )}

                {!s.stale && s.ok === false && (
                  <div className="mt-3 rounded-btn border border-danger-200 p-3.5 text-meta text-ink-800 leading-[1.6]">
                    <div className="font-display font-bold text-danger-700 mb-1">ბოლო გაშვება შეცდომით დასრულდა</div>
                    გრაფიკი დაცულია, მაგრამ თავად სამუშაომ შეცდომა დააბრუნა — შეხსენებები შეიძლება არ გაიგზავნა. ნახე „ბოლო გაშვების შედეგი“ ქვემოთ.
                  </div>
                )}

                {s.result != null && (
                  <details className="mt-3">
                    <summary className="text-meta text-ink-600 cursor-pointer">ბოლო გაშვების შედეგი</summary>
                    <pre className="mt-2 text-micro font-mono bg-ink-50 border border-ink-200 rounded-btn p-3 overflow-x-auto">
                      {JSON.stringify(s.result, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Operational attention — the numbers that decide what to do next. */}
        {a && (
          <section>
            <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-3">საჭიროებს ყურადღებას</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Count
                n={a.expertsWithoutAvailability} warn
                label="ექსპერტი დროის გარეშე"
                sub={`${a.liveExperts} ხილული ექსპერტიდან — ვინ არიან, ინსაითებშია`}
                href="/admin#insights"
              />
              <Count
                n={a.expertsWithoutService} warn
                label="ექსპერტი სერვისის გარეშე"
                sub="ჯავშნის ღილაკს გასაყიდი არაფერი აქვს — ვინ არიან, ინსაითებშია"
                href="/admin#insights"
              />
              <Count n={a.pendingApplications} warn label="განაცხადი მოლოდინში" sub="ელოდება მოდერაციას" href="/admin#moderation" />
              <Count n={a.bookingsAwaitingExpert} warn label="ჯავშანი უპასუხოდ" sub="ექსპერტს ჯერ არ უპასუხია" href="/admin#bookings" />
              <Count n={a.openDisputes} warn label="ღია დავა" sub="გადაწყვეტას ელოდება" href="/admin#disputes" />
              <Count n={a.sessionsNext24h} label="სესია 24 საათში" sub="დადასტურებული და მოახლოებული" href="/admin#bookings" />
            </div>
          </section>
        )}

        {/* The NAMED list behind the two expert counts above used to be rendered
            here as well. It was the same five people the „ინსაითები → ხალხი"
            pane lists — one idea in two tabs, which meant „who needs chasing"
            had two answers depending on which tab you opened, and the two could
            not stay in step. This tab keeps the counts (is there a leak?); the
            names, and the reminders already sent, live where the rest of the
            per-person work is. */}

        {/* ── Config truth — each item plainly true/false with what it means. */}
        {c && (
          <section className="rounded-card border border-ink-200 bg-white p-5">
            <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-1">კონფიგურაცია</div>
            <Row label="ონლაინ გადახდები" value={c.paymentsLive ? 'ჩართული' : 'გამორთული'} meaning="გამორთულზე დაჯავშნა უფასოა და საკომისიო არ იკავება." />
            <Row label="სამუშაოს გასაღები" value={c.cleanupSecretSet ? 'დაყენებული' : 'არ არის'} bad={!c.cleanupSecretSet} meaning="მის გარეშე ავტომატური სამუშაო საერთოდ ვერ გაეშვება." />
            <Row label="ფოსტა" value={c.mailerMode === 'send' ? 'იგზავნება' : 'მხოლოდ ლოგში'} bad={c.mailerMode !== 'send'} meaning={`გამგზავნი: ${c.mailFrom}`} />
            <Row
              label="Google Analytics"
              value={c.gaFromDb || c.gaFromEnv ? 'აქტიური' : 'გამორთული'}
              meaning={c.gaFromEnv && !c.gaFromDb
                ? 'იდენტიფიკატორი გარემოს ცვლადშია — ადმინის „ამოშლა“ მას ვერ გამორთავს.'
                : 'ადმინიდან იმართება.'}
            />
            <Row label="ქართული ძებნა (pg_trgm)" value={c.trgmInstalled ? 'ჩართული' : 'გამორთული'} bad={!c.trgmInstalled} meaning="გამორთულზე ძებნა ვერ პოულობს ბრუნებულ ფორმებს — „მარკეტინგში“ ვერ იპოვის „მარკეტინგს“." />
            <Row label="დროის ზონა" value={c.timezone} bad={c.timezone !== 'Asia/Tbilisi'} meaning="ყველა შეხსენების დრო ამაზეა დამოკიდებული." />
          </section>
        )}
      </div>
    </>
  )
}
