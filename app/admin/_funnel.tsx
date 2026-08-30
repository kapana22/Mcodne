'use client'
import { useCallback, useEffect, useState } from 'react'
import { Btn } from '@/components/Btn'
import {
  TabHeader, PeriodSwitch, SectionCard, Stat,
  AdminEmpty, AdminError, AdminLoading, downloadCsv,
} from './_parts'
import { REQUEST_KINDS, KIND, topicLabel, type RequestKindName } from '@/lib/requestTopics'

/* „ძაბრი" — how many opened /request and how far they got.
 *
 * No names, no „write to this person": /request works without an account, so
 * most attempts carry no identity and a list would silently show a third of the
 * truth. The actionable half is the queue in „მოთხოვნები".
 *
 * One fetch, on open and on period change. Never polled. */

type Funnel = {
  days: number
  retentionDays: number
  funnel: {
    attempts: number
    steps: { key: string; n: number }[]
    outcomes: { failed: number; abandoned: number }
  }
  prev: { attempts: number; sent: number }
  byKind: { kind: string; chose: number; details: number; sent: number }[]
  byTopic: { topic: string; chose: number; sent: number }[]
  failureCodes: { code: string; n: number }[]
  staffFlows: number
}

/** Integer percent, and 0 rather than NaN when the base is empty. */
const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0)

const STEP_LABEL: Record<string, string> = {
  opened:  'გახსნა',
  kind:    'ტიპი აირჩია',
  topic:   'თემა აირჩია',
  details: 'დეტალები შეავსო',
  sent:    'გააგზავნა',
}

// The codes /api/requests can return, in words. The raw code stays on screen —
// that is what you grep the logs for.
const CODE_LABEL: Record<string, string> = {
  RATE_LIMITED: 'ლიმიტმა შეაჩერა — ძალიან ბევრი მცდელობა ერთი მისამართიდან',
  INVALID:      'ფორმა სერვერის ვალიდაციას ვერ გაუძლო',
  INVALID_JSON: 'დაზიანებული მოთხოვნა მოვიდა ბრაუზერიდან',
  NOT_FOUND:    'ფუნქცია ამ დეპლოიზე გამორთულია',
  ERROR:        'ქსელი გაწყდა ან უცნობი შეცდომა',
}

// NOT kindOf(): it coerces anything unrecognised to „MEETING“, which is right
// in a form and a lie in a table. An unknown slug shows as itself.
const kindLabel = (raw: string) =>
  (REQUEST_KINDS as readonly string[]).includes(raw) ? KIND[raw as RequestKindName].label : raw

/* ───── one bar of the spine ───── */

