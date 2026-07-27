// Registry of editable site texts. Pure data (no prisma) so it's safe to import
// in client components (the provider's fallback) AND on the server. Each entry's
// `default` is the exact string currently shipped; a SiteText DB row overrides
// it. To make a new string editable: add an entry here + render it with
// <SiteText k="..."/> (or useSiteText) where it appears.

export type SiteTextDef = {
  key: string
  group: string      // admin UI grouping
  label: string      // human label in the admin editor
  default: string
  multiline?: boolean
}

export const SITE_TEXTS: SiteTextDef[] = [
  // ── Landing hero ──
  { key: 'home.hero.line1', group: 'მთავარი — Hero', label: 'სათაური, 1-ლი ხაზი', default: 'ვიდეოსესია ექსპერტთან —' },
  { key: 'home.hero.line2', group: 'მთავარი — Hero', label: 'სათაური, აქცენტი (მწვანე)', default: 'პასუხი, ძებნის ნაცვლად.' },
  { key: 'home.hero.subtitle', group: 'მთავარი — Hero', label: 'ქვესათაური', multiline: true, default: 'გამოცდილი ქართველი ექსპერტები ბიზნესში, კარიერასა და გადასახადებში.' },
  { key: 'home.hero.subtitleEmphasis', group: 'მთავარი — Hero', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'დაჯავშნე და შეხვდი ვიდეოზე.' },

  // ── Home · Categories section ──
  { key: 'home.categories.title', group: 'მთავარი — კატეგორიები', label: 'სათაური', default: 'აირჩიე შენი სფერო' },
  { key: 'home.categories.subtitle', group: 'მთავარი — კატეგორიები', label: 'ქვესათაური', default: 'შეადარე ექსპერტები და დაჯავშნე ვიდეოსესია.' },

  // ── Home · Featured experts section ──
  { key: 'home.experts.title', group: 'მთავარი — ექსპერტები', label: 'სათაური', default: 'ხელით შერჩეული ექსპერტები.' },

  // ── Home · How it works ──
  { key: 'home.how.subtitle', group: 'მთავარი — როგორ მუშაობს', label: 'ქვესათაური', default: 'რეგისტრაცია, არჩევა, ვიდეოსესია.' },
  { key: 'home.how.step1.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'აირჩიე ექსპერტი' },
  { key: 'home.how.step1.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'გადახედე პროფილებს, შეფასებებს და ვიდეოშესავალს.' },
  { key: 'home.how.step2.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'აირჩიე სერვისი და დრო' },
  { key: 'home.how.step2.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'აირჩიე სერვისი და დრო კალენდრიდან — ექსპერტი ადასტურებს.' },

  // ── Home · Why us ──
  { key: 'home.why.card1.title', group: 'მთავარი — რატომ მცოდნე', label: 'ბარათი 1 — სათაური', default: 'ხელით მოდერაცია' },
  { key: 'home.why.card1.body', group: 'მთავარი — რატომ მცოდნე', label: 'ბარათი 1 — ტექსტი', multiline: true, default: 'ვამოწმებთ ყოველ განაცხადს — გამოცდილებას და რეპუტაციას.' },
  { key: 'home.why.card2.title', group: 'მთავარი — რატომ მცოდნე', label: 'ბარათი 2 — სათაური', default: 'HD ვიდეოსესია' },
  { key: 'home.why.card2.body', group: 'მთავარი — რატომ მცოდნე', label: 'ბარათი 2 — ტექსტი', multiline: true, default: 'ვიდეო-ოთახი, ჩატი, ფაილები. ჩაწერა — მალე.' },
  { key: 'home.why.card3.title', group: 'მთავარი — რატომ მცოდნე', label: 'ბარათი 3 — სათაური', default: 'გამჭვირვალე ფასი' },
  { key: 'home.why.card3.body', group: 'მთავარი — რატომ მცოდნე', label: 'ბარათი 3 — ტექსტი', multiline: true, default: 'ერთი ფასი, ფარული საკომისიოს გარეშე.' },

  // ── Categories page ──
  { key: 'categories.hero.title', group: 'სფეროები', label: 'სათაური', default: 'აირჩიე შენი სფერო' },
  { key: 'categories.hero.subtitle', group: 'სფეროები', label: 'ქვესათაური', multiline: true, default: 'აირჩიე მიმართულება, შეადარე ექსპერტები და დაჯავშნე ვიდეოსესია.' },

  // ── About page ──
  { key: 'about.hero.title', group: 'ჩვენ შესახებ', label: 'სათაური', default: 'ცოდნა, რომელსაც შენ ენდობი' },
  { key: 'about.hero.body', group: 'ჩვენ შესახებ', label: 'შესავალი', multiline: true, default: 'ბევრი ეძებს პასუხს რთულ პროფესიულ კითხვაზე, მაგრამ ვერ პოულობს ექსპერტს, ვისაც ენდობა. მცოდნე გაკავშირებს გამოცდილ სპეციალისტთან — მოკლედ, პირდაპირ და უსაფრთხოდ.' },
  { key: 'about.principles.title', group: 'ჩვენ შესახებ', label: 'პრინციპები — სათაური', default: 'ჩვენი პრინციპები' },
  { key: 'about.value1.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 1 — სათაური', default: 'გადამოწმებული ცოდნა' },
  { key: 'about.value1.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 1 — ტექსტი', multiline: true, default: 'ხელით ვამოწმებთ გამოცდილებას, პორტფოლიოსა და რეპუტაციას.' },
  { key: 'about.value2.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 2 — სათაური', default: 'გამჭვირვალე ფასი' },
  { key: 'about.value2.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 2 — ტექსტი', multiline: true, default: 'ერთი ფასი, გადახდა დაჯავშნისას. დაცული გადახდები — მალე.' },
  { key: 'about.value3.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 3 — სათაური', default: 'ღირებული დრო' },
  { key: 'about.value3.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 3 — ტექსტი', multiline: true, default: 'ფასი წინასწარ ცნობილია. სესია სტრუქტურული და შედეგზე ორიენტირებული.' },
  { key: 'about.value4.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 4 — სათაური', default: 'ქართული საზოგადოება' },
  { key: 'about.value4.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 4 — ტექსტი', multiline: true, default: 'ცოდნა ქართულად — ბიზნესი, სამართალი, კარიერა, ფსიქოლოგია.' },
  { key: 'about.create.title', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — სათაური', default: 'პირდაპირი წვდომა ცოდნაზე' },
  { key: 'about.create.p1', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — აბზაცი 1', multiline: true, default: 'კარგი კონსულტაცია ძნელი საპოვნია — ცოდნა არსებობს, მაგრამ ხელმისაწვდომი არაა. მცოდნე ამ ხარვეზს ავსებს.' },
  { key: 'about.create.p2', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — აბზაცი 2', multiline: true, default: 'გაკავშირებთ ხელით შერჩეულ ქართველ ექსპერტთან ერთ ვიდეოსესიაზე. ერთმა საუბარმა შეიძლება შენი პროექტი თუ კარიერა შეცვალოს.' },
  { key: 'about.cta.title', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — სათაური', default: 'ხარ ექსპერტი? გვინდა შენი ცოდნა' },
  { key: 'about.cta.body', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — ტექსტი', multiline: true, default: 'გაქვს გამოცდილება? შემოგვიერთდი — განაცხადს 24–48 საათში განვიხილავთ.' },

  // ── Help page ──
  { key: 'help.hero.title', group: 'დახმარება', label: 'სათაური', default: 'ხშირად დასმული კითხვები' },
  { key: 'help.contact.title', group: 'დახმარება', label: 'კონტაქტი — სათაური', default: 'დაგვიკავშირდი' },
  { key: 'help.contact.sub', group: 'დახმარება', label: 'კონტაქტი — ქვესათაური', default: 'ჩვენი გუნდი პასუხობს ორშ – პარ 10:00 – 19:00.' },

  // ── Footer ──
  { key: 'footer.tagline', group: 'Footer', label: 'აღწერა', multiline: true, default: 'მცოდნე — ხელით შერჩეული ქართველი ექსპერტები ვიდეოსესიაზე.' },
]

export const SITE_TEXT_DEFAULTS: Record<string, string> = Object.fromEntries(
  SITE_TEXTS.map(t => [t.key, t.default]),
)

// Guard: only known keys can be written from the admin API.
export function isKnownSiteTextKey(key: string): boolean {
  return key in SITE_TEXT_DEFAULTS
}
