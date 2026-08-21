// georgian-lint-disable term-escrow
//
// WHY THE EXEMPTION: the arrays below are not copy — they are the words a USER
// might TYPE into the search box, and „ესქროუ" is one of them precisely because
// it is the wrong word. Someone who types it is asking about დაცული გადახდა and
// must be matched to that answer. Removing it would not improve our Georgian; it
// would break the search for the exact person the lint is meant to protect.
// (The canon draws this line already: copy rules bind text WE author. Nothing
// here is ever rendered.)

/**
 * THE LOCAL ANSWER MATCHER — the „chat bot“, and it runs entirely in the tab.
 *
 * No API, no model, no network call: a person types a question and this file
 * decides which of the 16 answers we already wrote is the one they asked for.
 * That is a deliberate ceiling, not a shortcut. The two questions people
 * actually type here are pricing and cancellation, and those are exactly the
 * two where an invented sentence costs money and trust. A retrieval matcher can
 * be WRONG (it offers the wrong answer, which the person can see and reject);
 * it cannot be CONFIDENTLY FALSE (inventing a refund policy that does not
 * exist). Everything below is built to keep that property.
 *
 * WHY GEORGIAN NEEDS MORE THAN `includes()`. Georgian is agglutinative: one
 * noun appears as ფასი / ფასს / ფასები / ფასად, and one verb as გავაუქმო /
 * გაუქმება / გავაუქმებ. A substring search finds none of those from the
 * others. So there are two mechanisms, and they cover different halves:
 *
 *   1. A conservative SUFFIX STEMMER, which handles the noun cases — the part
 *      of the language where a short suffix list is genuinely safe.
 *   2. Hand-written KEYWORDS per topic, which handle the verbs and the
 *      synonyms. Georgian verb morphology changes the stem itself
 *      (გავაუქმო vs გაუქმება share only „გა“), so no light stemmer can bridge
 *      it — and guessing harder would produce false matches, which are worse
 *      than a „ვერ გავიგე“. Listing the real surface forms is honest,
 *      auditable, and editable by someone who does not read code.
 *
 * THE THIRD OUTCOME IS THE IMPORTANT ONE. This returns answer / choice / none,
 * and `none` is a first-class success: it hands the person to a human and
 * records what they typed so the answer can be WRITTEN. A matcher that always
 * answers something is a matcher that is often wrong.
 */
import type { HelpTopic } from '@/lib/helpTopics'
import { professionHit, type HelpProfession } from '@/lib/helpProfessions'

/* ═══════════ keywords: the half a stemmer cannot reach ═══════════════════ */

/**
 * Per-topic trigger words, keyed by topic id. Content, not code — add the words
 * people actually type, including misspellings and the Latin ones they reach
 * for (zoom, visa). Multi-word entries are matched as phrases and score higher,
 * because „არ გამოცხადდა“ is far more specific than either word alone.
 *
 * Deliberately overlapping in places (გაუქმება appears for both a booking and
 * an account): the ambiguity is real, and the CHOICE outcome below is how it is
 * handled — by asking, not by guessing.
 */
