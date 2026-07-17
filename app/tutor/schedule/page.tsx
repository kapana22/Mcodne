'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TutorAppBar } from '@/components/TutorAppBar'
import { Footer } from '@/components/Footer'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { useToast } from '@/components/ToastProvider'

type Booking = {
  id: string
  topic: string
  startAt: string
  durationMin: number
  status: string
  student?: { fullName: string } | null
}
type Slot = { id: string; startAt: string; endAt: string; booked: boolean }
type Me = { fullName: string; avatarUrl?: string | null } | null

const DAY_LABELS = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი']
const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i) // 8..20

function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7 // Mon=0
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - day)
  return out
}

function addDays(d: Date, n: number) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

// Server Node has no Georgian ICU data — toLocaleDateString('ka-GE', ...) falls
// back to English on SSR, causing a hydration mismatch when the client renders
// Georgian. Format manually.
const KA_MONTHS_SHORT = ['იან.','თებ.','მარ.','აპრ.','მაი.','ივნ.','ივლ.','აგვ.','სექ.','ოქტ.','ნოე.','დეკ.']
function fmtRangeLabel(weekStart: Date) {
  const end = addDays(weekStart, 6)
  return `${weekStart.getDate()} ${KA_MONTHS_SHORT[weekStart.getMonth()]} — ${end.getDate()} ${KA_MONTHS_SHORT[end.getMonth()]}`
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TutorSchedulePage() {
  const { toast } = useToast()
  const [me, setMe] = useState<Me>(null)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [modalErr, setModalErr] = useState<string | null>(null)
  const [form, setForm] = useState({ startAt: '', endAt: '' })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockForm, setBlockForm] = useState({ from: '', to: '' })
  const [blocking, setBlocking] = useState(false)
  const [blockErr, setBlockErr] = useState<string | null>(null)
  const [tplOpen, setTplOpen] = useState(false)
  const [tplDays, setTplDays] = useState<boolean[]>([false, false, false, false, false, false, false])
  const [tplStartHour, setTplStartHour] = useState(10)
  const [tplEndHour, setTplEndHour] = useState(18)
  const [tplWeeks, setTplWeeks] = useState(4)
  const [tplSaving, setTplSaving] = useState(false)
  const [tplErr, setTplErr] = useState<string | null>(null)
  const [tplMsg, setTplMsg] = useState<string | null>(null)

  const deleteSlot = async (slotId: string) => {
    if (deletingId) return
    if (!confirm('წავშალო ეს სლოტი?')) return
    setDeletingId(slotId)
    try {
      const res = await fetch(`/api/tutor/availability/${slotId}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        const m = j.error === 'SLOT_BOOKED' ? 'ეს დროზე უკვე დაჯავშნილია — წაშლა შეუძლებელია' : 'წაშლა ვერ მოხერხდა'
        setErr(m)
        return
      }
      setSlots(prev => (prev ?? []).filter(s => s.id !== slotId))
      toast('სლოტი წაიშალა', 'success')
    } catch { setErr('ქსელის შეცდომა') }
    finally { setDeletingId(null) }
  }

  const submitTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setTplSaving(true); setTplErr(null); setTplMsg(null)
    try {
      if (tplEndHour <= tplStartHour) { setTplErr('დასრულების საათი დაწყებაზე გვიან უნდა იყოს'); return }
      const selected = tplDays.map((v, i) => v ? i : -1).filter(i => i >= 0)
      if (selected.length === 0) { setTplErr('აირჩიე მინიმუმ ერთი დღე'); return }
      // Split the picked time range into 1-hour blocks per selected weekday.
      // This matches how tutors add slots manually and keeps the picker on
      // /tutors/[id] able to enumerate any duration (30/60) inside.
      const blocks = selected.flatMap(day =>
        Array.from({ length: tplEndHour - tplStartHour }, (_, k) => ({
          day,
          startHour: tplStartHour + k,
          endHour: tplStartHour + k + 1,
        }))
      )
      const res = await fetch('/api/tutor/availability/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, weeks: tplWeeks }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        const map: Record<string, string> = {
          BAD_RANGE: 'დროის დიაპაზონი არასწორია',
          INVALID: 'შეავსე ყველა ველი',
          NO_PROFILE: 'ექსპერტის პროფილი არ არსებობს',
        }
        setTplErr(map[j.error] ?? 'შექმნა ვერ მოხერხდა')
        return
      }
      // Refresh slots list from server so the new rows appear in the grid.
      const sRes = await fetch('/api/tutor/availability').then(r => r.json()).catch(() => null)
      if (sRes?.slots) setSlots(sRes.slots)
      setTplMsg(`შეიქმნა ${j.created} სლოტი` + (j.skipped ? ` · ${j.skipped} გამოტოვდა (გადაფარვა)` : ''))
      toast(`შეიქმნა ${j.created} სლოტი`, 'success')
      // Auto-close on success after a beat so the user reads the count.
      setTimeout(() => { setTplOpen(false); setTplMsg(null) }, 1600)
    } catch { setTplErr('ქსელის შეცდომა') }
    finally { setTplSaving(false) }
  }

  const submitBlockOff = async (e: React.FormEvent) => {
    e.preventDefault()
    setBlocking(true); setBlockErr(null)
    try {
      const from = new Date(blockForm.from + 'T00:00:00')
      const to = new Date(blockForm.to + 'T23:59:59')
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
        setBlockErr('არასწორი თარიღი — from ≤ to'); return
      }
      // Grab unbooked slots inside the range from local state, delete each server-side.
      const toDelete = (slots ?? []).filter(s => {
        if (s.booked) return false
        const start = new Date(s.startAt).getTime()
        return start >= from.getTime() && start <= to.getTime()
      })
      if (toDelete.length === 0) {
        setBlockErr('ამ პერიოდში წასაშლელი (თავისუფალი) სლოტი არ არის'); return
      }
      const results = await Promise.all(
        toDelete.map(s => fetch(`/api/tutor/availability/${s.id}`, { method: 'DELETE' })
          .then(r => r.ok ? s.id : null)
          .catch(() => null))
      )
      const okIds = new Set(results.filter((x): x is string => !!x))
      setSlots(prev => (prev ?? []).filter(s => !okIds.has(s.id)))
      setBlockOpen(false)
      setBlockForm({ from: '', to: '' })
      toast(`წაიშალა ${okIds.size} თავისუფალი სლოტი`, 'success')
    } catch { setBlockErr('ქსელის შეცდომა') }
    finally { setBlocking(false) }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [meRes, bRes, sRes] = await Promise.all([
          fetch('/api/me').then(r => r.json()),
          fetch('/api/tutor/bookings').then(r => r.json()),
          fetch('/api/tutor/availability').then(r => r.json()),
        ])
        if (cancelled) return
        setMe(meRes?.user ?? null)
        setBookings(bRes?.bookings ?? [])
        setSlots(sRes?.slots ?? [])
      } catch {
        if (!cancelled) setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const grid = useMemo(() => {
    const bookingsByCell: Record<string, Booking[]> = {}
    const slotsByCell: Record<string, Slot[]> = {}
    // Key by (dayIndex-in-week, hour) computed AGAINST weekStart. Without this,
    // bookings from every past week collapse into the same weekday cell and the
    // Prev/Next arrows change only the header label, not what appears in cells.
    const weekEnd = addDays(weekStart, 7)
    for (const b of bookings ?? []) {
      const d = new Date(b.startAt)
      if (d < weekStart || d >= weekEnd) continue
      const dayIdx = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))
      const key = `${dayIdx}-${d.getHours()}`
      ;(bookingsByCell[key] ||= []).push(b)
    }
    for (const s of slots ?? []) {
      const d = new Date(s.startAt)
      if (d < weekStart || d >= weekEnd) continue
      const dayIdx = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))
      const key = `${dayIdx}-${d.getHours()}`
      ;(slotsByCell[key] ||= []).push(s)
    }
    return { bookingsByCell, slotsByCell }
  }, [bookings, slots, weekStart])

  const openModalFor = (dayIdx: number, hour: number) => {
    const day = addDays(weekStart, dayIdx)
    const start = new Date(day); start.setHours(hour, 0, 0, 0)
    const end = new Date(start); end.setHours(hour + 1, 0, 0, 0)
    setForm({ startAt: toLocalInput(start), endAt: toLocalInput(end) })
    setModalOpen(true)
  }

  const submitSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setModalErr(null)
    try {
      const start = new Date(form.startAt)
      const end = new Date(form.endAt)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        setModalErr('არასწორი თარიღი'); return
      }
      if (end <= start) {
        setModalErr('დაწყების დრო უფრო ადრეა ვიდრე დასრულების'); return
      }
      if (start < new Date()) {
        setModalErr('სლოტი წარსულში ვერ იქნება'); return
      }
      const res = await fetch('/api/tutor/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        const map: Record<string, string> = {
          BAD_RANGE: 'დაწყების დრო უფრო ადრეა ვიდრე დასრულების',
          PAST_DATE: 'სლოტი წარსულში ვერ იქნება',
          OVERLAP: 'ეს დრო უკვე დაკავებულია სხვა სლოტით',
          NO_PROFILE: 'ექსპერტის პროფილი არ არსებობს',
        }
        setModalErr(map[j.error] ?? 'სლოტის დამატება ვერ მოხერხდა')
        return
      }
      setSlots(prev => [...(prev ?? []), j.slot])
      setModalOpen(false)
      toast('სლოტი დაემატა', 'success')
    } catch {
      setModalErr('ქსელის შეცდომა — სცადე თავიდან')
    } finally {
      setSaving(false)
    }
  }

  const loading = bookings === null || slots === null

  // Count of upcoming, still-free slots. Zero means clients literally cannot
  // book this expert — surfaced as an activation banner above the grid.
  const upcomingFree = useMemo(
    () => (slots ?? []).filter(s => !s.booked && new Date(s.startAt).getTime() > Date.now()).length,
    [slots],
  )

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <TutorAppBar user={me ? { name: me.fullName, avatar: me.avatarUrl ?? undefined } : undefined} />

      <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-[26px] font-bold tracking-tight text-ink-900">გრაფიკი</h1>
            <p className="text-[13px] text-ink-500 mt-1">კვირეული ხელმისაწვდომობა და ჯავშნები</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="წინა კვირა"
                    className="h-11 w-11 rounded-btn border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 inline-flex items-center justify-center">
              <Icon.chevR className="w-4 h-4 rotate-180" />
            </button>
            <div className="font-display text-[13px] font-semibold text-ink-800 tabular-nums px-2 whitespace-nowrap">{fmtRangeLabel(weekStart)}</div>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="შემდეგი კვირა"
                    className="h-11 w-11 rounded-btn border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 inline-flex items-center justify-center">
              <Icon.chevR className="w-4 h-4" />
            </button>
            <Btn variant="primary" size="sm" onClick={() => openModalFor(0, 9)}>
              <Icon.plus className="w-4 h-4" /> სლოტის დამატება
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setTplOpen(true)}>
              ყოველკვირეული განრიგი
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setBlockOpen(true)}>
              შვებულების პერიოდი
            </Btn>
          </div>
        </div>

        {err && (
          <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-[13px] flex items-start justify-between gap-3">
            <span className="min-w-0">{err}</span>
            <button
              type="button"
              onClick={() => setErr(null)}
              aria-label="დახურვა"
              className="shrink-0 -mr-1 -mt-1 w-7 h-7 inline-flex items-center justify-center rounded-btn text-danger-700 hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-300"
            >
              <Icon.close className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Empty-availability explainer — why slots matter + direct add CTAs */}
        {!loading && upcomingFree === 0 && (
          <div className="mb-4 rounded-card border border-warning-300 bg-warning-50 p-4 sm:p-5 flex items-start sm:items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-9 h-9 rounded-btn bg-warning-100 text-warning-700 inline-flex items-center justify-center shrink-0">
                <Icon.calendar className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[14px] font-bold text-ink-900">მომავალი ხელმისაწვდომი დრო არ გაქვს</div>
                <p className="text-[12.5px] text-ink-600 mt-0.5 leading-snug">სლოტების გარეშე კლიენტები ვერ დაგიჯავშნიან — ჯავშანი მხოლოდ გამოქვეყნებულ დროზეა შესაძლებელი. დაამატე ცალკეული სლოტი ან შექმენი ყოველკვირეული განრიგი.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Btn variant="primary" size="sm" onClick={() => openModalFor(0, 9)}>
                <Icon.plus className="w-4 h-4" /> სლოტის დამატება
              </Btn>
              <Btn variant="secondary" size="sm" onClick={() => setTplOpen(true)}>ყოველკვირეული განრიგი</Btn>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden" aria-busy="true">
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-ink-200 bg-ink-50">
              <div />
              {DAY_LABELS.map((_, i) => (
                <div key={i} className="px-2 py-3 border-l border-ink-200 space-y-1.5">
                  <Skeleton.Line width={60} className="h-2.5" />
                  <Skeleton.Line width={30} className="h-3" />
                </div>
              ))}
            </div>
            <div>
              {Array.from({ length: 6 }).map((_, r) => (
                <div key={r} className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-ink-100 min-h-[64px]">
                  <div className="px-2 py-2 border-r border-ink-100">
                    <Skeleton.Line width={70} className="h-2.5" />
                  </div>
                  {Array.from({ length: 7 }).map((_, c) => (
                    <div key={c} className="border-l border-ink-100 p-1.5">
                      <Skeleton className="h-6 w-full" rounded="rounded-field" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Below lg the 7-day grid scrolls horizontally at a readable column
          // width instead of compressing to ~40px columns. Header + body share
          // one scroll container so they stay aligned.
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-ink-200 bg-ink-50">
              <div />
              {DAY_LABELS.map((d, i) => {
                const day = addDays(weekStart, i)
                const isToday = day.toDateString() === new Date().toDateString()
                return (
                  <div key={d} className="px-2 py-3 text-center border-l border-ink-200">
                    <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">{d}</div>
                    <div className={`text-[13px] font-bold tabular-nums ${isToday ? 'text-brand-700' : 'text-ink-800'}`}>{day.getDate()}</div>
                  </div>
                )
              })}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {HOURS.map(h => (
                <div key={h} className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-ink-100 min-h-[64px]">
                  <div className="px-2 py-2 text-[11px] font-mono text-ink-400 border-r border-ink-100 tabular-nums">
                    {String(h).padStart(2, '0')}:00
                  </div>
                  {Array.from({ length: 7 }, (_, dayIdx) => {
                    const key = `${dayIdx}-${h}`
                    const cellBookings = grid.bookingsByCell[key] ?? []
                    const cellSlots = grid.slotsByCell[key] ?? []
                    return (
                      <button
                        key={dayIdx}
                        type="button"
                        onClick={() => openModalFor(dayIdx, h)}
                        className="border-l border-ink-100 hover:bg-brand-50/40 transition-colors text-left p-1 group relative"
                      >
                        {cellBookings.map(b => (
                          // Click booking pill → open booking detail. `stopPropagation`
                          // so the outer cell's "add slot" handler doesn't fire.
                          <Link
                            key={b.id}
                            href={`/tutor/bookings/${b.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block rounded-field bg-brand-50 border border-brand-200 text-brand-800 px-1.5 py-1 mb-1 hover:bg-brand-100 transition-colors"
                          >
                            <div className="text-[10.5px] font-display font-bold truncate">{b.student?.fullName ?? 'ჯავშანი'}</div>
                            <div className="text-[10px] truncate opacity-80">{b.topic}</div>
                          </Link>
                        ))}
                        {cellSlots.map(s => (
                          <div
                            key={s.id}
                            onClick={(e) => { e.stopPropagation(); if (!s.booked) deleteSlot(s.id) }}
                            className={`rounded-field border border-dashed px-1.5 py-1 mb-1 transition-colors ${
                              s.booked
                                ? 'bg-brand-50 border-brand-300 text-brand-800 cursor-default'
                                : 'bg-success-50 border-success-300 text-success-800 cursor-pointer hover:bg-danger-50 hover:border-danger-300 hover:text-danger-700'
                            }`}
                            title={s.booked ? 'დაჯავშნილი — ვერ წაიშლება' : 'დააკლიკე წასაშლელად'}
                          >
                            <div className="text-[10.5px] font-display font-bold flex items-center justify-between gap-1">
                              <span>{s.booked ? 'დაჯავშნილი' : 'ხელმისაწვდომია'}</span>
                              {!s.booked && (
                                <span className="text-[9px] opacity-70">{deletingId === s.id ? '…' : '×'}</span>
                              )}
                            </div>
                          </div>
                        ))}
                        {cellBookings.length === 0 && cellSlots.length === 0 && (
                          <div className="opacity-0 group-hover:opacity-100 text-ink-400 text-[10px] p-1 transition">+ დამატება</div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          </div>
          </div>
        )}
      </main>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/40 flex items-center justify-center p-4"
          onClick={() => { setModalOpen(false); setModalErr(null) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-card bg-white shadow-float p-6 motion-safe:animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[18px] font-bold text-ink-900">ხელმისაწვდომობის სლოტი</h2>
              <button type="button" aria-label="დახურვა" onClick={() => { setModalOpen(false); setModalErr(null) }} className="w-8 h-8 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
                <Icon.close className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitSlot} className="space-y-4">
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">დაწყება</label>
                <input type="datetime-local" required value={form.startAt}
                       onChange={e => setForm({ ...form, startAt: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
              </div>
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">დასრულება</label>
                <input type="datetime-local" required value={form.endAt}
                       onChange={e => setForm({ ...form, endAt: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
              </div>
              {modalErr && (
                <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[12.5px]">
                  {modalErr}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Btn variant="ghost" size="md" type="button" onClick={() => { setModalOpen(false); setModalErr(null) }}>გაუქმება</Btn>
                <Btn variant="primary" size="md" type="submit" disabled={saving}>
                  {saving ? 'ინახება…' : 'დამატება'}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {tplOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/40 flex items-center justify-center p-4"
          onClick={() => { setTplOpen(false); setTplErr(null); setTplMsg(null) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-card bg-white shadow-float p-6 motion-safe:animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[18px] font-bold text-ink-900">ყოველკვირეული განრიგი</h2>
              <button type="button" aria-label="დახურვა" onClick={() => { setTplOpen(false); setTplErr(null); setTplMsg(null) }} className="w-8 h-8 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center">
                <Icon.close className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12.5px] text-ink-500 mb-4 leading-snug">
              მონიშნე დღეები და საათი — ეს ტემპლეიტი გამრავლდება მოცემული კვირების რაოდენობაზე. უკვე არსებული ან გადამფარავი სლოტები გამოტოვდება.
            </p>
            <form onSubmit={submitTemplate} className="space-y-5">
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-2">დღეები</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTplDays(prev => prev.map((v, j) => j === i ? !v : v))}
                      className={`h-11 rounded-btn font-display font-bold text-[12px] tracking-wide border transition-colors ${
                        tplDays[i]
                          ? 'bg-brand-500 border-brand-500 text-white'
                          : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">დაწყება</label>
                  <select value={tplStartHour} onChange={e => setTplStartHour(Number(e.target.value))}
                          className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none">
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">დასრულება</label>
                  <select value={tplEndHour} onChange={e => setTplEndHour(Number(e.target.value))}
                          className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none">
                    {Array.from({ length: 24 }, (_, h) => h + 1).map(h => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">კვირების რაოდენობა</label>
                <div className="flex gap-1.5">
                  {[1, 2, 4, 8, 12].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setTplWeeks(w)}
                      className={`h-10 flex-1 rounded-btn font-display font-bold text-[13px] tabular-nums border transition-colors ${
                        tplWeeks === w
                          ? 'bg-brand-500 border-brand-500 text-white'
                          : 'bg-white border-ink-200 text-ink-700 hover:border-ink-300'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-btn bg-ink-50 border border-ink-200 px-3 py-2.5 text-[12.5px] text-ink-700">
                {(() => {
                  const days = tplDays.filter(Boolean).length
                  const hours = Math.max(0, tplEndHour - tplStartHour)
                  const est = days * hours * tplWeeks
                  return est > 0
                    ? <>დაახლ. <span className="font-display font-bold tabular-nums">{est}</span> სლოტი (1-საათიანი)</>
                    : <>აირჩიე დღეები და დროის დიაპაზონი</>
                })()}
              </div>
              {tplErr && (
                <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[12.5px]">
                  {tplErr}
                </div>
              )}
              {tplMsg && (
                <div className="p-2.5 rounded-btn bg-success-50 border border-success-200 text-success-800 text-[12.5px]">
                  {tplMsg}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Btn variant="ghost" size="md" type="button" onClick={() => { setTplOpen(false); setTplErr(null); setTplMsg(null) }}>გაუქმება</Btn>
                <Btn variant="primary" size="md" type="submit" disabled={tplSaving}>
                  {tplSaving ? 'იქმნება…' : 'შექმნა'}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {blockOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/40 flex items-center justify-center p-4"
          onClick={() => { setBlockOpen(false); setBlockErr(null) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-card bg-white shadow-float p-6 motion-safe:animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[18px] font-bold text-ink-900">შვებულების პერიოდი</h2>
              <button type="button" aria-label="დახურვა" onClick={() => { setBlockOpen(false); setBlockErr(null) }} className="w-8 h-8 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center">
                <Icon.close className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12.5px] text-ink-500 mb-4 leading-snug">ამ პერიოდში არსებული ყველა <span className="font-display font-semibold text-ink-700">თავისუფალი</span> სლოტი წაიშლება. უკვე დაჯავშნილი სესიები არ დაზარალდება.</p>
            <form onSubmit={submitBlockOff} className="space-y-4">
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">დაწყება</label>
                <input type="date" required value={blockForm.from} min={new Date().toISOString().slice(0, 10)}
                       onChange={e => setBlockForm({ ...blockForm, from: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
              </div>
              <div>
                <label className="block font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 mb-1.5">დასრულება</label>
                <input type="date" required value={blockForm.to} min={blockForm.from || new Date().toISOString().slice(0, 10)}
                       onChange={e => setBlockForm({ ...blockForm, to: e.target.value })}
                       className="w-full h-11 px-3 rounded-field border border-ink-200 bg-white text-[14px] text-ink-900 focus:border-brand-400 focus:outline-none" />
              </div>
              {blockErr && (
                <div className="p-2.5 rounded-btn bg-danger-50 border border-danger-200 text-danger-700 text-[12.5px]">
                  {blockErr}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Btn variant="ghost" size="md" type="button" onClick={() => { setBlockOpen(false); setBlockErr(null) }}>გაუქმება</Btn>
                <Btn variant="primary" size="md" type="submit" disabled={blocking}>
                  {blocking ? 'იშლება…' : 'დაბლოკვა'}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}
