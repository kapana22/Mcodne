'use client'
// Admin tab: მომხმარებლები — list, detail modal, per-tutor toggles.

import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_AVATAR } from '@/lib/defaultAvatar'
import { broadcastSessionChange } from '@/lib/sessionSignal'
import { fmtKaDate } from '@/lib/kaDate'
import { isAnonymized } from '@/lib/userDeletion'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/Eyebrow'
import { EmptyState } from '@/components/EmptyState'
import { AdminConfirmDialog, AdminMessageDialog, AdminDeleteUserDialog, TabHeader, adminOk, AdminLoading, AdminError, type DeleteImpact, type DeleteMode, downloadCsv, KA_STATUS, fmtShort, fmtDT, LoadMoreBar } from './_parts'
import { CategorySelect, useAssignableCategories } from './_categoryPicker'
import { ROLE, roleLabel as roleLabelOf } from '@/lib/roles'

/* ───── User detail modal (opens from Users row click) ───── */
type UserDetail = {
  user: {
    id: string; email: string; fullName: string;
    role: 'USER' | 'PROVIDER' | 'ADMIN';
    emailVerified: boolean; createdAt: string; avatarUrl: string | null;
    phone?: string | null; bio?: string | null;
    suspendedAt?: string | null;
    // ⚠️ IT WAS `tutor`, AND THE PANEL WAS READING A KEY NOBODY SENT
    // (2026-08-25). The API has returned `serviceProfile` since the consultation
    // product was removed, so `u.tutor` was always undefined — which meant the
    // block holding the „გადამოწმებული" toggle and the category picker never
    // rendered, and an admin silently lost both controls. The three fetches
    // inside them still pointed at /api/admin/experts/…, a prefix that no longer
    // exists; nobody noticed, because the buttons could not be reached to fail.
    serviceProfile?: {
      id: string; slug: string | null;
      headline: string | null; professions: string[];
      services: string[]; areas: string[];
      priceFrom: number | null; calloutFee: number | null;
      verified: boolean; featured: boolean;
      available: boolean; published: boolean;
      servicesConfirmedAt: string | null;
      category?: { id: string; slug: string; name: string } | null;
    } | null;
    _count: { reviewsGiven: number; notifications: number; favorites: number; serviceRequests: number; requestOffers: number };
  }
  // What the API actually sends. ⚠️ `bookingsAsStudent`, `bookingsAsTutor` and
  // `reviewsReceived` were declared here and are GONE: reading
  // `data.bookingsAsStudent.length` in the tab label threw the moment anybody
  // opened a user, because the key is simply not in the response.
  reviewsWritten: any[]
  requests: any[]
  offers: any[]
  recentNotifications: any[]
  // Real totals for the delete dialog. The arrays above are capped at take:30/15,
  // so they can't be used to tell an admin what a deletion would destroy.
  deleteImpact?: DeleteImpact
}