export const TOPIC_KEYWORDS: Record<string, string[]> = {
  'what-is': ['მცოდნე', 'პლატფორმა', 'რა არის', 'რას აკეთებთ', 'რას სთავაზობთ', 'საიტი', 'სერვისი',
    'აპლიკაცია', 'რისთვისაა', 'რაშია საქმე', 'რას წარმოადგენთ'],
  'find-expert': ['ვიპოვო', 'პოვნა', 'ძებნა', 'ვეძებ', 'შერჩევა', 'ავირჩიო', 'აირჩიო', 'კატეგორია',
    'სპეციალისტი', 'კონსულტანტი', 'ვინ არის', 'რომელი ექსპერტი', 'მჭირდება იურისტი',
    'მჭირდება ბუღალტერი', 'მჭირდება ფსიქოლოგი', 'ვის მივმართო', 'რა სფეროები', 'რა მიმართულებები',
    'ვინ მუშაობს', 'გაქვთ სპეციალისტი', 'ფილტრი', 'ვინ მყავს ასარჩევი'],
  'price': ['ფასი', 'ფასები', 'ღირს', 'ჯდება', 'რა ღირს', 'თანხა', 'ფული', 'ტარიფი',
    'უფასო', 'უფასოა', 'საფასური', 'ღირებულება', 'გადასახდელი', 'ბიუჯეტი', 'ძვირი', 'იაფი',
    'რა ეღირება', 'ფასდაკლება', 'აქცია', 'ლარი', 'ფასიანი', 'ფასიანია', 'საათში რამდენი'],
  'how-to-book': ['დაჯავშნა', 'ჯავშანი', 'დავჯავშნო', 'ჩაწერა', 'ჩავიწერო', 'დანიშვნა', 'დავნიშნო',
    'შეხვედრის დაჯავშნა', 'როგორ დავჯავშნო', 'ჯავშნის გაკეთება', 'როგორ ჩავეწერო', 'დროის არჩევა', 'ვირჩევ დროს', 'დროს ვირჩევ',
    'თარიღის არჩევა', 'შეხვედრა დავნიშნო', 'როგორ დავიწყო', 'პირველი ნაბიჯი', 'რა ვქნა'],
  'where-session': ['სად ტარდება', 'ვიდეო', 'ვიდეოზარი', 'ვიდეოკავშირი', 'zoom', 'ზუმი', 'skype',
    'meet', 'კამერა', 'ლინკი', 'ბმული', 'სად შევხვდები', 'სად იქნება', 'ონლაინ', 'აპლიკაცია მჭირდება',
    'პროგრამა მჭირდება', 'როგორ შედგება კავშირი', 'ტელეფონით', 'პირისპირ', 'ცოცხლად', 'მიკროფონი',
    'ინტერნეტი', 'ვიდეოოთახი'],
  'cancel': ['გაუქმება', 'გავაუქმო', 'გაუქმო', 'გავაუქმებ', 'გადატანა', 'გადავიტანო', 'გადაწევა',
    'გადადება', 'თარიღის შეცვლა', 'დროის შეცვლა', 'ვეღარ დავესწრები', 'უარის თქმა',
    'თანხის დაბრუნება', 'ვერ მოვალ', 'ვერ დავესწრები', 'გადამიტანეთ', 'შევცვალო დრო',
    'გამომრჩა', 'შეხვედრა გამომრჩა', 'ჯავშნის გაუქმება', 'რეფანდი', 'შევცვალო', 'თარიღი შემიძლია', 'გადავიტანო'],
  'expert-noshow': ['არ გამოცხადდა', 'არ მოვიდა', 'არ იყო', 'დააგვიანა', 'დაგვიანება', 'გამოცხადება',
    'არ გამოჩნდა', 'ვერ დამიკავშირდა', 'არ მიპასუხა', 'არავინ იყო', 'ვერ შემხვდა', 'გამაცურა', 'დამაცდინა', 'დამაცადა', 'დამალოდინა', 'არ გამოცხადებულა'],
  'payment-safety': ['უსაფრთხო', 'დაცული', 'თაღლითობა', 'მოტყუება', 'ბარათის მონაცემები', 'ესქროუ',
    'დაცული გადახდა', 'დაცული თანხა', 'სანდოა', 'მომატყუებთ', 'ენდობა', 'რისკი', 'ბარათს ხომ არ მომპარავთ'],
  'payment-methods': ['გადახდის მეთოდი', 'როგორ გადავიხადო', 'ბარათი', 'ბარათით', 'გადარიცხვა',
    'visa', 'mastercard', 'ვისა', 'ნაღდი', 'საბანკო', 'გადახდა', 'გადავიხადო', 'ანგარიშზე',
    'tbc', 'bog', 'ბანკი', 'apple pay', 'გადახდის საშუალება'],
  'invoice': ['ინვოისი', 'ქვითარი', 'ჩეკი', 'ანგარიშფაქტურა', 'დოკუმენტი', 'ბუღალტერია', 'დღგ',
    'კომპანიაზე ინვოისი', 'იურიდიულ პირზე', 'ხელშეკრულება', 'საბუთი'],
  'become-expert': ['გავხდე ექსპერტი', 'ვხდები ექსპერტი', 'ექსპერტად გახდომა', 'განაცხადი', 'რეგისტრაცია',
    'მინდა ვმუშაობ', 'თქვენთან ვიმუშაო', 'განიხილება განაცხადი', 'განაცხადის განხილვა', 'როგორ დავიწყო', 'ექსპერტების მიღება', 'ვასწავლო', 'კონსულტაციის გაწევა',
    'თანამშრომლობა', 'ვმუშაობ თქვენთან',
    'მინდა შემოვუერთდე', 'ვაკანსია', 'სპეციალისტი ვარ', 'თქვენთან მუშაობა', 'თქვენთან თანამშრომლობა', 'ექსპერტად დარეგისტრირება'],
  'commission': ['კომისია', 'საკომისიო', 'პროცენტი', 'იტოვებთ', 'იჭერთ', 'რამდენს იღებთ',
    'თქვენი წილი', 'რას იღებთ', 'ხარჯი', 'რამდენს იტოვებთ'],
  'payout': ['გამომუშავება', 'ანაზღაურება', 'ხელფასი', 'გადმორიცხვა', 'გატანა', 'ჩემი თანხა',
    'როდის მივიღებ', 'შემოსავალი', 'ანგარიშსწორება', 'როდის გადმომერიცხება', 'ფულის გატანა', 'ფულის გამოტანა', 'გამოვიტანო',
    'როდის ამიხდით', 'გამომიგზავნით'],
  'account-security': ['პაროლი', 'პაროლის შეცვლა', 'უსაფრთხოება', 'ანგარიშის დაცვა', 'გატეხეს', 'გამიტეხეს',
    'ავტორიზაცია', 'ვერ შევდივარ', 'შესვლა', 'დამავიწყდა', 'აღდგენა', 'ორეტაპიანი',
    'ჩემი მონაცემები', 'კონფიდენციალურობა', 'პერსონალური მონაცემები'],
  'delete-account': ['წაშლა', 'წავშალო', 'ანგარიშის წაშლა', 'პროფილის წაშლა', 'დახურვა',
    'დეაქტივაცია', 'აღარ მინდა ანგარიში', 'აღარ მინდა პროფილი', 'გამომრიცხეთ'],
  // ── added with the 2026-08-04 answers ──
  'signup': ['რეგისტრაცია უფასო', 'დარეგისტრირება უფასო', 'დავრეგისტრირდე', 'დავრესგიტრირდე', 'დარეგისტრირება', 'რეგისტრაცია', 'ანგარიშის შექმნა', 'შევქმნა ანგარიში',
    'ანგარიში მჭირდება', 'როგორ შემოვდივარ', 'ექაუნთი', 'დარეგისტრირდი'],
  'duration': ['რამდენი ხანი', 'რამდენ ხანს', 'ხანგრძლივობა', 'რამდენი წუთი', 'რამდენი საათი',
    'გრძელდება', 'რა დროა', 'რამდენ ხანში'],
  'location': ['სად მდებარეობ', 'სად ხართ', 'სად არის', 'სად ვარ', 'სად ხარ', 'ოფისი', 'მისამართი',
    'ადგილმდებარეობა', 'უნდა მოვიდე', 'პირადად შევხვდეთ', 'ფიზიკურად'],
  'contact': ['ტელეფონი', 'ნომერი გაქვთ', 'დამირეკეთ', 'დაგირეკოთ', 'ცხელი ხაზი', 'როგორ დაგიკავშირდეთ',
    'საკონტაქტო'],
  'language': ['რომელ ენაზე', 'ენა', 'ინგლისურად', 'ქართულად', 'რუსულად', 'თარგმანი'],
  'pre-contact': ['წინასწარ მივწერო', 'დაჯავშნამდე მივწერო', 'დაველაპარაკო', 'დაკავშირება ექსპერტთან',
    'შეკითხვა ექსპერტს', 'მივწერო ექსპერტს'],
  'report-abuse': ['ჩივილი', 'საჩივარი', 'დისკრიმინაცია', 'შეურაცხყოფა', 'უხეშად', 'დარღვევა',
    'გასაჩივრება', 'უხამსი', 'შევატყობინო', 'ცუდად მომექცა', 'უხეში იყო', 'პრობლემა მაქვს ექსპერტთან',
    'მოტყუებული ვარ'],
}

