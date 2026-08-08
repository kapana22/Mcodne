// Shared Open Graph / Twitter card builder.
//
// WHY THIS EXISTS — the bug it fixes:
// Next merges `metadata` shallowly PER FIELD. app/layout.tsx sets a default
// `openGraph.images`, but the moment a page declares its own `openGraph: {…}`
// object without an `images` key, the whole parent object is replaced and the
// image is GONE — it is not inherited key-by-key. Every page that set a custom
// OG title (which is every marketing page) was therefore shipping a card with
// no image, so shares on Facebook/LinkedIn/Messenger rendered a blank block.
//
// Route it through this helper and the fallback image can never be dropped
// again. Pass `image` only when the page has a genuinely better one (a blog
// cover, an expert's avatar).
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

/** The 1200×630 default card. Absolute — scrapers do not resolve relative URLs. */
const DEFAULT_OG_IMAGE = `${SITE_URL}/og.png`

type OgInput = {
  title: string
  description: string
  /** Site-relative path ('/blog') or absolute URL. */
  url: string
  /** Overrides the default card. Relative paths are made absolute. */
  image?: string | null
  type?: 'website' | 'article'
}

function absolute(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `${SITE_URL}${u.startsWith('/') ? '' : '/'}${u}`
}

/**
 * Build the `openGraph` + `twitter` pair for a page's metadata.
 *
 *   export const metadata = { title, description, ...socialMeta({…}) }
 *
 * Twitter mirrors OG deliberately: `summary_large_image` needs its own tags,
 * and several Georgian chat apps read the twitter:* pair in preference to og:*.
 */
export function socialMeta({ title, description, url, image, type = 'website' }: OgInput) {
  const img = absolute(image?.trim() || DEFAULT_OG_IMAGE)
  // Width/height are only truthful for our own card; a blog cover or avatar can
  // be any size, and a wrong declared size makes scrapers letterbox or skip it.
  const isDefault = img === DEFAULT_OG_IMAGE
  const images = [isDefault ? { url: img, width: 1200, height: 630, alt: 'მცოდნე' } : { url: img }]
  return {
    openGraph: { title, description, url: absolute(url), images, locale: 'ka_GE', type },
    twitter: { card: 'summary_large_image' as const, title, description, images },
  }
}
