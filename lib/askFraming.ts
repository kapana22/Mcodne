// Curated "framing" for the Perplexity-style Ask flow. A client types a business
// question; instead of an AI answer we (a) detect the most likely category, and
// (b) return a short curated brief — what the consultation covers, what to
// prepare, and related follow-ups — plus the category slug used to match experts.
//
// Purely rule-based (keyword → category), no LLM. `matchQuery` is what we hand to
// /api/tutors?q= so the matched experts ("sources") back up the framing.

export type Framing = {
  categorySlug: string | null
  categoryLabel: string
  headline: string
  intro: string
  prepare: string[]
  related: string[]
}

type CatDef = {
  slug: string
  label: string
  keywords: string[]
  headline: string
  intro: string
  prepare: string[]
  related: string[]
}

const CATEGORIES: CatDef[] = [
  {
    slug: 'business',
    label: 'ბიზნესი',
    keywords: ['ბიზნეს', 'სტარტაპ', 'startup', 'series a', 'fundrais', 'ფონდ', 'ინვესტ', 'pitch', 'pmf', 'product-market', 'გაყიდვ', 'growth', 'სტრატეგ', 'ოპერაცი', 'gtm', 'unicorn', 'scal'],
    headline: 'ბიზნეს-სტრატეგიის კონსულტაცია',
    intro: 'ეს კითხვა ბიზნესის სფეროშია. ქვემოთ ის ექსპერტები არიან, ვინც სწორედ ამ ტიპის საკითხში დაგეხმარება — სტრატეგია, ზრდა, fundraising, ოპერაციები.',
    prepare: [
      'მოკლედ ჩამოწერე შენი მიზანი და სად ხარ ახლა',
      'თუ გაქვს — pitch deck ან რიცხვები (revenue, growth)',
      'რა გადაწყვეტილება უნდა მიიღო შემდეგ 30 დღეში',
    ],
    related: [
      'როგორ მოვძებნო product-market fit?',
      'Series A-სთვის რა მეტრიკები მჭირდება?',
      'როგორ ავაწყო gtm სტრატეგია?',
    ],
  },
  {
    slug: 'finance',
    label: 'ფინანსები',
    keywords: ['ფინანს', 'გადასახად', 'tax', 'ბუღალტ', 'ip სტატუს', 'დღგ', 'ხელფას', 'ბიუჯეტ', 'accounting', 'invoice', 'ინვოის', 'ფული'],
    headline: 'ფინანსური / საგადასახადო კონსულტაცია',
    intro: 'ეს კითხვა ფინანსების სფეროშია — გადასახადები, ბუღალტერია, IP სტატუსი. ქვემოთ შესაბამისი ექსპერტები არიან.',
    prepare: [
      'რა სტატუსით მუშაობ (ფიზ. პირი, შპს, IP)',
      'შემოსავლის დაახლოებითი მასშტაბი',
      'კონკრეტული დოკუმენტი/სიტუაცია, რაზეც კითხვა გაქვს',
    ],
    related: [
      'რა გადასახადს ვიხდი IP სტატუსით?',
      'შპს თუ ინდ. მეწარმე — რომელი ჯობია?',
      'როგორ დავიანგარიშო დღგ?',
    ],
  },
  {
    slug: 'career',
    label: 'კარიერა',
    keywords: ['კარიერ', 'ინტერვიუ', 'interview', 'cv', 'რეზიუმე', 'faang', 'ხელფასზე', 'promotion', 'დაწინაურ', 'linkedin', 'სამსახურ', 'ვაკანს', 'ქოუჩ'],
    headline: 'კარიერული კონსულტაცია',
    intro: 'ეს კითხვა კარიერის სფეროშია — ინტერვიუ, CV, ხელფასზე მოლაპარაკება, ზრდა. ქვემოთ შესაბამისი ექსპერტები არიან.',
    prepare: [
      'შენი CV ან LinkedIn (თუ არსებობს)',
      'სამიზნე პოზიცია/კომპანია',
      'რაში გინდა კონკრეტულად დახმარება (ინტერვიუ, ხელფასი, ცვლილება)',
    ],
    related: [
      'FAANG ინტერვიუსთვის როგორ მოვემზადო?',
      'როგორ ვალაპარაკო ხელფასზე?',
      'CV-ს რა შევცვალო?',
    ],
  },
  {
    slug: 'law',
    label: 'სამართალი',
    keywords: ['სამართ', 'იურის', 'კონტრაქტ', 'ხელშეკრულებ', 'law', 'legal', 'contract', 'nda', 'დავა', 'სასამართლ', 'რეგისტრაცი'],
    headline: 'იურიდიული კონსულტაცია',
    intro: 'ეს კითხვა სამართლის სფეროშია — კონტრაქტები, რეგისტრაცია, დავები. ქვემოთ შესაბამისი ექსპერტები არიან.',
    prepare: [
      'რა დოკუმენტზე/სიტუაციაზეა საუბარი',
      'მხარეები და მოკლე კონტექსტი',
      'რა შედეგი გინდა მიიღო',
    ],
    related: [
      'სტარტაპის კონტრაქტში რა შევცვალო?',
      'NDA როგორ შევადგინო?',
      'შპს-ს რეგისტრაცია — რა ნაბიჯებია?',
    ],
  },
  {
    slug: 'marketing',
    label: 'მარკეტინგი',
    keywords: ['მარკეტ', 'ბრენდ', 'რეკლამ', 'smm', 'სოც', 'social', 'ads', 'seo', 'კონტენტ', 'brand', 'აუდიტორ'],
    headline: 'მარკეტინგის კონსულტაცია',
    intro: 'ეს კითხვა მარკეტინგის სფეროშია — ბრენდი, რეკლამა, SMM, კონტენტი. ქვემოთ შესაბამისი ექსპერტები არიან.',
    prepare: [
      'პროდუქტი/სერვისი და სამიზნე აუდიტორია',
      'ამჟამინდელი არხები (თუ არსებობს)',
      'ბიუჯეტისა და მიზნის დაახლოებითი სურათი',
    ],
    related: [
      'როგორ ავაწყო SMM სტრატეგია?',
      'რომელი არხით დავიწყო რეკლამა?',
      'ბრენდი როგორ განვასხვავო?',
    ],
  },
  {
    slug: 'psychology',
    label: 'ფსიქოლოგია',
    keywords: ['ფსიქ', 'ცხოვრებ', 'ურთიერთ', 'burnout', 'სტრეს', 'მოტივაცი', 'therapy', 'თერაპ', 'emotional', 'ემოცი'],
    headline: 'ფსიქოლოგიური კონსულტაცია',
    intro: 'ეს კითხვა ფსიქოლოგიის სფეროშია — ცხოვრება, ურთიერთობები, burnout. ქვემოთ შესაბამისი ექსპერტები არიან.',
    prepare: [
      'მოკლედ — რა გაწუხებს ან რაზე გინდა საუბარი',
      'რამდენ ხანია ეს სიტუაცია გრძელდება',
      'რა შედეგს ელოდები კონსულტაციისგან',
    ],
    related: [
      'burnout-ს როგორ გავუმკლავდე?',
      'როგორ დავძლიო სამსახურის სტრესი?',
      'ურთიერთობის კონფლიქტი — რა ვქნა?',
    ],
  },
]

