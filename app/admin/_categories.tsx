'use client'
// Admin tab: კატეგორიები — status + parent + name.

import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { hierarchyError, canBeParent, strandedBy, TREE_ERROR } from '@/lib/categoryTree'
import type { CategoryStatus } from '@/lib/categoryTree'
import { Eyebrow } from '@/components/Eyebrow'
import { PROFESSIONS } from '@/lib/professions'
import { fmtKaDate } from '@/lib/kaDate'
import { AdminConfirmDialog, TabHeader, adminOk, AdminError } from './_parts'

/* ───── Section: Categories (status + parent + name) ─────
   The one screen where the shape of the catalogue is decided. Every control
   hits PATCH /api/admin/categories/:id — we mutate local state first
   (optimistic) and revert on failure so the change feels instant.

   The hierarchy rules are NOT restated here: the picker offers only what
   lib/categoryTree would accept, and the same function runs again before the
   fetch. The server runs it a third time, because a screen is not a guard. */
export type AdminCategory = {
  id: string
  slug: string
  name: string
  isLive: boolean
  status: CategoryStatus
  parentId: string | null
  /** Profiles pointing HERE — the blast radius of hiding or deleting. */
  providerCount: number
  /** What the public sees under it: gated, and folded for a sphere. */
  listedCount: number
  childCount: number
}

/* ⚠️ „განმცხადებლებმა მოითხოვეს" WAS HERE AND IS GONE (2026-08-24).
 *
 * It listed the spheres applicants had typed by hand — „ჩემი სფერო სიაში
 * არ არის" — aggregated out of `TutorApplication.professionData`, so the
 * taxonomy could grow from what people actually asked for. The consultation
 * application went with the consultation product, and with it that column. The
 * idea is worth rebuilding on `MasterApplication` the day it carries the same
 * free-text answer; it does not today, and a panel reading from nothing would
 * be furniture that says the feature works.
 */

/* ONE checkbox, used on spheres and sub-categories alike — the only visibility
   control on this screen. A sphere toggles VISIBLE ↔ HIDDEN; a sub-category
   toggles REDIRECTED ↔ HIDDEN, keeping its parent either way. Both mean the
   same thing to the person clicking: „is this offered or not". */
const VisibleBox = ({ row, onToggle }: { row: AdminCategory; onToggle: (r: AdminCategory, on: boolean) => void }) => (
  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={row.status !== 'HIDDEN'}
      onChange={e => onToggle(row, e.target.checked)}
      aria-label={`${row.name} — ჩანს`}
      className="w-5 h-5 shrink-0 accent-brand-500"
    />
    <span className={`text-small ${row.status === 'HIDDEN' ? 'text-ink-400' : 'text-ink-800'}`}>
      {row.status === 'HIDDEN' ? 'არ ჩანს' : row.parentId ? 'ჩანს კატეგორიაში' : 'ჩანს საიტზე'}
    </span>
  </label>
)

/* Delete is blocked by the same two facts the server checks, and the button
   SAYS which one — „disabled with no reason" is how an admin concludes the
   screen is broken. Hiding is the answer in both cases. */
const DeleteBtn = ({ row, onAsk }: { row: AdminCategory; onAsk: (r: AdminCategory) => void }) => (
  <button
    type="button"
    onClick={() => onAsk(row)}
    disabled={row.providerCount > 0 || row.childCount > 0}
    title={row.providerCount > 0 ? 'ჯერ ექსპერტები ჰყავს — მოხსენი პტიჩკა' : row.childCount > 0 ? TREE_ERROR.HAS_CHILDREN : 'წაშლა'}
    aria-label={`${row.name} — წაშლა`}
    className="shrink-0 h-10 w-10 sm:h-9 sm:w-9 rounded-btn text-danger-600 hover:bg-danger-50 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors duration-fast"
  >
    <Icon.x className="w-3.5 h-3.5" />
  </button>
)

