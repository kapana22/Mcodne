/**
 * PROFESSION ROUTING — the fix for the single worst thing the bot did.
 *
 * Measured on the evaluation corpus, „find an expert" scored 4/9. Every miss
 * had the same shape: nobody types „how do I find an expert". They type
 * „იურისტი მჭირდება", „ბუღალტერი მჭირდება", „ბიზნესზე ვინმე მჭირდება" — a
 * PROFESSION and a need, with no question in it at all. Adding those words to
 * the find-expert keyword list would have papered over it; the real answer is
 * that the site already knows every profession it serves, and each one has its
 * own page. So a named profession stops being a search term and becomes a
 * destination: „იურისტი მჭირდება" → the answer, plus a button to the iuristi
 * page. That is better than what the generic answer could ever say.
 *
 * WHY THIS TABLE IS A COPY AND NOT AN IMPORT. `lib/professionSeo.ts` is ~450
 * lines of landing-page prose; the help widget is client-side, and importing it
 * would ship all of that to every visitor's browser to use four fields. This
 * holds only the four fields, and `tests/helpProfessions.test.ts` fails if it
 * ever drifts from the real table — so it cannot silently rot, which is the
 * usual and fair objection to a copy.
 *
 * ALIASES are the part a generated table cannot give us: the words people
 * actually use are not the words the SEO page targets. Nobody in Georgia types
 * „კარიერული კონსულტანტი" — they type „სამსახური" or „CV". Those go here.
 */

export type HelpProfession = {
  /** /konsultacia/<slug> */
  slug: string
  /** Nominative label, for the button text. */
  label: string
  /**
   * NAMES of the professional. Naming one IS the intent — nobody writes
   * „იურისტი" on a help widget unless they want one. Fires on its own.
   */
  words: string[]
  /**
   * TOPICS the professional covers. These are NOT intent on their own, and
   * treating them as if they were is measurable damage: with „ლოგო" firing
   * alone, „რა ფერია თქვენი ლოგო" was answered with „here are designers", and
   * „რეკლამა გავაკეთოთ ერთად" — a partnership pitch — got a marketer. Refusal
   * accuracy fell from 75% to 63% the moment these were treated as names.
   *
   * So a topic word only routes when a NEED word is present too: someone must
   * be asking FOR somebody, not merely mentioning the subject.
   */
  topics?: string[]
}

/**
 * „I am looking for a person" — the second half a topic word needs.
 *
 * Deliberately excludes „გინდათ/გსურთ" (do YOU want), which is what a person
 * SELLING something writes, not one buying.
 */
/**
 * „I AM one" — the mirror image, and it must BEAT a profession name.
 *
 * „ვმუშაობ ფსიქოლოგად, თქვენთან შემიძლია?" is a specialist offering to join
 * the platform. Naming a profession normally means wanting one, so the router
 * sent them to the list of psychologists — a confident wrong answer to somebody
 * trying to become supply rather than find it. The noun is the same; only these
 * words tell the two apart.
 */
const OFFER_WORDS = [
  'ვმუშაობ', 'მინდა ვმუშაო', 'შემოგიერთდეთ', 'შემოვუერთდე', 'თანამშრომლობა',
  'ვაკანსია', 'დასაქმება', 'გამოცდილება მაქვს', 'სპეციალისტი ვარ', 'ექსპერტი ვარ',
  'ვარ და მინდა', 'რეზიუმე გამოგიგზავნოთ',
]

const NEED_WORDS = [
  'მჭირდება', 'მინდა', 'ვეძებ', 'ვინმე', 'რჩევა', 'დახმარება', 'დამეხმარ', 'მირჩიე',
  'კონსულტაცია', 'სპეციალისტი', 'ექსპერტი', 'გყავთ', 'გაქვთ', 'ვის მივმართო', 'ვინ მყავს',
]