/* ═══════════ normalisation ═══════════════════════════════════════════════ */

/**
 * Words that carry no topic on their own. Without this list „როგორ“ scores
 * against every answer that contains it and the ranking collapses — every
 * question in the FAQ starts with one of these.
 */
const STOPWORDS = new Set([
  'რა', 'რას', 'რის', 'როგორ', 'სად', 'როდის', 'რატომ', 'ვინ', 'რომელი', 'რამდენ',
  'არის', 'იყო', 'იქნება', 'აქვს', 'მაქვს', 'გაქვს', 'უნდა', 'შეიძლება', 'შემიძლია',
  'თუ', 'და', 'ან', 'მაგრამ', 'ეს', 'ის', 'ამ', 'იმ', 'მე', 'შენ', 'თქვენ', 'ჩემი', 'ჩვენი',
  'არა', 'არ', 'კი', 'ხომ', 'უკვე', 'ძალიან', 'ერთი', 'ყველა', 'რაღაც', 'გამარჯობა', 'გთხოვთ',
])

/**
 * Words that are everywhere in THIS corpus and therefore separate nothing.
 *
 * „ექსპერტი", „კონსულტაცია" and „სესია" appear in most of the sixteen
 * questions, so sharing one with a topic is not evidence about which topic was
 * meant — it is evidence that the person is on this website. Left in, they
 * produced nine „did you mean" hedges out of 82 questions, pairing things like
 * „ექსპერტმა დამაცდინა" with „how to find an expert".
 *
 * They are skipped ONLY when scoring against a topic's own question/answer
 * text. Keyword matching still sees them, so „გავხდე ექსპერტი" and
 * „მივწერო ექსპერტს" keep working — this removes an accidental signal, not a
 * deliberate one.
 */
