// Search-term synonym map — used by /api/tutors to broaden matches so a
// student's colloquial term ("იურისტი") still finds tutors whose specialty is
// the formal cognate ("სამართალი"). Keys are lowercased Georgian/English
// terms; values include the original term + related terms.
//
// Coverage originally tracked only the 6 seeded categories; the catalogue is
// now 15 spheres, so the map was extended 2026-07-28 to cover the rest
// (sales, product, HR, real-estate, relocation, crypto) plus the CONCRETE
// terms people actually type. That second group matters more than the sphere
// names: nobody searches „გადასახადები", they search „დღგ", „შპს",
// „ინდმეწარმე", „დეკლარაცია". A zero-result search is a lost booking, not
// just a lost ranking.
//
// Adding a new key is cheap — dedupe is handled by expandQuery below. Two
// rules when you do:
//   1. Every bucket must contain its own key (expandQuery returns the bucket
//      verbatim on a direct hit, so omitting it drops the user's own word).
//   2. Keys are matched by substring in BOTH directions, so keep them short
//      and distinctive — a key like „ბიზნესი" also catches „ბიზნეს".

export const SEARCH_SYNONYMS: Record<string, string[]> = {
  // Law / ადვოკატი
  'იურისტი':     ['იურისტი', 'სამართალი', 'ადვოკატი', 'law', 'lawyer'],
  'ადვოკატი':    ['ადვოკატი', 'იურისტი', 'სამართალი', 'lawyer'],
  'სამართალი':   ['სამართალი', 'იურისტი', 'ადვოკატი', 'law'],
  'law':         ['law', 'lawyer', 'იურისტი', 'სამართალი'],

  // Finance / accounting
  'ბუღალტერი':   ['ბუღალტერი', 'საგადასახადო', 'ფინანსური', 'ფინანსები', 'accountant'],
  'საგადასახადო':['საგადასახადო', 'ბუღალტერი', 'გადასახადი', 'ფინანსები', 'tax'],
  'გადასახადი':  ['გადასახადი', 'საგადასახადო', 'ბუღალტერი'],
  'ფინანსური':   ['ფინანსური', 'ფინანსები', 'ბუღალტერი', 'finance'],
  'ფინანსები':   ['ფინანსები', 'ფინანსური', 'ბუღალტერი', 'ინვესტიცია', 'finance'],
  'ინვესტიცია':  ['ინვესტიცია', 'ფინანსები', 'finance', 'investment'],
  'accountant':  ['accountant', 'ბუღალტერი', 'საგადასახადო'],
  'finance':     ['finance', 'ფინანსები', 'ფინანსური'],

  // Tech / developer
  'პროგრამისტი': ['პროგრამისტი', 'დეველოპერი', 'ინჟინერი', 'developer', 'engineer'],
  'დეველოპერი':  ['დეველოპერი', 'პროგრამისტი', 'developer'],
  'developer':   ['developer', 'პროგრამისტი', 'დეველოპერი', 'engineer'],

  // Marketing
  'მარკეტოლოგი': ['მარკეტოლოგი', 'მარკეტინგი', 'reklama', 'marketing'],
  'მარკეტინგი':  ['მარკეტინგი', 'მარკეტოლოგი', 'ბრენდი', 'marketing'],
  'reklama':     ['reklama', 'რეკლამა', 'მარკეტინგი', 'marketing'],
  'რეკლამა':     ['რეკლამა', 'მარკეტინგი', 'მარკეტოლოგი'],
  'marketing':   ['marketing', 'მარკეტინგი', 'მარკეტოლოგი'],
  'ბრენდი':      ['ბრენდი', 'მარკეტინგი', 'brand'],

  // Psychology
  'ფსიქოლოგი':   ['ფსიქოლოგი', 'ფსიქოთერაპია', 'ფსიქოლოგია', 'psychology', 'therapist'],
  'ფსიქოთერაპია':['ფსიქოთერაპია', 'ფსიქოლოგი', 'ფსიქოლოგია', 'psychotherapy'],
  'ფსიქოლოგია':  ['ფსიქოლოგია', 'ფსიქოლოგი', 'ფსიქოთერაპია', 'psychology'],
  'psychology':  ['psychology', 'ფსიქოლოგია', 'ფსიქოლოგი'],

  // Business / strategy
  'ბიზნეს':      ['ბიზნეს', 'ბიზნესი', 'business', 'სტრატეგია'],
  'ბიზნესი':     ['ბიზნესი', 'ბიზნეს', 'business', 'სტრატეგია'],
  'სტრატეგია':   ['სტრატეგია', 'ბიზნესი', 'strategy'],
  'business':    ['business', 'ბიზნესი', 'ბიზნეს', 'სტრატეგია'],
  'strategy':    ['strategy', 'სტრატეგია', 'ბიზნესი'],

  // Career / coaching / HR
  'კარიერა':     ['კარიერა', 'ქოუჩი', 'career', 'coach'],
  'ქოუჩი':       ['ქოუჩი', 'კარიერა', 'coach'],
  'career':      ['career', 'კარიერა', 'ქოუჩი'],
  'coach':       ['coach', 'ქოუჩი', 'კარიერა'],
  'hr':          ['hr', 'კარიერა', 'talent', 'ქოუჩი'],

  // Design / product
  'დიზაინი':     ['დიზაინი', 'design', 'ux'],
  'design':      ['design', 'დიზაინი', 'ux'],

  /* ═══ Added 2026-07-28 ═══════════════════════════════════════════════════
   * Concrete terms first — these are what people type. Each one routes to the
   * sphere that can actually answer it, so „დღგ" reaches the tax experts even
   * though no profile literally contains that string.
   */

  // Tax & accounting — the highest-intent zero-result terms on the site.
  'დღგ':          ['დღგ', 'გადასახადი', 'საგადასახადო', 'ბუღალტერი', 'vat'],
  'vat':          ['vat', 'დღგ', 'საგადასახადო', 'ბუღალტერი'],
  'დეკლარაცია':   ['დეკლარაცია', 'საგადასახადო', 'ბუღალტერი', 'გადასახადი'],
  'აღრიცხვა':     ['აღრიცხვა', 'ბუღალტერი', 'ბუღალტრული', 'ფინანსები'],
  'ბუღალტრული':   ['ბუღალტრული', 'ბუღალტერი', 'აღრიცხვა', 'საგადასახადო'],
  'ხელფასი':      ['ხელფასი', 'ბუღალტერი', 'hr', 'გადასახადი'],

  // Company forms — searched as the form itself, never as „სამართალი".
  'შპს':          ['შპს', 'კომპანია', 'რეგისტრაცია', 'იურისტი', 'ბიზნესი'],
  'ინდმეწარმე':   ['ინდმეწარმე', 'მეწარმე', 'რეგისტრაცია', 'საგადასახადო', 'ბუღალტერი'],
  'მეწარმე':      ['მეწარმე', 'ინდმეწარმე', 'ბიზნესი', 'რეგისტრაცია'],
  'რეგისტრაცია':  ['რეგისტრაცია', 'შპს', 'ინდმეწარმე', 'იურისტი'],
  'ხელშეკრულება': ['ხელშეკრულება', 'იურისტი', 'სამართალი', 'contract'],
  'contract':     ['contract', 'ხელშეკრულება', 'იურისტი'],

  // Business planning
  'ბიზნეს გეგმა': ['ბიზნეს გეგმა', 'ბიზნესი', 'სტრატეგია', 'ფინანსები'],
  'გეგმა':        ['გეგმა', 'ბიზნეს გეგმა', 'სტრატეგია', 'ბიზნესი'],
  'სტარტაპი':     ['სტარტაპი', 'ბიზნესი', 'სტრატეგია', 'startup', 'ინვესტიცია'],
  'startup':      ['startup', 'სტარტაპი', 'ბიზნესი'],

  // Sales — a live sphere with a live expert and no entry until now.
  'გაყიდვები':    ['გაყიდვები', 'გაყიდვა', 'sales', 'ბიზნესი'],
  'გაყიდვა':      ['გაყიდვა', 'გაყიდვები', 'sales'],
  'sales':        ['sales', 'გაყიდვები', 'გაყიდვა'],
  'მოლაპარაკება': ['მოლაპარაკება', 'გაყიდვები', 'ბიზნესი', 'negotiation'],

  // Product
  'პროდაქტი':     ['პროდაქტი', 'product', 'პროდუქტი', 'სტრატეგია'],
  'პროდუქტი':     ['პროდუქტი', 'პროდაქტი', 'product'],
  'product':      ['product', 'პროდაქტი', 'პროდუქტი'],

  // HR / recruiting — 'hr' already existed but pointed only at career.
  'რეკრუტინგი':   ['რეკრუტინგი', 'hr', 'კადრები', 'recruiting'],
  'კადრები':      ['კადრები', 'hr', 'რეკრუტინგი'],
  'გასაუბრება':   ['გასაუბრება', 'კარიერა', 'ქოუჩი', 'hr', 'interview'],
  'რეზიუმე':      ['რეზიუმე', 'cv', 'კარიერა', 'ქოუჩი'],
  'cv':           ['cv', 'რეზიუმე', 'კარიერა'],

  // Real estate
  'უძრავი':       ['უძრავი', 'ქონება', 'უძრავი ქონება', 'real estate'],
  'ქონება':       ['ქონება', 'უძრავი', 'უძრავი ქონება', 'real estate'],
  'იპოთეკა':      ['იპოთეკა', 'უძრავი', 'ქონება', 'ფინანსები'],

  // Relocation / residency
  'რელოკაცია':    ['რელოკაცია', 'relocation', 'ბინადრობა', 'ვიზა'],
  'ბინადრობა':    ['ბინადრობა', 'რელოკაცია', 'ვიზა', 'იურისტი'],
  'ვიზა':         ['ვიზა', 'რელოკაცია', 'ბინადრობა', 'იურისტი'],
  'relocation':   ['relocation', 'რელოკაცია', 'ბინადრობა'],

  // Crypto
  'კრიპტო':       ['კრიპტო', 'crypto', 'ბლოკჩეინი', 'ინვესტიცია'],
  'crypto':       ['crypto', 'კრიპტო', 'ბლოკჩეინი'],
  'ბლოკჩეინი':    ['ბლოკჩეინი', 'კრიპტო', 'blockchain'],

  // IT — 'it' is too short to be a safe substring key (it matches inside many
  // Latin words), so route the spelled-out terms instead.
  'ტექნოლოგი':    ['ტექნოლოგი', 'პროგრამისტი', 'დეველოპერი', 'it'],
  'ვებგვერდი':    ['ვებგვერდი', 'საიტი', 'დეველოპერი', 'დიზაინი'],
  'საიტი':        ['საიტი', 'ვებგვერდი', 'დეველოპერი'],
}

// Expand a raw user query into a list of terms to search against. Includes the
// original term. Falls back to partial-key matching so "იურის" still finds the
// "იურისტი" bucket.
export function expandQuery(q: string): string[] {
  const trimmed = q.trim().toLowerCase()
  if (!trimmed) return []
  // Direct hit — return that bucket's terms verbatim.
  if (SEARCH_SYNONYMS[trimmed]) return Array.from(new Set(SEARCH_SYNONYMS[trimmed]))
  // Partial match: any key that contains or is contained by the query
  // contributes its bucket. Always include the original trimmed query so users
  // typing arbitrary text still get a contains-match.
  const matches: string[] = [trimmed]
  for (const [k, v] of Object.entries(SEARCH_SYNONYMS)) {
    if (k.includes(trimmed) || trimmed.includes(k)) matches.push(...v)
  }
  return Array.from(new Set(matches))
}
