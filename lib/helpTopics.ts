// The FAQ content — ONE source, two readers.
//
// WHY IT MOVED HERE. These answers lived inside app/help/page.tsx. The help
// WIDGET needs the same answers, and a copy in the widget would drift the first
// time someone edits the page — with the widget then quietly telling people the
// OLD cancellation window or the OLD payment status. Those are exactly the two
// answers that cost money when they are wrong, which is why this is shared
// rather than duplicated.
//
// The flag-gated tenses are deliberate and must stay: PAYMENTS_LIVE decides
// whether accepting an offer implies a charge, and COMMISSION_PCT is read,
// never typed. An answer that hardcodes a number becomes a lie the day the
// constant changes.
//
// ⚠️ REWRITTEN 2026-08-26, AND CANCEL_CUTOFF_HOURS LEFT WITH THE PRODUCT. Half
// this file described the booking: „როგორ დავჯავშნო სესია", a cancellation
// window counted back from a start time, a session held in the browser, a
// length of 15/30/60 minutes. None of it exists — there is no calendar, no
// slot and no video room since 2026-08-24, and `ServiceProfile` carries a
// price and no duration at all. A person who followed these instructions went
// looking for a date picker on a profile that has none.
import { COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'
import { SUPPORT_EMAIL } from '@/lib/supportEmails'

/**
 * The one thing to DO after reading the answer. „An answer without an action is
 * an explanation, not help" — so the widget ends its answer bubble with this
 * where a real next step exists, and with nothing where it does not. Payment
 * answers deliberately carry none: there is nothing to do until payments are
 * live, and a button that only moves you sideways is worse than no button.
 *
 * `gate` keeps a link honest about who is looking:
 *   'apply' → only where `showApplyCta(role)` passes, so an existing expert is
 *             never invited to become one (the project's role-correctness rule);
 *   'auth'  → only when signed in, because /settings bounces an anonymous
 *             visitor to /signin, which is a dead end dressed as an answer.
 */
export type FaqAction = { label: string; href: string; gate?: 'apply' | 'auth' }

/**
 * `id` is the STABLE handle for a question and the only thing that ever leaves
 * the browser. Two failures it exists for:
 *   · the route map used to point at questions by Georgian text prefix, so
 *     rewording a question silently detached its context ordering;
 *   · the analytics used to send the question text itself — which resets the
 *     history on every copy edit and sits under a 64-char prop cap that a
 *     slightly longer Georgian question would quietly exceed.
 * Ids are permanent: reword `q` freely, never renumber an `id`.
 */
type FaqItem = { id: string; q: string; a: string; action?: FaqAction }

export type FaqGroup = {
  title: string
  items: FaqItem[]
}

export const GROUPS: FaqGroup[] = [
  {
    title: 'დაწყება',
    items: [
      {
        id: 'what-is',
        q: 'რა არის მცოდნე?',
        a: 'პლატფორმა, სადაც აღწერ რა გჭირდება და ექსპერტები შეთავაზებას გამოგიგზავნიან.',
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
      {
        id: 'find-expert',
        q: 'როგორ ვიპოვო შესაფერისი ექსპერტი?',
        a: 'გვერდზე „ექსპერტები“ გაფილტრე კატეგორიითა და ფასით. პროფილში ნახავ გამოცდილებას, სერვისებსა და ფასებს.',
        action: { label: 'ექსპერტების მოძებნა', href: '/experts' },
      },
      {
        id: 'price',
        q: 'რა ჯდება?',
        // Payment tense is gated on PAYMENTS_LIVE — the same flag the „გადახდა“
        // section below reads. While it's off a booking costs nothing, so the
        // page must not imply a charge.
        a: PAYMENTS_LIVE
          ? 'ფასს ადგენს ექსპერტი — პროფილში წინასწარ ხედავ, შეთავაზებაში კი ზუსტად შენს სამუშაოზე მიიღებ. გადაიხდი მას შემდეგ, რაც შეთავაზებას დაეთანხმები.'
          : 'ფასს ადგენს ექსპერტი — პროფილში წინასწარ ხედავ, შეთავაზებაში კი ზუსტად შენს სამუშაოზე მიიღებ. მოთხოვნის დატოვება უფასოა და ბარათს არ ვთხოვთ.',
        action: { label: 'ნახე ფასები', href: '/experts' },
      },
    ],
  },
  {
    title: 'მოთხოვნა და შეთავაზება',
    items: [
      {
        // ⚠️ THE `id` IS PERMANENT — it is the analytics handle and the
        // SiteText key, and the file's own rule is „reword `q` freely, never
        // renumber an `id`". So the question that used to be „how do I book"
        // keeps the handle `how-to-book` while asking what a person can
        // actually do.
        id: 'how-to-book',
        q: 'როგორ დავიწყო?',
        a: PAYMENTS_LIVE
          ? 'აღწერე რა გჭირდება — ექსპერტები შეთავაზებას ფასთან ერთად თავად გამოგიგზავნიან. აირჩიე ერთი, გადაიხადე და დანარჩენს მიმოწერაში ათანხმებთ.'
          : 'აღწერე რა გჭირდება — ექსპერტები შეთავაზებას ფასთან ერთად თავად გამოგიგზავნიან. აირჩიე ერთი და დანარჩენს მიმოწერაში ათანხმებთ. მოთხოვნა უფასოა, ბარათს არ ვთხოვთ.',
        // ⚠️ THE CATALOGUE, NOT /request. The intake is flag-gated
        // (`requestsOn`) and every link into it must sit in a file that reads
        // the flag — tests/requests.test.ts enforces exactly that, and this
        // one does not. /experts carries the gated CTA one tap away.
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
      {
        id: 'where-session',
        q: 'სად სრულდება სამუშაო?',
        a: 'ადგილზე შესასრულებელი — შენს მისამართზე. დანარჩენს ექსპერტთან ათანხმებ.',
      },
      {
        id: 'cancel',
        q: 'შემიძლია გავაუქმო?',
        // ⚠️ NO CUTOFF ANY MORE, AND THAT IS THE POINT. The window was counted
        // back from a session's START TIME; nothing has a start time now. What
        // a person can actually do is decline every offer, or close the request.
        a: PAYMENTS_LIVE
          ? 'დიახ — სანამ რომელიმე შეთავაზებას დაეთანხმები, მოთხოვნა ნებისმიერ დროს შეგიძლია დახურო და არაფერს იხდი. დათანხმების შემდეგ გაუქმებას ექსპერტთან ათანხმებ.'
          : 'დიახ — სანამ რომელიმე შეთავაზებას დაეთანხმები, მოთხოვნა ნებისმიერ დროს შეგიძლია დახურო. ონლაინ გადახდა ჯერ არ არის, ამიტომ დასაბრუნებელი თანხა არ არსებობს.',
      },
      {
        id: 'expert-noshow',
        q: 'რა მოხდება, თუ ექსპერტმა სამუშაო არ შეასრულა?',
        a: 'მოგვწერე — გამოვიძიებთ და სხვა ექსპერტს შემოგთავაზებთ.',
      },
    ],
  },
  {
    title: 'გადახდა',
    items: [
      {
        id: 'payment-safety',
        q: 'უსაფრთხოა თუ არა გადახდა?',
        a: 'მოთხოვნის დატოვება უფასოა, ბარათს არ ვთხოვთ.',
      },
      {
        id: 'payment-methods',
        q: 'რომელი გადახდის მეთოდები მიიღება?',
        a: 'ონლაინ გადახდა ჯერ არ არის. მოთხოვნის დატოვება უფასოა.',
      },
      {
        id: 'invoice',
        q: 'შემიძლია მივიღო ინვოისი?',
        a: 'ინვოისები გადახდებთან ერთად ამოქმედდება — ავტომატურად მოვა ელფოსტაზე. მანამდე მოთხოვნა უფასოა.',
      },
    ],
  },
  {
    title: 'ექსპერტებისთვის',
    items: [
      {
        id: 'become-expert',
        q: 'როგორ ვხდები ექსპერტი?',
        a: 'შეავსე განაცხადი და პასუხს 24–48 საათში მიიღებ.',
        action: { label: 'განაცხადის შევსება', href: '/join', gate: 'apply' },
      },
      {
        id: 'commission',
        q: 'რა კომისიას იღებს პლატფორმა?',
        // The figure is stated in both branches (owner, 2026-08-10). The
        // „არ ვიკავებთ" half of the old answer was true and still misleading:
        // it is the sentence an expert quotes back when the 15% appears.
        a: PAYMENTS_LIVE
          ? `პლატფორმა იტოვებს ${COMMISSION_PCT}%-ს. ეს მოიცავს ინფრასტრუქტურას, გადახდას, მხარდაჭერასა და მარკეტინგს.`
          : `პლატფორმა ${COMMISSION_PCT}%-ს იტოვებს — ონლაინ გადახდების ამოქმედების შემდეგ. ეს მოიცავს ინფრასტრუქტურას, გადახდას, მხარდაჭერასა და მარკეტინგს.`,
        action: { label: 'განაცხადის შევსება', href: '/join', gate: 'apply' },
      },
      {
        id: 'payout',
        q: 'როდის მივიღებ თანხას?',
        a: 'ონლაინ გადახდები ჯერ არ ამოქმედებულა.',
        action: { label: 'განაცხადის შევსება', href: '/join', gate: 'apply' },
      },
    ],
  },
  {
    title: 'ანგარიში და უსაფრთხოება',
    items: [
      {
        id: 'account-security',
        q: 'როგორ დავიცვა ჩემი ანგარიში?',
        // Only controls that actually exist: /settings has „პაროლის შეცვლა“
        // (min. 8 characters) and Google-ით შესვლა. There is no 2FA anywhere in
        // the product — don't send people looking for a switch that isn't there.
        a: `გამოიყენე ძლიერი, უნიკალური პაროლი (მინიმუმ 8 სიმბოლო) და არავის გაუზიარო წვდომა. პაროლს ნებისმიერ დროს შეცვლი „პარამეტრები → პაროლის შეცვლა“-ში. თუ ეჭვი გაქვს, რომ ვინმემ ანგარიშთან წვდომა მოიპოვა, მაშინვე შეცვალე პაროლი და მოგვწერე ${SUPPORT_EMAIL}.`,
        action: { label: 'პაროლის შეცვლა', href: '/settings', gate: 'auth' },
      },
      {
        id: 'delete-account',
        q: 'როგორ წავშალო ანგარიში?',
        // The DELETE in app/api/me/route.ts runs prisma.user.delete() straight
        // away — no grace period, no restore. It refuses only when live bookings
        // or historical records exist (then support handles it by hand).
        a: `„პარამეტრები → ანგარიში → ანგარიშის წაშლა“. წაშლა მყისიერია და შეუქცევადი — მონაცემები აღდგენას აღარ ექვემდებარება. თუ ღია მოთხოვნა ან მიმდინარე შეთანხმება გაქვს, ჯერ დახურე; თუ ანგარიშს დასრულებული სამუშაოები ან მიმოწერა აქვს, წაშლა ავტომატურად არ სრულდება — მოგვწერე ${SUPPORT_EMAIL}.`,
        action: { label: 'პარამეტრები', href: '/settings', gate: 'auth' },
      },
      {
        id: 'report-abuse',
        q: 'რა ხდება, თუ ექსპერტი დისკრიმინაციულად მოიქცა?',
        // Was report@mcodne.ge — an address that appeared nowhere else in the
        // product and had no inbox behind it, so abuse reports went nowhere.
        // Route to the one support address that is actually monitored.
        a: `დაწერე ${SUPPORT_EMAIL} — გამოვიძიებთ 48 საათში. სერიოზული დარღვევისას ანგარიშს ვხურავთ და თანხას სრულად ვაბრუნებთ.`,
        action: { label: 'მოგვწერე', href: '/contact' },
      },
    ],
  },
  {
    // Written 2026-08-04 from the UNANSWERED log: every question below was
    // typed by a real person and got „I have no answer for that". Each answer
    // states only behaviour that is verifiable in the product — no policy is
    // invented here, because a made-up rule about lateness or refunds is the
    // exact failure this widget is built to avoid.
    title: 'ანგარიში და შეხვედრა',
    items: [
      {
        id: 'signup',
        // PROD, twice, both misspelled: „როგორ დავრესგიტრირდე" / „როგორ
        // დავრესგისტრირდე". Client registration had no answer at all —
        // „become-expert" is the EXPERT application, a different thing.
        q: 'როგორ დავრეგისტრირდე?',
        a: 'რეგისტრაცია უფასოა. ანგარიში მხოლოდ მოთხოვნის დასატოვებლად გჭირდება — ექსპერტებს ისედაც ნახავ.',
        action: { label: 'რეგისტრაცია', href: '/signup' },
      },
      {
        id: 'duration',
        // PROD ×2 — „რამდენი ხანი გრძელდება სესია".
        q: 'რამდენი ხანი გრძელდება?',
        // ⚠️ THIS NAMED „15, 30 ან 60 წუთი" AND NOTHING STORES A LENGTH. That
        // was the bookable session's picker; `ServiceProfile` carries
        // `services` and `priceFrom` and no duration column at all, so the
        // three numbers were a promise the product cannot keep. The offer is
        // where scope and time are actually stated, by the person doing it.
        a: 'ეს სამუშაოზეა დამოკიდებული და შეთავაზებაში წერია — ექსპერტი მოცულობასა და ვადას იქვე უთითებს.',
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
      {
        id: 'location',
        // PROD ×4 — „სად არის" / „სად ვარ" / „სად მდებარეობს" / „სად ხარ".
        q: 'სად მდებარეობთ? ოფისში უნდა მოვიდე?',
        a: 'ოფისში მოსვლა არ გჭირდება. ყველაფერი პლატფორმაზე და ექსპერტთან შეთანხმებით ხდება.',
      },
      {
        id: 'contact',
        q: 'ტელეფონის ნომერი გაქვთ?',
        a: `სატელეფონო ხაზი არ გვაქვს — მხარდაჭერა ელფოსტითა და საკონტაქტო ფორმით მუშაობს, პასუხს 24 საათში იღებ. მოგვწერე ${SUPPORT_EMAIL}.`,
        action: { label: 'საკონტაქტო ფორმა', href: '/contact' },
      },
      {
        id: 'language',
        q: 'რომელ ენაზე ტარდება შეხვედრა?',
        a: 'ენა პროფილში წერია. აირჩიე ის, ვისაც შენთვის სასურველი უწერია.',
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
      {
        id: 'pre-contact',
        q: 'შემიძლია ექსპერტს წინასწარ მივწერო?',
        // ⚠️ THE OLD ANSWER SAID YES AND POINTED AT A BUTTON THAT IS GONE. It
        // cited `app/experts/[slug]/client.tsx` — the file went with the
        // booking product on 2026-08-24, and the profile's one action is
        // „დატოვე მოთხოვნა". The chat opens on an OFFER (RequestMessage hangs
        // off RequestOffer), so this now says where the conversation really
        // starts instead of sending somebody looking for a button.
        a: 'მიმოწერა შეთავაზების მიღების შემდეგ იხსნება. კითხვა თავად მოთხოვნაში დაწერე.',
        // ⚠️ THE CATALOGUE, NOT /request. The intake is flag-gated
        // (`requestsOn`) and every link into it must sit in a file that reads
        // the flag — tests/requests.test.ts enforces exactly that, and this
        // one does not. /experts carries the gated CTA one tap away.
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
    ],
  },
]

/* ═══════════ the widget: which question leads, and where ════════════════ */

/* ── Editable answers ────────────────────────────────────────────────────────
 *
 * Every question and most answers are edited in ადმინი → ტექსტები. The SiteText
 * key is built from the `id`, which is why ids are permanent: reword freely,
 * never renumber.
 *
 * SEVEN ANSWERS ARE DELIBERATELY NOT EDITABLE. They interpolate a constant —
 * CANCEL_CUTOFF_HOURS, COMMISSION_PCT, SUPPORT_EMAIL — or branch on
 * PAYMENTS_LIVE, and those are exactly the answers that cost money when they
 * are wrong. An answer typed by hand saying „24 საათი" becomes a lie the day
 * the constant moves, and nothing would report it. The file's own header made
 * that rule before this feature existed; this list is that rule, enforced.
 *
 * The QUESTION of a locked item is still editable — only its answer is pinned.
 */
export const HELP_LOCKED_ANSWER_IDS: readonly string[] = [
  'price', 'how-to-book', 'cancel', 'commission',
  'account-security', 'delete-account', 'report-abuse',
  // Interpolates SUPPORT_EMAIL — an edited copy would freeze today's address
  // into the answer and keep showing it after the address changes.
  'contact',
]

export const helpFaqKey = (id: string, part: 'q' | 'a') => `help.faq.${id}.${part}`

/**
 * Overlay admin-written copy onto the static groups.
 *
 * Pure and React-free on purpose: the /help page resolves the map on the SERVER
 * (so the FAQPage structured data and the visible answer are built from one
 * value — a mismatch is what makes Google drop a rich result), while the widget
 * resolves it in the browser. Both call this.
 */
export function resolveGroups(map: Record<string, string>): FaqGroup[] {
  return GROUPS.map(g => ({
    ...g,
    items: g.items.map(it => ({
      ...it,
      q: map[helpFaqKey(it.id, 'q')] || it.q,
      a: HELP_LOCKED_ANSWER_IDS.includes(it.id) ? it.a : (map[helpFaqKey(it.id, 'a')] || it.a),
    })),
  }))
}

/** Flattened equivalent of resolveGroups — what the widget renders. */
function resolveTopics(map: Record<string, string>): HelpTopic[] {
  return resolveGroups(map).flatMap(g => g.items.map(it => ({ ...it, group: g.title })))
}

/** One question, flattened out of its group — what the widget renders. */
export type HelpTopic = { id: string; q: string; a: string; group: string; action?: FaqAction }

/** Every question, in page order, with its section name kept for grouping. */
export const ALL_TOPICS: HelpTopic[] = GROUPS.flatMap(g =>
  g.items.map(it => ({ id: it.id, q: it.q, a: it.a, group: g.title, action: it.action })),
)

/**
 * The id allow-list, used by the /api/events validator (via funnelEvents) to
 * accept `q`. An exact set rather than a regex: the only legal value is a
 * question we ship, so nothing a browser invents can reach the column.
 */
export const HELP_TOPIC_IDS: ReadonlySet<string> = new Set(ALL_TOPICS.map(t => t.id))

/**
 * CONTEXT ORDERING — the thing that makes a widget better than a FAQ page.
 *
 * The same five-ish questions everywhere would just be /help in a smaller box.
 * A visitor stuck in the booking sheet has a different question from one on
 * /apply, and the widget's whole value is answering it BEFORE they have to
 * phrase it. So each route promotes the questions that belong to the doubt a
 * person actually has while standing there.
 *
 * Matched by prefix, longest first, so `/apply` and `/experts/x` can differ from
 * `/`. Anything unmatched falls back to DEFAULT_LEAD — never to an empty list.
 *
 * Leads name topic IDS, not question text. The earlier version matched by
 * Georgian prefix, which meant a copy edit to a question detached its lead
 * entry and the widget quietly fell back to the generic list — the whole
 * context feature gone, with no error and no visible symptom. An id cannot
 * drift when the wording does.
 */
const LEAD_BY_ROUTE: { prefix: string; lead: string[] }[] = [
  // Becoming an expert: money and the process, in that order — those are the
  // two things that stop someone mid-application.
  { prefix: '/join', lead: ['become-expert', 'commission', 'payout'] },
  // On a profile the doubt is „what am I paying for and what happens next",
  // never „what is mcodne“.
  { prefix: '/experts/', lead: ['price', 'where-session', 'cancel', 'expert-noshow'] },
  { prefix: '/experts', lead: ['find-expert', 'price', 'how-to-book'] },
  // Auth: the honest question is „why do you need an account at all“.
  { prefix: '/signup', lead: ['what-is', 'how-to-book', 'price'] },
  { prefix: '/signin', lead: ['account-security', 'what-is'] },
  // ⚠️ THE PREFIX WAS `/me/bookings` UNTIL 2026-08-26 AND THAT ROUTE IS GONE,
  // so this row matched nothing and the client's own request screen fell back
  // to DEFAULT_LEAD — the „what is mcodne" questions, offered to somebody who
  // is already mid-job. Inside a request, the questions are about the work
  // that is already agreed.
  { prefix: '/me/requests', lead: ['where-session', 'cancel', 'expert-noshow'] },
  { prefix: '/work', lead: ['payout', 'commission'] },
]

const DEFAULT_LEAD = ['what-is', 'find-expert', 'price', 'how-to-book']

/**
 * How many suggested questions the panel offers at once.
 *
 * Was 5, for the accordion. The chat skin needs the number to be SMALLER, not
 * bigger: the suggestions are pinned under the transcript, so every extra row
 * is a row taken from the conversation itself. At 5 the list ate ~240px of a
 * 480px panel and its own last row was clipped — the pinned block scrolled,
 * which reads as broken. Three rows leave the transcript the space it needs,
 * and because an asked question drops off and the next one surfaces, no
 * question becomes unreachable — the list refills instead of growing.
 */
export const HELP_VISIBLE = 3

/**
 * The questions to show on `pathname`, most relevant first.
 *
 * Pure and total: any route returns a non-empty list, and every returned topic
 * exists in ALL_TOPICS — a lead entry that no longer matches any question is
 * skipped rather than rendering a blank row (see tests/helpTopics.test.ts).
 */
export function topicsForRoute(
  pathname: string | null | undefined,
  /** Resolved SiteText map. Passing it makes the widget show the admin's
   *  wording; omitting it falls back to the code defaults. Ordering is
   *  unaffected either way — it is driven by `id`, never by the text. */
  map?: Record<string, string>,
): HelpTopic[] {
  const path = pathname || '/'
  const source = map ? resolveTopics(map) : ALL_TOPICS
  const match = LEAD_BY_ROUTE
    .filter(r => path.startsWith(r.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]
  const lead = match?.lead ?? DEFAULT_LEAD
  const promoted = lead
    .map(id => source.find(t => t.id === id))
    .filter((t): t is HelpTopic => !!t)
  const rest = source.filter(t => !promoted.includes(t))
  return [...promoted, ...rest]
}

/* ═══════════ instrumentation ════════════════════════════════════════════ */

/**
 * What the widget records. THIS is what makes it more than a smaller /help.
 *
 * The point is not support metrics. It is that „12 people opened help ON THE
 * BOOKING SHEET and clicked ფასიანია?" is a product instruction: that answer
 * belongs on that screen, not behind a circle. Every question that migrates
 * onto the page it is asked from is one the widget never has to answer again.
 *
 * `route` is the pathname, never the full URL — a booking or profile path can
 * carry ids, and nothing here needs them.
 */
export const HELP_EVENTS = {
  /** Panel opened. The denominator for everything below. Props: { route }. */
  opened: 'help_opened',
  /** A question was expanded. Props: { route, q }. */
  question: 'help_question',
  /** „ვერ ვიპოვე პასუხი“ — the answer set failed this person. Props: { route,
   *  seen } where `seen` is how many answers they READ before giving up: 0 says
   *  the suggestions did not even look relevant, 3 says the answers were wrong.
   *  Different failures, different fixes. */
  unresolved: 'help_unresolved',
  /**
   * Someone TYPED a question and the local matcher had nothing for it.
   * Props: { route, text } — and `text` is the one place in this codebase where
   * words a person wrote are stored on purpose. See the firewall exception in
   * components/booking/funnelEvents.ts for the full reasoning; in short, the
   * list of questions we cannot answer IS the backlog of answers to write, and
   * it cannot be reconstructed from counts. Redacted and capped by
   * lib/helpSearch#redactQuery before it leaves the browser, never recorded for
   * a question we DID answer, and disclosed in the widget.
   */
  unanswered: 'help_unanswered',
} as const

type HelpEvent = (typeof HELP_EVENTS)[keyof typeof HELP_EVENTS]

/** Flat list — what /api/events turns into its allow-list. */
export const HELP_EVENT_NAMES: readonly HelpEvent[] = Object.values(HELP_EVENTS)

/**
 * The shape `route` must have to be written. Kept next to the normaliser below
 * so the sender and the server-side gate cannot drift: a route the client emits
 * always satisfies the regex the API enforces.
 */
export const HELP_ROUTE_RE = /^\/[a-z0-9\-_/]{0,47}$/

/**
 * A pathname reduced to something safe, short and countable.
 *
 * Rejecting an odd route server-side would 400 a fire-and-forget beacon —
 * invisible, and exactly the failure mode that left this widget with zero rows
 * for its whole life. So the client narrows instead: anything outside
 * `[a-z0-9-_/]` (a Georgian blog slug, an encoded segment) becomes `-`, and the
 * result is capped. Nothing is silently dropped, because nothing is rejected.
 *
 * Ids in the path are kept as-is: they are already public, and they are what
 * makes „help was opened on THIS expert“ answerable.
 */
export function normalizeRoute(pathname: string | null | undefined): string {
  const raw = (pathname || '/').split('?')[0].split('#')[0].toLowerCase()
  // Runs of replaced characters collapse to a single `-`: a Georgian blog slug
  // becoming `/blog/-` says „a non-latin slug“ honestly, where `/blog/------`
  // would invent a distinction out of nothing but character count.
  const cleaned = ('/' + raw.replace(/^\/+/, '')).replace(/[^a-z0-9\-_/]+/g, '-')
  const trimmed = cleaned.length > 48 ? cleaned.slice(0, 48).replace(/\/+$/, '') : cleaned
  return trimmed || '/'
}

/**
 * Fire-and-forget, exactly like components/booking/funnelEvents.
 * Never awaited, never throws, never blocks a click — an analytics row is not
 * worth a degraded interaction, and a blocked one would be worse than no data.
 */
type HelpProps = {
  /** Raw pathname — normalised here, so no call site can forget. */
  route?: string | null
  /** A topic ID from ALL_TOPICS. Never the question text. */
  q?: string
  /** How many answers were read before giving up. */
  seen?: number
  /** ONLY with HELP_EVENTS.unanswered, and only after redactQuery(). */
  text?: string
}

export function trackHelp(name: HelpEvent, props: HelpProps): void {
  if (typeof window === 'undefined') return
  const payload: Record<string, string | number> = {}
  if (props.route !== undefined) payload.route = normalizeRoute(props.route)
  if (props.q !== undefined) payload.q = props.q
  if (props.seen !== undefined) payload.seen = props.seen
  // Belt and braces: even if a future call site attaches `text` to the wrong
  // event, it cannot leave the browser. The server refuses it too — this only
  // means the mistake is never made on the wire either.
  if (props.text !== undefined && name === HELP_EVENTS.unanswered) payload.text = props.text
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, props: payload }),
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {})
  } catch { /* analytics must never surface to the user */ }
}
