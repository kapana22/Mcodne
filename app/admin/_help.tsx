'use client'
import { useCallback, useEffect, useState } from 'react'
import { TabHeader, AdminLoading, AdminError, PeriodSwitch } from './_parts'
import { MiniChart } from './_charts'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { fmtKaDate } from '@/lib/kaDate'

/**
 * „დახმარება“ — what the help widget learned.
 *
 * THE POINT OF THIS TAB IS NOT SUPPORT VOLUME. Every table here is written to
 * be read as an instruction about the PRODUCT:
 *
 *  · a question asked over and over ON ONE PAGE is an answer that belongs on
 *    that page, not behind a floating circle;
 *  · a question people TYPED that we could not answer is an answer to write —
 *    that list is the only signal here that cannot be reconstructed from counts,
 *    which is why storing it was worth an exception to the free-text rule;
 *  · somebody who read three answers and still wrote to a human did not fail to
 *    find the answer — they found it and it was wrong.
 *
 * So the sections are ordered by what you can act on, not by what is easiest to
 * count, and the „ჩაწერე პასუხი“ framing is deliberate: the widget's job is to
 * make itself unnecessary, one question at a time.
 */

type Row = { route: string; n: number }
type QRow = { id: string; q: string; known: boolean; route: string; n: number }
type URow = { text: string; route: string; n: number; last: string }
type TRow = { route: string; seen: number; n: number; last: string }
type MRow = {
  id: string; at: string; route: string | null; question: string | null
  message: string; email: string | null; name: string | null; status: string
}
type Data = {
  days: number
  messages: MRow[]
  openMessages: number
  totals: { opened: number; answered: number; unanswered: number; unresolved: number; missShare: number | null }
  byRoute: Row[]
  byQuestion: QRow[]
  unanswered: URow[]
  tickets: TRow[]
  series: { days: string[]; opened: number[]; answered: number[]; unanswered: number[]; unresolved: number[] }
}

