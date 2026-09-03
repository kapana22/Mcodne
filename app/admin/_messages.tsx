'use client'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/Icon'
import { OUTBOUND, AUDIENCE_LABEL, CHANNEL_LABEL, canToggle, outboundLabel, type Audience, type Channel } from '@/lib/outbound'
import {
  AdminEmpty, AdminError, AdminLoading, LoadMoreBar, PeriodSwitch,
  RowList, SectionCard, Stat, SubTabs, TabHeader, fmtDT,
} from './_parts'

/* შეტყობინებები — what this site sends, and what it actually sent.
 *
 * Owner, 2026-09-02: „მინდა ვმართოთ მეილზე გაგზავნის ტელეფონზე გაგზავნა სად
 * მიდის როდის მიდის და ასეთი დეტალები რომ კარგად იყოს მოწესრიგებული და არ
 * გაგვეპაროს შეცდომები."
 *
 * WHY IT EXISTS. Before it, a send left exactly one trace — a console line in
 * the Railway log — and that log scrolls. So from here „the letter never
 * arrived" and „the letter was never sent" were the same picture, and they
 * need opposite answers: one is a mail server, the other is a switch somebody
 * left off. The tab separates them at a glance and names the branch that
 * answered (`mode`), which is the only field that says WHY.
 *
 * TWO HALVES, and they are different questions:
 *   რას აგზავნის — the registry (lib/outbound). Code-owned, so it cannot drift:
 *                  `sendMail`/`sendSms` take an OutboundKey and a message that
 *                  is not registered does not compile.
 *   რა გაიგზავნა — the log (MessageLog). Written by the senders themselves.
 */

type Row = {
  id: string; channel: string; key: string; to: string; status: string
  mode: string; detail: string | null; ref: string | null; parts: number | null; at: string
  /** sender.ge's carrier report: 0 pending · 1 delivered · 2 undelivered · null never asked. */
  delivery: number | null
}
type MessageState = { mailOn: boolean; smsOn: boolean }
type Preview = { subject: string | null; body: string; sms?: string; source: string }
type CopyField = {
  key: string; label: string; value: string; fallback: string
  multiline: boolean; vars: string[]; overridden: boolean
}
type CopyGroup = { key: string; label: string; texts: CopyField[] }
type Data = {
  balance: { balance: number; overdraft: number } | null
  settings: Record<string, MessageState>
  previews: Record<string, Preview>
  copy: CopyGroup[]
  tableReady: boolean
  days: number
  transport: {
    mailerMode: string; mailOnlyAfter: string | null; gmailConfigured: boolean
    smsMode: string; smsOnlyAfter: string | null; smsKeySet: boolean
  }
  counts: { key: string; channel: string; status: string; n: number }[]
  lastByKey: Record<string, string>
  total: number
  rows: Row[]
  hasMore: boolean
}

/* ⚠️ THE FOUR STATUSES ARE COLOURED BY MEANING, never by position: a failure is
   red, a send is green, and „held"/„logged" are grey because neither is a
   fault — one is a rule doing its job, the other is a transport nobody has
   switched on yet. An operator scanning forty rows reads state without reading
   words (the same rule _requests.tsx follows). */
const STATUS: Record<string, { l: string; cls: string }> = {
  sent:   { l: 'გაიგზავნა', cls: 'bg-brand-50 text-brand-800 border-brand-200' },
  failed: { l: 'ჩავარდა',   cls: 'bg-danger-50 text-danger-700 border-danger-300' },
  held:   { l: 'შეჩერდა',   cls: 'bg-ink-100 text-ink-700 border-ink-200' },
  logged: { l: 'ჩაიწერა',   cls: 'bg-ink-50 text-ink-600 border-ink-200' },
}
const StatusPill = ({ s }: { s: string }) => {
  const v = STATUS[s] ?? { l: s, cls: 'bg-ink-50 text-ink-600 border-ink-200' }
  return <span className={`shrink-0 inline-flex items-center h-6 px-2 rounded-pill border text-micro font-display font-bold ${v.cls}`}>{v.l}</span>
}

const AUDIENCE_ORDER: Audience[] = ['client', 'provider', 'anyone', 'admin', 'inbox']