const DOMAIN_COMMON = ['ექსპერტ', 'კონსულტაც', 'სესი', 'მცოდნე']
const isCommon = (t: string) => DOMAIN_COMMON.some(c => t.startsWith(c) || c.startsWith(t))

/** Georgian noun suffixes, longest first. Conservative on purpose — see below. */
const SUFFIXES = [
  'ებისთვის', 'ისთვის', 'ებიდან', 'ებამდე', 'ებთან', 'ებზე', 'ებში', 'ებით', 'ებად', 'ებმა',
  'ისას', 'იდან', 'ამდე', 'თვის', 'ებს', 'ები', 'თან',
  // Adjective/participle tails. „ფასიანია" stemmed to itself and so never met
  // „ფასი" → „ფას"; these are what let a describing word reach its noun.
  'იანია', 'იანი', 'ოვანი', 'ური', 'ულ', 'იან',
  'ზე', 'ში', 'ით', 'ად', 'ის', 'მა', 'ს', 'ი',
]

/** Lowercase, strip punctuation and the Georgian quotes, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[„“"'`’‘.,!?;:()[\]{}\-—–/\\|*#@%+=<>~^&$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strip ONE noun suffix, and only when at least 3 characters survive.
 *
 * One pass, not a loop: iterating turns ფასები into ფას and then keeps eating,
 * and an over-stemmed token matches everything. A single conservative cut is
 * what makes ფასი/ფასს/ფასები meet at ფას without dragging unrelated words
 * along with them.
 */
