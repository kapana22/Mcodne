'use client'
// Admin tab: მოდერაცია — the expert-application review queue.
//
// Tutor-supplied URLs (ID/selfie/certificate scans, LinkedIn, website) are
// rendered as clickable links in the moderation panel. React does NOT block
// `javascript:`/`data:text/html` schemes in an href, so a crafted URL would
// execute on an admin's click. `safeDocHref` (= shared `safeHttpUrl`, imported
// at the top) yields `undefined` for any unsafe scheme so the anchor is
// non-navigable rather than an interpreted payload.

import React, { useState, useEffect, useCallback } from 'react'
import { safeHttpUrl as safeDocHref } from '@/lib/safeUrl'
import { fmtKaDate } from '@/lib/kaDate'
import { normalizeCertificates, summarizeProfessionData, hasVerificationDocument, missingApplicationParts, fileLabel } from './_application'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { AdminConfirmDialog, TabHeader, adminOk, AdminLoading, fmtDT, LoadMoreBar } from './_parts'
import type { AdminCategory } from './_categories'

/* ───── Shared SectionHeader (for non-overview tabs) ───── */
/* ───── Section: Moderation (tutor applications queue) ───── */
/* The LIST payload (GET /api/admin/applications) — light fields only.
   `city` keeps its raw nullable value: the queue renders „—“ itself, but the
   detail panel must be able to say „ქალაქი არ არის მითითებული“ out loud, and a
   pre-substituted „—“ is indistinguishable from a city literally named „—“. */
type AppRow = {
  id: string; name: string; cat: string; yrs: number; rate: number;
  city: string | null; sla: string; urgent?: boolean; motivation?: string | null; email?: string;
  phone?: string | null; linkedinUrl?: string | null; websiteUrl?: string | null;
  introVideoUrl?: string | null; introVideoId?: string | null;
  createdAt?: string
  /** `/api/avatars/<userId>?v=` — a URL, never the base64 blob (see the note in
      the list route). Present so the QUEUE can show the face: a column of
      initials is not something 20 applications can be told apart by. */
  photo?: string | null
  status?: AppStatus
  moderatorNote?: string | null
  reviewedAt?: string | null
}

/* The queue is no longer hard-wired to SUBMITTED (2026-08-03): a decided
   application was unreachable from the panel, so „why was this person rejected“
   could not be answered without the audit log. */
type AppStatus = 'SUBMITTED' | 'NEEDS_REVISION' | 'APPROVED' | 'REJECTED'
const APP_STATUS_TABS: { id: AppStatus; l: string }[] = [
  { id: 'SUBMITTED', l: 'მოლოდინში' },
  { id: 'NEEDS_REVISION', l: 'შესასწორებელი' },
  { id: 'APPROVED', l: 'დამტკიცებული' },
  { id: 'REJECTED', l: 'უარყოფილი' },
]
/** Only these two are still open decisions — the action bar is hidden for the
 *  rest, because „დაამტკიცე“ on an already-approved row is a lie about what the
 *  button would do. */
const isOpenStatus = (s: AppStatus) => s === 'SUBMITTED' || s === 'NEEDS_REVISION'

/* The HEAVY half (GET /api/admin/applications/:id) — the profile photo, the
   uploaded document blobs and the apply-flow JSON. Lazy-loaded for the open
   application only; `null` while in flight. */
type AppDetail = {
  avatarUrl?: string | null
  idDocUrl?: string | null
  selfieUrl?: string | null
  certificates?: { title: string; url: string }[] | null
  professionData?: Record<string, unknown> | null
}

/* Mirrors the category resolver inside PATCH /api/applications/:id — the admin
   UI must pre-select exactly what approval would pick on its own, otherwise the
   dropdown quietly lies about the outcome. */
const matchCategory = (specialty: string, cats: AdminCategory[]): AdminCategory | undefined => {
  const nrm = (s: string) => s.toLowerCase().trim()
  const sp = nrm(specialty || '')
  if (!sp) return undefined
  return cats.find(c => nrm(c.name) === sp)
    ?? cats.find(c => { const n = nrm(c.name); const stem = n.slice(0, 4); return sp.includes(n) || n.includes(sp) || (stem.length >= 3 && sp.includes(stem)) })
}

/* One labelled fact in the review grid. A missing value is SAID out loud —
   a blank cell is indistinguishable from a field the form never asked for, and
   that is precisely the complaint this panel exists to fix. */
