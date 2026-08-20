'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Btn } from '@/components/Btn'
import { Eyebrow } from '@/components/Eyebrow'
import { Icon } from '@/components/Icon'
import { Skeleton } from '@/components/Skeleton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Sheet } from '@/components/Sheet'
// One source for what a publishable window is, shared with POST/PATCH.
import { MAX_WINDOW_MS, windowErrorMessage, windowRangeError } from '@/lib/availabilityRules'
import { useToast } from '@/components/ToastProvider'
import { PageHeader } from '@/components/PageHeader'
import { KA_MONTHS_SHORT, KA_WEEKDAYS_SHORT } from '@/lib/kaDate'
import { subtractIntervals } from '@/lib/availability'
import {
  DAY_LABELS, HOURS_DEFAULT, HOURS_FULL, PREFILL_DAYS, PREFILL_END_HOUR, PREFILL_START_HOUR,
  TEMPLATE_PARAM, addDays, fmtDur, fmtRangeLabel, fmtSlotRange, fmtTime, overlapMinutes,
  startOfWeek, tbDateValue, tbDayNum, tbHour, tbStartOfDay, tbTimeValue, tbWeekdayMon0,
  tbilisiInstant, tbFrom, tbInputValue,
  type Booking, type Slot,
} from './_shared'
import { SlotSheet } from './_sheetSlot'
import { TemplateSheet } from './_sheetTemplate'
import { BlockOffSheet } from './_sheetBlock'