export function stem(w: string): string {
  for (const suf of SUFFIXES) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length)
  }
  return w
}

/** Content tokens of a string: normalised, stopwords dropped, stemmed. */
export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(w => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem)
    .filter(w => w.length >= 3)
}

/**
 * Edit distance, abandoned as soon as it exceeds `max`.
 *
 * Bounded rather than complete because we never care HOW different two words
 * are — only whether they are within a typo of each other. The early exit also
 * keeps this cheap enough to run against every keyword on every keystroke-sized
 * query without thinking about it.
 */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  // DAMERAU, not plain Levenshtein: a swap of two adjacent letters counts as
  // ONE edit. This is not a refinement, it is the main case — „დავჯავშნო"
  // typed as „დავჯვაშნო" is the single most common Georgian mistype, and plain
  // Levenshtein scores that transposition as two substitutions and rejects it.
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      row[j] = v
      if (v < best) best = v
    }
    if (best > max) return false
    prev2 = prev
    prev = row
  }
  return prev[b.length] <= max
}

/* ═══════════ character n-grams: TRIED, MEASURED, REMOVED ════════════════
 *
 * A character-4-gram similarity net was built here and then deleted, and the
 * reasoning is kept so nobody spends the day rebuilding it.
 *
 * THE CASE FOR IT was good. There is no Georgian stemmer in existence — no
 * Snowball algorithm, nothing on npm or PyPI, not even a stopword list in any
 * mainstream package — and the CLEF-2002 measurements (McNamee & Mayfield) show
 * character n-grams beating plain words by +66% MAP in Finnish and +28% in
 * German, with the gain tracking mean word length at r=0.935. Georgian's mean
 * word length is 6.92 characters, essentially Turkish (6.90). Turkish work
 * found 5-char truncation statistically indistinguishable from a full
 * lemmatiser. On paper this should have been a large win.
 *
 * IT MEASURED AS EXACTLY ZERO. Against eight inflected phrasings that appear in
 * no keyword list and match no suffix rule, the matcher scored 7/8 with the net
 * ON at every threshold from 0.55 to 0.75 — and 7/8 with it OFF. Not one case
 * changed. Below 0.62 it did change something: it broke refusal, matching
 * „თანამშრომელი" to „თანამშრომლობა" and answering „how many employees do you
 * have" with the expert-application page.
 *
 * WHY, in hindsight. Those +66% figures are measured against word matching with
 * NO stemming at all. That is not the baseline here: `related()` already treats
 * one word as another when it is a prefix of it, and Georgian inflects by
 * SUFFIX — so prefix matching already collapses precisely the pairs a 4-gram
 * set would. The n-grams were computing a second opinion about a question that
 * had already been answered.
 *
 * WHEN IT WOULD BE WORTH REVISITING: if the corpus grows well past 16 answers,
 * or if prefix matching is ever removed. Not before — and if it is rebuilt,
 * rebuild the measurement first.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Two stems count as the same word when one is a prefix of the other — OR when
 * they are within a typo of each other.
 *
 * The typo tolerance is deliberately scaled to length and never applied to
 * short words: at 5–6 characters one edit already turns real Georgian words
 * into different real Georgian words, and a false match is worse than a miss
 * because it answers confidently. Only from 7 characters, where the space of
 * words is sparse enough, is a single edit safe; nothing here ever allows two.
 */
