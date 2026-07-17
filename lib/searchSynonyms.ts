// Search-term synonym map — used by /api/tutors to broaden matches so a
// student's colloquial term ("იურისტი") still finds tutors whose specialty is
// the formal cognate ("სამართალი"). Keys are lowercased Georgian/English
// terms; values include the original term + related terms.
//
// Coverage is intentionally biased toward the 6 seeded categories
// (business, finance, career, law, marketing, psychology) and their
// specialties from prisma/seed.ts. Adding a new key is cheap — dedupe is
// handled by expandQuery below.

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
