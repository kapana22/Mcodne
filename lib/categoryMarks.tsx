import { phMark } from '@/components/CategoryMarks'

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
  /** ⚠️ A KEY NOW, NOT AN ELEMENT (2026-09-02). The marks moved to Phosphor
   *  duotone (components/CategoryMarks) — see that file for why the hand-drawn
   *  set went. Holding the key rather than the drawing means the table stays a
   *  table: no JSX in a `Record`, and `categoryIcon` is the one place a size is
   *  applied. */
  icon: string
  /** Two or three concrete examples of what belongs in this sphere. */
  description: string
  /**
   * The sphere's PHOTOGRAPH — `public/category-photos/<slug>.webp`, 800×500, the
   * plate behind the home tile (app/_home/categories).
   *
   * ⚠️ THE FOLDER IS `category-photos/`, NOT `categories/`, AND IT HAS TO BE.
   * `/categories/*` is a RETIRED URL that middleware.ts 308s to
   * `/experts?category=…`, and the matcher covers everything under public/ bar
   * `fonts` — so `public/categories/law.webp` was served as a redirect, the
   * image optimizer answered „The requested resource isn't a valid image", and
   * eight tiles drew a blank band with no error anywhere on the page. Measured
   * 2026-08-31. Any new public/ folder must be checked against middleware.ts
   * the same way.
   *
   * ⚠️ SHIPPED WITH THE REPO, not hotlinked. `images.unsplash.com` is an
   * allowed next/image host and the tiles could have pointed straight at it —
   * that puts the busiest surface on the site behind somebody else's CDN and
   * sends every visitor's IP there for a picture of a gavel. `public/` already
   * ships `max-age=immutable` (next.config), so a local file is one cached
   * round trip and it cannot 404 on us.
   *
   * ⚠️ `null` IS A REAL ANSWER, and the tile is built for it: a sphere with no
   * photograph falls back to the coloured plate the tiles had before
   * (2026-08-31). A shared „generic office" under an unknown slug would be a
   * picture that says nothing, twice.
   */
  photo: string | null
}

const MARKS: Record<string, CategoryMark> = {
  business:      { icon: 'business',       description: 'სტრატეგია, სტარტაპი', photo: '/category-photos/business.webp' },
  tax:           { icon: 'tax',            description: 'ინდ. მეწარმე, დღგ, 1%', photo: '/category-photos/tax.webp' },
  finance:       { icon: 'finance',        description: 'ბიუჯეტი, ინვესტიცია', photo: '/category-photos/finance.webp' },
  law:           { icon: 'law',            description: 'კონტრაქტი, რეგისტრაცია', photo: '/category-photos/law.webp' },
  marketing:     { icon: 'marketing',      description: 'ბრენდი, რეკლამა, SMM', photo: '/category-photos/marketing.webp' },
  sales:         { icon: 'sales',          description: 'გაყიდვები, მოლაპარაკება', photo: '/category-photos/sales.webp' },
  it:            { icon: 'it',             description: 'დეველოპმენტი, კარიერა', photo: '/category-photos/it.webp' },
  product:       { icon: 'product',        description: 'პროდუქტი, UX', photo: '/category-photos/product.webp' },
  design:        { icon: 'design',         description: 'ბრენდი, UI, გრაფიკა', photo: '/category-photos/design.webp' },
  career:        { icon: 'career',         description: 'CV, ინტერვიუ, მენტორობა', photo: '/category-photos/career.webp' },
  hr:            { icon: 'hr',             description: 'კადრები, გუნდი', photo: '/category-photos/hr.webp' },
  psychology:    { icon: 'psych',          description: 'მხარდაჭერა, ემოციები', photo: '/category-photos/psychology.webp' },
  'real-estate': { icon: 'property',       description: 'ყიდვა, გაქირავება', photo: '/category-photos/real-estate.webp' },
  relocation:    { icon: 'relocation',     description: 'ვიზა, გადასვლა', photo: '/category-photos/relocation.webp' },
  crypto:        { icon: 'crypto',         description: 'ბლოკჩეინი, ტოკენი', photo: '/category-photos/crypto.webp' },
}

const FALLBACK: CategoryMark = { icon: 'business', description: 'ექსპერტული კონსულტაცია', photo: null }

/** The mark + blurb for a slug. Unknown slugs get a neutral default. */
function categoryMark(slug: string | null | undefined): CategoryMark {
  return (slug && MARKS[slug]) || FALLBACK
}

/** The mark, sized. `phMark` puts the class on the <svg> itself — wrapping
 *  would scale the box and not the drawing. */
export function categoryIcon(slug: string | null | undefined, className = 'w-7 h-7') {
  return phMark(categoryMark(slug).icon, className)
}

/**
 * The photograph behind a sphere's tile, or `null` when we have none for that
 * slug — see `CategoryMark.photo` for why a fallback picture would be worse
 * than no picture.
 */
export function categoryPhoto(slug: string | null | undefined): string | null {
  return categoryMark(slug).photo
}

/**
 * The two home tiles that are NOT spheres — „ყველა სერვისი" (the whole
 * catalogue) and „მოთხოვნის გაგზავნა" (/request). They have no slug, so their
 * plates are named here rather than invented at the call site, next to the
 * fifteen that do.
 */
export const ALL_CATEGORIES_PHOTO = '/category-photos/all.webp'
export const REQUEST_TILE_PHOTO = '/category-photos/request.webp'

/** Every slug that has a bespoke mark — used by the test that forbids repeats. */
export const MARKED_SLUGS = Object.keys(MARKS)