function related(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  /* A prefix only counts when it is MOST of the longer word.
   *
   * „ანგარიშფაქტურა" (an invoice) begins with „ანგარიში" (an account), so a
   * bare startsWith answered „ანგარიშფაქტურა მჭირდება" with the registration
   * answer. Georgian compounds like that constantly, and the length ratio is
   * what separates an inflection („ბიზნეს" in „ბიზნესმა") from a different
   * word that merely opens the same way. 0.6 keeps every inflection in the corpus —
   * including the -ია copula („ძვირია", „საიტია") that 0.7 rejected — and
   * still drops „ანგარიშ" ⊄ „ანგარიშფაქტურ" at 0.54. */
  if (short.length >= 4 && long.startsWith(short) && short.length >= long.length * 0.6) return true
  // „დაჯავშნა" typed as „დაჯვაშნა" (transposition) must still find the answer.
  if (short.length >= 7 && withinEdits(a, b, 1)) return true
  return false
}

/**
 * Does a MULTI-WORD keyword fire for this query?
 *
 * WHY THIS IS NOT `includes()` ANYMORE. It used to be, and that single line is
 * why „როგორ დავრესგისტრირდე" — one transposed letter — got „ამაზე პასუხი არ
 * მაქვს". A phrase went through raw substring matching, so the Damerau
 * tolerance in `withinEdits` (written for exactly that mistype) never reached
 * the keywords that need it most: the long, specific, multi-word ones. Word
 * ORDER broke it too — „დავრეგისტრირდე როგორ" matched nothing.
 *
 * So a phrase now fires when every one of its content words is present in the
 * query, in any order, each under the same typo tolerance a single-word
 * keyword already got. It stays strict — ALL words must be there, which is
 * what keeps „ინვოისი მჭირდება ბუღალტერიისთვის" out of the accountant page.
 */
function phraseHit(norm: string, qTokens: string[], k: string): 0 | typeof W_KEYWORD | typeof W_PHRASE {
  if (norm.includes(k)) return W_PHRASE
  const kt = tokens(k)
  if (!kt.length) return 0
  if (!kt.every(t => qTokens.some(q => related(q, t)))) return 0
  // A phrase that reduces to ONE content word („რა ვქნა" → ვქნა) is a one-word
  // keyword wearing a phrase's score, and a SHORT one is not distinctive enough
  // to fire on its own — measured, letting those through cost four correct
  // answers. Long ones are the opposite case and the reason this branch exists:
  // „როგორ დავრეგისტრირდე" reduces to დავრეგისტრირდე, and rescuing the
  // mistyped „დავრესგისტრირდე" is the whole point. Same 7-character bar
  // `related` uses before it trusts a typo.
  if (kt.length < 2) return kt[0].length >= 7 ? W_KEYWORD : 0
  return W_PHRASE
}

/* ═══════════ small talk ══════════════════════════════════════════════════ */

/**
 * Not every line typed into a chat is a question, and answering „გამარჯობა"
 * with „ამაზე პასუხი ჯერ არ მაქვს" is both useless and cold — it also poisons
 * the unanswered-questions backlog with greetings.
 *
 * These are FIXED replies to fixed openers. The one that matters most is the
 * „are you a real person" case: it is answered truthfully, because a widget
 * that dodges that question has started pretending to be something it is not.
 */
const SMALL_TALK: { match: string[]; reply: string }[] = [
  {
    match: ['გამარჯობა', 'გამარჯობათ', 'სალამი', 'ჰაი', 'hi', 'hello', 'დილა მშვიდობისა', 'საღამო მშვიდობისა'],
    reply: 'გამარჯობა! დაწერე კითხვა — ფასზე, დაჯავშნაზე, გაუქმებაზე ან ექსპერტად გახდომაზე.',
  },
  {
    match: ['მადლობა', 'გმადლობთ', 'დიდი მადლობა', 'thanks', 'thank you', 'მადლობთ'],
    reply: 'არაფრის! თუ სხვა კითხვა გაჩნდება, აქ ვარ.',
  },
  {
    match: ['ნახვამდის', 'კარგად', 'ბაი', 'bye', 'კარგად იყავი'],
    reply: 'კარგად! წარმატებები.',
  },
  {
    match: ['ბოტი ხარ', 'რობოტი ხარ', 'ადამიანი ხარ', 'ხარ ადამიანი', 'ვინ ხარ', 'ნამდვილი ხარ', 'ai ხარ'],
    // Truthful, and it says what that means in practice rather than just
    // admitting it: what this thing can and cannot do for you.
    reply: 'ავტომატური დამხმარე ვარ — პასუხებს მზა ბაზიდან გიპოვი, არაფერს ვიგონებ. თუ შენი შემთხვევა უფრო რთულია, ცოცხალ ადამიანთან გადაგამისამართებ.',
  },
  {
    match: ['დახმარება', 'დამეხმარე', 'რას შვები', 'რა შეგიძლია', 'როგორ მუშაობს ეს'],
    reply: 'ვპასუხობ კითხვებს ფასზე, დაჯავშნაზე, სესიაზე, გაუქმებაზე, გადახდაზე და ექსპერტად გახდომაზე. დაწერე შენი კითხვა.',
  },
]