const GENERIC: Framing = {
  categorySlug: null,
  categoryLabel: 'ყველა კატეგორია',
  headline: 'შენი კონსულტაცია',
  intro: 'აი ის შემოწმებული ექსპერტები, რომლებიც შენს კითხვასთან ყველაზე ახლოს არიან. აირჩიე და დაჯავშნე ვიდეოსესია.',
  prepare: [
    'მოკლედ ჩამოაყალიბე შენი კითხვა',
    'რა კონტექსტი ან დოკუმენტი გაქვს',
    'რა შედეგი გინდა მიიღო სესიიდან',
  ],
  related: [
    'როგორ მოვძებნო product-market fit?',
    'რა გადასახადს ვიხდი IP სტატუსით?',
    'FAANG ინტერვიუსთვის როგორ მოვემზადო?',
  ],
}

// Best-effort category detection: the category whose keywords the query hits
// most. Ties and no-match fall back to the generic framing.
export function frameQuestion(rawQuery: string): Framing {
  const q = (rawQuery || '').toLowerCase().trim()
  if (!q) return GENERIC
  let best: CatDef | null = null
  let bestScore = 0
  for (const c of CATEGORIES) {
    const score = c.keywords.reduce((n, kw) => (q.includes(kw) ? n + 1 : n), 0)
    if (score > bestScore) { bestScore = score; best = c }
  }
  if (!best || bestScore === 0) return GENERIC
  return {
    categorySlug: best.slug,
    categoryLabel: best.label,
    headline: best.headline,
    intro: best.intro,
    prepare: best.prepare,
    related: best.related,
  }
}
