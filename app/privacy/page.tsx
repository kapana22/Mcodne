import Link from 'next/link'
import type { Metadata } from 'next'
import { MarketingTopBar } from '@/components/MarketingTopBar'
import { Container } from '@/components/Container'
import { Footer } from '@/components/Footer'
import { Eyebrow } from '@/components/Eyebrow'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcodne.ge').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'კონფიდენციალურობა — მცოდნე',
  description: 'როგორ ვაგროვებთ, ვიყენებთ და ვიცავთ შენს პირად მონაცემებს.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  openGraph: {
    title: 'კონფიდენციალურობა — მცოდნე',
    description: 'როგორ ვაგროვებთ, ვიყენებთ და ვიცავთ შენს პირად მონაცემებს.',
    url: `${SITE_URL}/privacy`,
  },
}

const SECTIONS = [
  {
    id: 'summary',
    title: 'მოკლედ',
    body: [
      'ვიცავთ შენს პირად მონაცემებს GDPR და საქართველოს კანონმდებლობის შესაბამისად. მონაცემებს ვაგროვებთ მხოლოდ იმდენს, რაც სერვისისთვის საჭიროა და არასდროს ვყიდით.',
    ],
  },
  {
    id: 'controller',
    title: '1. ვინ არის მონაცემთა კონტროლიორი',
    body: [
      'მონაცემთა კონტროლიორია შპს „მცოდნე“, რეგისტრირებული საქართველოში. კონტაქტი კონფიდენციალურობის საკითხებზე: privacy@mcodne.ge',
    ],
  },
  {
    id: 'data',
    title: '2. რა მონაცემებს ვაგროვებთ',
    body: [
      'რეგისტრაციისას: სახელი, ელფოსტა, ტელეფონი, ქალაქი. ექსპერტებისთვის დამატებით — გამოცდილება, პორტფოლიო, ID დოკუმენტი (გადამოწმებისთვის).',
      'პლატფორმის გამოყენებისას: სესიების ისტორია, შეტყობინებები, გადახდები, შეფასებები, ტექნიკური მონაცემები (IP, ბრაუზერი, მოწყობილობა).',
      'გადახდის შემთხვევაში: ბარათის დეტალები არ ინახება ჩვენთან — მუშავდება TBC / BOG payment gateway-ის მიერ.',
    ],
  },
  {
    id: 'purpose',
    title: '3. რისთვის ვიყენებთ',
    body: [
      'მომსახურების გაწევა — ანგარიშის მართვა, სესიების ორგანიზება, გადახდები.',
      'უსაფრთხოება — თაღლითობის აღმოჩენა, სპამის პრევენცია, ანგარიშის დაცვა.',
      'გაუმჯობესება — პლატფორმის ანალიზი, ახალი ფუნქციების შემუშავება.',
      'კომუნიკაცია — მნიშვნელოვანი შეტყობინებები, პასუხი კითხვებზე. მარკეტინგული წერილები იგზავნება მხოლოდ თანხმობის შემდეგ.',
    ],
  },
  {
    id: 'legal',
    title: '4. მონაცემთა დამუშავების საფუძველი',
    body: [
      'ხელშეკრულების შესრულება — ანგარიშის მართვა, სესიების ორგანიზება.',
      'სამართლებრივი ვალდებულება — გადასახადები, ბუღალტერია.',
      'ლეგიტიმური ინტერესი — უსაფრთხოება, თაღლითობის პრევენცია.',
      'თანხმობა — მარკეტინგული კომუნიკაცია, ანალიტიკური ქუქიები.',
    ],
  },
  {
    id: 'sharing',
    title: '5. ვის ვუზიარებთ',
    body: [
      'პლატფორმის მუშაობის უზრუნველყოფის მიზნით ვთანამშრომლობთ ტექნიკურ პარტნიორებთან: hosting (Vercel), payment (TBC, BOG), email (Resend), analytics (Plausible).',
      'ყოველ პარტნიორთან გვაქვს Data Processing Agreement (DPA). არასდროს ვყიდით მონაცემებს მესამე მხარეს.',
      'პირადი მონაცემები შეიძლება გავხადოთ სასამართლოს ან სახელმწიფო უწყების კანონიერი მოთხოვნით.',
    ],
  },
  {
    id: 'retention',
    title: '6. რამდენ ხანს ვინახავთ',
    body: [
      'ანგარიშის მონაცემები ინახება მანამ, სანამ ანგარიში აქტიურია. წაშლის შემდეგ — 90 დღე „grace period“, შემდეგ სრული წაშლა.',
      'გადახდის ჩანაწერები ინახება 7 წელი (საგადასახადო ვალდებულებით).',
      'შეტყობინებების ლოგები — 12 თვე უსაფრთხოების მიზნებისთვის.',
    ],
  },
  {
    id: 'rights',
    title: '7. შენი უფლებები',
    body: [
      'შენ გაქვს უფლება: მოითხოვო ინფორმაცია რა მონაცემები გვაქვს შენზე; მოითხოვო შესწორება ან წაშლა; შეზღუდო დამუშავება; მოითხოვო მონაცემების პორტაცია; გაიხმო თანხმობა; შეიტანო საჩივარი პერსონალურ მონაცემთა დაცვის სამსახურში.',
      'ამ უფლებების გამოსაყენებლად დაწერე: privacy@mcodne.ge — ვუპასუხებთ 30 დღეში.',
    ],
  },
  {
    id: 'security',
    title: '8. უსაფრთხოება',
    body: [
      'გამოვიყენებთ დაშიფვრას გადაცემისას (TLS) და შენახვისას (AES-256). პაროლები ინახება ჰეშირებული (bcrypt). წვდომა შენს მონაცემებზე შეზღუდულია — მხოლოდ უფლებამოსილ თანამშრომლებს.',
      'უსაფრთხოების ინციდენტის შემთხვევაში მოცემულ პირებს ვაცნობებთ 72 საათში.',
    ],
  },
  {
    id: 'international',
    title: '9. საერთაშორისო გადაცემა',
    body: [
      'ზოგიერთი ჩვენი პარტნიორი (მაგ. Vercel) დაფუძნებულია ევროპულ ეკონომიკურ ზონაში ან აშშ-ში. მონაცემთა გადაცემა ხდება Standard Contractual Clauses-ის საფუძველზე.',
    ],
  },
  {
    id: 'minors',
    title: '10. არასრულწლოვნები',
    body: [
      'პლატფორმა განკუთვნილია 18+ მომხმარებლებისთვის. თუ შევიტყობთ, რომ 18 წლამდე პირს გვაქვს ანგარიში, დაუყოვნებლივ წავშლით.',
    ],
  },
  {
    id: 'contact',
    title: '11. კონტაქტი',
    body: [
      'კონფიდენციალურობის საკითხებზე: privacy@mcodne.ge',
      'ზოგადი შეკითხვები: hi@mcodne.ge',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingTopBar />

      <Container as="main" size="content" className="py-16 lg:py-20">
        <Eyebrow className="mb-3">
          კონფიდენციალურობა
        </Eyebrow>
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.05]">
          კონფიდენციალურობის პოლიტიკა
        </h1>
        <p className="mt-2 text-[12.5px] text-ink-500 tabular-nums">ბოლო განახლება: 2026 წლის 1 ივლისი</p>

        <p className="mt-6 text-[16px] text-ink-700 leading-relaxed">
          შენი პირადი მონაცემები მნიშვნელოვანია. წინამდებარე პოლიტიკა ხსნის რა მონაცემებს ვაგროვებთ, როგორ ვიყენებთ,
          ვის ვუზიარებთ და როგორ ვიცავთ. თუ რაიმე გაუგებარია — დაწერე{' '}
          <a href="mailto:privacy@mcodne.ge" className="text-brand-700 hover:text-brand-800 font-semibold">
            privacy@mcodne.ge
          </a>
          .
        </p>

        <nav className="mt-8 rounded-card border border-ink-200 bg-ink-50/50 p-5">
          <Eyebrow tone="muted" className="mb-3">
            შინაარსი
          </Eyebrow>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-ink-700">
            {SECTIONS.map(s => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-brand-700">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-10">
          {SECTIONS.map(s => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="font-display text-xl lg:text-2xl font-bold text-ink-900 tracking-tight">{s.title}</h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-[14.5px] text-ink-700 leading-relaxed max-w-prose">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-ink-200 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" className="text-[13px] text-brand-700 hover:text-brand-800 font-semibold">
            ← მთავარზე დაბრუნება
          </Link>
          <div className="text-[12.5px] text-ink-500">
            იხილე ასევე{' '}
            <Link href="/terms" className="text-brand-700 hover:text-brand-800 font-semibold">
              წესები
            </Link>{' '}
            და{' '}
            <Link href="/cookies" className="text-brand-700 hover:text-brand-800 font-semibold">
              ქუქიების პოლიტიკა
            </Link>
          </div>
        </div>
      </Container>

      <Footer />
    </div>
  )
}