export const HELP_PROFESSIONS: HelpProfession[] = [
  { slug: 'bughalteri', label: 'ბუღალტერი',
    words: ['ბუღალტერი', 'ბუღალტერთან', 'ბუღალტრები', 'აუდიტორი'],
    topics: ['ბუღალტერია', 'გადასახადები', 'საგადასახადო', 'დეკლარაცია', 'rs.ge'] },
  { slug: 'iuristi', label: 'იურისტი',
    words: ['იურისტი', 'იურისტთან', 'იურისტები', 'ადვოკატი', 'ადვოკატთან'],
    topics: ['ხელშეკრულება', 'სამართლებრივი', 'სასამართლო', 'იურიდიული'] },
  { slug: 'finansisti', label: 'ფინანსისტი',
    words: ['ფინანსისტი', 'ფინანსისტთან', 'ფინანსისტები'],
    topics: ['ფინანსური', 'ბიუჯეტი', 'ინვესტიცია', 'დანაზოგი', 'ფინანსები'] },
  { slug: 'fsikologi', label: 'ფსიქოლოგი',
    words: ['ფსიქოლოგი', 'ფსიქოლოგთან', 'ფსიქოლოგები', 'ფსიქოთერაპევტი', 'თერაპევტი'],
    topics: ['ფსიქოლოგიური', 'დეპრესია', 'შფოთვა'] },
  { slug: 'marketologi', label: 'მარკეტოლოგი',
    words: ['მარკეტოლოგი', 'მარკეტოლოგთან', 'მარკეტოლოგები'],
    topics: ['მარკეტინგი', 'მარკეტინგში', 'რეკლამა', 'სოციალური ქსელები', 'smm', 'ბრენდი'] },
  { slug: 'biznes-konsultanti', label: 'ბიზნეს კონსულტანტი',
    words: ['ბიზნეს კონსულტანტი', 'ბიზნეს კონსულტანტთან'],
    topics: ['ბიზნესზე', 'ბიზნესი', 'ბიზნეს-გეგმა', 'სტარტაპი', 'მეწარმე', 'კომპანიის გახსნა'] },
  { slug: 'karieruli-konsultanti', label: 'კარიერული კონსულტანტი',
    words: ['კარიერული კონსულტანტი', 'კარიერულ კონსულტანტ'],
    topics: ['კარიერა', 'კარიერული', 'სამსახური', 'სამსახურის ძებნა', 'cv', 'რეზიუმე', 'გასაუბრება', 'ინტერვიუ'] },
  { slug: 'hr-specialisti', label: 'HR სპეციალისტი',
    words: ['hr სპეციალისტი'],
    topics: ['hr', 'ადამიანური რესურსები', 'პერსონალი', 'თანამშრომლების აყვანა', 'რეკრუტინგი'] },
  { slug: 'it-specialisti', label: 'IT სპეციალისტი',
    words: ['it სპეციალისტი', 'პროგრამისტი', 'დეველოპერი'],
    topics: ['it', 'საიტის გაკეთება', 'აპლიკაციის შექმნა', 'ტექნიკური'] },
  { slug: 'dizaineri', label: 'დიზაინერი',
    words: ['დიზაინერი', 'დიზაინერთან', 'დიზაინერები'],
    topics: ['დიზაინი', 'ლოგო', 'ბრენდინგი', 'ui', 'ux'] },
  { slug: 'gayidvebis-konsultanti', label: 'გაყიდვების კონსულტანტი',
    words: ['გაყიდვების კონსულტანტი'],
    topics: ['გაყიდვები', 'გაყიდვებში', 'sales', 'კლიენტების მოზიდვა'] },
  { slug: 'produkt-menejeri', label: 'პროდაქტ მენეჯერი',
    words: ['პროდაქტ მენეჯერი', 'product manager', 'პროდუქტის მენეჯერი'],
    topics: ['პროდაქტი'] },
  { slug: 'rieltori', label: 'რიელტორი',
    words: ['რიელტორი', 'რიელტორთან', 'რიელტორები'],
    topics: ['უძრავი ქონება', 'ბინის ყიდვა', 'ქირავდება'] },
  { slug: 'relokaciis-konsultanti', label: 'რელოკაციის კონსულტანტი',
    words: ['რელოკაციის კონსულტანტი'],
    topics: ['რელოკაცია', 'გადასვლა საზღვარგარეთ', 'ემიგრაცია', 'ბინადრობა', 'გადაბარგება'] },
  { slug: 'kripto-eksperti', label: 'კრიპტო ექსპერტი',
    words: ['კრიპტო ექსპერტი'],
    topics: ['კრიპტო', 'კრიპტოვალუტა', 'bitcoin', 'ბიტკოინი', 'crypto', 'ბლოკჩეინი'] },
]

/**
 * Match on the ROOT, not the dictionary form.
 *
 * Georgian does not append a case ending to the nominative — it replaces the
 * final vowel: „გადასახადები" becomes „გადასახადებში", „ბიზნესი" becomes
 * „ბიზნესზე". So `includes('გადასახადები')` fails on the exact sentence a
 * person types. Dropping the final vowel gives „გადასახადებ", which every
 * inflected form does contain, and it covers the regular plural for free
 * („ბიზნეს კონსულტანტ" matches …ები). Irregular plurals that change the stem —
 * ბუღალტერი → ბუღალტრები — cannot be derived and are listed by hand above.
 */
function root(w: string): string {
  return /[იაეოსუ]$/.test(w) ? w.slice(0, -1) : w
}

/** Longest first, so „ბიზნეს კონსულტანტი" wins over „ბიზნესი" when both fit. */
function expand(list: string[], prof: HelpProfession, strong: boolean) {
  return list.flatMap(w => {
    const word = w.toLowerCase()
    const r = root(word)
    // The full word at a 3-char floor (so „hr", „it", „ui" still need their
    // exact form and cannot fire on a fragment), the root only from 5, where an
    // accidental substring stops being plausible.
    const out = [{ needle: word, prof, strong }]
    if (r !== word && r.length >= 5) out.push({ needle: r, prof, strong })
    return out
  }).filter(x => x.needle.length >= 3)
}

/** Longest first, so „ბიზნეს კონსულტანტი" wins over „ბიზნესი" when both fit. */
const INDEX: { needle: string; prof: HelpProfession; strong: boolean }[] = HELP_PROFESSIONS
  .flatMap(prof => [...expand(prof.words, prof, true), ...expand(prof.topics ?? [], prof, false)])
  .sort((a, b) => b.needle.length - a.needle.length)

/**
 * The profession someone named, or null.
 *
 * Substring rather than token matching, on purpose: Georgian glues case endings
 * on („იურისტთან", „ბიზნესზე", „მარკეტინგში"), so the typed word usually
 * CONTAINS the dictionary root rather than equalling the dictionary form.
 */
export function professionHit(query: string): HelpProfession | null {
  const q = query.toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, ' ')
  // Someone offering their own services is not looking for one.
  if (OFFER_WORDS.some(w => q.includes(w))) return null
  const asking = NEED_WORDS.some(n => q.includes(n))
  for (const { needle, prof, strong } of INDEX) {
    if (!q.includes(needle)) continue
    // A NAME routes on its own; a TOPIC only when someone is asking for a person.
    if (strong || asking) return prof
  }
  return null
}
