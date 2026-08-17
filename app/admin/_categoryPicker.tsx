'use client'
/* THE category picker for the admin panel — one control, two callers.
 *
 * WHY IT IS SHARED. Before this, the moderation panel built its own list and
 * its own <select>, and the expert drawer had none at all. The panel's list was
 * flat: „ბიზნესი და ფინანსები", „ფინანსები", „კადრები", „გაყიდვები" and
 * „ადვოკატი" rendered as five equal options, so nothing on screen said that
 * four of them fold into two spheres — the moderator was choosing between a
 * sphere and a sub-field without being told which was which. The expert's own
 * editor had used <optgroup> for exactly this reason since it was written; the
 * two screens simply never agreed.
 *
 * It also builds the candidate list from lib/categoryTree's ASSIGNABLE rule, so
 * an option offered here is an option the API will accept. The panel used to
 * drop every HIDDEN sphere, which made an applicant who picked „კარიერა" read
 * as „matched nothing" and silently excluded them from bulk approve — while the
 * server would have filed them correctly and un-hidden the sphere.
 */

import { useEffect, useState } from 'react'
import { isAssignable, type MatchableCategory } from '@/lib/categoryTree'
import type { AdminCategory } from './_categories'

/** A sphere plus everything folded into it, in display order. */
export type CategoryGroup = { sphere: AdminCategory; children: AdminCategory[] }

/**
 * Every category an expert may be filed into, fetched once and shaped for a
 * grouped <select>. `flat` is the same set as one list — the resolver and the
 * „which id did we pick" lookups want that, the UI wants the groups.
 */
export function useAssignableCategories() {
  const [flat, setFlat] = useState<AdminCategory[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/categories', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: AdminCategory[]) => {
        if (cancelled) return
        const all = Array.isArray(d) ? d : []
        setFlat(all.filter(c => isAssignable(c, all)))
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const groups: CategoryGroup[] = flat
    .filter(c => !c.parentId)
    .map(sphere => ({ sphere, children: flat.filter(c => c.parentId === sphere.id) }))

  return { flat, groups, loaded }
}

/** The candidate list in the shape lib/categoryTree's resolver wants. */
export const asMatchable = (cats: AdminCategory[]): MatchableCategory[] =>
  cats.map(c => ({ id: c.id, slug: c.slug, name: c.name }))

/**
 * The control. A sphere with no sub-fields stays a plain <option> — an
 * <optgroup> holding one item is a heading over itself.
 *
 * A HIDDEN sphere is offered and LABELLED. It has to be offered (somebody must
 * be able to be the first expert in „კარიერა", which is hidden precisely
 * because it has none), and it has to be labelled, because choosing it does
 * something the other options don't: it publishes the sphere.
 */
export function CategorySelect({
  value, onChange, groups, id, disabled, emptyLabel = '— არ არის მითითებული —',
}: {
  value: string
  onChange: (id: string) => void
  groups: CategoryGroup[]
  id?: string
  disabled?: boolean
  emptyLabel?: string
}) {
  const label = (c: AdminCategory) => (c.status === 'HIDDEN' ? `${c.name} (დამალული)` : c.name)
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full sm:max-w-[280px] h-11 px-3 rounded-field border border-ink-200 bg-white text-small text-ink-900 focus:border-brand-400 focus:outline-none disabled:bg-ink-50 disabled:text-ink-500"
    >
      <option value="">{emptyLabel}</option>
      {groups.map(g => (
        g.children.length > 0
          ? (
            <optgroup key={g.sphere.id} label={g.sphere.name}>
              <option value={g.sphere.id}>{label(g.sphere)}</option>
              {g.children.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </optgroup>
          )
          : <option key={g.sphere.id} value={g.sphere.id}>{label(g.sphere)}</option>
      ))}
    </select>
  )
}