/** A canned reply for an opener that is not a question, or null. */
export function smallTalk(query: string): string | null {
  const q = normalize(query)
  if (!q || q.length > 40) return null
  for (const s of SMALL_TALK) {
    for (const m of s.match) {
      const k = normalize(m)
      // Whole-line-ish only: „გამარჯობა, რა ღირს?" is a QUESTION and must go to
      // the matcher, not get answered with a greeting.
      if (q === k || (q.startsWith(k) && q.length <= k.length + 3)) return s.reply
    }
  }
  return null
}

/* ═══════════ scoring ═════════════════════════════════════════════════════ */

type Scored = {
  topic: HelpTopic
  score: number
  /**
   * How many INDEPENDENT reasons this topic matched: each keyword that fired,
   * plus one if the question's own words overlapped. A topic that reached
   * MIN_SCORE on a single loose keyword and nothing else is `weak` — the bar
   * for answering CONFIDENTLY is two reasons, or one multi-word phrase.
   *
   * WHY NOT JUST RAISE MIN_SCORE: measured, raising it from 4 to 5 removed 5
   * wrong answers and 16 correct ones. The problem was never the size of the
   * number; it was that one keyword and two keywords scored on the same scale.
   */
  signals: number
  /** A multi-word keyword matched — the strongest single reason there is. */
  phrase: boolean
}

/** Weights, named so a tuning change is a readable diff rather than a magic number. */
const W_PHRASE = 6   // a multi-word keyword matched literally — the strongest signal
const W_KEYWORD = 4  // a single-word keyword
const W_QUESTION = 3 // a content word shared with the question text
const W_ANSWER = 1   // a content word shared with the answer body

/** Everything above this is worth showing as an answer at all. */
const MIN_SCORE = 4
/** At or above this the FAQ match is specific enough to outrank a named
 *  profession — one keyword alone never reaches it. */
const PROFESSION_YIELDS_AT = 7
/** Within this of the winner, the runner-up is not distinguishable — ask. */
const TIE_WINDOW = 1

