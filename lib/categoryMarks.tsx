import React from 'react'
import { CatIcon } from '@/components/Icon'

/**
 * ONE mark per category, and ONE place that decides it.
 *
 * WHY THIS FILE EXISTS. The category glyph was defined TWICE, differently:
 * `app/HomeClient` mapped slugs onto the hand-drawn `CatIcon` set, while
 * `app/categories` had its own `ICON_MAP` onto the generic UI icons
 * (graph/wallet/heart/…) covering seven slugs and dropping the other eight onto
 * a single fallback. Measured 2026-07-31: fourteen category cards rendered SIX
 * distinct drawings. Whichever map you fixed, the other page stayed wrong.
 *
 * `description` lives here too, for the same reason — it was home-only, so the
 * category pages had none.
 *
 * ADDING A CATEGORY: add it here, with its OWN mark. A repeated drawing is a
 * bug — on a grid the eye reads two identical stamps as one thing.
 */

export type CategoryMark = {
  /** Hand-drawn mark, 28-box / 1.7 stroke — see CatIcon. */
  icon: React.ReactElement<{ className?: string }>
  /** Two or three concrete examples of what belongs in this sphere. */
  description: string
}

const MARKS: Record<string, CategoryMark> = {
  business:      { icon: CatIcon.business,       description: 'სტრატეგია, სტარტაპი' },
  tax:           { icon: CatIcon.tax,            description: 'ინდ. მეწარმე, დღგ, 1%' },
  finance:       { icon: CatIcon.finance,        description: 'ბიუჯეტი, ინვესტიცია' },
  law:           { icon: CatIcon.law,            description: 'კონტრაქტი, რეგისტრაცია' },
  marketing:     { icon: CatIcon.marketing,      description: 'ბრენდი, რეკლამა, SMM' },
  sales:         { icon: CatIcon.sales,          description: 'გაყიდვები, მოლაპარაკება' },
  it:            { icon: CatIcon.it,             description: 'დეველოპმენტი, კარიერა' },
  product:       { icon: CatIcon.product,        description: 'პროდაქტი, UX' },
  design:        { icon: CatIcon.design,         description: 'ბრენდი, UI, გრაფიკა' },
  career:        { icon: CatIcon.career,         description: 'CV, ინტერვიუ, მენტორობა' },
  hr:            { icon: CatIcon.hr,             description: 'რეკრუტინგი, გუნდი' },
  psychology:    { icon: CatIcon.psych,          description: 'მხარდაჭერა, ემოციები' },
  'real-estate': { icon: CatIcon['real-estate'], description: 'ყიდვა, გაქირავება' },
  relocation:    { icon: CatIcon.relocation,     description: 'ვიზა, გადასვლა' },
  crypto:        { icon: CatIcon.crypto,         description: 'ბლოკჩეინი, ტოკენი' },
}

const FALLBACK: CategoryMark = { icon: CatIcon.business, description: 'ექსპერტული კონსულტაცია' }

/** The mark + blurb for a slug. Unknown slugs get a neutral default. */
export function categoryMark(slug: string | null | undefined): CategoryMark {
  return (slug && MARKS[slug]) || FALLBACK
}

/**
 * The mark, sized. `CatIcon` bakes in `w-7 h-7`, so a caller that wants another
 * size has to clone rather than wrap — wrapping would scale the box, not the
 * stroke, and the strokes are what make the set read as one hand.
 */
export function categoryIcon(slug: string | null | undefined, className = 'w-7 h-7') {
  return React.cloneElement(categoryMark(slug).icon, { className })
}

/** Every slug that has a bespoke mark — used by the test that forbids repeats. */
export const MARKED_SLUGS = Object.keys(MARKS)
