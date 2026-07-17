'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useToast } from '@/components/ToastProvider'
import { PageHeader } from '@/components/tutor/PageHeader'

type Booking = {
  id: string
  topic: string
  startAt: string
  durationMin: number
  status: string
  student?: { fullName: string } | null
}
type Slot = { id: string; startAt: string; endAt: string; booked: boolean }
const DAY_LABELS = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი']
// Default visible band; "ყველა საათი" expands to the full range. Hours the
// visible week actually occupies are always unioned in so nothing hides.
const HOURS_DEFAULT: [number, number] = [9, 19]
const HOURS_FULL: [number, number] = [8, 22]

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

function fmtTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TutorSchedulePage() {
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  // Mobile day-list view: which weekday (0=Mon) is expanded. Defaults to today.
  const [selectedDay, setSelectedDay] = useState<number>(() => (new Date().getDay() + 6) % 7)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
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
  const [allHours, setAllHours] = useState(false)
  // Exact upcoming-free count from the server (independent of the list cap).
  const [serverFreeCount, setServerFreeCount] = useState<number | null>(null)

  // Deletion is always confirmed through <ConfirmModal> (native confirm() is
  // banned in this codebase) — callers set confirmDeleteId, the modal calls this.
  const deleteSlot = async (slotId: string) => {
    if (deletingId) return
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
    finally { setDeletingId(null); setConfirmDeleteId(null) }
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
      if (typeof sRes?.upcomingFreeCount === 'number') setServerFreeCount(sRes.upcomingFreeCount)
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
        const [bRes, sRes] = await Promise.all([
          fetch('/api/tutor/bookings').then(r => r.json()),
          fetch('/api/tutor/availability').then(r => r.json()),
        ])
        if (cancelled) return
        setBookings(bRes?.bookings ?? [])
        setSlots(sRes?.slots ?? [])
        if (typeof sRes?.upcomingFreeCount === 'number') setServerFreeCount(sRes.upcomingFreeCount)
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

  // Mobile day-list: merged chronological agenda for the selected weekday.
  // Booked slots whose startAt matches a booking are dropped — the booking row
  // already occupies that time and a duplicate "დაჯავშნილი" row reads as noise.
  const dayEntries = useMemo(() => {
    const dayStart = addDays(weekStart, selectedDay)
    const dayEnd = addDays(dayStart, 1)
    const out: Array<
      | { kind: 'booking'; at: number; booking: Booking }
      | { kind: 'slot'; at: number; slot: Slot }
    > = []
    const bookingStarts = new Set<number>()
    for (const b of bookings ?? []) {
      const d = new Date(b.startAt)
      if (d < dayStart || d >= dayEnd) continue
      bookingStarts.add(d.getTime())
      out.push({ kind: 'booking', at: d.getTime(), booking: b })
    }
    for (const s of slots ?? []) {
      const d = new Date(s.startAt)
      if (d < dayStart || d >= dayEnd) continue
      if (s.booked && bookingStarts.has(d.getTime())) continue
      out.push({ kind: 'slot', at: d.getTime(), slot: s })
    }
    return out.sort((a, b) => a.at - b.at)
  }, [bookings, slots, weekStart, selectedDay])

  // Per-weekday activity for the mobile day rail (dot indicators).
  const dayCounts = useMemo(() => {
    const counts = Array.from({ length: 7 }, () => ({ bookings: 0, free: 0 }))
    const weekEnd = addDays(weekStart, 7)
    const dayIdxOf = (iso: string) => {
      const d = new Date(iso)
      if (d < weekStart || d >= weekEnd) return -1
      return Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))
    }
    for (const b of bookings ?? []) {
      const i = dayIdxOf(b.startAt)
      if (i >= 0 && i < 7) counts[i].bookings++
    }
    for (const s of slots ?? []) {
      if (s.booked) continue
      const i = dayIdxOf(s.startAt)
      if (i >= 0 && i < 7) counts[i].free++
    }
    return counts
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
  // Server count is exact (list is capped at 500 rows); fall back to the
  // local list while loading.
  const localFree = useMemo(
    () => (slots ?? []).filter(s => !s.booked && new Date(s.startAt).getTime() > Date.now()).length,
    [slots],
  )
  const upcomingFree = serverFreeCount ?? localFree

  // Booked sessions inside the visible week (summary chip).
  const weekBooked = useMemo(() => {
    const weekEnd = addDays(weekStart, 7)
    return (bookings ?? []).filter(b => {
      const d = new Date(b.startAt)
      return d >= weekStart && d < weekEnd && (b.status === 'CONFIRMED' || b.status === 'LIVE' || b.status === 'PREPARING')
    }).length
  }, [bookings, weekStart])

  // Dynamic hour band: default 9–19, expanded to 8–22 on demand, always
  // unioned with hours the visible week actually occupies.
  const hours = useMemo(() => {
    let [lo, hi] = allHours ? HOURS_FULL : HOURS_DEFAULT
    const weekEnd = addDays(weekStart, 7)
    const consider = (iso: string) => {
      const d = new Date(iso)
      if (d < weekStart || d >= weekEnd) return
      lo = Math.min(lo, d.getHours())
      hi = Math.max(hi, d.getHours() + 1)
    }
    for (const b of bookings ?? []) consider(b.startAt)
    for (const sl of slots ?? []) consider(sl.startAt)
    return Array.from({ length: hi - lo }, (_, i) => lo + i)
  }, [allHours, bookings, slots, weekStart])

  return (
    <div>
        {/* Header: canonical PageHeader (title/sub + week nav in the actions
            slot, wrapping below on mobile), then the chips/actions row. */}
        <div className="mb-5 lg:mb-6 space-y-3">
          <PageHeader
            title="გრაფიკი"
            sub="კვირეული ხელმისაწვდომობა და ჯავშნები"
            actions={
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="წინა კვირა"
                        className="h-11 w-11 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 inline-flex items-center justify-center">
                  <Icon.chevR className="w-4 h-4 rotate-180" />
                </button>
                <div className="flex-1 lg:flex-none text-center font-display text-[13px] font-semibold text-ink-800 tabular-nums px-2 whitespace-nowrap">{fmtRangeLabel(weekStart)}</div>
                <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="შემდეგი კვირა"
                        className="h-11 w-11 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 inline-flex items-center justify-center">
                  <Icon.chevR className="w-4 h-4" />
                </button>
              </div>
            }
          />
          {/* Weekly template is the promoted flow — it's how availability
              actually gets published at scale; one-off slots and vacation
              are the quieter secondaries. */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-between">
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display font-semibold ${
                !loading && upcomingFree === 0
                  ? 'bg-warning-50 border-warning-200 text-warning-800'
                  : 'bg-brand-50 border-brand-200 text-brand-800'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                {loading ? '…' : `${upcomingFree} თავისუფალი სლოტი`}
              </span>
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border border-ink-200 bg-white text-ink-600 font-display font-semibold">
                {loading ? '…' : `${weekBooked} ჯავშანი ამ კვირაში`}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:flex lg:items-center gap-2 w-full lg:w-auto">
              <Btn variant="primary" size="md" className="col-span-2 lg:col-span-1 lg:h-9 lg:px-3.5 lg:text-[12.5px]" onClick={() => setTplOpen(true)}>
                <Icon.calendar className="w-4 h-4" /> ყოველკვირეული განრიგი
              </Btn>
              <Btn variant="secondary" size="md" className="lg:h-9 lg:px-3.5 lg:text-[12.5px]" onClick={() => openModalFor(selectedDay, 9)}>
                <Icon.plus className="w-4 h-4" /> სლოტი
              </Btn>
              <Btn variant="ghost" size="md" className="lg:h-9 lg:px-3.5 lg:text-[12.5px]" onClick={() => setBlockOpen(true)}>
                შვებულება
              </Btn>
            </div>
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
              <Btn variant="primary" size="sm" onClick={() => openModalFor(selectedDay, 9)}>
                <Icon.plus className="w-4 h-4" /> სლოტის დამატება
              </Btn>
              <Btn variant="secondary" size="sm" onClick={() => setTplOpen(true)}>ყოველკვირეული განრიგი</Btn>
            </div>
          </div>
        )}

        {loading ? (
          <>
          {/* Mobile loading: day-rail + agenda-row skeletons */}
          <div className="lg:hidden" aria-busy="true">
            <div className="grid grid-cols-7 gap-1.5 mb-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-[56px] w-full" rounded="rounded-btn" />
              ))}
            </div>
            <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 flex items-center gap-3 min-h-[64px]">
                  <div className="w-[76px] space-y-1.5"><Skeleton.Line width={52} className="h-3.5" /><Skeleton.Line width={40} className="h-2.5" /></div>
                  <div className="flex-1 space-y-1.5"><Skeleton.Line width={140} className="h-3.5" /><Skeleton.Line width={90} className="h-2.5" /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block rounded-card border border-ink-200 bg-white overflow-hidden" aria-busy="true">
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
          </>
        ) : (
          <>
          {/* ── Mobile (<lg): day-list view ──────────────────────────────
              A week grid can't breathe on a phone; instead: 7-day selector
              rail + a chronological agenda for the picked day, with big
              tap-safe rows and an inline add CTA. */}
          <div className="lg:hidden">
            <div className="grid grid-cols-7 gap-1.5 mb-4">
              {DAY_LABELS.map((d, i) => {
                const day = addDays(weekStart, i)
                const isToday = day.toDateString() === new Date().toDateString()
                const sel = selectedDay === i
                const c = dayCounts[i]
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDay(i)}
                    aria-pressed={sel}
                    className={`h-[56px] rounded-btn border flex flex-col items-center justify-center gap-0.5 transition-colors ${
                      sel ? 'bg-ink-900 border-ink-900 text-white' : 'bg-white border-ink-200 text-ink-800 hover:border-ink-300'
                    }`}
                  >
                    <span className={`font-display text-[10px] font-semibold uppercase tracking-[0.1em] ${sel ? 'text-white/70' : 'text-ink-500'}`}>{d}</span>
                    <span className={`text-[14px] font-bold tabular-nums leading-none ${!sel && isToday ? 'text-brand-700' : ''}`}>{day.getDate()}</span>
                    <span className="flex gap-0.5 h-1">
                      {c.bookings > 0 && <span className={`w-1 h-1 rounded-full ${sel ? 'bg-white' : 'bg-brand-500'}`} />}
                      {c.free > 0 && <span className={`w-1 h-1 rounded-full ${sel ? 'bg-white/50' : 'bg-ink-300'}`} />}
                    </span>
                  </button>
                )
              })}
            </div>

            {dayEntries.length === 0 ? (
              <div className="rounded-card border border-ink-200 bg-white p-6 text-center">
                <p className="text-[13.5px] text-ink-600">ამ დღეს არც სლოტი გაქვს და არც ჯავშანი</p>
                <Btn variant="secondary" size="md" className="mt-4 w-full" onClick={() => openModalFor(selectedDay, 9)}>
                  <Icon.plus className="w-4 h-4" /> სლოტის დამატება
                </Btn>
              </div>
            ) : (
              <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
                {dayEntries.map(e =>
                  e.kind === 'booking' ? (
                    <Link
                      key={`b-${e.booking.id}`}
                      href={`/tutor/bookings/${e.booking.id}`}
                      className="flex items-center gap-3 p-4 min-h-[64px] active:bg-ink-50 transition-colors"
                    >
                      <div className="w-[72px] shrink-0">
                        <div className="text-[13.5px] font-display font-bold text-ink-900 tabular-nums">{fmtTime(e.booking.startAt)}</div>
                        <div className="text-[11px] text-ink-400 tabular-nums">{e.booking.durationMin} წთ</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-display font-bold text-ink-900 truncate">{e.booking.student?.fullName ?? 'ჯავშანი'}</div>
                        <div className="text-[12.5px] text-ink-500 truncate">{e.booking.topic}</div>
                      </div>
                      <span className="shrink-0 h-6 px-2 rounded-pill bg-brand-50 text-brand-700 text-[10.5px] font-display font-bold inline-flex items-center">ჯავშანი</span>
                      <Icon.chevR className="w-4 h-4 text-ink-300 shrink-0" />
                    </Link>
                  ) : (
                    <div key={`s-${e.slot.id}`} className="flex items-center gap-3 p-4 min-h-[64px]">
                      <div className="w-[72px] shrink-0">
                        <div className="text-[13.5px] font-display font-bold text-ink-900 tabular-nums">{fmtTime(e.slot.startAt)}</div>
                        <div className="text-[11px] text-ink-400 tabular-nums">— {fmtTime(e.slot.endAt)}</div>
                      </div>
                      <div className="min-w-0 flex-1 text-[13px]">
                        {e.slot.booked
                          ? <span className="text-ink-500">დაჯავშნილი სლოტი</span>
                          : <span className="text-success-700 font-display font-semibold">ხელმისაწვდომია</span>}
                      </div>
                      {!e.slot.booked && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(e.slot.id)}
                          disabled={deletingId === e.slot.id}
                          aria-label="სლოტის წაშლა"
                          className="shrink-0 w-11 h-11 rounded-btn border border-ink-200 text-ink-500 hover:text-danger-600 hover:border-danger-300 hover:bg-danger-50 inline-flex items-center justify-center transition-colors disabled:opacity-50"
                        >
                          <Icon.close className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                )}
                <button
                  type="button"
                  onClick={() => openModalFor(selectedDay, 9)}
                  className="w-full p-4 min-h-[56px] text-[13px] font-display font-semibold text-brand-700 hover:bg-brand-50/50 active:bg-brand-50 inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Icon.plus className="w-4 h-4" /> სლოტის დამატება ამ დღეს
                </button>
              </div>
            )}
          </div>

          {/* ── Desktop (lg+): 7-day week grid ─────────────────────────── */}
          <div className="hidden lg:block rounded-card border border-ink-200 bg-white overflow-hidden">
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
              {hours.map(h => (
                <div key={h} className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-ink-100 min-h-[64px]">
                  <div className="px-2 py-2 text-[11px] font-mono text-ink-400 border-r border-ink-100 tabular-nums">
                    {String(h).padStart(2, '0')}:00
                  </div>
                  {Array.from({ length: 7 }, (_, dayIdx) => {
                    const key = `${dayIdx}-${h}`
                    const cellBookings = grid.bookingsByCell[key] ?? []
                    const cellSlots = grid.slotsByCell[key] ?? []
                    const isTodayCol = addDays(weekStart, dayIdx).toDateString() === new Date().toDateString()
                    return (
                      // Plain cell wrapper — never a <button>: the cell holds
                      // booking <Link>s and slot delete <button>s, and nesting
                      // interactives is invalid/inaccessible. The add-slot
                      // affordance is an absolutely-positioned button filling
                      // the cell background; pills/chips sit above it (z-10).
                      <div
                        key={dayIdx}
                        className={`border-l border-ink-100 p-1 group relative ${isTodayCol ? 'bg-brand-50/20' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => openModalFor(dayIdx, h)}
                          aria-label={`სლოტის დამატება — ${DAY_LABELS[dayIdx]} ${addDays(weekStart, dayIdx).getDate()}, ${String(h).padStart(2, '0')}:00`}
                          className="absolute inset-0 group-hover:bg-brand-50/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                        />
                        {cellBookings.map(b => (
                          // Click booking pill → open booking detail. Sibling of
                          // the add-slot button (not nested), lifted above it.
                          // White card + brand left bar: booked ≠ decorative wash.
                          <Link
                            key={b.id}
                            href={`/tutor/bookings/${b.id}`}
                            className="relative z-10 block rounded-field bg-white border border-ink-200 border-l-[3px] border-l-brand-500 text-ink-800 px-1.5 py-1 mb-1 hover:border-ink-300 hover:shadow-xs transition-all"
                          >
                            <div className="text-[10.5px] font-display font-bold truncate">{b.student?.fullName ?? 'ჯავშანი'}</div>
                            <div className="text-[10px] truncate text-ink-500">{b.topic}</div>
                          </Link>
                        ))}
                        {cellSlots.map(s => {
                          const chipInner = (
                            <div className="text-[10.5px] font-display font-bold flex items-center justify-between gap-1">
                              <span>{s.booked ? 'დაჯავშნილი' : 'თავისუფალი'}</span>
                              {!s.booked && (
                                <span className="text-[9px] opacity-0 group-hover/slot:opacity-100 transition-opacity">{deletingId === s.id ? '…' : '×'}</span>
                              )}
                            </div>
                          )
                          // Free slots delete via a real button (keyboard +
                          // screen-reader operable); booked ones stay inert.
                          return s.booked ? (
                            <div
                              key={s.id}
                              className="relative z-10 rounded-field px-1.5 py-1 mb-1 transition-colors bg-ink-50 border border-ink-200 text-ink-500 cursor-default"
                              title="დაჯავშნილი — ვერ წაიშლება"
                            >
                              {chipInner}
                            </div>
                          ) : (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setConfirmDeleteId(s.id)}
                              aria-label={`სლოტის წაშლა — ${fmtTime(s.startAt)}`}
                              title="დააკლიკე წასაშლელად"
                              className="group/slot relative z-10 block w-full text-left rounded-field px-1.5 py-1 mb-1 transition-colors bg-brand-50 border border-brand-100 text-brand-800 cursor-pointer hover:bg-danger-50 hover:border-danger-200 hover:text-danger-700"
                            >
                              {chipInner}
                            </button>
                          )
                        })}
                        {cellBookings.length === 0 && cellSlots.length === 0 && (
                          <div className="pointer-events-none opacity-0 group-hover:opacity-100 text-ink-400 text-[10px] p-1 transition">+ დამატება</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="border-t border-ink-100 px-3 py-2 flex justify-end">
              <button
                type="button"
                onClick={() => setAllHours(v => !v)}
                className="text-[11.5px] font-display font-semibold text-ink-500 hover:text-ink-800 inline-flex items-center gap-1.5 transition-colors"
              >
                <Icon.clock className="w-3.5 h-3.5" />
                {allHours ? 'ძირითადი საათები' : 'ყველა საათი (08–22)'}
              </button>
            </div>
          </div>
          </div>
          </div>
          </>
        )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => { setModalOpen(false); setModalErr(null) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md rounded-t-card sm:rounded-card bg-white shadow-float p-5 sm:p-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-6 max-h-[85vh] overflow-y-auto motion-safe:animate-scale-in" onClick={e => e.stopPropagation()}>
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
          className="fixed inset-0 z-50 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => { setTplOpen(false); setTplErr(null); setTplMsg(null) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-lg rounded-t-card sm:rounded-card bg-white shadow-float p-5 sm:p-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-6 max-h-[85vh] overflow-y-auto motion-safe:animate-scale-in" onClick={e => e.stopPropagation()}>
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
          className="fixed inset-0 z-50 bg-ink-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => { setBlockOpen(false); setBlockErr(null) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md rounded-t-card sm:rounded-card bg-white shadow-float p-5 sm:p-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-6 max-h-[85vh] overflow-y-auto motion-safe:animate-scale-in" onClick={e => e.stopPropagation()}>
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

      <ConfirmModal
        open={!!confirmDeleteId}
        title="წავშალო ეს სლოტი?"
        body="კლიენტები ამ დროს ვეღარ დაგიჯავშნიან. უკვე დაჯავშნილი სესიები არ იშლება."
        tone="danger"
        confirmLabel="წაშლა"
        busy={!!deletingId}
        onConfirm={() => { if (confirmDeleteId) void deleteSlot(confirmDeleteId) }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