export function scoreTopics(query: string, topics: HelpTopic[]): Scored[] {
  const norm = normalize(query)
  const qTokens = tokens(query)
  if (!norm) return []

  return topics
    .map(topic => {
      let score = 0
      let signals = 0
      let phrase = false
      for (const kw of TOPIC_KEYWORDS[topic.id] ?? []) {
        const k = normalize(kw)
        if (!k) continue
        if (k.includes(' ')) {
          const hit = phraseHit(norm, qTokens, k)
          if (hit) { score += hit; signals++; if (hit === W_PHRASE) phrase = true }
        } else if (qTokens.some(t => related(t, stem(k)))) { score += W_KEYWORD; signals++ }
      }
      if (qTokens.length) {
        const qt = tokens(topic.q)
        const at = tokens(topic.a)
        for (const t of qTokens) {
          if (qt.some(x => related(t, x))) { score += W_QUESTION; signals++ }
          else if (at.some(x => related(t, x))) score += W_ANSWER
        }
      }
      return { topic, score, signals, phrase }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.id.localeCompare(b.topic.id))
}

type SearchResult =
  /** One clear winner. */
  | { kind: 'answer'; topic: HelpTopic }
  /**
   * They named a PROFESSION („იურისტი მჭირდება"), not a question. Carries the
   * find-expert answer AND the page for that profession, because at that point
   * a link beats any paragraph we could write.
   */
  | { kind: 'profession'; prof: HelpProfession; topic: HelpTopic }
  /** Two or three plausible readings — ask rather than guess. */
  | { kind: 'choice'; topics: HelpTopic[] }
  /** Nothing we have written answers this. The honest outcome. */
  | { kind: 'none' }

/**
 * The decision, and the reason it has three branches rather than „best match“.
 *
 * `choice` exists because a wrong confident answer is the expensive failure:
 * someone asking about deleting an ACCOUNT and being told the BOOKING
 * cancellation window has been actively misinformed, and both questions
 * legitimately contain „გაუქმება“. When the top two are within a point of each
 * other the matcher does not know, so it says so.
 *
 * `none` exists because „I don't have that written down“ is a true statement
 * this widget is allowed to make, and it is the one that routes a person to a
 * human instead of to a plausible paragraph.
 */
export function searchAnswer(query: string, topics: HelpTopic[]): SearchResult {
  const ranked = scoreTopics(query, topics)

  /* PROFESSION vs FAQ — who wins when both fire.
   *
   * Naming a specialist is usually the whole intent: „ბუღალტერი მჭირდება"
   * scores against the INVOICE answer (which legitimately discusses
   * accounting), so ranking alone sends it to the wrong place. That is why the
   * router exists.
   *
   * But it must yield to a CONFIDENT FAQ match, or it starts hijacking real
   * questions: „ინვოისი მჭირდება ბუღალტერიისთვის" is a question about invoices
   * that merely mentions an accountant, and routing it to the accountant page
   * answers a question nobody asked. The threshold is set where a match stops
   * being one loose keyword and becomes a keyword AND the question's own words. */
  const bestScore = ranked[0]?.score ?? 0
  if (bestScore < PROFESSION_YIELDS_AT) {
    const prof = professionHit(query)
    if (prof) {
      const topic = topics.find(t => t.id === 'find-expert')
      if (topic) return { kind: 'profession', prof, topic }
    }
  }
  if (!ranked.length || ranked[0].score < MIN_SCORE) return { kind: 'none' }
  const close = ranked.filter(r => r.score >= ranked[0].score - TIE_WINDOW)
  if (close.length > 1) return { kind: 'choice', topics: close.slice(0, 3).map(r => r.topic) }
  return { kind: 'answer', topic: ranked[0].topic }
}

/* ═══════════ what may be recorded ════════════════════════════════════════ */

/** Hard cap on a stored question. Long enough to read, short enough that a
 *  pasted document cannot arrive one keystroke at a time. */
export const MAX_QUERY_CHARS = 120

/**
 * Scrub a typed question before it is EVER sent anywhere.
 *
 * The admin needs to read what people asked that we could not answer — that is
 * the whole product loop, and it is the one place in this codebase where words
 * a user typed are stored on purpose. So the cost is paid here rather than
 * waved away: emails, phone-shaped digit runs, long numbers and URLs are
 * removed before the string leaves the browser, and the result is truncated.
 *
 * This is redaction, not anonymisation, and it is not claimed to be more. It
 * removes the identifiers people paste in by reflex; it cannot remove a
 * sentence someone chooses to write about themselves. That is why the widget
 * says out loud that the question is kept, and why nothing here is stored for
 * a question we DID answer — an answered question tells us nothing new.
 */
export function redactQuery(raw: string): string {
  return raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[ელფოსტა]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[ბმული]')
    .replace(/[+\d][\d\s()-]{6,}\d/g, '[ნომერი]')
    .replace(/\d{5,}/g, '[ნომერი]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_CHARS)
}