export default function TutorSchedulePage() {
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  // Mobile day-list view: which weekday (0=Mon) is expanded. Defaults to today.
  const [selectedDay, setSelectedDay] = useState<number>(() => tbWeekdayMon0(new Date()))
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [modalErr, setModalErr] = useState<string | null>(null)
  /* THE PICKER IS A DAY + A START + A LENGTH (2026-08-07).
   *
   * It was two `datetime-local` inputs. On a phone that is the native spinner
   * twice — and the second one asks again for the DATE the expert had just
   * tapped, then refuses the save if the end is not after the start (which is
   * what happens by default, because the end does not follow the start). The
   * owner's word for it was „არაკომფორტული"; the honest description is that
   * publishing one hour took two date pickers and usually two attempts.
   *
   * `editId` is what makes this sheet do double duty: null = publish a new
   * window, an id = PATCH that one. Before today there was no edit at all. */
  const [form, setForm] = useState({ date: '', start: '', durMin: 60, editId: null as string | null })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockForm, setBlockForm] = useState({ from: '', to: '' })
  const [blocking, setBlocking] = useState(false)
  const [blockErr, setBlockErr] = useState<string | null>(null)
  const [tplOpen, setTplOpen] = useState(false)
  // Pre-filled from the first render (see PREFILL_DAYS) — the form is never a
  // blank grid the expert has to figure out.
  const [tplDays, setTplDays] = useState<boolean[]>(() => [...PREFILL_DAYS])
  const [tplStartHour, setTplStartHour] = useState(PREFILL_START_HOUR)
  const [tplEndHour, setTplEndHour] = useState(PREFILL_END_HOUR)
  const [tplWeeks, setTplWeeks] = useState(4)
  const [tplSaving, setTplSaving] = useState(false)
  const [tplErr, setTplErr] = useState<string | null>(null)
  const [tplMsg, setTplMsg] = useState<string | null>(null)
  const [allHours, setAllHours] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  // Exact upcoming-free ROW count from the server (independent of the 500-row
  // list cap). Not shown to the expert — rows are windows, so a count says
  // nothing useful; it only answers „is there ANY published time" when the list
  // is truncated (see `noFreeTime`).
  const [serverFreeCount, setServerFreeCount] = useState<number | null>(null)
  // The expert's DEFAULT session length (15/30/60) — shown as context in the
  // weekly-template estimate. It no longer sizes what we publish: a row is a
  // window and the bookable starts inside it are derived from the service the
  // client picks. Default 60 (the typical 1hr consult) until the profile loads.
  const [durationMin, setDurationMin] = useState(60)

  // Deletion is always confirmed through <ConfirmModal> (native confirm() is
  // banned in this codebase) — callers set confirmDeleteId, the modal calls this.
  // The server no longer refuses a window that a booking sits inside (bookings
  // are independent rows now), so there is no BOOKED error branch to map — it
  // deletes and reports how many sessions stayed in force.
  const deleteSlot = async (slotId: string) => {
    if (deletingId) return
    setDeletingId(slotId)
    try {
      const res = await fetch(`/api/tutor/availability/${slotId}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr('წაშლა ვერ მოხერხდა')
        return
      }
      const removed = (slots ?? []).find(s => s.id === slotId)
      setSlots(prev => (prev ?? []).filter(s => s.id !== slotId))
      // Drop the row from the server-side upcoming count too. `freeIntervals`
      // (header chip + day rail) recomputes from `slots` on its own, but
      // `noFreeTime` also consults this cap-proof count — leaving it stale meant
      // deleting your LAST window still read as „you have published time".
      if (removed && new Date(removed.startAt).getTime() > Date.now()) {
        setServerFreeCount(c => (c === null ? c : Math.max(0, c - 1)))
      }
      const kept = typeof j.keptBookings === 'number' ? j.keptBookings : 0
      toast(kept > 0 ? `შუალედი წაიშალა · ${kept} ჯავშანი ძალაშია` : 'თავისუფალი შუალედი წაიშალა', 'success')
    } catch { setErr('ქსელის შეცდომა') }
    finally { setDeletingId(null); setConfirmDeleteId(null) }
  }

  // „სრულად წაშლა" — withdraws EVERY future window in one server-side sweep
  // (DELETE /api/tutor/availability/bulk). Only ever reached through
  // <ConfirmModal>, and the sessions inside those windows are untouched: a
  // booking is an independent row now, so un-publishing strands nothing.
  const clearAll = async () => {
    if (clearing) return
    setClearing(true); setErr(null)
    try {
      const res = await fetch('/api/tutor/availability/bulk', { method: 'DELETE' })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setErr('წაშლა ვერ მოხერხდა'); return }
      // Re-read instead of patching local state: the sweep is server-scoped
      // („ყველა მომავალი"), while the list we hold is capped at 500 rows — so
      // subtracting what we can see would leave a stale tail behind.
      const sRes = await fetch('/api/tutor/availability').then(r => r.json()).catch(() => null)
      if (sRes?.slots) setSlots(sRes.slots)
      setServerFreeCount(typeof sRes?.upcomingFreeCount === 'number' ? sRes.upcomingFreeCount : 0)
      const kept = typeof j.keptBookings === 'number' ? j.keptBookings : 0
      const n = typeof j.deleted === 'number' ? j.deleted : 0
      toast(kept > 0 ? `წაიშალა ${n} შუალედი · ${kept} ჯავშანი ძალაშია` : `წაიშალა ${n} შუალედი`, 'success')
    } catch { setErr('ქსელის შეცდომა') }
    finally { setClearing(false); setConfirmClear(false) }
  }

  // One-tap fill: set the weekday toggles + start/end from a preset, so the
  // existing „შექმნა" submit/estimate logic runs unchanged.
  const applyTplPreset = (dayIdxs: number[], start: number, end: number) => {
    setTplDays(Array.from({ length: 7 }, (_, i) => dayIdxs.includes(i)))
    setTplStartHour(start)
    setTplEndHour(end)
    setTplErr(null)
  }

  const submitTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setTplSaving(true); setTplErr(null); setTplMsg(null)
    try {
      if (tplEndHour <= tplStartHour) { setTplErr('დასრულების საათი დაწყებაზე გვიან უნდა იყოს'); return }
      const selected = tplDays.map((v, i) => v ? i : -1).filter(i => i >= 0)
      if (selected.length === 0) { setTplErr('აირჩიე მინიმუმ ერთი დღე'); return }
      // ONE window per selected weekday — the picked range is posted whole and
      // the server stores it as a single availability window. (This used to
      // pre-slice the range into `durationMin` pieces; that both wasted
      // inventory — a 15-წთ service ate a 60-წთ piece — and advertised times a
      // longer service could never use. See lib/availability.ts.)
      const blocks = selected.map(day => ({
        day,
        startHour: tplStartHour,
        startMin: 0,
        endHour: tplEndHour,
        endMin: 0,
      }))
      const res = await fetch('/api/tutor/availability/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, weeks: tplWeeks }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        // Same vocabulary as the single-window sheet — the two used to describe
        // an identical refusal in different words.
        setTplErr(windowErrorMessage(j?.error))
        return
      }
      // Refresh slots list from server so the new rows appear in the grid.
      const sRes = await fetch('/api/tutor/availability').then(r => r.json()).catch(() => null)
      if (sRes?.slots) setSlots(sRes.slots)
      if (typeof sRes?.upcomingFreeCount === 'number') setServerFreeCount(sRes.upcomingFreeCount)
      setTplMsg(`შეიქმნა ${j.created} თავისუფალი შუალედი` + (j.skipped ? ` · ${j.skipped} გამოტოვდა (გადაფარვა)` : ''))
      toast(`შეიქმნა ${j.created} თავისუფალი შუალედი`, 'success')
      // Auto-close on success after a beat so the user reads the count.
      setTimeout(() => { setTplOpen(false); setTplMsg(null) }, 1600)
    } catch { setTplErr('ქსელის შეცდომა') }
    finally { setTplSaving(false) }
  }

  const submitBlockOff = async (e: React.FormEvent) => {
    e.preventDefault()
    setBlocking(true); setBlockErr(null)
    try {
      // Tbilisi wall-clock, like every other date on this screen: the picked
      // days run from 00:00 to 23:59 IN TBILISI, not in the browser's zone.
      const from = tbilisiInstant(blockForm.from + 'T00:00')
      const to = tbilisiInstant(blockForm.to + 'T23:59')
      if (!from || !to || isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
        setBlockErr('არასწორი თარიღი — დაწყება ≤ დასრულება'); return
      }
      // Grab windows inside the range that still have BOOKABLE time left, and
      // delete each server-side. „Still free" is the same `windows − bookings`
      // truth the rest of the screen shows (never the legacy `booked` flag): a
      // window a client already filled has nothing left to withdraw, and the
      // sessions inside it stay in force either way.
      const toDelete = (slots ?? []).filter(s => {
        const start = new Date(s.startAt).getTime()
        if (start < from.getTime() || start > to.getTime()) return false
        return overlapMinutes(freeIntervals, start, new Date(s.endAt).getTime()) > 0
      })
      if (toDelete.length === 0) {
        setBlockErr('ამ პერიოდში წასაშლელი თავისუფალი დრო არ არის'); return
      }
      const results = await Promise.all(
        toDelete.map(s => fetch(`/api/tutor/availability/${s.id}`, { method: 'DELETE' })
          .then(r => r.ok ? s.id : null)
          .catch(() => null))
      )
      const okIds = new Set(results.filter((x): x is string => !!x))
      setSlots(prev => (prev ?? []).filter(s => !okIds.has(s.id)))
      // Same bookkeeping as the single delete: keep the cap-proof server count
      // in step so the „თავისუფალი დრო არ გაქვს" banner is right immediately.
      const removedFuture = toDelete.filter(s => okIds.has(s.id) && new Date(s.startAt).getTime() > Date.now()).length
      if (removedFuture > 0) setServerFreeCount(c => (c === null ? c : Math.max(0, c - removedFuture)))
      setBlockOpen(false)
      setBlockForm({ from: '', to: '' })
      toast(`წაიშალა ${okIds.size} თავისუფალი შუალედი`, 'success')
    } catch { setBlockErr('ქსელის შეცდომა') }
    finally { setBlocking(false) }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [bRes, sRes, pRes] = await Promise.all([
          fetch('/api/tutor/bookings').then(r => r.json()),
          fetch('/api/tutor/availability').then(r => r.json()),
          fetch('/api/me/tutor').then(r => r.json()).catch(() => null),
        ])
        if (cancelled) return
        setBookings(bRes?.bookings ?? [])
        setSlots(sRes?.slots ?? [])
        if (typeof sRes?.upcomingFreeCount === 'number') setServerFreeCount(sRes.upcomingFreeCount)
        // The expert's default session length — context for the estimate only.
        const d = pRes?.profile?.consultationDurationMin
        if (d === 15 || d === 30 || d === 60) setDurationMin(d)
      } catch {
        if (!cancelled) setErr('მონაცემების ჩატვირთვა ვერ მოხერხდა')
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Deep link — /tutor/schedule?template=1 opens the pre-filled weekly form
  // straight away (the OpenTimeNudge CTA lands here). Read off `location`
  // rather than useSearchParams so this client page needs no Suspense
  // boundary, and stripped afterwards so a later refresh doesn't reopen a sheet
  // the expert already closed.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get(TEMPLATE_PARAM) !== '1') return
      setTplOpen(true)
      url.searchParams.delete(TEMPLATE_PARAM)
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    } catch {}
  }, [])

  // The weekly template always opens READY TO PUBLISH: ორშ–პარ 10:00–18:00.
  // Re-seeded on open for an expert with nothing published (the fresh-expert
  // default), and otherwise only when the selection is empty — an expert who
  // already has windows keeps their own picks. Runs on open only, so
  // deselecting a day inside the open sheet sticks.
  useEffect(() => {
    if (!tplOpen) return
    if (!noFreeTime && tplDays.some(d => d)) return
    setTplDays([...PREFILL_DAYS])
    setTplStartHour(PREFILL_START_HOUR)
    setTplEndHour(PREFILL_END_HOUR)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplOpen])

  const grid = useMemo(() => {
    const bookingsByCell: Record<string, Booking[]> = {}
    const slotsByCell: Record<string, Slot[]> = {}
    // Hours a window merely COVERS (everything after its opening hour). A row is
    // a range, so a 10:00–13:00 window that painted only the 10:00 cell would
    // read as one 10:00 session — the tint shows the real extent.
    const coverKeys = new Set<string>()
    // Key by (dayIndex-in-week, hour) computed AGAINST weekStart. Without this,
    // bookings from every past week collapse into the same weekday cell and the
    // Prev/Next arrows change only the header label, not what appears in cells.
    const weekEnd = addDays(weekStart, 7)
    for (const b of bookings ?? []) {
      const d = new Date(b.startAt)
      if (d < weekStart || d >= weekEnd) continue
      const dayIdx = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))
      const key = `${dayIdx}-${tbHour(d)}`
      ;(bookingsByCell[key] ||= []).push(b)
    }
    for (const s of slots ?? []) {
      const d = new Date(s.startAt)
      if (d < weekStart || d >= weekEnd) continue
      const dayIdx = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000))
      ;(slotsByCell[`${dayIdx}-${tbHour(d)}`] ||= []).push(s)
      // Walk the remaining hours in ms (Tbilisi is a whole-hour offset, so an
      // hour boundary is the same instant in both clocks — no local getters).
      const endMs = new Date(s.endAt).getTime()
      const hourStart = Math.floor(d.getTime() / 3_600_000) * 3_600_000
      for (let t = hourStart + 3_600_000; t < endMs; t += 3_600_000) {
        const di = Math.floor((t - weekStart.getTime()) / (24 * 60 * 60 * 1000))
        if (di < 0 || di > 6) break        // window ran past this week's columns
        coverKeys.add(`${di}-${tbHour(new Date(t))}`)
      }
    }
    return { bookingsByCell, slotsByCell, coverKeys }
  }, [bookings, slots, weekStart])

  // Everything this screen calls „თავისუფალი" comes from here: published
  // windows MINUS active bookings, clipped to the future. Bookings no longer
  // consume a whole row — they cut a hole in the window — so the free time left
  // is exactly `windows − bookings` (the same subtraction the client-facing
  // picker does server-side, lib/availability.ts). Declared BEFORE the memos
  // that read it (useMemo factories run during render).
  const freeIntervals = useMemo(() => {
    const now = Date.now()
    // EVERY published row is inventory. Filtering by the legacy `booked` flag
    // here is what made finished sessions hide their window forever.
    const windows = (slots ?? [])
      .map(s => ({ start: new Date(s.startAt), end: new Date(s.endAt) }))
    const busy = (bookings ?? [])
      .filter(b => b.status === 'PREPARING' || b.status === 'CONFIRMED' || b.status === 'LIVE')
      .map(b => {
        const st = new Date(b.startAt)
        return { start: st, end: new Date(st.getTime() + b.durationMin * 60_000) }
      })
    return subtractIntervals(windows, busy)
      .filter(iv => iv.end.getTime() > now)
      .map(iv => ({ start: new Date(Math.max(iv.start.getTime(), now)), end: iv.end }))
  }, [bookings, slots])

  // Mobile day-list: merged chronological agenda for the selected weekday.
  // A legacy pre-sliced row that a booking fills exactly is the SAME time twice
  // — drop it (no free minutes left AND it opens on a booking's start), so the
  // agenda doesn't print a „სრულად დაჯავშნილი" echo under the booking row.
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
      const freeInside = overlapMinutes(freeIntervals, d.getTime(), new Date(s.endAt).getTime())
      if (freeInside === 0 && bookingStarts.has(d.getTime())) continue
      out.push({ kind: 'slot', at: d.getTime(), slot: s })
    }
    return out.sort((a, b) => a.at - b.at)
  }, [bookings, slots, freeIntervals, weekStart, selectedDay])

  // Per-weekday activity for the mobile day rail: bookings as a count, free time
  // as MINUTES (a 3-hour window is not „1 დრო").
  const dayCounts = useMemo(() => {
    const counts = Array.from({ length: 7 }, () => ({ bookings: 0, freeMin: 0 }))
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
    for (let i = 0; i < 7; i++) {
      const from = addDays(weekStart, i).getTime()
      counts[i].freeMin = overlapMinutes(freeIntervals, from, from + 24 * 60 * 60 * 1000)
    }
    return counts
  }, [bookings, freeIntervals, weekStart])

  const openModalFor = (dayIdx: number, hour: number) => {
    // `weekStart` is Tbilisi midnight, so +hour lands on exactly the Tbilisi
    // hour whose cell the expert clicked — and `tbInputValue` writes that same
    // wall-clock into the form, which `tbilisiInstant` reads back on submit.
    // (`setHours` here was the bug: it wrote a BROWSER-local hour that the
    // submit path then re-read as Tbilisi.)
    const start = new Date(addDays(weekStart, dayIdx).getTime() + hour * 3_600_000)
    // ONE HOUR by default. A row is a range the client picks a start inside, so
    // defaulting to the expert's session length would publish a 15-წთ sliver
    // that only the shortest service could ever use.
    setForm({ date: tbDateValue(start), start: tbTimeValue(start), durMin: 60, editId: null })
    setModalErr(null)
    setModalOpen(true)
  }

  /** Same sheet, editing an existing window. */
  const openEditFor = (slot: Slot) => {
    const start = new Date(slot.startAt)
    const mins = Math.round((new Date(slot.endAt).getTime() - start.getTime()) / 60_000)
    setForm({ date: tbDateValue(start), start: tbTimeValue(start), durMin: mins, editId: slot.id })
    setModalErr(null)
    setModalOpen(true)
  }

  /** The instant pair the picker currently describes — null if incomplete. */
  const formRange = (): { start: Date; end: Date } | null => {
    if (!form.date || !form.start) return null
    const start = tbilisiInstant(`${form.date}T${form.start}`)
    if (!start || isNaN(start.getTime()) || !form.durMin) return null
    return { start, end: new Date(start.getTime() + form.durMin * 60_000) }
  }

  const submitSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setModalErr(null)
    try {
      const range = formRange()
      if (!range) { setModalErr(windowErrorMessage('INVALID')); return }
      // The SAME predicate the API runs (lib/availabilityRules) — so the sheet
      // can never let through something the server will refuse, and the two can
      // never word the same refusal differently.
      const editingSlot = form.editId ? (slots ?? []).find(s => s.id === form.editId) : undefined
      const local = windowRangeError(range.start, range.end, new Date(), {
        keepStart: editingSlot ? new Date(editingSlot.startAt) : undefined,
      })
      if (local) { setModalErr(windowErrorMessage(local)); return }

      const editing = form.editId
      const res = await fetch(editing ? `/api/tutor/availability/${editing}` : '/api/tutor/availability', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startAt: range.start.toISOString(), endAt: range.end.toISOString() }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setModalErr(windowErrorMessage(j?.error))
        return
      }
      if (editing) {
        setSlots(prev => (prev ?? []).map(s => (s.id === editing ? { ...s, ...j.slot } : s)))
        setModalOpen(false)
        // Honesty: a resize can push an agreed session outside what is published.
        // The session still stands — say so rather than letting it look cancelled.
        toast(
          j.outsideBookings > 0
            ? `შუალედი შეიცვალა — ${j.outsideBookings} დაჯავშნილი სესია ძალაში რჩება`
            : 'შუალედი შეიცვალა',
          'success',
        )
      } else {
        // The range is stored as ONE window; `slots` stays tolerated for legacy
        // responses that returned several rows.
        const added = Array.isArray(j.slots) ? j.slots : j.slot ? [j.slot] : []
        setSlots(prev => [...(prev ?? []), ...added])
        setModalOpen(false)
        toast('თავისუფალი შუალედი დაემატა', 'success')
      }
    } catch {
      setModalErr('ქსელის შეცდომა — სცადე თავიდან')
    } finally {
      setSaving(false)
    }
  }

  const loading = bookings === null || slots === null

  // How much bookable time is left, in minutes — the headline number.
  const freeMinutes = useMemo(
    () => overlapMinutes(freeIntervals, -Infinity, Infinity),
    [freeIntervals],
  )
  // Zero free time means clients literally cannot book this expert — surfaced as
  // an activation banner above the grid. The server row-count is consulted only
  // as a safety net: the list is capped at 500 rows ordered oldest-first, so a
  // legacy expert with hundreds of past rows could have future windows we never
  // received — that must not trigger a false „you have none".
  const noFreeTime = freeMinutes === 0 && (serverFreeCount ?? 0) === 0

  // What the pending delete actually costs. Deleting a window no longer touches
  // the sessions inside it (see the DELETE route), so the dialog has to say both
  // halves out loud: N sessions stay in force, only `freeInside` stops being
  // offered. Every figure is read off the SAME `freeIntervals` the header chip
  // uses, so the dialog can't promise a number the screen then contradicts.
  const deleteTarget = useMemo(() => {
    const slot = (slots ?? []).find(s => s.id === confirmDeleteId)
    if (!slot) return null
    const from = new Date(slot.startAt).getTime()
    const to = new Date(slot.endAt).getTime()
    const kept = (bookings ?? []).filter(b => {
      if (b.status !== 'PREPARING' && b.status !== 'CONFIRMED' && b.status !== 'LIVE') return false
      const bs = new Date(b.startAt).getTime()
      return bs < to && bs + b.durationMin * 60_000 > from     // overlaps the window
    }).length
    const freeInside = overlapMinutes(freeIntervals, from, to)
    return { slot, kept, freeInside, freeAfter: Math.max(0, freeMinutes - freeInside) }
  }, [confirmDeleteId, slots, bookings, freeIntervals, freeMinutes])

  // What „სრულად წაშლა" actually costs, in the same numbers the header chip
  // shows: every window with a future part goes, `freeMinutes` of bookable time
  // stops being offered, and `kept` sessions carry on regardless. The row count
  // is floored by the server's cap-proof `upcomingFreeCount` so a 500+-row
  // expert is never told a number lower than what will really be swept.
  const clearTarget = useMemo(() => {
    const now = Date.now()
    const futureSlots = (slots ?? []).filter(s => new Date(s.endAt).getTime() > now)
    const kept = (bookings ?? []).filter(b => {
      if (b.status !== 'PREPARING' && b.status !== 'CONFIRMED' && b.status !== 'LIVE') return false
      const bs = new Date(b.startAt).getTime()
      const be = bs + b.durationMin * 60_000
      if (be <= now) return false
      return futureSlots.some(s => bs < new Date(s.endAt).getTime() && be > new Date(s.startAt).getTime())
    }).length
    return { windows: Math.max(futureSlots.length, serverFreeCount ?? 0), kept }
  }, [slots, bookings, serverFreeCount])

  // Nothing published → nothing to clear; the button simply isn't there.
  const canClear = clearTarget.windows > 0

  // The „პირველი ნაბიჯი" activation card owns the publish actions while it is
  // on screen (see the toolbar above — it hides its duplicates then).
  const firstStep = !loading && noFreeTime

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
    // `edge: 'end'` steps back a minute: a window that closes at 13:00 fills the
    // 12:00 row, not an empty 13:00 one.
    const consider = (iso: string, edge: 'start' | 'end' = 'start') => {
      const raw = new Date(iso)
      if (raw < weekStart || raw > weekEnd) return
      const d = edge === 'end' ? new Date(raw.getTime() - 60_000) : raw
      lo = Math.min(lo, tbHour(d))
      hi = Math.max(hi, tbHour(d) + 1)
    }
    for (const b of bookings ?? []) consider(b.startAt)
    // Windows span hours, so the band must cover the whole range or the tail of
    // a 10:00–23:00 window would sit outside the visible rows.
    for (const sl of slots ?? []) { consider(sl.startAt); consider(sl.endAt, 'end') }
    return Array.from({ length: hi - lo }, (_, i) => lo + i)
  }, [allHours, bookings, slots, weekStart])

  return (
    <div>
        {/* Header: canonical PageHeader (title/sub + week nav in the actions
            slot, wrapping below on mobile), then the chips/actions row. */}
        <div className="mb-5 lg:mb-6 space-y-3">
          <PageHeader
            // The h1 carries STATE (the week you are looking at) instead of
            // repeating the highlighted sidebar label „გრაფიკი" 40px away —
            // and the week range now exists in exactly one place, so the
            // arrows are pure controls.
            title={<>გრაფიკი <span className="font-normal text-ink-400 tabular-nums whitespace-nowrap">· {fmtRangeLabel(weekStart)}</span></>}
            // Every time on this screen is Tbilisi wall-clock — say so, so an
            // expert abroad never reads the grid as their own local time.
            sub="დრო და ჯავშნები · თბილისის დროით (UTC+4)"
            actions={
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="წინა კვირა"
                        className="h-11 w-11 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast">
                  <Icon.chevR className="w-4 h-4 rotate-180" />
                </button>
                <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="შემდეგი კვირა"
                        className="h-11 w-11 shrink-0 rounded-btn border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 inline-flex items-center justify-center transition-colors duration-fast">
                  <Icon.chevR className="w-4 h-4" />
                </button>
              </div>
            }
          />
          {/* Weekly template is the promoted flow — it's how availability
              actually gets published at scale; one-off slots and vacation
              are the quieter secondaries. */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-between">
            <div className="flex items-center gap-2 flex-wrap text-meta">
              {/* Free time as a DURATION: rows are windows, so „3 თავისუფალი
                  დრო" would be a lie about three ranges of unknown length. */}
              <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display font-semibold ${
                !loading && noFreeTime
                  ? 'bg-warning-50 border-warning-200 text-warning-800'
                  : 'bg-brand-50 border-brand-200 text-brand-800'
              }`}>
                {loading ? '…' : `${fmtDur(freeMinutes)} თავისუფალი დრო`}
              </span>
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border border-ink-200 bg-white text-ink-600 font-display font-semibold">
                {loading ? '…' : `${weekBooked} ჯავშანი ამ კვირაში`}
              </span>
            </div>
            {/* When the „პირველი ნაბიჯი" card below is up it carries these very
                two buttons (same handlers, ~120px lower), so the toolbar drops
                its copies — one action, one place. „შვებულება" has no twin and
                stays either way. */}
            <div className="grid grid-cols-2 lg:flex lg:items-center gap-2 w-full lg:w-auto">
              {!firstStep && (
                <>
                  <Btn variant="primary" size="md" className="col-span-2 lg:col-span-1 lg:h-9 lg:px-3.5 lg:text-small" onClick={() => setTplOpen(true)}>
                    <Icon.calendar className="w-4 h-4" /> ყოველკვირეული განრიგი
                  </Btn>
                  <Btn variant="secondary" size="md" className="lg:h-9 lg:px-3.5 lg:text-small" onClick={() => openModalFor(selectedDay, 9)}>
                    <Icon.plus className="w-4 h-4" /> შუალედი
                  </Btn>
                </>
              )}
              <Btn variant="ghost" size="md" className={`lg:h-9 lg:px-3.5 lg:text-small ${firstStep ? 'col-span-2' : ''}`} onClick={() => setBlockOpen(true)}>
                შვებულება
              </Btn>
            </div>
          </div>
        </div>

        {err && (
          <div className="mb-4 p-4 rounded-card bg-danger-50 border border-danger-200 text-danger-700 text-small flex items-start justify-between gap-3">
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

        {/* Zero published time = literally unbookable. For a brand-new expert
            that is not a fault to warn about, it's step one — so this reads as
            an invitation (hairline card, no alarm fill) and the pre-filled
            ორშ–პარ 10:00–18:00 template is the obvious first action. Opening it
            only FILLS the form; „შექმნა" inside the sheet publishes. */}
        {firstStep && (
          <div className="mb-4 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
            <Eyebrow>პირველი ნაბიჯი</Eyebrow>
            <h2 className="mt-1.5 font-display text-body-lg sm:text-h3 font-bold text-ink-900">გამოაქვეყნე შენი თავისუფალი დრო</h2>
            <p className="mt-1.5 text-small text-ink-600 leading-snug max-w-[62ch]">
              სანამ დროს არ გამოაქვეყნებ, პროფილიდან ვერავინ დაგიჯავშნის. განრიგი უკვე შევსებულია — ორშაბათიდან პარასკევამდე, 10:00–18:00 თბილისის დროით. გახსენი, გამორთე დღეები ან შეცვალე საათები და გამოაქვეყნე.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Btn variant="primary" size="md" className="w-full sm:w-auto" onClick={() => setTplOpen(true)}>
                <Icon.calendar className="w-4 h-4" /> ორშ–პარ · 10:00–18:00
              </Btn>
              <Btn variant="secondary" size="md" className="w-full sm:w-auto" onClick={() => openModalFor(selectedDay, 9)}>
                <Icon.plus className="w-4 h-4" /> ცალკე შუალედი
              </Btn>
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
                const isToday = day.getTime() === tbStartOfDay(new Date()).getTime()
                const sel = selectedDay === i
                const c = dayCounts[i]
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDay(i)}
                    aria-pressed={sel}
                    aria-label={`${d} ${tbDayNum(day)} — ${c.bookings} ჯავშანი, ${fmtDur(c.freeMin)} თავისუფალი დრო`}
                    className={`h-[56px] rounded-btn border flex flex-col items-center justify-center gap-0.5 transition-colors duration-fast ${
                      sel ? 'bg-ink-900 border-ink-900 text-white' : 'bg-white border-ink-200 text-ink-800 hover:border-ink-300'
                    }`}
                  >
                    <span className={`font-display text-micro font-semibold uppercase ${sel ? 'text-white/70' : 'text-ink-500'}`}>{d}</span>
                    <span className={`text-body font-bold tabular-nums leading-none ${!sel && isToday ? 'text-brand-700' : ''}`}>{tbDayNum(day)}</span>
                    {/* Counts, not status dots (canon bans dots) — and a number
                        actually says HOW busy the day is. Colored text only, no
                        fill: bookings count first, then free time as a duration
                        (a single 8-hour window is „8სთ", never „1"). */}
                    <span aria-hidden className="flex items-center gap-1 h-3 text-meta font-display font-bold tabular-nums leading-none">
                      {c.bookings > 0 && <span className={sel ? 'text-white' : 'text-brand-700'}>{c.bookings}</span>}
                      {c.freeMin > 0 && (
                        <span className={sel ? 'text-white/55' : 'text-ink-400'}>
                          {c.freeMin >= 60 ? `${Math.floor(c.freeMin / 60)}სთ` : `${c.freeMin}წთ`}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {dayEntries.length === 0 ? (
              <div className="rounded-card border border-ink-200 bg-white p-6 text-center">
                <p className="text-body text-ink-600">ამ დღეს არაფერი გაქვს</p>
                <Btn variant="secondary" size="md" className="mt-4 w-full" onClick={() => openModalFor(selectedDay, 9)}>
                  <Icon.plus className="w-4 h-4" /> დროის დამატება
                </Btn>
              </div>
            ) : (
              <div className="rounded-card border border-ink-200 bg-white overflow-hidden divide-y divide-ink-100">
                {dayEntries.map(e =>
                  e.kind === 'booking' ? (
                    <Link
                      key={`b-${e.booking.id}`}
                      href={`/work/bookings/${e.booking.id}`}
                      className="flex items-center gap-3 p-4 min-h-[64px] active:bg-ink-50 transition-colors duration-fast"
                    >
                      <div className="w-[72px] shrink-0">
                        <div className="text-body font-display font-bold text-ink-900 tabular-nums">{fmtTime(e.booking.startAt)}</div>
                        <div className="text-meta text-ink-400 tabular-nums">{e.booking.durationMin} წთ</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-body font-display font-bold text-ink-900 truncate">{e.booking.student?.fullName ?? 'ჯავშანი'}</div>
                        <div className="text-small text-ink-500 truncate">{e.booking.topic}</div>
                      </div>
                      <span className="shrink-0 h-6 px-2 rounded-pill bg-brand-50 text-brand-700 text-meta font-display font-bold inline-flex items-center">ჯავშანი</span>
                      <Icon.chevR className="w-4 h-4 text-ink-300 shrink-0" />
                    </Link>
                  ) : (
                    <div key={`s-${e.slot.id}`} className="flex items-center gap-3 p-4 min-h-[64px]">
                      <div className="w-[72px] shrink-0">
                        <div className="text-body font-display font-bold text-ink-900 tabular-nums">{fmtTime(e.slot.startAt)}</div>
                        <div className="text-meta text-ink-400 tabular-nums">— {fmtTime(e.slot.endAt)}</div>
                      </div>
                      {/* A row is a WINDOW — say how much of it is still free, not
                          just that it exists („ხელმისაწვდომია" read as one
                          bookable session, and ignored bookings sitting inside). */}
                      <div className="min-w-0 flex-1 text-small">
                        {(() => {
                          const from = new Date(e.slot.startAt).getTime()
                          const to = new Date(e.slot.endAt).getTime()
                          if (to <= Date.now()) return <span className="text-ink-400">გასული დრო</span>
                          const free = overlapMinutes(freeIntervals, from, to)
                          return free === 0
                            ? <span className="text-ink-500">სრულად დაჯავშნილი</span>
                            : <span className="text-success-700 font-display font-semibold">თავისუფალი · {fmtDur(free)}</span>
                        })()}
                      </div>
                      {/* Edit first, delete second — a schedule is corrected far
                          more often than it is withdrawn, and until 2026-08-07
                          only the second of these existed. */}
                      <button
                        type="button"
                        onClick={() => openEditFor(e.slot)}
                        aria-label={`შუალედის შეცვლა — ${fmtTime(e.slot.startAt)}–${fmtTime(e.slot.endAt)}`}
                        className="shrink-0 w-11 h-11 rounded-btn border border-ink-200 text-ink-500 hover:text-brand-700 hover:border-brand-300 hover:bg-brand-50 inline-flex items-center justify-center transition-colors duration-fast"
                      >
                        <Icon.edit className="w-4 h-4" />
                      </button>
                      {/* Every window is deletable — the DELETE route never
                          touches the sessions inside one, and the confirm
                          dialog says how many stay in force. Gating this on the
                          legacy flag locked finished rows on the screen. */}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(e.slot.id)}
                        disabled={deletingId === e.slot.id}
                        aria-label="შუალედის წაშლა"
                        className="shrink-0 w-11 h-11 rounded-btn border border-ink-200 text-ink-500 hover:text-danger-600 hover:border-danger-300 hover:bg-danger-50 inline-flex items-center justify-center transition-colors duration-fast disabled:opacity-50"
                      >
                        <Icon.close className="w-4 h-4" />
                      </button>
                    </div>
                  )
                )}
                <button
                  type="button"
                  onClick={() => openModalFor(selectedDay, 9)}
                  className="w-full p-4 min-h-[56px] text-small font-display font-semibold text-brand-700 hover:bg-brand-50/50 active:bg-brand-50 inline-flex items-center justify-center gap-2 transition-colors duration-fast"
                >
                  <Icon.plus className="w-4 h-4" /> დროის დამატება ამ დღეს
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
                const isToday = day.getTime() === tbStartOfDay(new Date()).getTime()
                return (
                  <div key={d} className="px-2 py-3 text-center border-l border-ink-200">
                    <Eyebrow tone="muted">{d}</Eyebrow>
                    <div className={`text-small font-bold tabular-nums ${isToday ? 'text-brand-700' : 'text-ink-800'}`}>{tbDayNum(day)}</div>
                  </div>
                )
              })}
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {hours.map(h => (
                <div key={h} className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-ink-100 min-h-[64px]">
                  <div className="px-2 py-2 text-meta font-mono text-ink-400 border-r border-ink-100 tabular-nums">
                    {String(h).padStart(2, '0')}:00
                  </div>
                  {Array.from({ length: 7 }, (_, dayIdx) => {
                    const key = `${dayIdx}-${h}`
                    const cellBookings = grid.bookingsByCell[key] ?? []
                    const cellSlots = grid.slotsByCell[key] ?? []
                    // Inside a published window that opened in an earlier row.
                    const covered = grid.coverKeys.has(key)
                    const isTodayCol = addDays(weekStart, dayIdx).getTime() === tbStartOfDay(new Date()).getTime()
                    return (
                      // Plain cell wrapper — never a <button>: the cell holds
                      // booking <Link>s and slot delete <button>s, and nesting
                      // interactives is invalid/inaccessible. The add-slot
                      // affordance is an absolutely-positioned button filling
                      // the cell background; pills/chips sit above it (z-10).
                      <div
                        key={dayIdx}
                        title={covered ? 'თავისუფალი შუალედის ნაწილი' : undefined}
                        className={`border-l border-ink-100 p-1 group relative ${
                          covered ? 'bg-brand-50/60' : isTodayCol ? 'bg-brand-50/20' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openModalFor(dayIdx, h)}
                          aria-label={`დროის დამატება — ${DAY_LABELS[dayIdx]} ${tbDayNum(addDays(weekStart, dayIdx))}, ${String(h).padStart(2, '0')}:00`}
                          className="absolute inset-0 group-hover:bg-brand-50/40 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                        />
                        {cellBookings.map(b => (
                          // Click booking pill → open booking detail. Sibling of
                          // the add-slot button (not nested), lifted above it.
                          // White card + brand left bar: booked ≠ decorative wash.
                          <Link
                            key={b.id}
                            href={`/work/bookings/${b.id}`}
                            className="relative z-10 block rounded-field bg-white border border-ink-200 border-l-[3px] border-l-brand-500 text-ink-800 px-1.5 py-1 mb-1 hover:border-ink-300 hover:shadow-xs transition-all duration-fast"
                          >
                            <div className="text-meta font-display font-bold truncate">{b.student?.fullName ?? 'ჯავშანი'}</div>
                            <div className="text-meta truncate text-ink-500">{b.topic}</div>
                          </Link>
                        ))}
                        {cellSlots.map(s => {
                          // The chip carries the RANGE, not the word „თავისუფალი":
                          // one row is a window, not one bookable session. Its
                          // state comes from how much of that window is still
                          // bookable (windows − active bookings) — the same
                          // `freeIntervals` the header chip and the day rail read.
                          const from = new Date(s.startAt).getTime()
                          const to = new Date(s.endAt).getTime()
                          const free = overlapMinutes(freeIntervals, from, to)
                          const past = to <= Date.now()
                          const spent = free === 0                    // fully booked, or already gone
                          const state = past ? 'გასული' : spent ? 'სრულად დაჯავშნილი' : `თავისუფალი ${fmtDur(free)}`
                          // TAPPING A WINDOW EDITS IT; DELETE IS ITS OWN BUTTON
                          // (2026-08-07). The whole chip used to be the delete
                          // control — the only thing you could do to a published
                          // window was destroy it, and the „×" was a decorative
                          // span, so the real hit area was the range itself. Two
                          // SIBLING buttons now (never nested — the cell's
                          // add-slot button is already an ancestor layer).
                          return (
                            <div
                              key={s.id}
                              className={`group/slot relative z-10 flex items-stretch rounded-field mb-1 overflow-hidden border ${
                                spent
                                  ? 'bg-ink-50 border-ink-200 text-ink-500'
                                  : 'bg-brand-50 border-brand-100 text-brand-800'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => openEditFor(s)}
                                aria-label={`შუალედის შეცვლა — ${fmtTime(s.startAt)}–${fmtTime(s.endAt)} · ${state}`}
                                title={`${state} — დააკლიკე შესაცვლელად`}
                                className="min-w-0 flex-1 text-left px-1.5 py-1 hover:bg-white/60 transition-colors duration-fast"
                              >
                                <div className="text-meta font-display font-bold tabular-nums truncate">{fmtTime(s.startAt)}–{fmtTime(s.endAt)}</div>
                                <span className="sr-only">{state}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(s.id)}
                                disabled={deletingId === s.id}
                                aria-label={`შუალედის წაშლა — ${fmtTime(s.startAt)}–${fmtTime(s.endAt)}`}
                                title="წაშლა"
                                className="shrink-0 w-6 inline-flex items-center justify-center text-meta opacity-0 group-hover/slot:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-danger-100 hover:text-danger-700 transition-opacity duration-fast"
                              >
                                {deletingId === s.id ? '…' : '×'}
                              </button>
                            </div>
                          )
                        })}
                        {cellBookings.length === 0 && cellSlots.length === 0 && (
                          <div className="pointer-events-none opacity-0 group-hover:opacity-100 text-ink-400 text-meta p-1 transition duration-fast">+ დამატება</div>
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
                className="text-meta font-display font-semibold text-ink-500 hover:text-ink-800 inline-flex items-center gap-1.5 transition-colors duration-fast"
              >
                <Icon.clock className="w-3.5 h-3.5" />
                {allHours ? 'ძირითადი საათები (08–22)' : 'ყველა საათი (24სთ)'}
              </button>
            </div>
          </div>
          </div>
          </div>

          {/* Last step in the page's reading order — what you have now → add a
              window / apply the weekly template → clear all. Deliberately quiet
              (it's destructive) and absent entirely when there is nothing
              published to withdraw. */}
          {canClear && (
            <div className="mt-4 rounded-card border border-ink-200 bg-white px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-small text-ink-500 leading-snug min-w-0">
                გინდა თავიდან დაიწყო? „სრულად წაშლა“ მოხსნის ყველა მომავალ შუალედს — დაჯავშნილი სესიები ძალაში რჩება.
              </p>
              <Btn variant="danger" size="md" className="w-full sm:w-auto shrink-0" onClick={() => setConfirmClear(true)}>
                სრულად წაშლა
              </Btn>
            </div>
          )}
          </>
        )}

        <SlotSheet
          modalOpen={modalOpen}
          setModalOpen={setModalOpen}
          form={form}
          setForm={setForm}
          saving={saving}
          modalErr={modalErr}
          setModalErr={setModalErr}
          submitSlot={submitSlot}
          formRange={formRange}
        />

        <TemplateSheet
          tplOpen={tplOpen}
          setTplOpen={setTplOpen}
          tplDays={tplDays}
          setTplDays={setTplDays}
          tplStartHour={tplStartHour}
          setTplStartHour={setTplStartHour}
          tplEndHour={tplEndHour}
          setTplEndHour={setTplEndHour}
          tplWeeks={tplWeeks}
          setTplWeeks={setTplWeeks}
          tplSaving={tplSaving}
          tplErr={tplErr}
          setTplErr={setTplErr}
          tplMsg={tplMsg}
          setTplMsg={setTplMsg}
          submitTemplate={submitTemplate}
          applyTplPreset={applyTplPreset}
          durationMin={durationMin}
        />

        <BlockOffSheet
          blockOpen={blockOpen}
          setBlockOpen={setBlockOpen}
          blockForm={blockForm}
          setBlockForm={setBlockForm}
          blocking={blocking}
          blockErr={blockErr}
          setBlockErr={setBlockErr}
          submitBlockOff={submitBlockOff}
        />

      <ConfirmModal
        open={!!confirmDeleteId}
        title="წავშალო ეს შუალედი?"
        body={
          deleteTarget ? (
            <div className="space-y-1.5">
              {/* Name the window — a modal that says only „ეს შუალედი" asks the
                  expert to trust which chip they hit. */}
              <div className="font-display font-semibold text-ink-800 tabular-nums">
                {fmtSlotRange(deleteTarget.slot.startAt, deleteTarget.slot.endAt)}
              </div>
              {deleteTarget.kept > 0 ? (
                <p>
                  ამ შუალედში <span className="font-display font-semibold text-ink-800 tabular-nums">{deleteTarget.kept}</span> დაჯავშნილი სესია ძალაში რჩება — არც უქმდება, არც გადაიწევს. წაშლა მხოლოდ თავისუფალ დროს ხსნის: {fmtDur(deleteTarget.freeInside)} აღარ იქნება დასაჯავშნი.
                </p>
              ) : (
                <p>ამ შუალედში ვეღარ დაგიჯავშნიან. ჯავშნები არ იშლება.</p>
              )}
              {/* No partial delete exists — so when free time is about to go,
                  say what is left and point at the add-a-shorter-window path. */}
              {deleteTarget.freeInside > 0 && (
                <p className="text-ink-500">
                  წაშლის შემდეგ დაგრჩება {fmtDur(deleteTarget.freeAfter)} თავისუფალი დრო. თუ მხოლოდ ნაწილის მოხსნა გინდა — წაშალე და დაამატე უფრო მოკლე შუალედი.
                </p>
              )}
            </div>
          ) : (
            'ამ შუალედში ვეღარ დაგიჯავშნიან. ჯავშნები არ იშლება.'
          )
        }
        tone="danger"
        confirmLabel="წაშლა"
        busy={!!deletingId}
        onConfirm={() => { if (confirmDeleteId) void deleteSlot(confirmDeleteId) }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* Same <ConfirmModal> pattern as the single-window delete — no
          hand-rolled dialog, and every figure comes off `freeIntervals`, the
          one truth the header chip and the day rail already print. */}
      <ConfirmModal
        open={confirmClear}
        title="წავშალო ყველა მომავალი შუალედი?"
        body={
          <div className="space-y-1.5">
            <p>
              წაიშლება <span className="font-display font-semibold text-ink-800 tabular-nums">{clearTarget.windows}</span> მომავალი შუალედი და{' '}
              <span className="font-display font-semibold text-ink-800 tabular-nums">{fmtDur(freeMinutes)}</span> თავისუფალი დრო აღარ იქნება დასაჯავშნი — სანამ ახალს არ გამოაქვეყნებ, პროფილიდან ვერავინ დაგიჯავშნის.
            </p>
            {clearTarget.kept > 0 && (
              <p>
                <span className="font-display font-semibold text-ink-800 tabular-nums">{clearTarget.kept}</span> დაჯავშნილი სესია ძალაში რჩება — არც უქმდება, არც გადაიწევს.
              </p>
            )}
            <p className="text-ink-500">გასული შუალედები არ იშლება. ნებისმიერ დროს შეგიძლია ხელახლა გამოაქვეყნო ყოველკვირეული განრიგი.</p>
          </div>
        }
        tone="danger"
        confirmLabel="ყველას წაშლა"
        busy={clearing}
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