/* One editable string, saved where it stands.
 *
 * ⚠️ IT SAVES ON BLUR, NOT ON A BUTTON. There are up to a dozen fields behind
 * one message and a „შენახვა" per field is a dozen decisions; one save button
 * for all of them is a dozen fields you must not navigate away from. Leaving a
 * field IS the decision, which is how the site-text tab beside it already
 * behaves — and „დააბრუნე" undoes it in one click while the row is on screen.
 *
 * ⚠️ AND IT WRITES THROUGH /api/admin/site-texts. These rows ARE site texts;
 * the existing route already checks the key, audits the change and drops the
 * copy cache. A second writer would be a second set of rules to keep in step. */
function CopyField({ f, onSaved }: { f: CopyField; onSaved: (key: string, value: string, overridden: boolean) => void }) {
  const [v, setV] = useState(f.value)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setV(f.value) }, [f.value])

  const save = async (next: string, reset = false) => {
    if (!reset && next === f.value) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/site-texts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? { key: f.key, reset: true } : { key: f.key, value: next }),
      })
      if (res.ok) onSaved(f.key, reset ? f.fallback : next, !reset)
      else setV(f.value)
    } catch { setV(f.value) } finally { setBusy(false) }
  }

  const cls = `w-full rounded-btn border px-3 py-2 text-small text-ink-900 bg-white transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-brand-500 ${busy ? 'opacity-60' : ''} ${f.overridden ? 'border-brand-300' : 'border-ink-200'}`
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label htmlFor={f.key} className="text-micro font-display font-semibold text-ink-600">{f.label}</label>
        {f.overridden && (
          <button
            type="button"
            onClick={() => { setV(f.fallback); save(f.fallback, true) }}
            className="h-10 sm:h-7 tap-area px-2 -my-1 rounded-btn text-micro font-display font-semibold text-ink-500 hover:text-ink-900 hover:bg-ink-50 transition-colors duration-fast"
          >
            დააბრუნე საწყისი
          </button>
        )}
      </div>
      {f.multiline
        ? <textarea id={f.key} rows={3} value={v} disabled={busy} onChange={e => setV(e.target.value)} onBlur={() => save(v)} className={cls} />
        : <input id={f.key} type="text" value={v} disabled={busy} onChange={e => setV(e.target.value)} onBlur={() => save(v)} className={cls} />}
    </div>
  )
}

/* The switch, drawn exactly as /settings draws its notification switches — a
   44×44 tap target (canon floor 40px) around a 44×24 track. One control, one
   look, wherever somebody turns something off. */
