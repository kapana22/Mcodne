'use client'
// THE SPHERE LIST, LIVE — the admin-managed categories, fetched once per screen
// that needs to ask „which field do you work in".
//
// Split out of `app/join/_expert/_steps.tsx` on 2026-08-24, when that file went
// with the consultation wizard. Unchanged: the same fetch, the same fallback,
// and the same warning about why the fallback must mirror the deployed names.

import { useEffect, useState } from 'react'

export type CategoryNode = { name: string; slug?: string; children: string[] }

export function useCategories(): CategoryNode[] {
  const [dbCats, setDbCats] = useState<CategoryNode[]>([])
  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled || !Array.isArray(rows)) return
        setDbCats(rows
          .filter(c => c?.name)
          .map(c => ({
            name: c.name as string,
            slug: c.slug as string | undefined,
            children: (c.children ?? []).map((k: any) => k?.name).filter(Boolean) as string[],
          })))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  // Fallback MUST mirror the deployed SPHERE names, because the approval step
  // matches the applicant's answer BY NAME — a stale fallback lets somebody
  // pick a category that then resolves to nothing.
  //
  // It went stale exactly that way and this is the repair (2026-08-11, verified
  // against all 15 production rows): „ბიზნესი და ფინანსები" and „გადასახადები"
  // were renamed by the taxonomy realignment, and „რელოკაცია" was offered here
  // while no such category has ever existed in the database — an applicant who
  // picked it during an API blip was guaranteed to be filed nowhere.
  //
  // ⚠️ IT WENT STALE AGAIN, AND THIS TIME IT WAS ON THE FIRST SCREEN A GUEST
  // SEES (2026-08-20). Three of the eight names below no longer existed —
  // „ბიზნესი და სტრატეგია", „ფინანსები და გადასახადები", „ტექნოლოგია და
  // პროდუქტი" were renamed — and ტალღა 1's two service-side spheres
  // („სწავლება", „სახლის რემონტი") were not in the list at all. Since the
  // public door renders this control BEFORE the fetch resolves, every visitor
  // saw a consulting-only list with three dead names flash and then swap.
  // Verified against all 20 production rows the same day.
  //
  // ტალღა 1 first, in `lib/launchTaxonomy`'s order — the picker sorts anyway
  // (`launchFirst`), but a fallback that opens on the launch set is one less
  // thing that can disagree. The rest follow; nothing is hidden from this
  // screen on purpose, because a sphere that cannot be picked here can never
  // get its first expert.
  const CATEGORIES: CategoryNode[] = dbCats.length ? dbCats : [
    { name: 'სწავლება', slug: 'swavleba', children: [] },
    { name: 'ბუღალტერია და გადასახადები', slug: 'tax', children: [] },
    { name: 'სამართალი', slug: 'law', children: [] },
    { name: 'ფსიქოლოგია', slug: 'psychology', children: [] },
    { name: 'ბიზნესი', slug: 'business', children: [] },
    { name: 'სახლის რემონტი', slug: 'remonti', children: [] },
    { name: 'დიზაინი', slug: 'design', children: [] },
    { name: 'კარიერა და HR', slug: 'career', children: [] },
    { name: 'მარკეტინგი და გაყიდვები', slug: 'marketing', children: [] },
    { name: 'IT და ტექნოლოგიები', slug: 'it', children: [] },
    { name: 'უძრავი ქონება', slug: 'real-estate', children: [] },
    { name: 'ჯანმრთელობა და კვება', slug: 'health', children: [] },
    { name: 'მედიცინა', slug: 'medicine', children: [] },
    { name: 'არქიტექტურა და მშენებლობა', slug: 'architecture', children: [] },
    { name: 'ტურიზმი და ღონისძიებები', slug: 'tourism', children: [] },
    { name: 'ლოგისტიკა და საბაჟო', slug: 'logistics', children: [] },
    { name: 'მედია და კონტენტი', slug: 'media', children: [] },
    { name: 'გრანტები და ტენდერები', slug: 'grants', children: [] },
    { name: 'ვიზა, მიგრაცია და რელოკაცია', slug: 'relocation', children: [] },
    { name: 'სოფლის მეურნეობა', slug: 'agriculture', children: [] },
  ]

  return CATEGORIES
}