export const CategoriesSection = () => {
  const [rows, setRows] = useState<AdminCategory[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [newName, setNewName] = useState('')
  /** Per-sphere draft for the inline „+ ქვეკატეგორია" input, keyed by sphere
   *  id — each block types independently, so one shared string would leak a
   *  half-typed name into every other sphere on the screen. */
  const [subDraft, setSubDraft] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [query, setQuery] = useState('')
  // Category delete was the only destructive admin action firing instantly on
  // click — route it through the shared confirm dialog like every other delete.
  const [pendDelete, setPendDelete] = useState<AdminCategory | null>(null)
  // Leaving VISIBLE is far more destructive than DELETE (which is blocked while
  // the category still has experts): it takes the category out of browse, the
  // sitemap and the homepage. Confirm it. Coming back is harmless and stays one
  // click.
  const [pendStatus, setPendStatus] = useState<{ row: AdminCategory; next: CategoryStatus } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/categories', { cache: 'no-store' })
        if (!res.ok) throw new Error('fetch failed')
        const data: AdminCategory[] = await res.json()
        if (!cancelled) setRows(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setErr('კატეგორიების ჩატვირთვა ვერ მოხერხდა.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const patch = async (id: string, body: Partial<Pick<AdminCategory, 'status' | 'parentId'>>) => {
    if (!rows) return
    const before = rows
    // Optimistic mutation first — the UI feels instant. If the server rejects
    // (auth expired, 404, a rule we did not check) we swap the array back and
    // flash. `isLive` is mirrored because the public site still reads it.
    const next = rows.map(r => r.id === id
      ? { ...r, ...body, ...(body.status ? { isLive: body.status === 'VISIBLE' } : {}) }
      : r)
    setRows(next)
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      // adminOk, not res.ok — an expired session 307s to sign-in and fetch
      // hands the HTML back as a 200, which used to flash fake success while
      // the category never changed.
      if (!(await adminOk(res))) {
        // A 409 carries the sentence that says WHY; anything else is generic.
        const why = res.status === 409 ? (await res.json().catch(() => ({}))).message : null
        throw new Error(why || '')
      }
      setFlash({ kind: 'success', msg: 'ცვლილება შეინახა.' })
    } catch (e) {
      setRows(before)
      const why = e instanceof Error ? e.message : ''
      setFlash({ kind: 'error', msg: why || 'ცვლილება ვერ შეინახა — სცადე თავიდან.' })
    }
  }

  // Create a category from a name — it appears in /apply + discovery instantly
  // (both read the DB), so the field list is no longer hardcoded in the app.
  const create = async () => {
    const name = newName.trim()
    if (name.length < 2 || creating) return
    setCreating(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `parentId` present → the row is created as a sub-category in one go
        // (REDIRECTED + parent, server-side). Absent → a sphere, as before.
        body: JSON.stringify({ name }),
      })
      const j = await res.json().catch(() => ({}))
      // The server's own sentence first — a refused parent says WHY.
      if (!res.ok || !j.ok) throw new Error(typeof j?.message === 'string' ? j.message : '')
      setRows(prev => [...(prev ?? []), j.category])
      setNewName('')
      setFlash({ kind: 'success', msg: 'კატეგორია დაემატა.' })
    } catch (e) {
      const why = e instanceof Error ? e.message : ''
      setFlash({ kind: 'error', msg: why || 'დამატება ვერ მოხერხდა.' })
    }
    finally { setCreating(false) }
  }

  /* Add a sub-category from inside its sphere's block — the action this screen
     is mostly used for, and the one that used to take a trip to the form at the
     top plus a parent dropdown plus a hunt for where the row landed. The input
     stays focused and clears itself, so four sub-fields is four names and four
     Enters. */
  const addSub = async (parent: AdminCategory) => {
    const name = (subDraft[parent.id] ?? '').trim()
    if (name.length < 2 || creating) return
    setCreating(true); setFlash(null)
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: parent.id }),
      })
      const j = await res.json().catch(() => ({}))
      // The server's own sentence first — a refused parent says WHY.
      if (!res.ok || !j.ok) throw new Error(typeof j?.message === 'string' ? j.message : '')
      setRows(prev => [...(prev ?? []), j.category])
      setSubDraft(d => ({ ...d, [parent.id]: '' }))
      setFlash({ kind: 'success', msg: `„${name}“ დაემატა „${parent.name}“-ში.` })
    } catch (e) {
      const why = e instanceof Error ? e.message : ''
      setFlash({ kind: 'error', msg: why || 'დამატება ვერ მოხერხდა.' })
    } finally { setCreating(false) }
  }

  const rename = async (id: string) => {
    const name = editName.trim()
    setEditingId(null)
    if (name.length < 2) return
    const before = rows
    setRows(prev => (prev ?? []).map(r => r.id === id ? { ...r, name } : r))
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      // adminOk, not res.ok — see patch() above.
      if (!(await adminOk(res))) throw new Error()
      setFlash({ kind: 'success', msg: 'სახელი შეიცვალა.' })
    } catch { setRows(before); setFlash({ kind: 'error', msg: 'ვერ შეინახა.' }) }
  }

  const remove = async (id: string) => {
    setFlash(null)
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409) { setFlash({ kind: 'error', msg: j.message || 'ვერ წაიშლება — ამ კატეგორიას ექსპერტები ჰყავს. დამალე ნაცვლად.' }); return }
      if (!res.ok || !j.ok) throw new Error()
      setRows(prev => (prev ?? []).filter(r => r.id !== id))
      setFlash({ kind: 'success', msg: 'კატეგორია წაიშალა.' })
    } catch { setFlash({ kind: 'error', msg: 'წაშლა ვერ მოხერხდა.' }) }
  }

  /* The two rules-aware handlers. Both run lib/categoryTree BEFORE the fetch,
     so an impossible move is explained here instead of coming back as a 409. */
  const treeCheck = (row: AdminCategory, change: { status?: CategoryStatus; parentId?: string | null }) => {
    const nextParentId = change.parentId !== undefined ? change.parentId : row.parentId
    const parent = nextParentId ? (rows ?? []).find(r => r.id === nextParentId) ?? null : null
    return hierarchyError(
      { id: row.id, status: row.status, parentId: row.parentId, childCount: row.childCount },
      change,
      parent,
    )
  }

  /* THE checkbox handler. „Is it offered?" is one question, and the answer is
     one of two statuses depending on whether the row hangs off a sphere:
     a sphere goes VISIBLE, a sub-category goes REDIRECTED (which is what makes
     it appear under its sphere on /apply). Off is HIDDEN for both, and a
     sub-category keeps its parent while hidden, so ticking it back on restores
     exactly where it was. The three-value enum never reaches the screen. */
  const toggleVisible = (row: AdminCategory, on: boolean) =>
    changeStatus(row, on ? (row.parentId ? 'REDIRECTED' : 'VISIBLE') : 'HIDDEN')

  const changeStatus = (row: AdminCategory, next: CategoryStatus) => {
    if (next === row.status) return
    const bad = treeCheck(row, { status: next })
    if (bad) { setFlash({ kind: 'error', msg: TREE_ERROR[bad] }); return }
    // Coming back into view needs no warning; leaving it does — but ONLY when
    // leaving it costs somebody something. The dialog used to fire on every
    // hide, and most categories are empty, so the common case was a modal
    // asking to confirm that nothing would happen. It now appears exactly when
    // it has a real number to show: this row's experts, plus the experts of any
    // sub-category that would go dark with it (that second group is the one an
    // admin cannot see from the row, which is the whole reason to interrupt).
    if (next === 'VISIBLE') { patch(row.id, { status: next }); return }
    const alsoLost = strandedBy(rows ?? [], row, next)
      .reduce((n, id) => n + ((rows ?? []).find(r => r.id === id)?.providerCount ?? 0), 0)
    if (row.providerCount + alsoLost === 0) { patch(row.id, { status: next }); return }
    setPendStatus({ row, next })
  }

  /* „Make this a sub-category of X" — ONE action, both columns.
   *
   * The screen used to expose `status` and `parentId` as two independent
   * controls, so becoming a sub-category meant setting both, in the right
   * order: parent first then status, because a REDIRECTED row with no parent is
   * refused (REDIRECT_NEEDS_PARENT) and the admin met that as a 409 with no
   * hint about ordering. Nobody worked it out, which is why the catalogue has
   * sub-categories only where a migration put them.
   *
   * Both directions are one PATCH now, and the hierarchy rules still run here
   * first (and again on the server) so an impossible move is a sentence, not an
   * error code. Going independent restores VISIBLE deliberately: the row was
   * only REDIRECTED because it had a parent, and leaving it in that status
   * without one is the exact shape the guard refuses.
   */
  const foldInto = (row: AdminCategory, parentId: string | null) => {
    if (parentId === row.parentId) return
    const change = parentId
      ? { parentId, status: 'REDIRECTED' as CategoryStatus }
      : { parentId: null, status: 'VISIBLE' as CategoryStatus }
    const bad = treeCheck(row, change)
    if (bad) { setFlash({ kind: 'error', msg: TREE_ERROR[bad] }); return }
    patch(row.id, change)
  }

  /* Search matches a sub-category too, and when it does its SPHERE stays on
     screen — a child rendered without the block it belongs to would be a row
     with no context, which is the shape this screen just stopped having. */
  const q = query.trim().toLowerCase()
  const hit = (r: AdminCategory) => !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)
  const childrenOf = (id: string) => (rows ?? []).filter(r => r.parentId === id)
  const spheres = (rows ?? []).filter(r =>
    !r.parentId && (hit(r) || childrenOf(r.id).some(hit)),
  )
  /* Hiding a sphere takes its absorbed categories with it — their experts are
     browsable only through it. The dialog counted the row's OWN experts only,
     which is the number that is wrong in exactly the case that matters. */
  const hideStranded = pendStatus
    ? strandedBy(rows ?? [], pendStatus.row, pendStatus.next)
    : []
  const hideCount = (pendStatus?.row.providerCount ?? 0)
    + hideStranded.reduce((n, id) => n + ((rows ?? []).find(r => r.id === id)?.providerCount ?? 0), 0)
  const nameOf = (id: string | null) => (id ? (rows ?? []).find(r => r.id === id)?.name ?? '' : '')

  return (
    <>
      <TabHeader
        eyebrow="კონტენტი · კატეგორიები"
        title={<>კატეგორიების მართვა</>}
        sub="დაამატე, გადაარქვი, დამალე ან გადაამისამართე კატეგორია — /join და ძებნა DB-დან კითხულობს, ასე რომ კოდის შეცვლა აღარ სჭირდება."
        actions={undefined}
      />
      <section className="px-6 lg:px-8 py-6">
        {/* The three statuses, stated where they are chosen. The difference
            between „დამალული" and „გადამისამართებული" is the one that matters
            and the one a dropdown cannot convey: hiding takes a category's
            experts off the site, redirecting moves them to the parent. Getting
            those two the wrong way round is the only way to lose somebody from
            this screen. */}
        {/* Two controls, said in the words of what they DO. This used to
            explain three status values, one of which („გადამისამართებული")
            named a redirect mechanism rather than anything an admin wants —
            and it was, in fact, the only way to create a sub-category. */}
        <dl className="mb-4 rounded-btn border border-ink-200 bg-ink-50/60 px-3.5 py-3 grid gap-1.5 sm:grid-cols-2 text-meta">
          <div><dt className="inline font-display font-semibold text-ink-800">ჩანს საიტზე</dt>
            <dd className="inline text-ink-600"> — მენიუში, მთავარზე და ფილტრში. მოხსნისას გვერდი რჩება, კატეგორია კი სიებიდან ქრება.</dd></div>
          <div><dt className="inline font-display font-semibold text-ink-800">ქვეკატეგორია</dt>
            <dd className="inline text-ink-600"> — ექსპერტები კატეგორიაში ჩანან და იქვე ითვლებიან, არჩევისას კი საკუთარი სახელით. სწორედ ეს გამოჩნდება /apply-ზე კატეგორიის ქვეშ.</dd></div>
        </dl>
          {err && <AdminError message={err} className="mb-4" />}
        {flash && (
          <div role="alert" className={`mb-4 rounded-btn border px-3 py-2 text-small font-medium ${flash.kind === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            {flash.msg}
          </div>
        )}

        {/* Add a category + (once the list grows) filter it. */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          {/* This form adds a SPHERE, and only a sphere. The parent dropdown it
              briefly carried is gone: sub-categories are added inside the
              sphere they belong to, which needs no dropdown at all. */}
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') create() }}
              placeholder="ახალი კატეგორია — მაგ. ჯანმრთელობა და კვება"
              maxLength={60}
              className="flex-1 h-11 px-3 rounded-btn border border-ink-200 text-small focus:border-brand-500 focus:outline-none"
            />
            <button type="button" onClick={create} disabled={creating || newName.trim().length < 2} className="h-11 px-4 rounded-btn bg-brand-600 hover:bg-brand-700 disabled:bg-ink-100 disabled:text-ink-500 text-white font-display font-semibold text-body inline-flex items-center gap-1.5 transition-colors duration-fast shrink-0">
              <Icon.plus className="w-3.5 h-3.5" /> დამატება
            </button>
          </div>
          {(rows?.length ?? 0) > 6 && (
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ძებნა…" aria-label="კატეგორიების ძებნა" className="h-11 px-3 rounded-btn border border-ink-200 text-small focus:border-brand-500 focus:outline-none sm:w-44" />
          )}
        </div>

        {rows === null ? (
          <div className="rounded-card border border-ink-200 bg-white overflow-hidden">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5 border-b border-ink-100 last:border-b-0">
                <div className="h-4 w-40 rounded bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-6 w-24 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-4 w-16 rounded bg-ink-100 motion-safe:animate-pulse" />
                <div className="h-6 w-11 rounded-pill bg-ink-100 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-card border border-dashed border-ink-200 bg-white py-12 px-6 text-center">
            <div className="font-display text-body-lg font-bold text-ink-900 tracking-tight">კატეგორია არ არის</div>
            <p className="text-small text-ink-500 mt-1.5">დაამატე პირველი კატეგორია ზემოთ ველიდან.</p>
          </div>
        ) : (
          /* ONE BLOCK PER SPHERE, with its sub-categories INSIDE it.
           *
           * This was a flat table: a sub-category was just another row, several
           * screens away from its sphere, carrying the same six columns as a
           * top-level one. To add one you went to the form at the top, typed a
           * name, found the right parent in a dropdown — and then hunted for
           * where the new row had landed. Editing one meant finding it again.
           * All of that for the thing this screen is mostly used for.
           *
           * A sub-category only exists in relation to its sphere, so it is now
           * rendered inside it: a line with a checkbox, its name (click to
           * rename), its expert count and a delete — plus „+ ქვეკატეგორია" at
           * the bottom of the same block, which is where you are already
           * looking when you decide you need one. */
          <div className="grid gap-3">
            {spheres.length === 0 ? (
              <div className="rounded-card border border-ink-200 bg-white px-4 py-8 text-center text-small text-ink-500">ვერაფერი მოიძებნა.</div>
            ) : spheres.map(s => {
              const kids = childrenOf(s.id)
              return (
                <div key={s.id} className="rounded-card border border-ink-200 bg-white overflow-hidden">
                  {/* ── the sphere ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_11rem_4.5rem_4.5rem_auto] gap-2 lg:gap-4 items-center px-4 py-3 bg-ink-50/40 border-b border-ink-100">
                    <div className="min-w-0">
                      {editingId === s.id ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onBlur={() => rename(s.id)}
                          onKeyDown={e => { if (e.key === 'Enter') rename(s.id); if (e.key === 'Escape') setEditingId(null) }}
                          maxLength={60}
                          className="w-full h-9 px-2.5 rounded-btn border border-brand-400 text-body font-display font-semibold focus:outline-none"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setEditingId(s.id); setEditName(s.name) }}
                            title="სახელის შეცვლა"
                            className="block w-full text-left font-display font-semibold text-body text-ink-900 truncate hover:text-brand-700 transition-colors duration-fast"
                          >
                            {s.name}
                          </button>
                          {/* The slug is the URL and never changes — reference, not a control. */}
                          <div className="font-mono text-meta text-ink-400 truncate">{s.slug}</div>
                        </>
                      )}
                    </div>
                    <VisibleBox row={s} onToggle={toggleVisible} />
                    <div className="font-display font-semibold text-small text-ink-800 tabular-nums">
                      <span className="lg:hidden text-ink-500 font-normal">ექსპერტი: </span>{s.providerCount}
                    </div>
                    <div className="font-display font-semibold text-small tabular-nums">
                      <span className="lg:hidden text-ink-500 font-normal">საიტზე: </span>
                      {/* „—" for a sphere the public cannot browse. */}
                      {s.status === 'VISIBLE'
                        ? <span className="text-ink-800">{s.listedCount}</span>
                        : <span className="text-ink-400" title="დამალულია — არავინ ჩანს">—</span>}
                    </div>
                    <div className="flex items-center gap-1 lg:justify-end">
                      {/* Merging one sphere into another is rare but it is the
                          only way „ფინანსები" ever became a sub-field. Offered
                          only when there is somewhere to merge INTO. */}
                      {(rows ?? []).some(c => canBeParent(c, s)) && s.childCount === 0 && (
                        <select
                          value=""
                          onChange={e => { if (e.target.value) foldInto(s, e.target.value) }}
                          aria-label={`${s.name} — სხვა კატეგორიის ქვეშ გადატანა`}
                          title="სხვა კატეგორიის ქვეკატეგორიად გადატანა"
                          className="h-8 px-1.5 rounded-btn border border-ink-200 bg-white text-meta text-ink-600 focus:border-brand-500 focus:outline-none max-w-[7.5rem]"
                        >
                          <option value="">გადატანა…</option>
                          {(rows ?? []).filter(c => canBeParent(c, s)).map(c => (
                            <option key={c.id} value={c.id}>↳ {c.name}</option>
                          ))}
                        </select>
                      )}
                      <DeleteBtn row={s} onAsk={setPendDelete} />
                    </div>
                  </div>

                  {/* ── the professions inside this sphere ──
                      READ-ONLY on purpose. These are the owner's list
                      (lib/professions.ts, from კატეგორიები.docx) and they are
                      what an applicant ticks on /apply — so the admin has to be
                      able to SEE them here, next to the sphere they belong to.
                      Editing them is a code change, deliberately: the list is
                      the product's vocabulary, not per-deployment config. */}
                  {(PROFESSIONS[s.slug]?.length ?? 0) > 0 && (
                    <div className="px-4 pt-2.5">
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <Eyebrow tone="muted">პროფესიები</Eyebrow>
                        <span className="text-meta text-ink-400 tabular-nums">{PROFESSIONS[s.slug]!.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {PROFESSIONS[s.slug]!.map(job => (
                          <span key={job} className="inline-flex items-center h-6 px-2 rounded-pill border border-ink-200 bg-ink-50 text-meta text-ink-700">
                            {job}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── its sub-categories ── */}
                  <div className="px-4 py-2.5">
                    {kids.map(k => (
                      <div key={k.id} className="flex items-center gap-2 py-1.5 min-w-0">
                        <span className="text-ink-300 shrink-0" aria-hidden>↳</span>
                        <div className="w-[11rem] shrink-0"><VisibleBox row={k} onToggle={toggleVisible} /></div>
                        <div className="flex-1 min-w-0">
                          {editingId === k.id ? (
                            <input
                              autoFocus
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onBlur={() => rename(k.id)}
                              onKeyDown={e => { if (e.key === 'Enter') rename(k.id); if (e.key === 'Escape') setEditingId(null) }}
                              maxLength={60}
                              className="w-full h-8 px-2 rounded-btn border border-brand-400 text-small font-display font-semibold focus:outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingId(k.id); setEditName(k.name) }}
                              title="სახელის შეცვლა"
                              className="block w-full text-left text-small font-display font-semibold text-ink-800 truncate hover:text-brand-700 transition-colors duration-fast"
                            >
                              {k.name}
                            </button>
                          )}
                        </div>
                        <span className="shrink-0 text-meta text-ink-500 tabular-nums" title="ამ ქვეკატეგორიაში მყოფი ექსპერტები">{k.providerCount}</span>
                        {/* Move to another sphere, or promote back to a sphere
                            of its own. Same handler as the merge above. */}
                        <select
                          value={k.parentId ?? ''}
                          onChange={e => foldInto(k, e.target.value || null)}
                          aria-label={`${k.name} — რომელ კატეგორიაშია`}
                          className="shrink-0 h-8 px-1.5 rounded-btn border border-ink-200 bg-white text-meta text-ink-600 focus:border-brand-500 focus:outline-none max-w-[8rem]"
                        >
                          <option value="">დამოუკიდებელი</option>
                          {(rows ?? []).filter(c => !c.parentId && c.status === 'VISIBLE').map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <DeleteBtn row={k} onAsk={setPendDelete} />
                      </div>
                    ))}
                    {/* ADD, right here. The one action this screen exists for. */}
                    <div className="flex items-center gap-2 pt-1.5">
                      <span className="text-ink-300 shrink-0" aria-hidden>↳</span>
                      <input
                        value={subDraft[s.id] ?? ''}
                        onChange={e => setSubDraft(d => ({ ...d, [s.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addSub(s) }}
                        placeholder={kids.length ? 'კიდევ ერთი ქვეკატეგორია…' : 'ქვეკატეგორიის დამატება — მაგ. დიეტოლოგია'}
                        maxLength={60}
                        aria-label={`${s.name} — ქვეკატეგორიის დამატება`}
                        className="flex-1 min-w-0 h-9 px-2.5 rounded-btn border border-dashed border-ink-300 text-small placeholder:text-ink-400 focus:border-brand-500 focus:border-solid focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => addSub(s)}
                        disabled={creating || (subDraft[s.id] ?? '').trim().length < 2}
                        className="h-9 px-3 rounded-btn border border-ink-200 bg-white hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed text-ink-700 font-display font-semibold text-meta inline-flex items-center gap-1.5 transition-colors duration-fast shrink-0"
                      >
                        <Icon.plus className="w-3 h-3" /> დამატება
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <AdminConfirmDialog
        open={pendStatus !== null}
        title={pendStatus?.next === 'REDIRECTED' ? 'კატეგორიის გადამისამართება' : 'კატეგორიის დამალვა'}
        body={pendStatus?.next === 'REDIRECTED' ? (
          <>„{pendStatus?.row.name ?? ''}“ გვერდი გადამისამართდება „{nameOf(pendStatus?.row.parentId ?? null)}“-ზე. მისი <span className="font-display font-semibold tabular-nums">{pendStatus?.row.providerCount ?? 0}</span> ექსპერტი „{nameOf(pendStatus?.row.parentId ?? null)}“-ში ჩაითვლება. ძველი ბმული მუშაობს.</>
        ) : (
          <>
            „{pendStatus?.row.name ?? ''}“ საჯარო საიტიდან გაქრება — მისი <span className="font-display font-semibold tabular-nums">{hideCount}</span> ექსპერტი აღარ გამოჩნდება ძებნაში, კატეგორიის გვერდზე, sitemap-სა და მთავარ გვერდზე.
            {hideCount > 0 && <span className="mt-2 block text-danger-700">მოთხოვნები და პროფილები რჩება — მაგრამ ვეღარავინ იპოვის. ჩართვით ყველაფერი დაბრუნდება.</span>}
          </>
        )}
        tone="danger"
        confirmLabel={pendStatus?.next === 'REDIRECTED' ? 'გადამისამართება' : 'დამალე'}
        onCancel={() => setPendStatus(null)}
        onConfirm={async () => {
          const p = pendStatus
          setPendStatus(null)
          if (p) await patch(p.row.id, { status: p.next })
        }}
      />
      <AdminConfirmDialog
        open={pendDelete !== null}
        title="კატეგორიის წაშლა"
        body={<>წაიშლება კატეგორია <span className="font-display font-semibold">{pendDelete?.name ?? ''}</span>. ეს შეუქცევადია.</>}
        tone="danger"
        confirmLabel="წაშლა"
        onCancel={() => setPendDelete(null)}
        onConfirm={async () => {
          const id = pendDelete?.id
          setPendDelete(null)
          if (id) await remove(id)
        }}
      />
    </>
  )
}
