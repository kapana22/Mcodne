import { pageMetadata } from '@/lib/pageSeo'
import { socialMeta } from '@/lib/seo'
import { jsonLdString } from '@/lib/jsonLd'
import ContactPage from './ContactClient'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')
const DESC = `დაგვიკავშირდი — კითხვები პლატფორმაზე, ექსპერტობაზე ან თანამშრომლობაზე. გიპასუხებთ სწრაფად: ${SUPPORT_EMAIL}.`

// Editable in ადმინი → ტექსტები (group „SEO — დაგვიკავშირდი"). The
// DESCRIPTION stays here because it prints SUPPORT_EMAIL — one source for
// the address, so it can never be typed two different ways.
// Metadata now reads the editable SEO text from the database, so this page
// must render per request. Built statically it would bake whatever the
// defaults were at BUILD time — and Railway's builder cannot reach the DB,
// so that means the code defaults forever, whatever the admin types.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => pageMetadata('contact', '/contact', { description: DESC })

// ContactPage + the reachable contact point. Emitted from this server wrapper
// because ContactClient is a client component.
const contactLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  name: 'დაგვიკავშირდი — მცოდნე',
  url: `${SITE_URL}/contact`,
  inLanguage: 'ka',
  mainEntity: {
    '@type': 'Organization',
    name: 'მცოდნე',
    url: SITE_URL,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SUPPORT_EMAIL,
      availableLanguage: { '@type': 'Language', name: 'Georgian', alternateName: 'ka' },
    },
  },
}
const breadcrumbLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'მთავარი', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'დაგვიკავშირდი' },
  ],
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(contactLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }} />
      <ContactPage />
    </>
  )
}