const Step = ({ label, n, base, lost, lostBase }: {
  label: string; n: number; base: number; lost: number | null; lostBase: number
}) => (
  <div>
    {/* The gap is where the work is, so it gets its own line. */}
        {lost !== null && (
      <div className="pl-1 py-1.5 text-meta text-ink-600 tabular-nums">
        {lost > 0
          ? <span className="text-danger-700 font-semibold">−{lost} ({pct(lost, lostBase)}%)</span>
          : <span>დანაკარგის გარეშე</span>}
      </div>
    )}
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-small font-semibold text-ink-900">{label}</span>
        <span className="font-display text-small font-bold tabular-nums text-ink-900">
          {n}<span className="text-ink-500 font-semibold"> · {pct(n, base)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-pill bg-ink-100 overflow-hidden">
        <div className="h-full bg-ink-900" style={{ width: `${pct(n, base)}%` }} />
      </div>
    </div>
  </div>
)

/* ───── the tab ───── */

export function FunnelSection() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState<Funnel | null>(null)
  const [err, setErr] = useState(false)

  const load = useCallback(async () => {
    setErr(false); setD(null)
    try {
      // no-store: a panel that can be stale cannot be trusted.
      const r = await fetch(`/api/admin/funnel?days=${days}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error()
      setD(j)
    } catch { setErr(true) }
  }, [days])
  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    if (!d) return
    downloadCsv(`funnel-${d.days}d.csv`, [
      ['ნაბიჯი', 'რაოდენობა', '% გახსნილიდან'],
      ...d.funnel.steps.map(s => [STEP_LABEL[s.key] ?? s.key, s.n, pct(s.n, d.funnel.steps[0]?.n || d.funnel.attempts)]),
      [],
      ['ტიპი', 'აირჩია', 'დეტალები', 'გააგზავნა'],
      ...d.byKind.map(k => [kindLabel(k.kind), k.chose, k.details, k.sent]),
      [],
      ['თემა', 'აირჩია', 'გააგზავნა'],
      ...d.byTopic.map(t => [topicLabel(t.topic), t.chose, t.sent]),
    ])
  }

  const f = d?.funnel
  const sent = f?.steps.find(s => s.key === 'sent')?.n ?? 0
  // Base is the FIRST step, not `attempts` — a flow whose only event was a
  // later one would otherwise drag the first bar under 100%. how many attempts reached the FIRST step. Using
  // `attempts` instead would divide by flows whose only event was a later one,
  // and print a first bar under 100% for no reason a reader could name.
  const base = f?.steps[0]?.n || f?.attempts || 0
  const now = pct(sent, base)
  const was = pct(d?.prev.sent ?? 0, d?.prev.attempts ?? 0)

  return (
    <>
      <TabHeader
        eyebrow="ძაბრი"
        title="სად ჩერდება კლიენტი"
        sub="ვინ გახსნა /request და რომელ ნაბიჯამდე მივიდა. თითოეულ გაჩერებაზე ჩანს, ჩვენი შეცდომა იყო თუ ადამიანი თავად წავიდა."
        actions={
          <>
            <PeriodSwitch value={days} onChange={setDays} options={[7, 30, 90]} />
            <Btn variant="secondary" size="sm" onClick={load} disabled={!d && !err}>განახლება</Btn>
            <Btn variant="secondary" size="sm" onClick={exportCsv} disabled={!d}>CSV</Btn>
          </>
        }
      />

      <div className="px-6 lg:px-8 py-6 space-y-5">
        {err ? <AdminError onRetry={load} />
          : !d || !f ? <AdminLoading />
          : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat
                  n={String(f.attempts)}
                  label="მცდელობა"
                  sub={d.staffFlows > 0
                    ? `${d.staffFlows} შენი საკუთარი ტესტი გამოკლებულია`
                    : `ბოლო ${d.days} დღეში`}
                />
                <Stat n={String(sent)} label="გაგზავნილი მოთხოვნა" sub="ძაბრის ბოლო ნაბიჯი" />
                <Stat
                  n={`${now}%`}
                  label="ბოლომდე მისული"
                  sub={d.prev.attempts === 0
                    ? `წინა ${d.days} დღეში მცდელობა არ ყოფილა`
                    : `წინა ${d.days} დღეში — ${was}%`}
                  bad={d.prev.attempts > 0 && now < was}
                />
              </div>

              <SectionCard
                eyebrow="ძაბრი"
                title="ნაბიჯები"
                sub={`${f.attempts} მცდელობა ბოლო ${d.days} დღეში. თითოეული ნაბიჯი აჩვენებს, რამდენმა მიაღწია მას — და რამდენი დაიკარგა წინა ნაბიჯსა და მას შორის.`}
              >
                {f.attempts === 0 ? (
                  <AdminEmpty
                    text={d.staffFlows > 0
                      ? `ბოლო ${d.days} დღეში მხოლოდ შენი საკუთარი ${d.staffFlows} მცდელობა იყო — ისინი ძაბრში არ ითვლება.`
                      : `ბოლო ${d.days} დღეში /request არავის გაუხსნია.`}
                  />
                ) : (
                  <>
                    {f.steps.map((s, i) => (
                      <Step
                        key={s.key}
                        label={STEP_LABEL[s.key] ?? s.key}
                        n={s.n}
                        base={base}
                        lost={i > 0 ? f.steps[i - 1].n - s.n : null}
                        lostBase={i > 0 ? f.steps[i - 1].n : 0}
                      />
                    ))}

                    {/* A bug with a code, and a design problem. Never one number. */}
                    <div className="mt-5 pt-4 border-t border-ink-100">
                      <div className="font-display text-micro font-semibold uppercase text-ink-900 mb-2">დაუსრულებელი მცდელობები</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Stat
                          n={String(f.outcomes.failed)}
                          label="შეცდომაზე გაწყდა"
                          sub="სერვერმა უარი თქვა — ეს ჩვენი ბუგია"
                          bad={f.outcomes.failed > 0}
                        />
                        <Stat
                          n={String(f.outcomes.abandoned)}
                          label="თავად მიატოვა"
                          sub="შეცდომის გარეშე გავიდა — ეს დიზაინის საკითხია"
                        />
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

              {/* Base is „chose a kind“, not „opened“ — request_opened carries no
                  kind. The subtitle says so, because the number cannot. */}
              {d.byKind.length > 0 && (
                <SectionCard
                  eyebrow="ტიპის მიხედვით"
                  title="რომელი ტიპი იკარგება"
                  sub="ბაზა აქ არის „ტიპი აირჩია“, და არა „გახსნა“ — ვინც პირველ შეხებამდე წავიდა, ტიპი არ აქვს. ის დანაკარგი ზემოთ, პირველ გაჩერებაზე ჩანს."
                >
                  <div className="divide-y divide-ink-100">
                    {d.byKind.map(k => (
                      <div key={k.kind} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-display text-small font-semibold text-ink-900">{kindLabel(k.kind)}</span>
                          <span className="font-display text-small font-bold tabular-nums text-ink-900">
                            {k.sent}/{k.chose}
                            <span className="text-ink-500 font-semibold"> · {pct(k.sent, k.chose)}%</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-pill bg-ink-100 overflow-hidden">
                          <div className="h-full bg-ink-900" style={{ width: `${pct(k.sent, k.chose)}%` }} />
                        </div>
                        <div className="mt-1 text-meta text-ink-600 tabular-nums">
                          დეტალებამდე {k.details} · გააგზავნა {k.sent}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {d.byTopic.length > 0 && (
                <SectionCard
                  eyebrow="თემის მიხედვით"
                  title="რომელ თემაზე ჩერდებიან"
                  sub="რამდენმა აირჩია თემა და რამდენმა გააგზავნა. დაბალი პროცენტი ან გვერდის პრობლემაა, ან კატეგორია, სადაც გასაგზავნი არავინაა."
                >
                  <div className="divide-y divide-ink-100">
                    {d.byTopic.map(t => (
                      <div key={t.topic} className="py-2.5 first:pt-0 last:pb-0 flex items-baseline justify-between gap-4">
                        <span className="text-small text-ink-800 min-w-0 truncate">{topicLabel(t.topic)}</span>
                        <span className="shrink-0 font-display text-small font-semibold tabular-nums text-ink-900">
                          {t.sent}/{t.chose}
                          <span className={`ml-1.5 font-semibold ${t.sent === 0 ? 'text-danger-700' : 'text-ink-500'}`}>
                            {pct(t.sent, t.chose)}%
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              <p className="text-meta text-ink-500">
                მოვლენები {d.retentionDays} დღეში იშლება — ამაზე ძველი პერიოდი აღარ იკითხება.
              </p>
            </>
          )}
      </div>
    </>
  )
}
