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
// whether a booking implies a charge, and CANCEL_CUTOFF_HOURS / COMMISSION_PCT
// are read, never typed. An answer that hardcodes „24 საათი“ becomes a lie the
// day the constant changes.
import { CANCEL_CUTOFF_HOURS, COMMISSION_PCT, PAYMENTS_LIVE } from '@/lib/flags'
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
export type FaqItem = { id: string; q: string; a: string; action?: FaqAction }

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
        a: 'პლატფორმა, სადაც ხელით შერჩეულ ექსპერტებთან ჯავშნი ინდივიდუალურ ვიდეოკონსულტაციას — ბიზნესი, ფინანსები, კარიერა, სამართალი და სხვა.',
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
      {
        id: 'find-expert',
        q: 'როგორ ვიპოვო შესაფერისი ექსპერტი?',
        a: 'გვერდზე „ექსპერტები“ გაფილტრე კატეგორიით, ფასითა და შეფასებით. პროფილში ნახავ ვიდეოგაცნობას, გამოცდილებასა და შეფასებებს.',
        action: { label: 'ექსპერტების მოძებნა', href: '/experts' },
      },
      {
        id: 'price',
        q: 'რა ჯდება პირველი გაცნობა?',
        // Payment tense is gated on PAYMENTS_LIVE — the same flag the „გადახდა“
        // section below reads. While it's off a booking costs nothing, so the
        // page must not imply a charge.
        a: PAYMENTS_LIVE
          ? 'ფასს ადგენს ექსპერტი და წინასწარ ხედავ — გადაიხდი მხოლოდ დაჯავშნისას.'
          : 'ფასს ადგენს ექსპერტი და წინასწარ ხედავ. ონლაინ გადახდა ჯერ არ არის — დაჯავშნა ახლა უფასოა, ბარათს არ ვთხოვთ.',
        action: { label: 'ნახე ფასები', href: '/experts' },
      },
    ],
  },
  {
    title: 'დაჯავშნა და სესია',
    items: [
      {
        id: 'how-to-book',
        q: 'როგორ დავჯავშნო სესია?',
        a: PAYMENTS_LIVE
          ? 'პროფილში აირჩიე თარიღი და დრო, გადაიხადე — დადასტურება ელფოსტით მოვა.'
          : 'პროფილში აირჩიე თარიღი და დრო — დადასტურება ელფოსტით მოვა. გადახდის ეტაპი ჯერ არ არის, დაჯავშნა ახლა უფასოა.',
        action: { label: 'აირჩიე ექსპერტი', href: '/experts' },
      },
      {
        id: 'where-session',
        q: 'სად ტარდება სესია?',
        a: 'პირდაპირ პლატფორმაზე — არ გჭირდება Zoom ან სხვა აპლიკაცია. საკმარისია ბრაუზერი და კამერა.',
      },
      {
        id: 'cancel',
        q: 'შეიძლება თუ არა გავაუქმო ან გადავიტანო?',
        a: PAYMENTS_LIVE
          ? `დიახ — ${CANCEL_CUTOFF_HOURS} საათით ადრე უფასოა. ამის შემდეგ თანხა აღარ ბრუნდება, გარდა დასაბუთებული გამონაკლისისა.`
          : `დიახ — ${CANCEL_CUTOFF_HOURS} საათით ადრე უფასოა. ახლა დაჯავშნა უფასოა, ამიტომ დასაბრუნებელი თანხა არ არსებობს; გადახდების ამოქმედების შემდეგ ამ ვადის შემდეგ თანხა აღარ დაბრუნდება, გარდა დასაბუთებული გამონაკლისისა.`,
      },
      {
        id: 'expert-noshow',
        q: 'რა მოხდება, თუ ექსპერტი არ გამოცხადდა?',
        a: 'უფასოდ შემოგთავაზებთ გადატანას ან სხვა ექსპერტს. გადახდის ამოქმედების შემდეგ თანხა სრულად დაბრუნდება.',
      },
    ],
  },
  {
    title: 'გადახდა',
    items: [
      {
        id: 'payment-safety',
        q: 'უსაფრთხოა თუ არა გადახდა?',
        a: 'ახლა დაჯავშნა უფასოა, ბარათს არ ვთხოვთ. გაშვების შემდეგ თანხა დაცული იქნება — ექსპერტს მხოლოდ სესიის შემდეგ გადაერიცხება.',
      },
      {
        id: 'payment-methods',
        q: 'რომელი გადახდის მეთოდები მიიღება?',
        a: 'ონლაინ გადახდა ჯერ არ არის — ახლა დაჯავშნა უფასოა. მეთოდების სიას ამოქმედებისთანავე გამოვაქვეყნებთ.',
      },
      {
        id: 'invoice',
        q: 'შემიძლია მივიღო ინვოისი?',
        a: 'ინვოისები გადახდებთან ერთად ამოქმედდება — ავტომატურად მოვა ელფოსტაზე. მანამდე დაჯავშნა უფასოა.',
      },
    ],
  },
  {
    title: 'ექსპერტებისთვის',
    items: [
      {
        id: 'become-expert',
        q: 'როგორ ვხდები ექსპერტი?',
        a: '„გახდი ექსპერტი“ გვერდზე შეავსე განაცხადი — გამოცდილება, სპეციალიზაცია, პორტფოლიო. პასუხს 24–48 საათში მიიღებ.',
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
        a: 'გადახდები მალე ამოქმედდება — მანამდე სესიები უფასოა. გაშვების შემდეგ შემოსავალი რეგულარული გრაფიკით გადმოგერიცხება.',
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
        a: `„პარამეტრები → ანგარიში → ანგარიშის წაშლა“. წაშლა მყისიერია და შეუქცევადი — მონაცემები აღდგენას აღარ ექვემდებარება. თუ დაგეგმილი ან მიმდინარე ჯავშანი გაქვს, ჯერ გააუქმე; თუ ანგარიშს დასრულებული ჯავშნები ან მიმოწერა აქვს, წაშლა ავტომატურად არ სრულდება — მოგვწერე ${SUPPORT_EMAIL}.`,
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
        a: 'რეგისტრაცია უფასოა — გახსენი „დარეგისტრირდი“ და შედი Google-ით ან ელფოსტითა და პაროლით. ანგარიში მხოლოდ დაჯავშნისთვის გჭირდება; ექსპერტების დათვალიერება რეგისტრაციის გარეშეც შეგიძლია.',
        action: { label: 'რეგისტრაცია', href: '/signup' },
      },
      {
        id: 'duration',
        // PROD ×2 — „რამდენი ხანი გრძელდება სესია".
        q: 'რამდენი ხანი გრძელდება კონსულტაცია?',
        // „ყველაზე ხშირად", not a closed list: 15/30/60 are only the profile
        // DEFAULT's buttons. A published service accepts any length from 5 to
        // 240 minutes (app/tutor/profile/page.tsx:1105), so naming three values
        // as the whole set becomes a lie the first time somebody sells a 45- or
        // 90-minute session.
        a: 'ხანგრძლივობას ექსპერტი ადგენს თითოეული სერვისისთვის — ყველაზე ხშირად 15, 30 ან 60 წუთი. დაჯავშნამდე ზუსტად ხედავ, რომელ ვარიანტს ირჩევ და რამდენი ხანი გაგრძელდება.',
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
      {
        id: 'location',
        // PROD ×4 — „სად არის" / „სად ვარ" / „სად მდებარეობს" / „სად ხარ".
        q: 'სად მდებარეობთ? ოფისში უნდა მოვიდე?',
        a: 'არსად მოსვლა არ გჭირდება — ყველა კონსულტაცია ონლაინ, ვიდეოსესიის ფორმატში ტარდება, პირდაპირ ბრაუზერში. საჭიროა მხოლოდ ინტერნეტი, კამერა და მიკროფონი.',
      },
      {
        id: 'contact',
        q: 'ტელეფონის ნომერი გაქვთ?',
        a: `სატელეფონო ხაზი არ გვაქვს — მხარდაჭერა ელფოსტითა და საკონტაქტო ფორმით მუშაობს, პასუხს 24 საათში იღებ. მოგვწერე ${SUPPORT_EMAIL}.`,
        action: { label: 'საკონტაქტო ფორმა', href: '/contact' },
      },
      {
        id: 'language',
        q: 'რომელ ენაზე ტარდება კონსულტაცია?',
        a: 'ენას ექსპერტი უთითებს და პროფილშივე ხედავ — უმეტესობა ქართულად მუშაობს, ნაწილი ინგლისურადაც. აირჩიე ის, ვისაც შენთვის სასურველი ენა უწერია.',
        action: { label: 'ნახე ექსპერტები', href: '/experts' },
      },
      {
        id: 'pre-contact',
        q: 'შემიძლია ექსპერტს დაჯავშნამდე მივწერო?',
        // The sign-in requirement is stated because it is enforced: a signed-out
        // visitor tapping „მიწერე ექსპერტს" gets the auth sheet („შედი, რომ
        // მისწერო ექსპერტს" — app/experts/[slug]/client.tsx:951). An answer that
        // says „yes you can" and then hands over a login wall is the same
        // broken promise as a wrong price.
        a: 'დიახ — ექსპერტს შეტყობინებას დაჯავშნამდეც უგზავნი და საკითხს წინასწარ დააზუსტებ. ამისთვის ანგარიშში შესვლა დაგჭირდება, გადახდა კი არა. მიმოწერა „შეტყობინებებში“ გამოჩნდება.',
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
export function resolveTopics(map: Record<string, string>): HelpTopic[] {
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
  // On a profile / in the booking sheet the doubt is „what am I paying for and
  // what happens next", never „what is mcodne“.
  { prefix: '/experts/', lead: ['price', 'where-session', 'cancel', 'expert-noshow'] },
  { prefix: '/experts', lead: ['find-expert', 'price', 'how-to-book'] },
  // Auth: the honest question is „why do you need an account at all“.
  { prefix: '/signup', lead: ['what-is', 'how-to-book', 'price'] },
  { prefix: '/signin', lead: ['account-security', 'what-is'] },
  // Inside a booking, the questions are about the session that already exists.
  { prefix: '/me/bookings', lead: ['where-session', 'cancel', 'expert-noshow'] },
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

export type HelpEvent = (typeof HELP_EVENTS)[keyof typeof HELP_EVENTS]

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
export type HelpProps = {
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
