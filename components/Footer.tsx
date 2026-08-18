import Link from 'next/link'
import { Logo } from './Logo'
import { TrustStrip } from './TrustStrip'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyCtaGate } from './ApplyCtaGate'
import { SiteText } from '@/components/SiteTextProvider'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'
const COLS: { titleKey: string; links: { label: string; href: string }[] }[] = [
  { titleKey: 'footer.col1.title', links: [
    { label: 'ექსპერტების ძებნა', href: '/tutors' },
    { label: 'კატეგორიები', href: '/categories' },
    // Index of the profession landing pages (/konsultacia/[slug]). A site-wide
    // link is what gets the whole set crawled from any page.
    { label: 'კონსულტაციები', href: '/konsultacia' },
    { label: 'შემოგვიერთდი', href: '/apply' },
    { label: 'როგორ მუშაობს', href: '/#how' },
  ]},
  { titleKey: 'footer.col2.title', links: [
    { label: 'ჩვენს შესახებ', href: '/about' },
    { label: 'ბლოგი', href: '/blog' },
    { label: 'დაგვიკავშირდი', href: '/contact' },
    { label: 'დახმარება', href: '/help' },
  ]},
  { titleKey: 'footer.col3.title', links: [
    { label: 'წესები', href: '/terms' },
    { label: 'კონფიდენციალურობა', href: '/privacy' },
    { label: 'ქუქიები', href: '/cookies' },
  ]},
]

/* NO top margin on <footer>. Every page already ends with its own bottom
   padding, and this footer draws its own hairline — `mt-20` stacked 80px of
   nothing on top of that, on EVERY page. Measured on /blog: a 250px band with
   no text and no image in it between the last card and the footer. If a page
   needs air above the footer it should say so itself.
   (A `{/* … *\/}` cannot be the first thing inside a parenthesised return —
   same trap as app/HomeClient's ExpertCta.) */
export function Footer() {
  return (
    <footer className="relative">
      {/* Brand-tinted top hairline that fades in from the sides — visually
          separates footer from content without a hard line. */}
      {/* NEUTRAL, not brand. This was a green gradient hairline — the only
          coloured rule on the entire site, sitting directly above a footer whose
          every other line is ink-200. That single exception is what made the
          page's rules read as „green in one place, grey in another". Green is
          reserved for STATE here (hover, focus, active), never for structure. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-ink-200" />
      {/* Own container — pages drop this footer both inside and outside their
          content wrappers, so without its own max-width/padding it ran
          edge-to-edge and the bottom strip clipped at the viewport edge. */}
      <Container className="pt-14 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_1fr_1fr_1fr] gap-8 sm:gap-10 mb-12">
          <div className="col-span-2 sm:col-span-1">
            <Logo size="md" />
            <p className="text-body text-ink-600 mt-5 leading-[1.6] max-w-sm">
              <SiteText k="footer.tagline" />
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-1.5 mt-4 min-h-[40px] sm:min-h-0 text-small text-ink-700 hover:text-brand-700 transition-colors duration-fast font-display font-medium"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
          {COLS.map(col => (
            <div key={col.titleKey}>
              <Eyebrow tone="muted" className="mb-4"><SiteText k={col.titleKey} /></Eyebrow>
              {/* Below sm the gap becomes PADDING inside each link instead of
                  space between them: the row pitch goes 32px → 40px (+8px per
                  item, not the doubled footer a naive min-h would have cost),
                  and the whole row becomes tappable rather than just the 22px
                  of text. Desktop keeps the tighter rhythm — a mouse doesn't
                  need a 40px target. */}
              <ul className="space-y-1 sm:space-y-2.5">
                {col.links.map(l => {
                  const li = (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="text-body text-ink-700 hover:text-brand-700 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-sm flex items-center min-h-[40px] sm:inline-block sm:min-h-0"
                      >
                        {l.label}
                      </Link>
                    </li>
                  )
                  // "გახდი ექსპერტი" is meaningless for an existing expert.
                  return l.href === '/apply' ? <ApplyCtaGate key={l.href}>{li}</ApplyCtaGate> : li
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4 pt-6 border-t border-ink-200 text-meta text-ink-500">
          <div className="tabular-nums">© {new Date().getFullYear()} მცოდნე</div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <TrustStrip />
            <span className="hidden sm:inline text-ink-300">·</span>
            <span><SiteText k="footer.location" /></span>
          </div>
        </div>
      </Container>
    </footer>
  )
}