const RANGES = [7, 30, 90]

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      <div className="text-micro uppercase text-ink-500 font-display font-semibold">{label}</div>
      <div className={`mt-1 font-display text-h2 font-bold tabular-nums ${tone === 'warn' ? 'text-warning-700' : 'text-ink-900'}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-meta text-ink-500 leading-[1.4]">{hint}</div>}
    </div>
  )
}

/** Routes are stored normalised (lowercase, non-latin runs collapsed). Show the
 *  home page as something a person recognises rather than a bare slash. */
const routeLabel = (r: string) => (r === '/' ? '/ (მთავარი)' : r)

export function HelpSection() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  // Default to the ones that need a person. Closed messages are kept (they are
  // a record, not clutter) but they are not what you opened this for.
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async (d: number) => {
    setState('loading')
    try {
      const res = await fetch(`/api/admin/help?days=${d}`, { cache: 'no-store' })
      const j = await res.json().catch(() => null)
      // A failed fetch must never render as „no data“ — an empty panel and a
      // broken panel look identical and only one of them needs fixing.
      if (!res.ok || !j?.ok) { setState('error'); return }
      setData(j as Data)
      setState('ok')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { void load(days) }, [days, load])

  /**
   * Open ↔ closed. The row is updated from the SERVER's answer, never
   * optimistically: an admin who thinks they closed a ticket that is still open
   * stops looking at it, which is the one outcome this queue exists to prevent.
   */
  const setStatus = async (id: string, status: 'new' | 'done') => {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/help', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.ok) {
        setData(d => d && ({
          ...d,
          messages: d.messages.map(m => (m.id === id ? { ...m, status } : m)),
          openMessages: d.messages.filter(m => (m.id === id ? status : m.status) === 'new').length,
        }))
      }
    } catch { /* the row simply stays as it was — nothing is claimed */ }
    setBusyId(null)
  }

  const t = data?.totals
  const open = data?.openMessages ?? 0

  return (
    <div>
      <TabHeader
        eyebrow="დახმარება"
        title="რას კითხულობენ"
        sub="ვიჯეტის მიზანია საკუთარი თავი ზედმეტი გახადოს — ყოველი კითხვა, რომელიც აქ ხშირად ჩანს, იმ გვერდზე უნდა გადავიდეს."
        actions={
          <PeriodSwitch value={days} onChange={setDays} options={RANGES} />
        }
      />

      {state === 'error' && (
        <AdminError
          className="mt-6"
          message="მონაცემები ვერ ჩაიტვირთა."
          hint="ეს არ ნიშნავს, რომ ჩანაწერები არ არსებობს — მოთხოვნა ჩავარდა."
          onRetry={() => void load(days)}
        />
      )}

      {state === 'loading' && (
        <AdminLoading className="mt-6" />
      )}

      {state === 'ok' && data && t && (
        <div className="mt-6 space-y-8">
          {/* Three tiles, three facts. There were four: „ვერ იპოვა %" is
              unanswered ÷ (answered + unanswered), i.e. the other two divided
              by each other, presented as if it were new information. */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="გახსნა" value={String(t.opened)} hint="პანელი გაიხსნა" />
            <Stat label="პასუხი გავეცი" value={String(t.answered)} hint="კითხვა, რომელსაც პასუხი ჰქონდა" />
            <Stat
              label="ვერ ვუპასუხე"
              value={String(t.unanswered)}
              hint={t.missShare === null ? 'ჯერ არავის უკითხავს' : `დაწერილის ${Math.round(t.missShare * 100)}%`}
              tone={t.unanswered > 0 ? 'warn' : undefined}
            />
          </div>

          {/* ── 0. PEOPLE WAITING. Above every chart, because a number can wait
                 and a person cannot. ── */}
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-h3 font-bold text-ink-900">შემოსული პრობლემები</h3>
              <div className="flex items-center gap-3 shrink-0">
                {open > 0 && (
                  <span className="font-display text-meta font-semibold text-warning-700 tabular-nums">
                    {open} ელოდება
                  </span>
                )}
                {data.messages.some(m => m.status === 'done') && (
                  <button
                    type="button"
                    onClick={() => setShowDone(v => !v)}
                    aria-pressed={showDone}
                    className="font-display text-meta font-semibold text-ink-600 hover:text-ink-900 transition-colors duration-fast"
                  >
                    {showDone ? 'მხოლოდ ღია' : `დახურულებიც (${data.messages.filter(m => m.status === 'done').length})`}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-small text-ink-600">
              ბოტმა ვერ უპასუხა და ადამიანმა თვითონ მოგვწერა. ელფოსტაზეც მოდის.
            </p>
            <div className="mt-4 space-y-3">
              {data.messages.filter(m => showDone || m.status === 'new').length === 0 ? (
                <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
                  <EmptyState
                    variant="inline"
                    icon={<Icon.check className="w-5 h-5" />}
                    title={showDone ? 'შემოსული პრობლემა არ არის' : 'ღია პრობლემა არ არის'}
                    description={showDone ? 'ჩათიდან ჯერ არავის მოუწერია.' : 'ყველაფერი დახურულია.'}
                  />
                </div>
              ) : data.messages.filter(m => showDone || m.status === 'new').map(m => (
                <div
                  key={m.id}
                  className={`rounded-card border bg-white p-4 ${
                    m.status === 'new' ? 'border-warning-300' : 'border-ink-200 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-small font-bold text-ink-900">
                        {m.name || 'ანონიმური'}
                      </div>
                      <div className="text-meta text-ink-500 tabular-nums">
                        {fmtKaDate(new Date(m.at))} · <span className="font-mono">{routeLabel(m.route || '?')}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void setStatus(m.id, m.status === 'new' ? 'done' : 'new')}
                      disabled={busyId === m.id}
                      className={`h-9 px-3 shrink-0 rounded-btn font-display text-small font-semibold transition-colors duration-fast ${
                        m.status === 'new'
                          ? 'bg-ink-900 hover:bg-ink-800 text-white'
                          : 'bg-white border border-ink-200 text-ink-700 hover:bg-ink-50'
                      } disabled:opacity-60`}
                    >
                      {busyId === m.id ? '…' : m.status === 'new' ? 'დახურვა' : 'გახსნა'}
                    </button>
                  </div>

                  {m.question && (
                    <div className="mt-3 text-meta text-ink-600">
                      ბოტს ჰკითხა: <span className="text-ink-800">„{m.question}“</span>
                    </div>
                  )}
                  <p className="mt-2 text-small text-ink-900 leading-[1.55] whitespace-pre-wrap">{m.message}</p>

                  {/* The reply channel, one click. Without an address there is
                      nothing to click, and saying so is better than a dead
                      mailto: that opens an empty compose window. */}
                  {m.email ? (
                    <a
                      href={`mailto:${m.email}?subject=${encodeURIComponent('მცოდნე — პასუხი შენს კითხვაზე')}`}
                      className="mt-3 inline-flex items-center gap-1.5 font-display text-meta font-semibold text-brand-700 hover:text-brand-800 transition-colors duration-fast"
                    >
                      <Icon.mail className="w-3.5 h-3.5" />
                      {m.email}
                    </a>
                  ) : (
                    <div className="mt-3 text-meta text-ink-500">ელფოსტა არ დატოვა — პასუხის გაგზავნა ვერ მოხერხდება.</div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── 2. THE BACKLOG — first, because it is the only list that tells
                 you something you did not already know. ── */}
          <section>
            <h3 className="font-display text-h3 font-bold text-ink-900">უპასუხო კითხვები</h3>
            {/* The old version of this line told a non-technical operator to
                „add it to lib/helpTopics" — a TypeScript file. That is not an
                instruction, it is a dead end. This says what they can actually
                do and admits the rest needs a developer. */}
            <p className="mt-1 text-small text-ink-600">
              თითოეული მათგანი ერთი დასაწერი პასუხია. არსებული პასუხის ტექსტს „ტექსტები“-ში შეასწორებ;
              სრულიად ახალი კითხვის დამატება ჯერ დეველოპერს სჭირდება.
            </p>
            <div className="mt-4 rounded-card border border-ink-200 bg-white overflow-hidden">
              {data.unanswered.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={<Icon.check className="w-5 h-5" />}
                  title="უპასუხო კითხვა არ არის"
                  description="ან ყველაფერზე გვაქვს პასუხი, ან ჯერ არავის დაუწერია."
                />
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-small">
                      <thead className="bg-ink-50/60 text-ink-600">
                        <tr>
                          <th className="text-left font-semibold px-4 py-2.5">კითხვა</th>
                          <th className="text-left font-semibold px-4 py-2.5 w-[180px]">გვერდი</th>
                          <th className="text-right font-semibold px-4 py-2.5 w-[80px]">ჯერ</th>
                          <th className="text-right font-semibold px-4 py-2.5 w-[120px]">ბოლოს</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {data.unanswered.map((r, i) => (
                          <tr key={i} className="hover:bg-ink-50/40">
                            <td className="px-4 py-2.5 text-ink-900">{r.text}</td>
                            <td className="px-4 py-2.5 font-mono text-meta text-ink-600">{routeLabel(r.route)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink-900">{r.n}</td>
                            <td className="px-4 py-2.5 text-right text-meta text-ink-500 tabular-nums">{fmtKaDate(new Date(r.last))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="block md:hidden divide-y divide-ink-100">
                    {data.unanswered.map((r, i) => (
                      <div key={i} className="p-4">
                        <div className="text-small text-ink-900">{r.text}</div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-meta text-ink-500">
                          <span className="font-mono truncate">{routeLabel(r.route)}</span>
                          <span className="tabular-nums shrink-0">{r.n}× · {fmtKaDate(new Date(r.last))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── 1. question × page ── */}
          <section>
            <h3 className="font-display text-h3 font-bold text-ink-900">რომელი კითხვა რომელ გვერდზე</h3>
            <p className="mt-1 text-small text-ink-600">
              თუ ერთი კითხვა ერთსა და იმავე გვერდზე მეორდება — პასუხი იმ გვერდზე უნდა ეწეროს.
            </p>
            <div className="mt-4 rounded-card border border-ink-200 bg-white overflow-hidden">
              {data.byQuestion.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={<Icon.chat className="w-5 h-5" />}
                  title="ჯერ არავის გაუხსნია"
                  description="ამ პერიოდში კითხვა არ დასმულა."
                />
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-small">
                      <thead className="bg-ink-50/60 text-ink-600">
                        <tr>
                          <th className="text-left font-semibold px-4 py-2.5">კითხვა</th>
                          <th className="text-left font-semibold px-4 py-2.5 w-[200px]">გვერდი</th>
                          <th className="text-right font-semibold px-4 py-2.5 w-[80px]">ჯერ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {data.byQuestion.map((r, i) => (
                          <tr key={i} className="hover:bg-ink-50/40">
                            <td className="px-4 py-2.5 text-ink-900">
                              {r.q}
                              {!r.known && (
                                <span className="ml-2 text-meta text-ink-500">(წაშლილი კითხვა)</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-meta text-ink-600">{routeLabel(r.route)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-ink-900">{r.n}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="block md:hidden divide-y divide-ink-100">
                    {data.byQuestion.map((r, i) => (
                      <div key={i} className="p-4">
                        <div className="text-small font-semibold text-ink-900">{r.q}</div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-meta text-ink-500">
                          <span className="font-mono truncate">{routeLabel(r.route)}</span>
                          <span className="tabular-nums shrink-0">{r.n}×</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── 3. gave up ── */}
          <section>
            <h3 className="font-display text-h3 font-bold text-ink-900">ვინ ვერ იპოვა პასუხი</h3>
            {/* The rows below already say this in words, per row. */}
            <div className="mt-4 rounded-card border border-ink-200 bg-white overflow-hidden">
              {data.tickets.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={<Icon.check className="w-5 h-5" />}
                  title="არავის დაუწერია"
                  description="ამ პერიოდში „ვერ ვიპოვე პასუხი“ არავის დაუჭერია."
                />
              ) : (
                <div className="divide-y divide-ink-100">
                  {data.tickets.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-mono text-meta text-ink-700 truncate">{routeLabel(r.route)}</div>
                        <div className="text-meta text-ink-500">
                          {r.seen === 0
                            ? 'ერთი პასუხიც არ წაუკითხავს — შემოთავაზებები არ ერგო'
                            : `${r.seen} პასუხი წაიკითხა და მაინც დაწერა`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-display text-h3 font-bold tabular-nums text-ink-900">{r.n}</div>
                        <div className="text-meta text-ink-500 tabular-nums">{fmtKaDate(new Date(r.last))}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          

          
        </div>
      )}
    </div>
  )
}