const Switch = ({ on, busy, label, onClick }: { on: boolean; busy: boolean; label: string; onClick: () => void }) => (
  <button
    type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy} onClick={onClick}
    className="shrink-0 h-11 rounded-btn inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
  >
    <span className={`relative block w-11 h-6 rounded-full transition-colors duration-fast ${on ? 'bg-brand-500' : 'bg-ink-200'} ${busy ? 'opacity-60' : ''}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-fast ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  </button>
)

/* What the carrier said, for an SMS that really left. Absent on mail, and on a
   text that never went — there is nothing to have a delivery report about. */
const DELIVERY_LABEL: Record<number, { l: string; cls: string }> = {
  0: { l: 'გზაშია', cls: 'text-ink-500' },
  1: { l: 'ჩაბარდა', cls: 'text-brand-700' },
  2: { l: 'ვერ ჩაბარდა', cls: 'text-danger-700' },
}

/** One line of the transport card. `bad` is „nothing will go out this way". */
const Wire = ({ label, value, meaning, bad }: { label: string; value: string; meaning: string; bad?: boolean }) => (
  <div className="py-3 border-b border-ink-100 last:border-0 flex items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="font-display text-small font-semibold text-ink-900">{label}</div>
      <div className="text-meta text-ink-600 mt-0.5 leading-snug">{meaning}</div>
    </div>
    <span className={`shrink-0 font-mono text-meta font-bold ${bad ? 'text-danger-700' : 'text-ink-900'}`}>{value}</span>
  </div>
)

export function MessagesSection() {
  const [days, setDays] = useState(7)
  const [view, setView] = useState<'registry' | 'log'>('registry')
  const [status, setStatus] = useState('')
  const [skip, setSkip] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [editKey, setEditKey] = useState<string | null>(null)

  /* A saved field is written back into the payload rather than refetched: the
     whole page is one query and re-running it to learn what we just typed is a
     round trip for an answer we already have. */
  const applySaved = (key: string, value: string, overridden: boolean) =>
    setData(d => d && ({
      ...d,
      copy: d.copy.map(g => ({ ...g, texts: g.texts.map(x => x.key === key ? { ...x, value, overridden } : x) })),
    }))

  /* One switch, flipped optimistically and put back if the server refuses.
     ⚠️ THE SERVER IS THE AUTHORITY ON WHAT MAY BE SWITCHED — a 409 here means
     lib/outboundSettings refused (a credential, or our own inbox), and the
     honest response is to restore the state rather than argue with it. */
  const flip = async (key: string, channel: Channel, on: boolean) => {
    setBusyKey(key + channel)
    const prev = data
    setData(d => (d ? { ...d, settings: { ...d.settings, [key]: { ...d.settings[key], [channel === 'mail' ? 'mailOn' : 'smsOn']: on } } } : d))
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, channel, on }),
      })
      if (!res.ok) setData(prev)
    } catch { setData(prev) } finally { setBusyKey(null) }
  }

  const load = useCallback(async (nextSkip: number) => {
    setLoading(true); setErr(false)
    try {
      const q = new URLSearchParams({ days: String(days), skip: String(nextSkip) })
      if (status) q.set('status', status)
      const res = await fetch(`/api/admin/messages?${q}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const d: Data = await res.json()
      setData(d)
      setRows(prev => (nextSkip === 0 ? d.rows : [...prev, ...d.rows]))
    } catch { setErr(true) } finally { setLoading(false) }
  }, [days, status])

  useEffect(() => { setSkip(0); load(0) }, [load])

  if (err) return <AdminError onRetry={() => load(0)} />
  if (!data) return <AdminLoading />

  const t = data.transport
  const mailDark = t.mailerMode === 'off' || (!t.gmailConfigured && !t.mailerMode.startsWith('send'))
  const smsDark = !t.smsMode.startsWith('send')

  // Totals over the window, from the same grouped read the registry rows use —
  // one number is never computed twice from two sources.
  const tot = (s: string) => data.counts.filter(c => c.status === s).reduce((n, c) => n + c.n, 0)
  const failed = tot('failed')

  const countFor = (key: string, s: string) =>
    data.counts.filter(c => c.key === key && c.status === s).reduce((n, c) => n + c.n, 0)

  return (
    <>
      <TabHeader
        eyebrow="შეტყობინებები"
        title="რას აგზავნის საიტი"
        sub="ყველა წერილი და SMS ერთ სიაში — ვის მიდის, რა ამოძრავებს და რა მოხდა ბოლოს."
        actions={<PeriodSwitch value={days} onChange={setDays} />}
      />

      <div className="px-6 lg:px-8 pb-8 space-y-5">
        {!data.tableReady && (
          <AdminEmpty text="ჟურნალის ცხრილი ჯერ არ შექმნილა — პირველივე მოთხოვნაზე შეიქმნება (lib/dbBoot). განაახლე გვერდი ცოტა ხანში." />
        )}

        {/* ── the four numbers, and the red one is the point ─────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat n={tot('sent')} label="გაიგზავნა" sub={`ბოლო ${days} დღე`} />
          <Stat n={failed} label="ჩავარდა" sub="მიმღებამდე ვერ მივიდა" bad={failed > 0} />
          <Stat n={tot('held')} label="შეჩერდა" sub="წესმა შეაჩერა — ზღვარი ან გამორთვა" />
          <Stat n={tot('logged')} label="ჩაიწერა" sub="ტრანსპორტი ჩართული არ არის" />
        </div>

        {/* ── is anything going out at all ──────────────────────────────── */}
        <SectionCard
          eyebrow="ტრანსპორტი"
          title="რით გადის"
          sub="ეს ის ზუსტი მნიშვნელობებია, რასაც lib/mailer და lib/sms კითხულობს. გასაღები არასდროს ჩანს — მხოლოდ ის, დაყენებულია თუ არა."
        >
          <div>
            <Wire
              label="ელფოსტა — რეჟიმი" value={t.mailerMode} bad={mailDark}
              meaning={t.mailerMode === 'off' ? 'გამორთულია: არაფერი გადის, ყველაფერი ლოგში იწერება' : t.gmailConfigured ? 'Gmail SMTP მიერთებულია' : 'გამგზავნი მიერთებული არ არის — მხოლოდ ლოგი'}
            />
            <Wire
              label="ელფოსტა — ზღვარი" value={t.mailOnlyAfter ? t.mailOnlyAfter.slice(0, 10) : '—'}
              meaning={t.mailOnlyAfter ? 'ვინც ამ მომენტამდე იყო ბაზაში, წერილს არ იღებს' : 'ზღვარი არ დგას — ყველას მისდის'}
            />
            <Wire
              label="SMS — რეჟიმი" value={t.smsMode} bad={smsDark}
              meaning={smsDark ? 'რეალურად არაფერი იგზავნება — ტექსტი ლოგში იბეჭდება' : 'sender.ge-ზე მიდის, თითო ნაწილი ფასიანია'}
            />
            <Wire
              label="SMS — გასაღები" value={t.smsKeySet ? 'დაყენებულია' : 'არ არის'} bad={!t.smsKeySet}
              meaning="მარტო გასაღები არასდროს აგზავნის — SMS_MODE=send მეორე ნახევარია"
            />
            {/* ⚠️ THE 402 YOU CAN SEE COMING. „Insufficient balance" is not a
                bug and does not read like one at 2am — it silently stops every
                text. This is the only warning that arrives in time to act on. */}
            <Wire
              label="SMS — ბალანსი"
              value={data.balance ? `${data.balance.balance} ₾` : '—'}
              bad={Boolean(data.balance && data.balance.balance <= 0)}
              meaning={data.balance
                ? (data.balance.balance <= 0 ? 'ამოიწურა — SMS აღარ გადის, შეავსე sender.ge-ზე' : 'sender.ge-ს ანგარიშზე')
                : 'ვერ ვკითხულობთ — გასაღები არ არის ან sender.ge არ პასუხობს'}
            />
          </div>
        </SectionCard>

        <SubTabs
          value={view}
          onChange={setView}
          tabs={[
            { id: 'registry' as const, label: 'რას აგზავნის', count: OUTBOUND.length },
            { id: 'log' as const, label: 'რა გაიგზავნა', count: data.total },
          ]}
        />

        {view === 'registry' ? (
          <div className="space-y-5">
            {/* ⚠️ ONE EDIT, TWENTY LETTERS. The frame every mail is drawn in has
                no message of its own, so it would otherwise be the one string on
                this screen with nowhere to live — and it is the string most
                likely to be wrong, because nobody reads a footer twice. */}
            {data.copy.filter(g => g.key === 'shell').map(g => (
              <SectionCard
                key={g.key}
                eyebrow="ჩარჩო"
                title={g.label}
                sub="ეს ტექსტი ყველა წერილის ბოლოში ჩნდება — ერთი ცვლილება ოცივეს ეხება."
              >
                {g.texts.map(f => <CopyField key={f.key} f={f} onSaved={applySaved} />)}
              </SectionCard>
            ))}
            {AUDIENCE_ORDER.map(a => {
              const defs = OUTBOUND.filter(d => d.audience === a)
              if (!defs.length) return null
              return (
                <SectionCard
                  key={a}
                  eyebrow={AUDIENCE_LABEL[a]}
                  title={`${defs.length} შეტყობინება`}
                  sub={a === AUDIENCE_ORDER[0] ? 'თითოეულის სიტყვები „ტექსტები“ ტაბზე იცვლება — ჯგუფი „წერილი — …“. ცვლილება მაშინვე ცოცხლდება, დეპლოის გარეშე.' : undefined}
                >
                  <RowList>
                    {defs.map(d => {
                      const nFailed = countFor(d.key, 'failed')
                      const nSent = countFor(d.key, 'sent')
                      const last = data.lastByKey[d.key]
                      return (
                        <div key={d.key} className="p-4 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display text-small font-bold text-ink-900">{d.label}</span>
                              {d.channels.map(c => (
                                <span key={c} className="inline-flex items-center h-5 px-1.5 rounded-pill bg-ink-100 text-ink-600 text-micro font-display font-semibold">
                                  {CHANNEL_LABEL[c]}
                                </span>
                              ))}
                              {'credential' in d && (
                                <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-warning-50 text-warning-700 text-micro font-display font-semibold">
                                  <Icon.lock className="w-3 h-3" />კოდი
                                </span>
                              )}
                            </div>
                            <div className="text-meta text-ink-600 mt-1 leading-snug">{d.when}</div>
                            <div className="text-micro text-ink-400 mt-1 font-mono">{d.key}</div>
                            {/* ⚠️ THE SUBJECT IS SHOWN, NOT HIDDEN BEHIND THE
                                CLICK. Owner, having gone looking for it:
                                „სადა ტექსტები ვერ ვნახე ადმინშში". A control
                                somebody has to discover before they can read
                                what the site sends is a control that failed —
                                so the identifying line is always on screen and
                                only the full body waits behind the button.
                                ⚠️ RENDERED FROM THE BUILDER THAT ACTUALLY SENDS
                                (lib/outboundPreview), never retyped: a preview
                                kept in step by hand lies the first time the
                                template is edited, on the one screen an
                                operator opens to check what goes out. */}
                            {data.previews[d.key]?.subject && (
                              <div className="mt-2 text-meta text-ink-800 truncate max-w-[420px]">
                                <span className="text-ink-400">სათაური: </span>
                                {data.previews[d.key].subject}
                              </div>
                            )}
                            {data.previews[d.key]?.sms && (
                              <div className="mt-1 text-meta text-ink-800 truncate max-w-[420px]">
                                <span className="text-ink-400">SMS: </span>
                                {data.previews[d.key].sms}
                              </div>
                            )}
                            {/* ⚠️ THE EDIT LINK IS THE POINT OF THE WHOLE FILE.
                                Owner, looking at a read-only preview: „რედაქტირება
                                რატომ არ შემიძლია?" — the words now ride SITE_TEXTS
                                (lib/messageTextDefs → lib/siteTextDefs), so this
                                goes to the SAME editor the site copy uses, at the
                                group this message owns. */}
                            {data.copy.some(g => g.key === d.key) && (
                              <button
                                type="button"
                                onClick={() => setEditKey(editKey === d.key ? null : d.key)}
                                className="mt-2 mr-2 h-10 sm:h-9 tap-area px-3 rounded-btn border border-brand-200 bg-brand-50 hover:bg-brand-100 inline-flex items-center gap-1.5 text-micro font-display font-semibold text-brand-800 transition-colors duration-fast"
                              >
                                <Icon.edit className="w-3 h-3" />
                                {editKey === d.key ? 'დახურე' : 'რედაქტირება'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setOpenKey(openKey === d.key ? null : d.key)}
                              className="mt-2 h-10 sm:h-9 tap-area px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 inline-flex items-center gap-1.5 text-micro font-display font-semibold text-ink-700 transition-colors duration-fast"
                            >
                              <Icon.chevD className={`w-3 h-3 transition-transform duration-fast ${openKey === d.key ? 'rotate-180' : ''}`} />
                              {openKey === d.key ? 'დახურე' : 'სრული ტექსტი'}
                            </button>
                            {openKey === d.key && (
                              <div className="mt-2 rounded-card border border-ink-200 bg-ink-50 p-3 max-w-[560px]">
                                {data.previews[d.key]?.subject && (
                                  <div className="font-display text-small font-bold text-ink-900 mb-1.5">
                                    {data.previews[d.key].subject}
                                  </div>
                                )}
                                {data.previews[d.key]?.body
                                  ? <pre className="text-meta text-ink-700 whitespace-pre-wrap font-sans leading-relaxed">{data.previews[d.key].body}</pre>
                                  : <div className="text-meta text-ink-500">ტექსტი იმ მარშრუტშივე იწერება, საიდანაც იგზავნება — საერთო შაბლონი არ აქვს.</div>}
                                {data.previews[d.key]?.sms && (
                                  <div className="mt-3 pt-3 border-t border-ink-200">
                                    <div className="text-micro font-display font-semibold text-ink-500 mb-1">SMS</div>
                                    <div className="text-meta text-ink-800">{data.previews[d.key].sms}</div>
                                  </div>
                                )}
                                <div className="mt-3 text-micro text-ink-400 font-mono break-all">{data.previews[d.key]?.source}</div>
                              </div>
                            )}
                            {editKey === d.key && (
                              <div className="mt-2 rounded-card border border-brand-200 bg-white p-4 max-w-[560px]">
                                <div className="text-micro text-ink-500 mb-2 leading-snug">
                                  ველიდან გასვლისთანავე ინახება და მაშინვე ცოცხლდება. მწვანე ჩარჩო ნიშნავს, რომ შენ შეცვალე.
                                </div>
                                {data.copy.find(g => g.key === d.key)?.texts.map(f => (
                                  <CopyField key={f.key} f={f} onSaved={applySaved} />
                                ))}
                                {/* The frame is one group for all twenty letters — said here
                                    so nobody edits it expecting to change only this one. */}
                                <a href="#texts" className="mt-2 inline-block text-micro text-ink-500 hover:text-ink-900 underline">
                                  ყველა ტექსტი ერთ სიაში →
                                </a>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-4">
                            <div className="text-right">
                              <div className={`font-display text-small font-bold tabular-nums ${nFailed > 0 ? 'text-danger-700' : 'text-ink-900'}`}>
                                {nFailed > 0 ? `${nFailed} ჩავარდა` : nSent > 0 ? `${nSent} გაიგზავნა` : '—'}
                              </div>
                              <div className="text-micro text-ink-400 mt-0.5">
                                {last ? `ბოლოს ${fmtDT(last)}` : `${days} დღეში არაფერი`}
                              </div>
                            </div>
                            {/* ⚠️ A SWITCH ONLY WHERE TURNING IT OFF IS ALLOWED,
                                and the rule is the SERVER's (lib/outbound →
                                canToggle): a password-reset code and our own
                                inbox are listed with no switch beside them, the
                                way Shopify lists its required receipts. A row
                                with nothing to flip says so in words instead. */}
                            <div className="flex items-center gap-1">
                              {d.channels.map(c => {
                                const st = data.settings[d.key] ?? { mailOn: true, smsOn: false }
                                const on = c === 'mail' ? st.mailOn : st.smsOn
                                if (!canToggle(d.key, c)) {
                                  return (
                                    <span key={c} className="text-micro text-ink-400 px-2" title="ამის გამორთვა არ შეიძლება">
                                      {CHANNEL_LABEL[c]} · ყოველთვის
                                    </span>
                                  )
                                }
                                return (
                                  <div key={c} className="flex flex-col items-center">
                                    <Switch
                                      on={on}
                                      busy={busyKey === d.key + c}
                                      label={`${d.label} — ${CHANNEL_LABEL[c]}`}
                                      onClick={() => flip(d.key, c, !on)}
                                    />
                                    <span className="text-micro text-ink-400 -mt-1">{CHANNEL_LABEL[c]}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </RowList>
                </SectionCard>
              )
            })}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 flex-wrap pb-4">
              {['', 'failed', 'sent', 'held', 'logged'].map(s => (
                <button
                  key={s || 'all'}
                  type="button"
                  onClick={() => { setStatus(s); setSkip(0) }}
                  className={`h-9 px-3 rounded-btn border font-display text-small font-semibold transition-colors duration-fast ${
                    status === s ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
                  }`}
                >
                  {s ? STATUS[s].l : 'ყველა'}
                </button>
              ))}
            </div>

            {rows.length === 0 && !loading
              ? <AdminEmpty text={`${days} დღეში ${status ? STATUS[status].l.toLowerCase() : 'არცერთი'} ჩანაწერი არ არის.`} ok={status === 'failed'} />
              : (
                <RowList>
                  {rows.map(r => (
                    <div key={r.id} className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusPill s={r.status} />
                          <span className="font-display text-small font-bold text-ink-900">{outboundLabel(r.key)}</span>
                          <span className="text-micro text-ink-500">{CHANNEL_LABEL[r.channel as 'mail' | 'sms'] ?? r.channel}</span>
                        </div>
                        {/* ⚠️ `to` for an SMS is ALREADY masked by lib/sms before
                            it reaches the table — this renders what was stored,
                            it does not mask on the way out. */}
                        <div className="text-meta text-ink-700 mt-1 truncate font-mono">{r.to}</div>
                        <div className="text-micro text-ink-400 mt-1">
                          {r.mode}
                          {r.parts ? ` · ${r.parts} ნაწილი` : ''}
                          {r.ref ? ` · ${r.ref}` : ''}
                          {/* ⚠️ „გაიგზავნა" means sender.ge took it; this is
                              whether the phone rang. The two are different
                              facts and the gap is where texts die. */}
                          {r.delivery !== null && DELIVERY_LABEL[r.delivery] && (
                            <span className={`ml-1 font-semibold ${DELIVERY_LABEL[r.delivery].cls}`}>
                              · {DELIVERY_LABEL[r.delivery].l}
                            </span>
                          )}
                        </div>
                        {r.detail && <div className="text-micro text-danger-700 mt-1 break-words">{r.detail}</div>}
                      </div>
                      <div className="shrink-0 text-micro text-ink-400 tabular-nums">{fmtDT(r.at)}</div>
                    </div>
                  ))}
                </RowList>
              )}
            <LoadMoreBar
              hasMore={data.hasMore}
              loading={loading}
              count={rows.length}
              onMore={() => { const n = skip + 60; setSkip(n); load(n) }}
            />
          </div>
        )}
      </div>
    </>
  )
}