const UserDetailModal = ({ userId, onClose, onImpersonate, onChanged, onDeleted }: { userId: string | null; onClose: () => void; onImpersonate: (userId: string, fullName: string) => void; onChanged?: () => void; onDeleted?: (msg: string) => void }) => {
  const [data, setData] = useState<UserDetail | null>(null)
  const [tab, setTab] = useState<'profile' | 'work' | 'reviews' | 'activity'>('profile')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Suspend/unsuspend flow — confirm dialog with a required reason on suspend.
  const [pendSuspend, setPendSuspend] = useState(false)
  const [suspBusy, setSuspBusy] = useState(false)
  const [roleBusy, setRoleBusy] = useState(false)
  // Grant/revoke ADMIN goes through the shared confirm dialog — it used to fire
  // on a single un-confirmed click, the most dangerous one-click in the panel.
  const [pendRole, setPendRole] = useState<'makeAdmin' | 'revokeAdmin' | null>(null)
  // Account removal — see AdminDeleteUserDialog for why it isn't a confirm.
  const [deleteOpen, setDeleteOpen] = useState(false)
  // „მიწერე“ — the only way to contact ONE person from here (see AdminMessageDialog).
  const [composeOpen, setComposeOpen] = useState(false)
  const [sentMsg, setSentMsg] = useState<string | null>(null)
  // True once any mutation (suspend/role/verified/featured) succeeded — the
  // parent list is stale then, so closing the modal triggers onChanged and the
  // list refetches instead of keeping the pre-mutation rows.
  const dirtyRef = useRef(false)

  const close = useCallback(() => {
    if (dirtyRef.current) { dirtyRef.current = false; onChanged?.() }
    onClose()
  }, [onChanged, onClose])

  useEffect(() => {
    if (!userId) { setData(null); setErr(null); setSentMsg(null); setDeleteOpen(false); setTab('profile'); return }
    let cancelled = false
    dirtyRef.current = false
    setLoading(true); setErr(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('load')
        const j = await res.json()
        if (!cancelled) setData(j)
      } catch {
        if (!cancelled) setErr('ჩატვირთვა ვერ მოხერხდა')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [userId, close])

  if (!userId) return null

  const u = data?.user
  const provider = u?.serviceProfile ?? null

  const doSuspendToggle = async (reason: string) => {
    if (!u || suspBusy) return
    setSuspBusy(true)
    setErr(null)
    const action = u.suspendedAt ? 'unsuspend' : 'suspend'
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) {
        setErr(j?.message ?? 'ოპერაცია ვერ შესრულდა')
        return
      }
      dirtyRef.current = true
      setData(prev => prev
        ? { ...prev, user: { ...prev.user, suspendedAt: j.user?.suspendedAt ?? null } }
        : prev)
    } catch {
      setErr('ქსელის შეცდომა')
    } finally {
      setSuspBusy(false)
      setPendSuspend(false)
    }
  }

  // Grant / revoke ADMIN. The server enforces the hard guards (no self-demote,
  // never the last admin); here we just reflect the returned role. Reached only
  // through the confirm dialog below — the reason lands in the audit meta.
  const doRoleChange = async (action: 'makeAdmin' | 'revokeAdmin', reason: string) => {
    if (!u || roleBusy) return
    setRoleBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      })
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok || !j.ok) { setErr(j?.message ?? 'ოპერაცია ვერ შესრულდა'); return }
      dirtyRef.current = true
      setData(prev => prev ? { ...prev, user: { ...prev.user, role: j.user?.role ?? prev.user.role } } : prev)
    } catch {
      setErr('ქსელის შეცდომა')
    } finally {
      setRoleBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-sheet flex items-start sm:items-center justify-center p-0 sm:p-6">
      <button type="button" aria-label="დახურვა" onClick={close} className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" className="relative w-full sm:max-w-[880px] max-h-[95vh] bg-white sm:rounded-card shadow-float overflow-hidden flex flex-col motion-safe:animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-ink-200 flex items-start justify-between gap-4 shrink-0">
          {loading || !u ? (
            <AdminLoading />
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-12 h-12 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-display text-h3 font-bold text-ink-900 truncate">{u.fullName}</div>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                    u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                    : u.role === ROLE.PROVIDER ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'bg-ink-50 border-ink-200 text-ink-600'
                  }`}>{roleLabelOf(u.role)}</span>
                  {u.emailVerified && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-success-50 border border-success-200 text-success-700 font-display text-micro font-bold uppercase"><Icon.check className="w-3 h-3" /> ვერიფ.</span>}
                  {/* Anonymized outranks suspended: the pause is not a pause
                      here, it is the thing keeping the tombstone off the public
                      site, and it can no longer be lifted. Saying „შეჩერებული"
                      would invite an admin to try. */}
                  {isAnonymized(u.email)
                    ? <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-ink-900 text-white font-display text-micro font-bold uppercase"><Icon.warn className="w-3 h-3" /> ანონიმიზებული</span>
                    : u.suspendedAt && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-pill bg-danger-50 border border-danger-200 text-danger-700 font-display text-micro font-bold uppercase"><Icon.pause className="w-3 h-3" /> შეჩერებული</span>}
                </div>
                <div className="text-meta text-ink-500 font-mono truncate mt-0.5">{u.email}</div>
              </div>
            </div>
          )}
          <button type="button" onClick={close} aria-label="დახურვა" className="w-9 h-9 rounded-btn text-ink-500 hover:bg-ink-100 inline-flex items-center justify-center shrink-0">
            <Icon.x className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        {u && (
          <div className="px-6 border-b border-ink-100 flex items-center gap-1 overflow-x-auto shrink-0">
            {[
              { id: 'profile' as const, l: 'პროფილი' },
              // ⚠️ „ჯავშნები" BECAME „საქმეები" (2026-08-25). It counted this
              // person's bookings on both sides; there are none, and the two
              // arrays it read are not in the payload — so this label threw and
              // took the whole drawer with it. What says the same thing now is
              // what they ASKED for and what they OFFERED.
              { id: 'work' as const, l: `საქმეები (${data.requests.length + data.offers.length})` },
              { id: 'reviews' as const, l: `შეფასებები (${data.reviewsWritten.length})` },
              { id: 'activity' as const, l: `აქტივობა (${data.recentNotifications.length})` },
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`shrink-0 inline-flex items-center h-11 px-3 font-display text-small font-semibold tracking-tight border-b-2 transition-colors duration-fast ${
                  tab === t.id ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'
                }`}
              >
                {t.l}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {err && <AdminError message={err} className="m-6" />}
          {sentMsg && <div role="status" className="m-6 p-3 rounded-btn bg-success-50 border border-success-200 text-success-800 text-small">{sentMsg}</div>}
          {u && data && (
            <>
              {tab === 'profile' && (
                <div className="px-6 py-5 space-y-5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="რეგისტრაცია" value={fmtShort(u.createdAt)} />
                    <Field label="ტელეფონი" value={u.phone ?? '—'} />
                    <Field label="მოთხოვნები" value={String(u._count.serviceRequests)} />
                    <Field label="შეთავაზებები" value={String(u._count.requestOffers)} />
                    <Field label="დაწერილი შეფასებები" value={String(u._count.reviewsGiven)} />
                    <Field label="ფავორიტები" value={String(u._count.favorites)} />
                  </div>
                  {u.bio && (
                    <div>
                      <Eyebrow tone="muted" className="mb-2">ბიო</Eyebrow>
                      <p className="text-body text-ink-700 whitespace-pre-wrap">{u.bio}</p>
                    </div>
                  )}
                  {provider && (
                    <div className="rounded-card border border-brand-200 bg-brand-50/40 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                        <Eyebrow>პროვაიდერის პროფილი</Eyebrow>
                        <div className="flex items-center gap-2">
                          <VerifiedToggle providerId={provider.id} initial={provider.verified} onSaved={() => { dirtyRef.current = true }} />
                          <FeaturedToggle providerId={provider.id} initial={provider.featured} onSaved={() => { dirtyRef.current = true }} />
                        </div>
                      </div>
                      {/* Category is EDITABLE here — see CategoryPicker below
                          for why a read-only line was the wrong control. */}
                      <CategoryPicker
                        providerId={provider.id}
                        initial={provider.category?.id ?? ''}
                        onSaved={() => { dirtyRef.current = true }}
                      />
                      {/* ⚠️ THE ROW AN ADMIN NEEDS MOST SINCE THE MIGRATION.
                          The 27 who came across were seeded with their whole
                          category — a lawyer claiming all seven legal services —
                          and only they can narrow it. This says whether they
                          have been back to look, so the admin knows who to
                          chase without opening every profile. */}
                      <div className={`mt-3 rounded-btn px-3 py-2 text-small ${
                        provider.servicesConfirmedAt
                          ? 'bg-white border border-ink-200 text-ink-600'
                          : 'bg-warning-50 border border-warning-200 text-warning-800'
                      }`}>
                        {provider.servicesConfirmedAt
                          ? `სერვისები დაადასტურა — ${fmtShort(provider.servicesConfirmedAt)}`
                          : 'სერვისები ჯერ არ გადაუხედავს — სია მიგრაციისას შეივსო'}
                      </div>
                      <div className="mt-3 grid sm:grid-cols-2 gap-3 text-small">
                        <div><span className="text-ink-500">სერვისები:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{provider.services.length}</span></div>
                        <div><span className="text-ink-500">ქალაქები:</span> <span className="font-display font-bold text-ink-900 tabular-nums">{provider.areas.length}</span></div>
                        <div>
                          <span className="text-ink-500">ფასი:</span>{' '}
                          <span className="font-display font-bold text-ink-900 tabular-nums">
                            {provider.priceFrom ? `${provider.priceFrom}₾-დან` : provider.calloutFee ? `გამოძახება ${provider.calloutFee}₾` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-ink-500">კატალოგში:</span>{' '}
                          <span className="font-display font-bold text-ink-900">
                            {provider.published && provider.available ? '✓ ჩანს' : 'არ ჩანს'}
                          </span>
                        </div>
                        {provider.slug && (
                          <div className="min-w-0">
                            <span className="text-ink-500">გვერდი:</span>{' '}
                            <a
                              href={`/experts/${provider.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tap-area font-display font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 break-all"
                            >
                              /experts/{provider.slug}
                            </a>
                          </div>
                        )}
                      </div>
                      {provider.headline && (
                        <div className="mt-3 text-small text-ink-700"><span className="font-display font-semibold">სათაური:</span> {provider.headline}</div>
                      )}
                      {/* What this provider calls themselves (lib/professions) —
                          several, and the finest-grained thing on the profile.
                          Read-only here: the provider owns it, and the one thing
                          an admin needs is to SEE it while judging a report. */}
                      {provider.professions.length > 0 && (
                        <div className="mt-3">
                          <Eyebrow tone="muted" className="mb-1.5">პროფესიები</Eyebrow>
                          <div className="flex flex-wrap gap-1">
                            {provider.professions.map(job => (
                              <span key={job} className="inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 bg-white text-meta text-ink-700">{job}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* ⚠️ IT WAS „ჯავშნები" AND IT RENDERED FROM TWO ARRAYS THE API
                  DOES NOT SEND. Both sides of a booking are gone; the two
                  things this account can have now are the requests it FILED and
                  the offers it WROTE, which is the same question — what has
                  this person done here — asked of the product that exists. */}
              {tab === 'work' && (
                <div className="px-6 py-5 space-y-6">
                  {data.requests.length > 0 && (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">მოთხოვნები ({data.requests.length})</Eyebrow>
                      <ul className="divide-y divide-ink-100">
                        {data.requests.map((r: any) => (
                          <li key={r.id} className="py-2.5 flex items-baseline gap-3">
                            <span className="font-mono text-meta text-ink-500 shrink-0">{r.publicRef}</span>
                            <span className="font-display text-small font-semibold text-ink-900 truncate flex-1 min-w-0">{r.topic}</span>
                            <span className="text-meta text-ink-600 shrink-0">{KA_STATUS[r.status] ?? r.status}</span>
                            <span className="font-mono text-meta tabular-nums text-ink-400 shrink-0">{fmtShort(r.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.offers.length > 0 && (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">შეთავაზებები ({data.offers.length})</Eyebrow>
                      <ul className="divide-y divide-ink-100">
                        {data.offers.map((o: any) => (
                          <li key={o.id} className="py-2.5 flex items-baseline gap-3">
                            <span className="font-display text-small font-bold text-ink-900 tabular-nums shrink-0">{o.priceGel}₾</span>
                            <span className="text-meta text-ink-600 flex-1 min-w-0">{KA_STATUS[o.status] ?? o.status}</span>
                            {o.doneAt && <span className="text-meta text-success-700 shrink-0">დასრულდა</span>}
                            <span className="font-mono text-meta tabular-nums text-ink-400 shrink-0">{fmtShort(o.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {data.requests.length === 0 && data.offers.length === 0 && (
                    <EmptyState variant="inline" icon={<Icon.list className="w-6 h-6" />} title="საქმეები ჯერ არ არის" description="ამ ანგარიშს არც მოთხოვნა და არც შეთავაზება არ ჰქონია." />
                  )}
                </div>
              )}
              {tab === 'reviews' && (
                <div className="px-6 py-5 space-y-6">
                  {/* ⚠️ „მიღებული" IS GONE (2026-08-25) — the API sends only the
                      reviews this account WROTE. A review hangs on a finished
                      offer now (Review.offerId), not on a tutor id, so „reviews
                      received by this person" is a join nothing performs yet.
                      Showing an always-empty half read as „nobody rates them". */}
                  {data.reviewsWritten.length > 0 ? (
                    <div>
                      <Eyebrow tone="muted" className="mb-3">დაწერილი ({data.reviewsWritten.length})</Eyebrow>
                      <ReviewList items={data.reviewsWritten} />
                    </div>
                  ) : (
                    <EmptyState variant="inline" icon={<Icon.star className="w-6 h-6" />} title="შეფასებები ჯერ არ არის" description="ამ ანგარიშს შეფასება არ დაუწერია." />
                  )}
                </div>
              )}
              {tab === 'activity' && (
                <div className="px-6 py-5">
                  {data.recentNotifications.length === 0 ? (
                    <EmptyState variant="inline" icon={<Icon.bell className="w-6 h-6" />} title="შეტყობინება ჯერ არ არის" description="ბოლო აქტივობა აქ გამოჩნდება." />
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {data.recentNotifications.map((n: any) => (
                        <li key={n.id} className="py-2.5 flex items-start gap-3">
                          <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${n.readAt ? 'bg-ink-300' : 'bg-brand-500'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="font-display text-small font-semibold text-ink-900 truncate">{n.title}</div>
                            {n.body && <div className="text-meta text-ink-600 mt-0.5 truncate">{n.body}</div>}
                            <div className="font-mono text-meta tabular-nums text-ink-400 mt-1">{fmtDT(n.createdAt)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {u && (
          <div className="px-6 py-3 border-t border-ink-100 bg-ink-50/40 flex items-center justify-between gap-3 shrink-0">
            <div className="text-meta text-ink-500 font-mono">ID: {u.id}</div>
            <div className="flex items-center gap-2">
              {/* Grant / revoke ADMIN — opens the confirm dialog below (reason
                  required). Server refuses self-demote + last-admin. */}
              {u.role === 'ADMIN' ? (
                <button
                  type="button"
                  onClick={() => setPendRole('revokeAdmin')}
                  disabled={roleBusy}
                  className="h-9 px-3 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 text-danger-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-50"
                >
                  <Icon.shield className="w-3.5 h-3.5" /> ადმინის მოხსნა
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendRole('makeAdmin')}
                  disabled={roleBusy}
                  className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-50"
                >
                  <Icon.shield className="w-3.5 h-3.5" /> ადმინად დანიშვნა
                </button>
              )}
              {/* No suspend toggle on an anonymized account: the server refuses
                  the unsuspend (it would republish the tombstone profile), and
                  a control whose only outcome is an error is worse than none. */}
              {u.role !== 'ADMIN' && !isAnonymized(u.email) && (
                <button
                  type="button"
                  onClick={() => setPendSuspend(true)}
                  disabled={suspBusy}
                  className={`h-9 px-3 rounded-btn font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast disabled:opacity-50 ${
                    u.suspendedAt
                      ? 'bg-white border border-success-200 hover:bg-success-50 text-success-700'
                      : 'bg-white border border-danger-200 hover:bg-danger-50 text-danger-700'
                  }`}
                >
                  <Icon.pause className="w-3.5 h-3.5" /> {u.suspendedAt ? 'შეჩერების მოხსნა' : 'შეჩერება'}
                </button>
              )}
              {/* Removal. Never on an admin — the server refuses it too, but a
                  button that only ever errors is worse than no button. */}
              {u.role !== 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="h-9 px-3 rounded-btn bg-white border border-danger-200 hover:bg-danger-50 text-danger-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
                >
                  <Icon.warn className="w-3.5 h-3.5" /> წაშლა
                </button>
              )}
              <button
                type="button"
                onClick={() => onImpersonate(u.id, u.fullName)}
                className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 hover:text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
              >
                <Icon.external className="w-3.5 h-3.5" /> შესვლა როგორც
              </button>
              {/* The missing middle: before this, an admin could suspend or
                  impersonate this person but not simply write to them. */}
              <button
                type="button"
                onClick={() => { setSentMsg(null); setComposeOpen(true) }}
                className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 hover:border-ink-300 text-ink-700 hover:text-ink-800 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
              >
                <Icon.mail className="w-3.5 h-3.5" /> მიწერე
              </button>
              <button type="button" onClick={close} className="h-9 px-3 rounded-btn bg-brand-600 hover:bg-brand-700 text-white font-display font-semibold text-small transition-colors duration-fast">
                დახურვა
              </button>
            </div>
          </div>
        )}
      </div>
      {u && (
        <AdminConfirmDialog
          open={pendRole !== null}
          title={pendRole === 'makeAdmin' ? 'ადმინად დანიშვნა' : 'ადმინის მოხსნა'}
          body={pendRole === 'makeAdmin'
            ? <>{u.fullName} მიიღებს სრულ წვდომას ადმინ პანელზე — მომხმარებლები, მოთხოვნები, ფინანსები, იმპერსონაცია.</>
            : <>{u.fullName} დაკარგავს ადმინის უფლებებს და ყველა სესიიდან გავა.</>}
          tone="danger"
          reason="required"
          reasonLabel="მიზეზი (სავალდებულო · ინახება აუდიტში)"
          confirmLabel={pendRole === 'makeAdmin' ? 'დანიშნე' : 'მოხსენი'}
          busy={roleBusy}
          onCancel={() => setPendRole(null)}
          onConfirm={async (reason) => {
            const action = pendRole
            setPendRole(null)
            if (action) await doRoleChange(action, reason)
          }}
        />
      )}
      {u && (
        <AdminConfirmDialog
          open={pendSuspend}
          title={u.suspendedAt ? 'შეჩერების მოხსნა' : 'ანგარიშის შეჩერება'}
          body={u.suspendedAt
            ? <>{u.fullName} კვლავ შეძლებს შესვლას.</>
            : <>{u.fullName} ვეღარ შევა ანგარიშზე, სანამ შეჩერება არ მოიხსნება.</>}
          tone={u.suspendedAt ? 'brand' : 'danger'}
          reason="optional"
          reasonLabel={u.suspendedAt ? 'მიზეზი (სურვ.)' : 'მიზეზი (სურვ. · ინახება აუდიტში)'}
          confirmLabel={u.suspendedAt ? 'მოხსენი' : 'შეაჩერე'}
          busy={suspBusy}
          onCancel={() => setPendSuspend(false)}
          onConfirm={doSuspendToggle}
        />
      )}
      {u && (
        <AdminMessageDialog
          open={composeOpen}
          user={{ id: u.id, fullName: u.fullName, email: u.email }}
          onClose={() => setComposeOpen(false)}
          onSent={msg => setSentMsg(msg)}
        />
      )}
      {u && (
        <AdminDeleteUserDialog
          open={deleteOpen}
          user={{ id: u.id, fullName: u.fullName, email: u.email, isExpert: provider !== null }}
          impact={data?.deleteImpact ?? null}
          onClose={() => setDeleteOpen(false)}
          onDeleted={(mode: DeleteMode, name: string) => {
            setDeleteOpen(false)
            // The row this modal is showing no longer exists (purge) or no
            // longer says what it says (anonymize) — close and refetch rather
            // than leave a stale profile on screen.
            dirtyRef.current = true
            onDeleted?.(mode === 'purge'
              ? `${name} — ანგარიში სრულად წაიშალა.`
              : `${name} — ანგარიში ანონიმიზებულია და დაბლოკილია.`)
            close()
          }}
        />
      )}
    </div>
  )
}

// The verified-badge toggle — the ONLY way an approved provider gets the public
// „გადამოწმებული“ trust badge (approval seeds verified:false). Mirrors FeaturedToggle.
// Success is judged with adminOk, not `res.ok` — an expired session redirects
// to sign-in and fetch hands the HTML page back as a 200, so the badge used to
// flip on screen while the DB never changed.
//
// ⚠️ IT WAS UNREACHABLE FROM 2026-08-24 TO 2026-08-25, and that is worse than a
// broken button: the badge it sets is drawn on every catalogue card, and the
// home page promises „ყველა პროფილი ხელით მოწმდება". For a day nobody could
// keep that promise — the block that renders this read `u.tutor`, a key the API
// had stopped sending, so the control simply was not on the screen to fail.
// Measured when it was found: 1 of 29 providers verified.
const VerifiedToggle = ({ providerId, initial, onSaved }: { providerId: string; initial: boolean; onSaved?: () => void }) => {
  const [verified, setVerified] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const next = !verified
    setVerified(next)
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/verified`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: next }),
      })
      if (await adminOk(res)) onSaved?.()
      else { setVerified(!next); setFailed(true) }
    } catch { setVerified(!next); setFailed(true) }
    finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`tap-area inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display text-micro font-bold uppercase transition-colors duration-fast disabled:opacity-60 ${
          verified
            ? 'bg-brand-600 border-brand-600 text-white hover:bg-brand-700'
            : 'bg-white border-ink-300 text-ink-600 hover:border-brand-500 hover:text-brand-700'
        }`}
        title="გადამოწმებული პროვაიდერი — გამოჩნდება ✓ ბეჯი ბარათსა და პროფილზე"
      >
        <Icon.shieldCheck className="w-3 h-3" /> ვერიფ.
      </button>
      {failed && <span role="alert" className="font-display text-meta font-semibold text-danger-700">ვერ შეინახა</span>}
    </span>
  )
}

// ⚠️ AND IT NOW DOES SOMETHING (2026-08-25). `featured` was a column, an index
// and this button, and NOTHING read it — the catalogue's „ჩვენი რჩევით" sort
// kept the server's order and ignored it entirely, so an admin could tick a
// provider and watch nothing happen anywhere. It is the owner's one editorial
// lever over the roster, so the sort reads it: see app/experts/client.tsx.
const FeaturedToggle = ({ providerId, initial, onSaved }: { providerId: string; initial: boolean; onSaved?: () => void }) => {
  const [featured, setFeatured] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const next = !featured
    setFeatured(next)
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: next }),
      })
      // adminOk, not res.ok — see VerifiedToggle.
      if (await adminOk(res)) onSaved?.()
      else { setFeatured(!next); setFailed(true) }
    } catch { setFeatured(!next); setFailed(true) }
    finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`tap-area inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill border font-display text-micro font-bold uppercase transition-colors duration-fast disabled:opacity-60 ${
          featured
            ? 'bg-warning-600 border-warning-600 text-white hover:bg-warning-700'
            : 'bg-white border-ink-300 text-ink-600 hover:border-warning-500 hover:text-warning-700'
        }`}
        title="ჩართე რჩეული — გამოჩნდება მთავარი გვერდის hero-ში"
      >
        <Icon.star className="w-3 h-3" /> რჩეული
      </button>
      {failed && <span role="alert" className="font-display text-meta font-semibold text-danger-700">ვერ შეინახა</span>}
    </span>
  )
}
/* ⚠️ „პაკეტები" WAS A TOGGLE HERE AND WENT WITH THE TEACHING VERTICAL
   (2026-08-24). It decided whether one expert could sell lesson packages —
   `TutorProfile.packagesEnabled`, a column on a table that no longer exists,
   gating a `Package`/`Enrollment` pair created by lib/dbBoot with no foreign
   keys. The flag went too — lib/flags says at length why packages are not a
   dark feature waiting on a flip but a vertical whose data model was removed,
   and what a revival would have to design first. A switch with nothing behind
   it is not a dark feature, it is a control that lies. */


/* Re-file an expert. 2026-08-11.
 *
 * This slot used to be a read-only line („კატეგორია: ბიზნესი და ფინანსები"),
 * and that was the whole problem: approval is the only moment the platform
 * chooses a category, it chooses by matching free text against names, and when
 * it chose wrong nobody could undo it. The panel could grant a public trust
 * badge, feature someone on the home page and make them an admin — but not move
 * a psychologist out of the business sphere. The only remaining path was to ask
 * the expert to fix our taxonomy in their own editor.
 *
 * Saves on change, immediately: there is nothing to compose here, and a „შენახვა"
 * button next to a single <select> is a second click for no decision. The old
 * value comes back if the request fails, and the failure is said out loud.
 *
 * „— არ არის მითითებული —" is offered on purpose. An expert with no category
 * still appears in the unfiltered browse (lib/tutorsQuery), so clearing is a
 * legitimate move — the line under the control states exactly what it costs
 * instead of hiding the option behind a warning that isn't true.
 */
const CategoryPicker = ({ providerId, initial, onSaved }: { providerId: string; initial: string; onSaved?: () => void }) => {
  const { groups, loaded } = useAssignableCategories()
  const [val, setVal] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (next: string) => {
    if (busy) return
    const prev = val
    setVal(next)
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: next || null }),
      })
      // adminOk, not res.ok — an expired session answers with the sign-in HTML
      // as a 200, which would read as a saved category that never moved.
      if (await adminOk(res)) onSaved?.()
      else { setVal(prev); setFailed(true) }
    } catch { setVal(prev); setFailed(true) }
    finally { setBusy(false) }
  }
  return (
    <div>
      <Eyebrow as="label" tone="muted" className="block mb-1.5">კატეგორია</Eyebrow>
      <div className="flex items-center gap-2 flex-wrap">
        <CategorySelect value={val} onChange={save} groups={groups} disabled={busy || !loaded} />
        {busy && <span className="text-meta text-ink-500">ინახება…</span>}
        {failed && <span role="alert" className="font-display text-meta font-semibold text-danger-700">ვერ შეინახა</span>}
      </div>
      {loaded && !val && (
        <p className="mt-1.5 text-meta text-ink-600">ჩანს /experts-ზე, მაგრამ ვერცერთ კატეგორიაში და ვერც ფილტრში.</p>
      )}
    </div>
  )
}

// A compact detail FIELD inside the user drawer — deliberately not the panel's
// <Stat> KPI tile (./_parts), which it used to share a name with in the same
// folder. One word for two different things is how the wrong one gets imported.
const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-card border border-ink-200 bg-ink-50/40 p-3">
    <div className="font-display text-micro font-semibold uppercase text-ink-500">{label}</div>
    <div className="mt-1 font-display text-body-lg font-bold text-ink-900 tabular-nums truncate">{value}</div>
  </div>
)

/* ⚠️ `BookingList` WAS HERE AND IS GONE (2026-08-25). It drew one booking per
   row — the other party's face, the topic, the start time in Tbilisi, a status
   pill and the price — for the „ჯავშნები" tab of this drawer. Both the tab and
   the two arrays that fed it went with the booking itself; the tab is „საქმეები"
   now and renders requests and offers inline, because each is three fields and
   does not earn a component.

   The one rule it carried, in case a list like it comes back: a status pill is
   COLOURED by meaning, never by position in an enum — done is green, ended is
   grey, live is red — so an admin scanning forty rows reads state without
   reading words. */

const ReviewList = ({ items }: { items: any[] }) => (
  <ul className="divide-y divide-ink-100 rounded-card border border-ink-200 overflow-hidden bg-white">
    {items.map(r => {
      const author = r.student
      return (
        <li key={r.id} className="p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-display text-small font-bold text-ink-900 truncate">{author?.fullName ?? '—'}</span>
            <span className="inline-flex items-center gap-0.5 text-warning-500">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon.star key={i} className={`w-3 h-3 ${i < r.rating ? '' : 'text-ink-200'}`} />
              ))}
            </span>
            <span className="ml-auto font-mono text-meta tabular-nums text-ink-400 shrink-0">{fmtShort(r.createdAt)}</span>
          </div>
          <p className="text-small text-ink-700 leading-snug whitespace-pre-wrap">{r.body}</p>
        </li>
      )
    })}
  </ul>
)

/* ───── Section: Users (real data via /api/admin/users) ───── */
type ApiUser = {
  id: string; email: string; fullName: string;
  role: 'USER' | 'PROVIDER' | 'ADMIN';
  emailVerified: boolean; createdAt: string; avatarUrl: string | null;
  // ⚠️ THIS SAID `{ bookingsAsStudent, sentMessages }` UNTIL 2026-08-26 AND THE
  // API HAD STOPPED SENDING EITHER (2026-08-24 — its own comment says so). The
  // table's „ჯავშნები" column, the phone row and the CSV export therefore all
  // printed `undefined`, for every account, silently: a missing key on a typed
  // shape is only a lie at runtime. These two are what the route actually
  // returns — what the person ASKED FOR and what they OFFERED.
  _count: { serviceRequests: number; requestOffers: number };
}

export const UsersSection = () => {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all'|'USER' | 'PROVIDER' | 'ADMIN'>('all')
  const [users, setUsers] = useState<ApiUser[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  // Bumped by the detail modal (onChanged) when it closes after a successful
  // mutation — suspend/role/verified/featured — so the list refetches instead
  // of keeping the pre-mutation rows on screen.
  const [refreshTick, setRefreshTick] = useState(0)
  // A deletion closes the modal it happened in, so the confirmation has to land
  // out here — otherwise the row just silently vanishes from the list.
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true); setErr(null)
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set('q', q.trim())
        if (role !== 'all') params.set('role', role)
        const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' })
        if (!res.ok) { setErr('ჩატვირთვა ვერ მოხერხდა'); setUsers([]); setNextCursor(null); return }
        const data = await res.json()
        if (!cancelled) { setUsers(Array.isArray(data.items) ? data.items : []); setNextCursor(data.nextCursor ?? null) }
      } catch {
        if (!cancelled) setErr('ქსელის შეცდომა')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, role, refreshTick])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (role !== 'all') params.set('role', role)
      params.set('cursor', nextCursor)
      const res = await fetch(`/api/admin/users?${params}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setUsers(prev => [...(prev ?? []), ...(Array.isArray(data.items) ? data.items : [])])
      setNextCursor(data.nextCursor ?? null)
    } catch { /* keep current page */ } finally { setLoadingMore(false) }
  }

  const roleLabel = (r: string) => roleLabelOf(r)

  // Impersonation goes through the shared confirm dialog (no native confirm()).
  const [pendImp, setPendImp] = useState<{ userId: string; fullName: string } | null>(null)
  const [impBusy, setImpBusy] = useState(false)
  const impersonate = (userId: string, fullName: string) => setPendImp({ userId, fullName })
  const doImpersonate = async () => {
    if (!pendImp || impBusy) return
    setImpBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/impersonate/${pendImp.userId}`, { method: 'POST' })
      const data = await res.json().catch(() => ({} as any))
      // Session identity just changed (admin → impersonated user). Tell other
      // tabs to reload so none keeps showing the admin panel, then hard-navigate.
      if (res.ok && data?.ok) { broadcastSessionChange(); window.location.href = data.redirect ?? '/'; return }
      setErr('იმპერსონაცია ვერ მოხერხდა')
      setOpenUserId(null)
    } catch {
      setErr('ქსელის შეცდომა')
      setOpenUserId(null)
    } finally {
      setImpBusy(false)
      setPendImp(null)
    }
  }

  return (
    <>
      <TabHeader
        eyebrow="მოდერაცია · მომხმარებლები"
        // Honest count: the list is cursor-paginated, so this is what's LOADED,
        // not the total match — say so while more pages remain.
        title={<>{users ? (nextCursor ? `ჩატვირთულია ${users.length} ` : `${users.length} `) : '— '}ანგარიში</>}
        sub="ძებნა და როლის ფილტრი — რეალურ დროში მუშავდება ბაზაზე. დააჭირე რიგს — სრული პროფილი."
        actions={users && users.length > 0 ? (
          <button
            type="button"
            title="ექსპორტდება მხოლოდ ჩატვირთული ჩანაწერები"
            onClick={() => downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, [
              ['id', 'email', 'fullName', 'role', 'emailVerified', 'serviceRequests', 'requestOffers', 'createdAt'],
              ...users.map(u => [u.id, u.email, u.fullName, u.role, u.emailVerified ? 'yes' : 'no', u._count.serviceRequests, u._count.requestOffers, u.createdAt]),
            ])}
            className="h-9 px-3 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast"
          >
            <Icon.download className="w-3.5 h-3.5" /> CSV · {users.length}
          </button>
        ) : undefined}
      />
      <section className="px-6 lg:px-8 py-4 bg-ink-50/40 border-b border-ink-100 sticky top-16 z-20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-[420px]">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="სახელი ან ელფოსტა…" className="w-full h-11 pl-9 pr-3 rounded-field border border-ink-200 bg-white text-small focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none" />
          </div>
          <div className="inline-flex items-center p-0.5 rounded-pill bg-white border border-ink-200">
            {(['all','USER','PROVIDER','ADMIN'] as const).map(r => (
              <button key={r} type="button" onClick={() => setRole(r)} className={`h-10 sm:h-9 px-3.5 rounded-pill font-display text-small font-semibold tracking-wide transition-colors duration-fast ${role === r ? 'bg-ink-900 text-white hover:bg-ink-800' : 'text-ink-600 hover:bg-ink-100'}`}>{r === 'all' ? 'ყველა' : roleLabel(r)}</button>
            ))}
          </div>
          {loading && <span className="text-meta text-ink-500">იტვირთება…</span>}
        </div>
      </section>
      <section className="px-6 lg:px-8 py-6">
        {err && <AdminError message={err} className="mb-4" />}
        {notice && (
          <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-card border border-success-200 bg-success-50 px-4 py-3 text-small text-success-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="დახურვა" className="shrink-0 w-9 h-9 -my-1.5 -mr-2 rounded-btn inline-flex items-center justify-center text-success-700 hover:bg-success-100 transition-colors duration-fast">
              <Icon.x className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-small min-w-[720px]">
            <thead className="bg-ink-50/40 border-b border-ink-100">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">მომხმარებელი</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">როლი</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">ვერიფიც.</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">მოთხოვნები</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 whitespace-nowrap">რეგისტრ.</th>
                <th className="px-3 py-2.5 font-display text-micro font-semibold uppercase text-ink-500 text-right whitespace-nowrap">მოქმ.</th>
              </tr>
            </thead>
            <tbody>
              {/* Three visual states: null (initial, never fetched) → skeleton;
                  loaded + empty → empty message; loaded + rows → table.
                  Previously null and [] collapsed into the "empty" branch, so
                  users saw a flash of "no users found" for ~300ms on mount. */}
              {users === null ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center"><AdminLoading /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-3">
                  <EmptyState
                    variant="inline"
                    icon={<Icon.search className="w-6 h-6" />}
                    title="მომხმარებელი ვერ მოიძებნა"
                    description="ამ ძებნას და ფილტრს არავინ შეესაბამება."
                    cta={q.trim() || role !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setRole('all') } } : undefined}
                  />
                </td></tr>
              ) : users.map(u => (
                <tr
                  key={u.id}
                  onClick={() => setOpenUserId(u.id)}
                  className="border-t border-ink-100 hover:bg-ink-50/40 cursor-pointer"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200" />
                      <div className="min-w-0">
                        <div className="font-display text-small font-bold text-ink-900 truncate">{u.fullName}</div>
                        <div className="font-mono text-meta tabular-nums text-ink-500 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                      u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                      : u.role === ROLE.PROVIDER ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'bg-ink-50 border-ink-200 text-ink-600'
                    }`}>{roleLabel(u.role)}</span>
                  </td>
                  <td className="px-3 py-3">{u.emailVerified ? <span className="text-success-700"><Icon.check className="w-4 h-4 inline" /></span> : <span className="text-ink-400">—</span>}</td>
                  <td className="px-3 py-3"><div className="font-display text-small font-bold text-ink-900 tabular-nums">{u._count.serviceRequests}</div></td>
                  <td className="px-3 py-3"><div className="font-mono text-meta tabular-nums text-ink-500">{fmtKaDate(new Date(u.createdAt), { year: true })}</div></td>
                  <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenUserId(u.id)}
                      className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1 transition-colors duration-fast"
                    >
                      დეტალები
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {/* Mobile stacked-card fallback — same rows/states as the table. */}
          <div className="block md:hidden">
            {users === null ? (
              <AdminLoading inset />
            ) : users.length === 0 ? (
              <EmptyState
                variant="inline"
                icon={<Icon.search className="w-6 h-6" />}
                title="მომხმარებელი ვერ მოიძებნა"
                description="ამ ძებნას და ფილტრს არავინ შეესაბამება."
                cta={q.trim() || role !== 'all' ? { label: 'ფილტრის გასუფთავება', onClick: () => { setQ(''); setRole('all') } } : undefined}
              />
            ) : users.map(u => (
              <div key={u.id} className="px-4 py-3 border-b border-ink-100 last:border-b-0">
                <div className="flex items-center gap-3">
                  <img src={u.avatarUrl || DEFAULT_AVATAR} alt={u.fullName} className="w-9 h-9 rounded-full object-cover ring-1 ring-ink-200 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display text-small font-bold text-ink-900 truncate">{u.fullName}</span>
                      <span className={`inline-flex items-center h-5 px-1.5 rounded-pill border font-display text-micro font-bold uppercase ${
                        u.role === 'ADMIN' ? 'bg-iris-50 border-iris-200 text-iris-700'
                        : u.role === ROLE.PROVIDER ? 'bg-brand-50 border-brand-200 text-brand-700'
                        : 'bg-ink-50 border-ink-200 text-ink-600'
                      }`}>{roleLabel(u.role)}</span>
                      {u.emailVerified && <span className="text-success-700"><Icon.check className="w-3.5 h-3.5 inline" /></span>}
                    </div>
                    <div className="font-mono text-meta tabular-nums text-ink-500 truncate mt-0.5">{u.email}</div>
                    <div className="font-mono text-meta tabular-nums text-ink-500 mt-0.5">
                      {u._count.serviceRequests} მოთხოვნა · {fmtKaDate(new Date(u.createdAt), { year: true })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenUserId(u.id)}
                    className="h-9 px-2.5 rounded-btn bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 font-display font-semibold text-meta shrink-0 transition-colors duration-fast"
                  >
                    დეტალები
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {users && <LoadMoreBar hasMore={!!nextCursor} loading={loadingMore} onMore={loadMore} count={users.length} />}
      </section>
      <UserDetailModal
        userId={openUserId}
        onClose={() => setOpenUserId(null)}
        onImpersonate={impersonate}
        onChanged={() => setRefreshTick(t => t + 1)}
        onDeleted={msg => setNotice(msg)}
      />
      <AdminConfirmDialog
        open={pendImp !== null}
        title={`შესვლა როგორც ${pendImp?.fullName ?? ''}?`}
        body="გაიხსნება მისი ანგარიში ამავე ბრაუზერში. მოქმედება ინახება აუდიტში."
        tone="warning"
        confirmLabel="შესვლა"
        busy={impBusy}
        onCancel={() => setPendImp(null)}
        onConfirm={doImpersonate}
      />
    </>
  )
}