const ReviewField = ({ label, value, href, newTab = true, mono }: {
  label: string; value?: string | null; href?: string; newTab?: boolean; mono?: boolean
}) => {
  const has = !!(value && String(value).trim())
  return (
    <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3 min-w-0">
      <Eyebrow tone="muted">{label}</Eyebrow>
      {!has ? (
        <div className="mt-1 text-small text-ink-400">არ არის მითითებული</div>
      ) : href ? (
        <a
          href={href}
          {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="mt-1 flex items-start gap-1 font-display text-small font-semibold text-brand-700 hover:text-brand-800"
        >
          <span className="min-w-0 break-all">{value}</span>
          {newTab && <Icon.external className="w-3 h-3 mt-1 shrink-0" />}
        </a>
      ) : (
        <div className={`mt-1 text-small font-semibold text-ink-900 break-words ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</div>
      )}
    </div>
  )
}

/* One openable upload. EVERY href goes through `safeDocHref` — application
   URLs are user-supplied and a `javascript:`/`data:text/html` value would
   execute in the admin's authenticated origin on click. An unsafe URL yields no
   href, so the tile is shown (the moderator still learns a file exists) but is
   inert and says so. Stored files are frequently base64 `data:` images, which
   is why the label comes from `fileLabel` rather than the URL itself. */
const DocTile = ({ caption, url }: { caption: string; url?: string | null }) => {
  const href = safeDocHref(url)
  const isImg = !!url && /^data:image\/|\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
  const thumb = isImg && href
    ? <img src={href} alt={caption} className="w-24 h-24 rounded-btn object-cover border border-ink-200" />
    : <span className="w-24 h-24 rounded-btn bg-white border border-ink-200 text-ink-600 inline-flex flex-col items-center justify-center gap-1"><Icon.doc className="w-5 h-5" /><span className="font-display text-micro font-bold uppercase">ფაილი</span></span>
  const body = (
    <>
      {thumb}
      <span className="block mt-1.5 font-display text-meta font-semibold text-ink-800 max-w-[96px] truncate">{caption}</span>
      <span className="block text-meta text-ink-500 max-w-[96px] truncate">{fileLabel(url)}</span>
    </>
  )
  if (!href) {
    return (
      <div className="block text-left">
        {body}
        <span className="block text-meta text-danger-700 max-w-[96px]">ბმული საეჭვოა</span>
      </div>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block text-left group" title="ახალ ფანჯარაში გახსნა">
      {body}
      <span className="mt-0.5 inline-flex items-center gap-1 text-meta text-brand-700 group-hover:text-brand-800">გახსენი <Icon.external className="w-3 h-3" /></span>
    </a>
  )
}

/* „nothing here“ line — the one thing an empty slot must never do is render as
   empty space. */
const NothingHere = ({ children }: { children: React.ReactNode }) => (
  <p className="text-small text-ink-500 flex items-start gap-1.5">
    <Icon.x className="w-3 h-3 mt-1 shrink-0 text-ink-400" />
    <span>{children}</span>
  </p>
)

export const ModerationSection = ({ onDecision }: { onDecision?: () => void }) => {
  const [APPS, setAPPS] = useState<AppRow[]>([])
  const [sel, setSel] = useState<string | null>(null)
  // Which queue is on screen. SUBMITTED is the job; the other three are the
  // history that used to be unreachable from here.
  const [status, setStatus] = useState<AppStatus>('SUBMITTED')
  const [counts, setCounts] = useState<Partial<Record<AppStatus, number>>>({})
  // Search box, debounced into `query` — the value the fetch actually uses.
  // Every other list tab (მომხმარებლები, ჯავშნები, შეფასებები) has had one;
  // the applications queue was the only list you could not search.
  const [qInput, setQInput] = useState('')
  const [query, setQuery] = useState('')
  // Live categories for the approve-time selector. A free-text niche („cat“ is
  // the applicant's specialty) matches no preset → the profile is born
  // category-less and /tutors never shows it, so the moderator needs a way to
  // assign one at the moment of approval.
  const [liveCats, setLiveCats] = useState<AdminCategory[]>([])
  const [catId, setCatId] = useState('')
  // Photo + document blobs + professionData are excluded from the list payload
  // and lazy-loaded for the selected application only (see effect below).
  const [detail, setDetail] = useState<AppDetail | null>(null)
  const [detailErr, setDetailErr] = useState(false)
  // The moderator's „გადამოწმებული“ decision for the OPEN application. Resets
  // to false on every selection change — the badge is never inherited from the
  // previous applicant, and never pre-ticked.
  const [grantVerified, setGrantVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [note, setNote] = useState('')
  // Bulk-action state. `checked` is the set of selected application IDs.
  // `bulkProgress` renders "N/M დამუშავებულია" while the sequential PATCH
  // loop runs; null when idle.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  // Reject flows go through the shared confirm dialog with a REQUIRED reason
  // ('single' → the open application, 'bulk' → every checked application).
  const [pendReject, setPendReject] = useState<'single' | 'bulk' | null>(null)
  // Revise („შესწორება“) also goes through the shared confirm dialog with a
  // REQUIRED note — softer than reject, sends the application back for the
  // applicant to fix. Single-application only (no bulk revise).
  const [pendRevise, setPendRevise] = useState<boolean>(false)
  // Bulk APPROVE is the most consequential button here (N users promoted to
  // TUTOR, no undo) — it now goes through the same dialog as bulk reject.
  const [pendBulkApprove, setPendBulkApprove] = useState<{ ids: string[]; skipped: number } | null>(null)
  // Single approve is exactly as consequential as bulk approve × 1 (a user
  // becomes a public expert, no undo) — same dialog treatment.
  const [pendApprove, setPendApprove] = useState(false)
  // Cursor pagination — the queue mirrors the users/reviews lists.
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const mapRow = (a: any): AppRow => ({
    id: a.id, name: a.fullName, cat: a.specialty, yrs: a.yearsExp, rate: a.hourlyRate,
    city: a.city ?? null,
    sla: fmtKaDate(new Date(a.createdAt), { year: true }),
    urgent: (Date.now() - new Date(a.createdAt).getTime()) > 24 * 3600 * 1000,
    motivation: a.motivation, email: a.user?.email,
    phone: a.phone, linkedinUrl: a.linkedinUrl, websiteUrl: a.websiteUrl,
    introVideoUrl: a.introVideoUrl, introVideoId: a.introVideoId,
    createdAt: a.createdAt,
    photo: a.user?.avatarUrl ?? null,
    status: a.status as AppStatus,
    moderatorNote: a.moderatorNote ?? null,
    reviewedAt: a.reviewedAt ?? null,
  })

  useEffect(() => {
    const t = setTimeout(() => setQuery(qInput.trim()), 300)
    return () => clearTimeout(t)
  }, [qInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Server-filtered: the queue used to pull the newest 300 applications of
      // ANY status and keep the SUBMITTED ones in the browser — past 300 decided
      // rows it read empty while the KPI still counted a real backlog.
      const res = await fetch(`/api/admin/applications?status=${status}&limit=50${query ? `&q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      const mapped: AppRow[] = (Array.isArray(data?.items) ? data.items : []).map(mapRow)
      setAPPS(mapped)
      setCounts(data?.counts ?? {})
      setNextCursor(data?.nextCursor ?? null)
      setSel(mapped[0]?.id ?? null)
      // Reset the bulk-selection set on every refetch — stale IDs (already
      // approved/rejected in this pass) must not linger checked.
      setChecked(new Set())
    } catch {
      setFlash({ kind: 'error', msg: 'განაცხადების ჩატვირთვა ვერ მოხერხდა.' })
    } finally {
      setLoading(false)
    }
  }, [status, query])
  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/admin/applications?status=${status}&limit=50&cursor=${encodeURIComponent(nextCursor)}${query ? `&q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setAPPS(prev => [...prev, ...(Array.isArray(data?.items) ? data.items : []).map(mapRow)])
      setNextCursor(data?.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  // Same endpoint the „კატეგორიები“ tab uses — hidden ones are filtered out
  // because assigning a non-live category would keep the expert invisible.
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/categories', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: AdminCategory[]) => { if (!cancelled) setLiveCats(Array.isArray(d) ? d.filter(c => c.isLive) : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAll = () => {
    setChecked(prev => prev.size === APPS.length ? new Set() : new Set(APPS.map(a => a.id)))
  }

  // The category an application would resolve to on approval. Bulk approve sends
  // it EXPLICITLY per row (the single-application path already does) — without it
  // an applicant with a free-text niche is approved with categoryId null and
  // becomes an approved-but-INVISIBLE expert, since /tutors hard-requires a live
  // category. Rows that match nothing are excluded from the bulk action instead.
  const catIdFor = (appId: string) => matchCategory(APPS.find(a => a.id === appId)?.cat ?? '', liveCats)?.id

  const bulkDecide = async (action: 'approve' | 'reject', reason?: string, only?: string[]) => {
    const ids = only ?? Array.from(checked)
    if (busy || ids.length === 0) return
    setBusy(true)
    setFlash(null)
    setBulkProgress({ done: 0, total: ids.length })
    let ok = 0, fail = 0
    // Sequential — keeps the mini progress counter honest and avoids
    // spraying the mutation endpoint with N parallel PATCHes.
    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await fetch(`/api/applications/${ids[i]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            note: reason?.trim() || undefined,
            categoryId: action === 'approve' ? catIdFor(ids[i]) : undefined,
          }),
        })
        // adminOk, not `res.ok && data.ok !== false` — an expired session used
        // to hand back the sign-in HTML as a 200 with no `ok` key at all, and
        // `ok !== false` scored that as an approval. A whole bulk pass could
        // report „N დამტკიცდა“ without a single application changing.
        if (await adminOk(res)) ok++; else fail++
      } catch {
        fail++
      }
      setBulkProgress({ done: i + 1, total: ids.length })
    }
    setBulkProgress(null)
    setBusy(false)
    setFlash({
      kind: fail === 0 ? 'success' : 'error',
      msg: fail === 0
        ? `${ok} განაცხადი ${action === 'approve' ? 'დამტკიცდა' : 'უარყოფილია'}.`
        : `${ok} შესრულდა, ${fail} ვერ შესრულდა.`,
    })
    await load()
    onDecision?.()
  }

  // Split the checked set into „can be approved right now“ and „no live category
  // matches its სფერო" before opening the confirm dialog, so the moderator sees
  // exactly how many go through and how many need the single-application path.
  const askBulkApprove = () => {
    const ids = Array.from(checked)
    const approvable = ids.filter(id => !!catIdFor(id))
    if (approvable.length === 0) {
      setFlash({ kind: 'error', msg: 'ვერცერთ მონიშნულ განაცხადს სფერო ვერ დაემთხვა — დაამტკიცე ცალ-ცალკე და ხელით მიუთითე კატეგორია.' })
      return
    }
    setPendBulkApprove({ ids: approvable, skipped: ids.length - approvable.length })
  }

  const decide = async (action: 'approve' | 'reject' | 'revise', reasonArg?: string) => {
    if (busy || !sel) return
    setBusy(true)
    setFlash(null)
    try {
      // Reject and revise carry the dialog's required reason as the moderator
      // note; approve keeps using the optional inline textarea.
      const noteToSend = action === 'approve' ? note.trim() : reasonArg?.trim()
      const res = await fetch(`/api/applications/${sel}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // categoryId rides along on approve only — the server falls back to its
        // own name match when the key is absent, so we omit it when unset.
        // `verified` likewise: it is the moderator's explicit badge decision,
        // taken with the documents on screen, and defaults to NOT verified.
        body: JSON.stringify({
          action,
          note: noteToSend || undefined,
          categoryId: action === 'approve' ? (catId || undefined) : undefined,
          verified: action === 'approve' ? grantVerified : undefined,
        }),
      })
      // adminOk, not `data.ok === false` — see bulkDecide(). A moderation
      // decision must never claim success it can't prove.
      if (!(await adminOk(res))) {
        setFlash({ kind: 'error', msg: 'ოპერაცია ვერ შესრულდა.' })
        return
      }
      setFlash({ kind: 'success', msg: action === 'approve' ? 'განაცხადი დამტკიცდა.' : action === 'revise' ? 'განაცხადი შესასწორებლად დაბრუნდა.' : 'განაცხადი უარყოფილია.' })
      setNote('')
      await load()
      onDecision?.() // let parent re-fetch KPI stats
    } catch {
      setFlash({ kind: 'error', msg: 'ქსელის შეცდომა.' })
    } finally {
      setBusy(false)
    }
  }

  const active = APPS.find(a => a.id === sel) ?? null

  /* ONE fetch for the open application's heavy half — photo, uploaded documents
   * and the apply-flow JSON, all of which the list payload leaves out. There
   * used to be TWO effects hitting this same endpoint on every selection: one
   * filled `activeDocs` (what the JSX read), the other filled `detail` (what the
   * helpers read, and nothing rendered). Every click cost two round-trips and
   * half the panel was dead. `detailErr` is now RENDERED with a retry — before,
   * a failed request left the photo block saying „იტვირთება…“ forever, which is
   * indistinguishable from „this applicant has no photo“. */
  const loadDetail = useCallback(() => {
    if (!sel) { setDetail(null); setDetailErr(false); return }
    setDetail(null)
    setDetailErr(false)
    // A fresh applicant = a fresh decision. Never carry the previous
    // application's badge tick over to this one.
    setGrantVerified(false)
    fetch(`/api/admin/applications/${sel}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('detail'))))
      .then(d => {
        setDetail({
          avatarUrl: d?.user?.avatarUrl ?? null,
          idDocUrl: d?.idDocUrl ?? null,
          selfieUrl: d?.selfieUrl ?? null,
          certificates: d?.certificates ?? null,
          professionData: d?.professionData ?? null,
        })
      })
      .catch(() => setDetailErr(true))
  }, [sel])
  useEffect(() => { loadDetail() }, [loadDetail])
  // Everything derived from the loaded detail. `certs` is normalized because
  // the column is untyped JSON; `missing` is the explicit list of empty slots
  // (a blank space and a field that does not exist look identical otherwise).
  const certs = normalizeCertificates(detail?.certificates)
  const prof = summarizeProfessionData(detail?.professionData)
  const hasDoc = hasVerificationDocument(detail)
  const missing = active && detail
    ? missingApplicationParts({
      avatarUrl: detail.avatarUrl,
      phone: active.phone,
      city: active.city,
      motivation: active.motivation,
      linkedinUrl: active.linkedinUrl,
      websiteUrl: active.websiteUrl,
      introVideoUrl: active.introVideoUrl,
      introVideoId: active.introVideoId,
      professionData: detail.professionData,
      docs: detail,
    })
    : []
  // Pre-select the category the applicant's specialty resolves to; a niche that
  // matches nothing leaves the select empty (and shows the warning below it).
  useEffect(() => {
    setCatId(active ? (matchCategory(active.cat, liveCats)?.id ?? '') : '')
  }, [active, liveCats])
  return (
    <>
      <TabHeader
        eyebrow="განაცხადები · ექსპერტად მოთხოვნები"
        // Honest count: the server's per-status total when it has one, and the
        // loaded page size only as a fallback — the old title said „N განაცხადი
        // მოლოდინში" while showing whatever status was open.
        title={<>{counts[status] ?? APPS.length} {APP_STATUS_TABS.find(t => t.id === status)?.l.toLowerCase()}</>}
        sub={status === 'SUBMITTED'
          ? 'შეამოწმე ვინ არის, რას სთავაზობს და რა ფასად. მიზანი — 24 საათში.'
          : 'ისტორია — გადაწყვეტილება უკვე მიღებულია.'}
        actions={null}
      />
      {flash && (
        <div className="px-6 lg:px-8">
          <div role="alert" className={`rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        </div>
      )}
      <section className="px-6 lg:px-8 py-6 grid lg:grid-cols-[360px_1fr] gap-5">
        {/* Queue */}
        <aside className="rounded-card border border-ink-200 bg-white overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
            <Eyebrow tone="muted">რიგი · {APPS.length}</Eyebrow>
            <button type="button" onClick={load} disabled={loading} className="font-display text-meta font-semibold text-brand-700 disabled:text-ink-500">განახლება</button>
          </div>
          {/* STATUS TABS. The queue was hard-wired to SUBMITTED, so a decided
              application could not be opened at all from this panel — „რატომ
              უარვყავით ეს კაცი" was answerable only from the audit log. */}
          <div className="px-2 py-2 border-b border-ink-100 flex flex-wrap gap-1">
            {APP_STATUS_TABS.map(t => {
              const on = status === t.id
              const n = counts[t.id]
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { if (!on) { setStatus(t.id); setSel(null) } }}
                  aria-pressed={on}
                  className={`h-9 px-2.5 rounded-pill font-display text-meta font-semibold inline-flex items-center gap-1.5 transition-colors duration-fast ${
                    on ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  {t.l}
                  {typeof n === 'number' && n > 0 && (
                    <span className={`tabular-nums ${on ? 'text-white/70' : 'text-ink-400'}`}>{n}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="px-3 py-2 border-b border-ink-100">
            <div className="relative">
              <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={qInput}
                onChange={e => setQInput(e.target.value)}
                placeholder="სახელი, სფერო, ქალაქი, ელფოსტა…"
                aria-label="განაცხადების ძებნა"
                className="w-full h-11 pl-9 pr-8 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none"
              />
              {qInput && (
                <button
                  type="button"
                  onClick={() => setQInput('')}
                  aria-label="ძებნის გასუფთავება"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center"
                >
                  <Icon.x className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {/* Bulk-action bar — hidden when the queue is empty so we don't
              show a checkbox with nothing to check. */}
          {APPS.length > 0 && isOpenStatus(status) && (
            <div className="px-4 py-2.5 border-b border-ink-100 bg-ink-50/40">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked.size === APPS.length && APPS.length > 0}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-ink-300 text-ink-900 focus:ring-brand-500"
                />
                <span className="font-display text-meta font-semibold text-ink-700">
                  ყველას მონიშვნა{checked.size > 0 ? ` · ${checked.size} მონიშნული` : ''}
                </span>
              </label>
              {checked.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={askBulkApprove}
                    disabled={busy}
                    // h-10 sm:h-9 = the canon compact tier; h-8 is 32px, under
                    // the tap floor — and this one bulk-approves applications.
                    className="h-10 sm:h-9 px-3 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 text-white font-display font-semibold text-small inline-flex items-center gap-1"
                  >
                    <Icon.check className="w-3 h-3" /> მასობრივი დამტკიცება
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendReject('bulk')}
                    disabled={busy}
                    className="h-8 px-2.5 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 disabled:opacity-50 text-danger-700 font-display font-semibold text-meta inline-flex items-center gap-1"
                  >
                    <Icon.x className="w-3 h-3" /> მასობრივი უარყოფა
                  </button>
                </div>
              )}
              {bulkProgress && (
                <div className="mt-2 font-mono text-meta tabular-nums text-ink-600">
                  {bulkProgress.done}/{bulkProgress.total} დამუშავებულია
                </div>
              )}
            </div>
          )}
          {loading ? (
            <AdminLoading inset />
          ) : APPS.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ink-100 text-ink-500 mb-2"><Icon.check className="w-5 h-5" /></div>
              <div className="font-display text-small font-bold text-ink-900">{query ? 'ვერაფერი მოიძებნა' : 'ცარიელია'}</div>
              <div className="text-meta text-ink-500 mt-1">
                {query
                  ? <>„{query}“ — ამ სტატუსში დამთხვევა არ არის.</>
                  : status === 'SUBMITTED' ? 'არცერთი განაცხადი მოლოდინში არ არის.' : 'ამ სტატუსით განაცხადი არ არის.'}
              </div>
            </div>
          ) : APPS.map(a => (
            <div key={a.id} className={`flex items-start gap-2 px-4 py-3 border-b border-ink-100 last:border-b-0 hover:bg-ink-50/60 transition-colors duration-fast ${sel === a.id ? 'bg-brand-50/40' : ''}`}>
              {/* Checkbox is a sibling of the "select this row" button so
                  toggling doesn't also change which application is open. Only
                  open statuses can be bulk-actioned. */}
              {isOpenStatus(status) && (
                <input
                  type="checkbox"
                  aria-label={`მონიშვნა: ${a.name}`}
                  checked={checked.has(a.id)}
                  onChange={() => toggleCheck(a.id)}
                  className="mt-1 w-5 h-5 rounded border-ink-300 text-ink-900 focus:ring-brand-500 shrink-0"
                />
              )}
              <button type="button" onClick={() => setSel(a.id)} className="flex-1 min-w-0 text-left flex items-start gap-2.5">
                {/* The face, in the QUEUE. It costs a ~40-char URL per row
                    (/api/avatars/<id>?v=), and it is the fastest way to tell
                    twenty applications apart — initials are not. */}
                {a.photo
                  ? <img src={a.photo} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
                  : <span className="w-10 h-10 rounded-full bg-ink-100 text-ink-500 inline-flex items-center justify-center font-display font-bold text-small shrink-0" title="ფოტო არ აქვს">{a.name.charAt(0)}</span>}
                <span className="flex-1 min-w-0 block">
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 block">
                      <span className="block font-display text-small font-semibold text-ink-900 truncate">{a.name}</span>
                      <span className="block font-mono text-meta tabular-nums text-ink-400 mt-0.5 truncate">{a.cat}</span>
                    </span>
                    {a.urgent && status === 'SUBMITTED' && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-danger-50 border border-danger-200 text-danger-700 font-display text-micro font-bold uppercase shrink-0"><Icon.clock className="w-3 h-3" /> SLA</span>}
                  </span>
                  <span className="block mt-1.5 font-mono text-meta tabular-nums text-ink-500 truncate">{a.yrs} წ. · ₾{a.rate} · {a.city || '—'} · {a.sla}</span>
                </span>
              </button>
            </div>
          ))}
          {!loading && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={APPS.length} />}
        </aside>

        {/* Active application */}
        <div className="space-y-4 min-w-0">
          {!active ? (
            <div className="rounded-card border border-dashed border-ink-200 bg-white p-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ink-100 text-ink-500 mb-3"><Icon.chat className="w-6 h-6" /></div>
              <div className="font-display text-body-lg font-bold text-ink-900">აირჩიე განაცხადი</div>
              <div className="text-small text-ink-500 mt-1">მარცხნიდან — რიგში მოცემული ერთ-ერთი.</div>
            </div>
          ) : (
          <div className="rounded-card border border-ink-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* The photo that will appear on the PUBLIC profile, at a size a
                    face can actually be judged from — and IN THE HEADER, next to
                    the name, rather than in a separate block halfway down the
                    panel where it read as an afterthought. `detail.avatarUrl` is
                    the lazy-loaded blob; the queue row already showed the
                    cacheable URL, so `active.photo` covers the in-flight moment
                    and the header never flashes an initials circle for someone
                    who does have a photo. */}
                {(detail?.avatarUrl || active.photo) ? (
                  <img
                    src={detail?.avatarUrl || active.photo || ''}
                    alt={active.name}
                    className="w-16 h-16 rounded-full object-cover ring-1 ring-ink-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-700 inline-flex items-center justify-center font-display font-bold text-h3 ring-1 ring-ink-200 shrink-0" title={detail ? 'ფოტო არ აქვს ატვირთული' : 'იტვირთება…'}>
                    {active.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  {/* Wraps, never truncates: on a 390px panel „ნინო ტესტაშვილი“
                      became „ნინო ტესტ…“, and the applicant's name is the one
                      string on this screen that must always be readable. */}
                  <h2 className="font-display text-h3 font-bold text-ink-900 break-words">{active.name}</h2>
                  {/* „₾N“, not „₾N/სთ“: pricing is a flat per-booking amount the
                      expert sets — the column is still called `hourlyRate` for
                      legacy reasons, and the panel was repeating that legacy in
                      the UI. A trailing „·“ with nothing after it (null city)
                      was the other half of this line's problem. */}
                  <div className="font-mono text-meta tabular-nums text-ink-500">{active.cat} · {active.yrs} წ. · ₾{active.rate} · {active.city || '—'}</div>
                  {active.email && (
                    <a href={`mailto:${active.email}`} className="text-meta text-brand-700 hover:text-brand-800 mt-0.5 inline-block break-all">{active.email}</a>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-warning-50 border border-warning-200 text-warning-700 font-display text-micro font-bold uppercase"><Icon.clock className="w-3 h-3" /> {active.sla}</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {active.phone && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">ტელეფონი</div>
                  <a href={`tel:${active.phone}`} className="mt-1 block font-display text-small font-bold text-ink-900 tabular-nums hover:text-brand-700">{active.phone}</a>
                </div>
              )}
              {active.linkedinUrl && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">LinkedIn</div>
                  <a href={safeDocHref(active.linkedinUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 block font-display text-small font-semibold text-brand-700 hover:text-brand-800 truncate">{active.linkedinUrl}</a>
                </div>
              )}
              {active.websiteUrl && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">ვებგვერდი</div>
                  <a href={safeDocHref(active.websiteUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 block font-display text-small font-semibold text-brand-700 hover:text-brand-800 truncate">{active.websiteUrl}</a>
                </div>
              )}
              {active.createdAt && (
                <div className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                  <div className="font-display text-micro font-semibold uppercase text-ink-500">გაგზავნის დრო</div>
                  <div className="mt-1 font-mono text-meta tabular-nums text-ink-900">{fmtDT(active.createdAt)}</div>
                </div>
              )}
            </div>

            {active.introVideoId && (
              <div className="mb-4">
                <Eyebrow tone="muted" className="mb-2">ინტრო ვიდეო</Eyebrow>
                <a
                  href={active.introVideoUrl ?? `https://youtu.be/${active.introVideoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative aspect-video rounded-card overflow-hidden border border-ink-200 bg-ink-900 group"
                >
                  <img
                    src={`https://img.youtube.com/vi/${active.introVideoId}/hqdefault.jpg`}
                    alt="Intro video"
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-ink-900/20 group-hover:bg-ink-900/40 transition-colors duration-fast">
                    <span className="w-14 h-14 rounded-full bg-white/95 shadow-float inline-flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-brand-700 ml-1">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-5 px-2 rounded-pill bg-white/95 backdrop-blur text-micro font-display font-bold uppercase text-ink-800">
                    YouTube
                  </span>
                </a>
              </div>
            )}

            {/* One request feeds everything below. While it is in flight the
                blocks say „იტვირთება…“; if it FAILS the moderator is told and
                offered a retry — the old panel swallowed the error and left
                „იტვირთება…“ on screen forever, which reads exactly like „this
                applicant attached nothing". */}
            {detailErr && (
              <div className="rounded-card border border-danger-200 bg-danger-50 p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-small text-danger-800">
                  ფოტო, დოკუმენტები და განაცხადის დეტალები ვერ ჩაიტვირთა — <b>ეს არ ნიშნავს, რომ არ არსებობს</b>.
                </div>
                <button type="button" onClick={loadDetail} className="h-9 px-3 rounded-btn bg-white border border-danger-200 text-danger-700 font-display text-meta font-semibold inline-flex items-center gap-1.5">
                  <Icon.refresh className="w-3.5 h-3.5" /> ხელახლა
                </button>
              </div>
            )}

            {/* WHAT THEY OFFER — the whole point of the review, and until
                2026-08-03 it was rendered with `String(v)` over the raw JSON, so
                headline/languages/services printed „[object Object]“. The
                shaping helpers existed in _application.ts the whole time and
                were computed but never rendered. */}
            <div className="rounded-card border border-ink-100 bg-white p-4 mb-4">
              <Eyebrow tone="muted" className="mb-2">განაცხადი</Eyebrow>
              {!detail && !detailErr ? (
                <AdminLoading />
              ) : prof.isEmpty ? (
                <NothingHere>განაცხადში სერვისები, ენები და სათაური არ არის შევსებული.</NothingHere>
              ) : (
                <div className="space-y-4">
                  {prof.headline && (
                    <div>
                      <Eyebrow tone="muted">სათაური</Eyebrow>
                      <p className="mt-1 font-display text-body font-semibold text-ink-900 break-words">{prof.headline}</p>
                    </div>
                  )}
                  {prof.languages.length > 0 && (
                    <div>
                      <Eyebrow tone="muted">ენები</Eyebrow>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {prof.languages.map((l, i) => (
                          <span key={i} className="inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 bg-white text-meta text-ink-700">{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {prof.services.length > 0 && (
                    <div>
                      <Eyebrow tone="muted">სერვისები</Eyebrow>
                      <ul className="mt-1.5 space-y-2">
                        {prof.services.map((sv, i) => (
                          <li key={i} className="rounded-card border border-ink-100 bg-ink-50/40 p-3">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-display text-small font-bold text-ink-900 break-words">{sv.name || 'უსახელო სერვისი'}</span>
                              <span className="font-mono text-meta tabular-nums text-ink-700 shrink-0">
                                {sv.minutes != null ? `${sv.minutes} წთ` : '— წთ'} · {sv.free ? 'უფასო' : sv.price != null ? `₾${sv.price}` : 'ფასი არ არის'}
                              </span>
                            </div>
                            {sv.desc && <p className="mt-1 text-meta text-ink-600 leading-relaxed whitespace-pre-wrap">{sv.desc}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {prof.extras.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {prof.extras.map(e => <ReviewField key={e.key} label={e.label} value={e.value} />)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-card border border-ink-100 bg-ink-50/40 p-4 mb-4">
              <Eyebrow tone="muted" className="mb-2">მოტივაცია</Eyebrow>
              {active.motivation
                ? <p className="text-small text-ink-700 leading-relaxed whitespace-pre-wrap">{active.motivation}</p>
                : <NothingHere>ტექსტი არ დაუწერია.</NothingHere>}
            </div>

            {/* Verification documents — diplomas/certificates, plus the legacy
                ID/selfie pair. Every tile goes through DocTile (safe href +
                a real file label instead of a 12 000-character data: string). */}
            <div className="rounded-card border border-ink-100 bg-white p-4 mb-4">
              <Eyebrow tone="muted" className="mb-2">დოკუმენტები</Eyebrow>
              {!detail && !detailErr ? (
                <AdminLoading />
              ) : hasDoc ? (
                <div className="flex flex-wrap gap-3">
                  {detail?.idDocUrl && <DocTile caption="პირადობა" url={detail.idDocUrl} />}
                  {detail?.selfieUrl && <DocTile caption="სელფი" url={detail.selfieUrl} />}
                  {certs.map((c, i) => <DocTile key={i} caption={c.title} url={c.url} />)}
                </div>
              ) : (
                <NothingHere>არაფერი აქვს მიმაგრებული — შესამოწმებელი დოკუმენტი არ არსებობს.</NothingHere>
              )}
            </div>

            {/* „What is missing“ — computed for the whole application, so an
                empty slot is stated instead of rendering as blank space. This is
                also the honest input to the „გადამოწმებული“ decision below. */}
            {detail && missing.length > 0 && (
              <div className="rounded-card border border-warning-200 bg-warning-50/60 p-4 mb-4">
                <Eyebrow tone="muted" className="mb-2">რა აკლია ({missing.length})</Eyebrow>
                <ul className="space-y-1">
                  {missing.map(m => (
                    <li key={m.key} className="text-small text-ink-700 flex items-start gap-1.5">
                      <Icon.x className="w-3 h-3 mt-1 shrink-0 text-warning-700" />
                      <span>{m.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Decision controls exist only while the decision is still open.
                On an APPROVED/REJECTED row they used to render in full — three
                live buttons offering to re-decide something already decided,
                with no sign of what was decided or when. */}
            {isOpenStatus(active.status ?? status) ? (
            <>
            <div className="mb-3">
              <Eyebrow as="label" tone="muted" className="block mb-1.5">მოდერატორის ჩანაწერი (სურვ.)</Eyebrow>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="მიზეზი / კომენტარი — შენახვისთვის"
                className="w-full px-3 py-2 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none resize-none"
              />
            </div>
            {/* Category assignment — sent with „დაამტკიცე“. Without a live
                category the approved expert never appears on /tutors, so an
                unmatched niche gets a loud (not decorative) warning. */}
            <div className="mb-3">
              <Eyebrow as="label" tone="muted" className="block mb-1.5">კატეგორია</Eyebrow>
              <select
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
                className="w-full sm:max-w-[280px] h-11 px-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-400 focus:outline-none"
              >
                <option value="">— არ არის მითითებული —</option>
                {liveCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!catId && liveCats.length > 0 && (
                <p className="mt-1.5 text-meta text-danger-700">
                  „{active.cat}“ ვერცერთ სფეროს ვერ დაემთხვა. თუ კატეგორიას არ მიუთითებ, ექსპერტი /tutors-ზე არ გამოჩნდება — აირჩიე სფერო ან ჯერ დაამატე „კატეგორიები“ ტაბში.
                </p>
              )}
            </div>
            {/* „გადამოწმებული“ — a PUBLIC trust badge on every card and profile,
                so it must be a deliberate act taken with the documents on
                screen, never a default. Not hard-blocked when nothing is
                attached (a moderator may have checked out of band), but the
                consequence is stated so it can't be granted by accident. The
                choice is audited together with whether a document existed. */}
            <label className="mb-3 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={grantVerified}
                onChange={e => setGrantVerified(e.target.checked)}
                className="mt-0.5 w-5 h-5 shrink-0 accent-brand-500"
              />
              <span className="min-w-0">
                <span className="block font-display text-small font-semibold text-ink-900">მიანიჭე „გადამოწმებული“</span>
                <span className="block text-meta text-ink-600 mt-0.5 leading-snug">
                  {detail && !hasDoc
                    ? 'დოკუმენტი მიმაგრებული არ არის — ნიშანი მხოლოდ მაშინ მიანიჭე, თუ სხვა გზით გადაამოწმე.'
                    : 'ნიშანი ყველა ბარათსა და პროფილზე გამოჩნდება.'}
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPendApprove(true)} disabled={busy} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 text-white font-display font-semibold text-body inline-flex items-center gap-1.5"><Icon.check className="w-3.5 h-3.5" /> {busy ? 'იგზავნება…' : 'დაამტკიცე'}</button>
              <button type="button" onClick={() => setPendRevise(true)} disabled={busy} className="h-11 px-4 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 disabled:opacity-50 text-ink-700 font-display font-semibold text-small inline-flex items-center gap-1.5">შესწორება</button>
              <button type="button" onClick={() => setPendReject('single')} disabled={busy} className="h-11 px-4 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 disabled:opacity-50 text-danger-700 font-display font-semibold text-small inline-flex items-center gap-1.5"><Icon.x className="w-3.5 h-3.5" /> უარყავი</button>
            </div>
            </>
            ) : (
              <div className="rounded-card border border-ink-200 bg-ink-50/40 p-4">
                <Eyebrow tone="muted" className="mb-2">გადაწყვეტილება</Eyebrow>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center h-6 px-2 rounded-pill font-display text-meta font-bold ${
                    active.status === 'APPROVED' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-700 border border-danger-200'
                  }`}>
                    {active.status === 'APPROVED' ? 'დამტკიცებული' : 'უარყოფილი'}
                  </span>
                  {active.reviewedAt && <span className="font-mono text-meta tabular-nums text-ink-600">{fmtDT(active.reviewedAt)}</span>}
                </div>
                {active.moderatorNote
                  ? <p className="mt-2 text-small text-ink-700 whitespace-pre-wrap leading-relaxed">{active.moderatorNote}</p>
                  : <p className="mt-2 text-meta text-ink-500">მოდერატორის ჩანაწერი არ დარჩენილა.</p>}
              </div>
            )}
          </div>
          )}
        </div>
      </section>
      <AdminConfirmDialog
        open={pendReject !== null}
        title={pendReject === 'bulk' ? `${checked.size} განაცხადის უარყოფა` : 'განაცხადის უარყოფა'}
        body={pendReject === 'bulk'
          ? 'მიზეზი გაეგზავნება ყველა მონიშნულ განმცხადებელს.'
          : <>მიზეზი გაეგზავნება განმცხადებელს: <span className="font-display font-semibold">{active?.name ?? ''}</span></>}
        tone="danger"
        reason="required"
        confirmLabel="უარყავი"
        busy={busy}
        onCancel={() => setPendReject(null)}
        onConfirm={async (reason) => {
          const mode = pendReject
          setPendReject(null)
          if (mode === 'bulk') await bulkDecide('reject', reason)
          else await decide('reject', reason)
        }}
      />
      {/* Single approve — same consequence as bulk approve × 1 (promotion to a
          public expert, no undo), so it earns the same dialog. */}
      <AdminConfirmDialog
        open={pendApprove}
        title="განაცხადის დამტკიცება"
        body={<>
          <span className="font-display font-semibold">{active?.name ?? ''}</span> გახდება ექსპერტი — შეიქმნება პროფილი და გამოჩნდება საიტზე. უკან დაბრუნება არ არსებობს.
          {active && !catId && (
            <span className="mt-2 block text-danger-700">
              კატეგორია მითითებული არ არის — ექსპერტი /tutors-ზე არ გამოჩნდება, სანამ კატეგორიას არ მიანიჭებ.
            </span>
          )}
        </>}
        tone="brand"
        confirmLabel="დაამტკიცე"
        busy={busy}
        onCancel={() => setPendApprove(false)}
        onConfirm={async () => {
          setPendApprove(false)
          await decide('approve')
        }}
      />
      <AdminConfirmDialog
        open={pendBulkApprove !== null}
        title={`${pendBulkApprove?.ids.length ?? 0} განაცხადის დამტკიცება`}
        body={<>
          ეს {pendBulkApprove?.ids.length ?? 0} განმცხადებელი გახდება ექსპერტი — შეიქმნება პროფილი და გამოჩნდება საიტზე. უკან დაბრუნება არ არსებობს.
          {(pendBulkApprove?.skipped ?? 0) > 0 && (
            <span className="mt-2 block text-danger-700">
              {pendBulkApprove?.skipped} განაცხადს სფერო ვერ დაემთხვა — გამოტოვდება. დაამტკიცე ცალ-ცალკე და ხელით მიუთითე კატეგორია, თორემ ექსპერტი /tutors-ზე არ გამოჩნდება.
            </span>
          )}
        </>}
        tone="brand"
        confirmLabel="დაამტკიცე"
        busy={busy}
        onCancel={() => setPendBulkApprove(null)}
        onConfirm={async () => {
          const ids = pendBulkApprove?.ids ?? []
          setPendBulkApprove(null)
          await bulkDecide('approve', undefined, ids)
        }}
      />
      <AdminConfirmDialog
        open={pendRevise}
        title="განაცხადის შესწორება"
        body={<>მიუთითე რა უნდა შეასწოროს — გაეგზავნება განმცხადებელს: <span className="font-display font-semibold">{active?.name ?? ''}</span></>}
        tone="warning"
        reason="required"
        reasonLabel="რა უნდა შესწორდეს"
        reasonPlaceholder="მაგ. სახელი ქართულად ჩაწერე"
        confirmLabel="გააგზავნე"
        busy={busy}
        onCancel={() => setPendRevise(false)}
        onConfirm={async (reason) => {
          setPendRevise(false)
          await decide('revise', reason)
        }}
      />
    </>
  )
}

