import Link from 'next/link'
import { Logo } from './Logo'
import { TrustStrip } from './TrustStrip'
import { Container } from '@/components/Container'
import { Eyebrow } from '@/components/Eyebrow'
import { ApplyCtaGate } from './ApplyCtaGate'
import { SiteText } from '@/components/SiteTextProvider'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: 'პროდუქტი', links: [
    { label: 'ექსპერტების ძებნა', href: '/tutors' },
    { label: 'კატეგორიები', href: '/categories' },
    { label: 'გახდი ექსპერტი', href: '/apply' },
    { label: 'როგორ მუშაობს', href: '/#how' },
  ]},
  { title: 'კომპანია', links: [
    { label: 'ჩვენს შესახებ', href: '/about' },
    { label: 'ბლოგი', href: '/blog' },
    { label: 'დაგვიკავშირდი', href: '/contact' },
    { label: 'დახმარება', href: '/help' },
  ]},
  { title: 'სამართალი', links: [
    { label: 'წესები', href: '/terms' },
    { label: 'კონფიდენციალურობა', href: '/privacy' },
    { label: 'ქუქიები', href: '/cookies' },
  ]},
]

export function Footer() {
  return (
    <footer className="mt-20 relative">
      {/* Brand-tinted top hairline that fades in from the sides — visually
          separates footer from content without a hard line. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent"
      />
      {/* Own container — pages drop this footer both inside and outside their
          content wrappers, so without its own max-width/padding it ran
          edge-to-edge and the bottom strip clipped at the viewport edge. */}
      <Container className="pt-14 pb-8">
        <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_1fr_1fr_1fr] gap-8 sm:gap-10 mb-12">
          <div className="col-span-2 sm:col-span-1">
            <Logo size="md" />
            <p className="text-[13.5px] text-ink-600 mt-5 leading-[1.6] max-w-sm">
              <SiteText k="footer.tagline" />
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-1.5 mt-4 text-[12.5px] text-ink-700 hover:text-brand-700 transition-colors font-display font-medium"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>
          {COLS.map(col => (
            <div key={col.title}>
              <Eyebrow tone="muted" className="mb-4">{col.title}</Eyebrow>
              <ul className="space-y-2.5">
                {col.links.map(l => {
                  const li = (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="text-[13.5px] text-ink-700 hover:text-brand-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-sm inline-block"
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
        <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4 pt-6 border-t border-ink-100 text-[12px] text-ink-500">
          <div className="tabular-nums">© {new Date().getFullYear()} მცოდნე</div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <TrustStrip />
            <span className="hidden sm:inline text-ink-300">·</span>
            <span>თბილისი, საქართველო</span>
          </div>
        </div>
      </Container>
    </footer>
  )
}
