// The SEO text of every public page — the ONE table.
//
// Pure data, no prisma, no react: `lib/siteTextDefs` expands it into editable
// registry entries, and `lib/pageSeo` turns it into a Next `Metadata` object.
// Splitting the table from the builder is what keeps siteTextDefs importable
// from a client component.
//
// WHY IT EXISTS. These strings are what Google prints in the results list and
// what Facebook prints under a shared link — for a site whose whole
// distribution plan is organic search plus Facebook posts, they are the most
// commercially load-bearing copy on the platform, and they were the last thing
// still unreachable from the admin panel. They also could not be edited by
// anyone but a developer, which is the wrong shape for text you tune by
// watching a click-through rate.
//
// TWO TITLES PER PAGE IS DELIBERATE, not duplication:
//   `title` / `description`     → the SEARCH RESULT. Long, keyword-bearing.
//   `ogTitle` / `ogDescription` → the SHARE CARD. Short; a Facebook card
//                                 truncates hard and reads as a headline.
// Every page already shipped a different pair; keeping them separate preserves
// that, and collapsing them would silently rewrite eight share cards.

export type PageSeoDef = {
  /** Key stem and registry group suffix. Permanent — see siteTextDefs. */
  page: string
  /** What the admin sees as the group name. */
  label: string
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  /**
   * The description interpolates a constant (SUPPORT_EMAIL) and therefore stays
   * in code — same rule as the FAQ answers and the commission copy. Its TITLE
   * is still editable.
   */
  lockedDescription?: boolean
  /**
   * The page was deleted on purpose (stage 8: /categories). The rows stay in
   * the registry — a SiteText DB row is keyed by these strings and dropping the
   * key would orphan whatever the admin typed — but they are hidden from the
   * editor and no page reads them. Same mechanism as SiteTextDef.retired.
   */
  retired?: true
}

export const PAGE_SEO: PageSeoDef[] = [
  {
    page: 'home',
    label: 'მთავარი',
    title: 'აღწერე რა გჭირდება, მიიღე შეთავაზებები | მცოდნე',
    /* ⚠️ 155 → 122 CHARACTERS, AND TWO CLAIMS GONE (2026-09-02).
        · „გადამოწმებული" — 1 of 26 published providers carries the ✓.
        · „რემონტი, დალაგება" — the roster holds ZERO tradespeople, so this was
          bidding for searches the site cannot answer; a click that bounces is
          worse than no click.
        Length: Google truncates a snippet by PIXELS (~920 desktop, ~680 mobile
        ≈ 120 latin characters). Mkhedruli is wider than latin lowercase, so the
        Georgian budget is reached sooner — the target here is ~120, not 158.
        Descriptions are not a ranking factor (Google, confirmed) and are
        rewritten 63–71% of the time, so keyword-stuffing one buys nothing. */
    description: 'აღწერე რა გჭირდება და მიიღე შეთავაზებები — ხელშეკრულება, დეკლარაცია, ბრენდი, საიტი. ექსპერტები თბილისში. მოთხოვნა უფასოა.',
    ogTitle: 'მცოდნე — აღწერე რა გჭირდება, მიიღე შეთავაზებები',
    ogDescription: 'აღწერე რა გჭირდება და მიიღე შეთავაზებები ექსპერტებისგან. თბილისი.',
  },
  {
    // THE CATALOGUE. The KEY is historical — the page was /tutors until stage 10
    // (2026-08-19) and now answers at /experts; the key never moves, because a
    // SiteText DB row is keyed by the string `seo.tutors.*` and renaming it
    // orphans whatever the admin typed. app/experts/page.tsx reads it as
    // pageMetadata('tutors', '/experts').
    page: 'tutors',
    label: 'ექსპერტების ძებნა',
    title: 'სერვისები და ექსპერტები თბილისში — მიიღე შეთავაზება | მცოდნე',
    /* ⚠️ 146 → 104 (2026-09-02). „დალაგება, სანტექნიკა" name trades with no
        provider on the roster, and „ხელით შერჩეული" is the phrase the owner
        removed from the site the same day. What is left is the six spheres that
        actually hold people. */
    description: 'ერთ სიაში — სამართალი, ბუღალტერია, მარკეტინგი, IT, ფსიქოლოგია. ექსპერტები თბილისში.',
    ogTitle: 'ექსპერტები — მცოდნე',
    ogDescription: 'ერთ სიაში — ექსპერტები და სერვისები თბილისში.',
  },
  {
    /* ⚠️ „გახდი ექსპერტი" IS A RETIRED PHRASE AND IT WAS SHIPPING AS /join's
     * BROWSER TAB (fixed 2026-08-31). The site says ONE thing at its supply
     * door — `JOIN_DOOR_LABEL` in lib/capabilities, „დაარეგისტრირე სერვისი" —
     * and `home.expertCta.cta` was retired in lib/siteTextDefs for carrying
     * exactly this wording. It survived here because SEO copy is reachable from
     * no screen, which is the same way /about came to advertise a booking
     * product deleted on 2026-08-24. „კონსულტაციით" went with it, for the same
     * reason: there is no consultation product.
     * Editable in ადმინი → ტექსტები („SEO — …"); no production row overrides it. */
    page: 'apply',
    label: 'დაარეგისტრირე სერვისი',
    title: 'დაარეგისტრირე სერვისი — მიიღე კლიენტები | მცოდნე',
    /* ⚠️ 136 → 116 (2026-09-02). Everything in it is true; it was simply past
        the mobile snippet, and the clause that fell off the end („რეგისტრაცია
        უფასოა") is the one a provider deciding whether to bother most wants —
        so it moved up and the middle clause went. */
    description: 'დაარეგისტრირე რასაც აკეთებ და მიიღე კლიენტები თბილისში. რეგისტრაცია უფასოა, ფასს კი შენ ადგენ.',
    ogTitle: 'დაარეგისტრირე სერვისი — მცოდნე',
    ogDescription: 'დაარეგისტრირე რასაც აკეთებ — ფასს შენ ადგენ.',
  },
  {
    page: 'help',
    label: 'დახმარება',
    title: 'დახმარება — მოთხოვნა, შეთავაზება, ფასი | მცოდნე',
    description: 'როგორ დავტოვო მოთხოვნა, როგორ მოდის შეთავაზებები, რა ღირს და როგორ ვირჩევ ექსპერტს — ხშირად დასმული კითხვები და დახმარების არხები.',
    ogTitle: 'დახმარება — მცოდნე',
    ogDescription: 'როგორ დავტოვო მოთხოვნა, რა ღირს, როგორ გავაუქმო — პასუხები ხშირად დასმულ კითხვებზე.',
  },
  {
    /* ⚠️ THIS ENTRY DESCRIBED A PRODUCT THAT WAS REMOVED ON 2026-08-24 (fixed
     * 2026-08-31). It read „ქართული ექსპერტ-კონსულტაციები" and „ერთსაათიანი
     * ონლაინ კონსულტაცია" — the booking product, gone with `TutorProfile`, the
     * calendar and the video room — and it was serving that sentence live as
     * the browser tab and the Google snippet for the page the header calls
     * „როგორ მუშაობს". Exactly the failure app/page.tsx records for the home:
     * a literal nobody could reach from a screen outlives the thing it names.
     *
     * The wording below is not new copy — it is the page's own h1 and its own
     * lead sentence, plus the four steps it draws. Editable in
     * ადმინი → ტექსტები („SEO — …"), and no production row overrides it today
     * (verified against the live page), so this default IS what ships. */
    page: 'about',
    label: 'როგორ მუშაობს',
    title: 'როგორ მუშაობს — მოთხოვნა, შეთავაზება, არჩევანი | მცოდნე',
    /* ⚠️ 176 → 108 (2026-09-02). It was the longest live description on the
        site and its second sentence — the one that survives no truncation on a
        phone — repeated what the first already said. */
    description: 'აღწერე, რა გჭირდება — ექსპერტები შეთავაზებას გამოგიგზავნიან, შენ კი შეადარებ და აირჩევ.',
    ogTitle: 'როგორ მუშაობს — მცოდნე',
    ogDescription: 'აღწერე, რა გჭირდება. ფასს თავად შემოგთავაზებენ.',
  },
  {
    page: 'blog',
    label: 'ბლოგი',
    title: 'ბლოგი — პრაქტიკული რჩევები ექსპერტებისგან | მცოდნე',
    /* ⚠️ 159 → 118 (2026-09-02). Six categories and a slogan do not fit a
        mobile snippet; four categories and no slogan do. */
    description: 'პრაქტიკული სახელმძღვანელოები ქართველი ექსპერტებისგან — ბიზნესი, გადასახადები, სამართალი, მარკეტინგი.',
    ogTitle: 'ბლოგი — მცოდნე',
    ogDescription: 'პრაქტიკული სახელმძღვანელოები ქართველი ექსპერტებისგან — ბიზნესი, გადასახადები, სამართალი, მარკეტინგი.',
  },
  {
    // ⚠️ RETIRED 2026-08-19 (stage 8): /categories/∗ 308s to /experts?category=.
    // Kept for the DB rows under `seo.categories.*` — never delete a key.
    page: 'categories',
    retired: true,
    label: 'კატეგორიები',
    title: 'კონსულტაციის კატეგორიები — აირჩიე მიმართულება | მცოდნე',
    description: 'აირჩიე კატეგორია — სამართალი, ბუღალტერია, მარკეტინგი, IT, დალაგება, სანტექნიკა და სხვ. — და ნახე, ვინ მუშაობს ამაზე.',
    ogTitle: 'კატეგორიები — მცოდნე',
    ogDescription: 'აირჩიე კატეგორია და ნახე, ვინ მუშაობს ამაზე.',
  },
  {
    /* ⚠️ RETIRED IN FACT SINCE THE TRADES DOOR WENT, FLAGGED ONLY ON 2026-09-02.
       app/sitemap.ts and app/join/page.tsx both already SAY „the SEO registry
       row `apply-master` stays retired" — and it was not, so the admin editor
       offered a page nothing renders, and its description („სანტექნიკა,
       ელექტრიკა, დალაგება, ტექნიკის შეკეთება") named four trades with no
       provider. The key stays: a SiteText row may be filed under it. */
    page: 'apply-master',
    retired: true,
    label: 'დაარეგისტრირე შენი სერვისი',
    title: 'დაარეგისტრირე შენი სერვისი — მიიღე შეკვეთები | მცოდნე',
    description: 'დაარეგისტრირე შენი სერვისი და მიიღე შეკვეთები შენს ქალაქში — სანტექნიკა, ელექტრიკა, დალაგება, ტექნიკის შეკეთება. რეგისტრაცია უფასოა.',
    ogTitle: 'დაარეგისტრირე შენი სერვისი — მცოდნე',
    ogDescription: 'დარეგისტრირდი და მიიღე შეკვეთები შენს ქალაქში.',
  },
  {
    // ⚠️ RETIRED 2026-08-19 (stage 10): the trades DOOR was deleted and
    // /services 308s to /experts. Kept for the DB rows under `seo.services.*` —
    // never delete a key. Its children moved to /experts/<slug> and
    // /experts/<trade> in stage 11 (the whole /services prefix now 308s); they
    // build their metadata themselves, not from this registry.
    page: 'services',
    retired: true,
    label: 'სერვისები',
    title: 'სერვისი სახლში — სანტექნიკოსი, ელექტრიკოსი, დალაგება | მცოდნე',
    // ⚠️ THE FOUR OPEN TRADES, and it has to stay in step with
    // requestTopics → LIVE_SERVICE_GROUP_IDS. A meta description is a promise
    // made in a search result, which is the one place a visitor decides before
    // they can see that a category is empty.
    description: 'აღწერე რა გჭირდება — სანტექნიკა, ელექტრიკა, დალაგება, ტექნიკის შეკეთება — და ფასს შემოგთავაზებენ. უფასოა.',
    ogTitle: 'სერვისები — მცოდნე',
    ogDescription: 'აღწერე რა გჭირდება და ფასს შემოგთავაზებენ.',
  },
  {
    // ⚠️ RETIRED 2026-08-19 (stage 10): the trades catalogue and the expert one
    // became ONE list at /experts, and /masters 308s there. Kept for the DB rows
    // under `seo.masters.*` — never delete a key.
    page: 'masters',
    retired: true,
    label: 'სერვისები',
    // ⚠️ THE CATALOGUE'S PROMISE IS THE LIST AND THE FILTER — nothing else.
    // the deleted /services door sold the intake; this page shows who is there, so its SERP
    // text must describe browsing and must NOT advertise ratings, reviews or
    // response times. There is no such data, and a description that promises
    // it is a promise broken in the first second on the page. Same four trades
    // as that door, and it stays in step with LIVE_SERVICE_GROUP_IDS.
    title: 'სერვისები — სანტექნიკოსი, ელექტრიკოსი, დამლაგებელი | მცოდნე',
    description: 'ნახე სერვისები — სანტექნიკა, ელექტრიკა, დალაგება, ტექნიკის შეკეთება. გაფილტრე სერვისითა და ქალაქით.',
    ogTitle: 'სერვისები — მცოდნე',
    ogDescription: 'ნახე სერვისები კატეგორიისა და ქალაქის მიხედვით.',
  },
  {
    // ⚠️ RETIRED 2026-08-19 (stage 10). The profession HUB moved from
    // /konsultacia to /experts in stage 8 and was replaced by the catalogue in
    // stage 10 — a hub of professions is a pre-filtered catalogue, and the
    // landings it indexed still answer at /experts/<profession>, each with its
    // own metadata (lib/professionSeo). The rows stay for the DB under
    // `seo.konsultacia.*`; never delete a key.
    page: 'konsultacia',
    retired: true,
    label: 'კონსულტაციები',
    title: 'ონლაინ კონსულტაცია სპეციალისტთან | მცოდნე',
    description: 'ონლაინ კონსულტაცია ქართველ სპეციალისტთან — ბუღალტერი, იურისტი, ფინანსისტი, ფსიქოლოგი, მარკეტოლოგი და სხვა. აირჩიე მიმართულება და დატოვე მოთხოვნა.',
    ogTitle: 'ონლაინ კონსულტაცია სპეციალისტთან | მცოდნე',
    ogDescription: 'აირჩიე სპეციალისტი და დატოვე მოთხოვნა — შეთავაზებას თავად გამოგიგზავნის.',
  },
  {
    page: 'contact',
    label: 'დაგვიკავშირდი',
    title: 'დაგვიკავშირდი — კითხვები და თანამშრომლობა | მცოდნე',
    // Placeholders — the live strings print SUPPORT_EMAIL and are built in
    // lib/pageSeo. Kept here so the table stays one shape.
    description: '',
    ogTitle: 'დაგვიკავშირდი — მცოდნე',
    ogDescription: '',
    lockedDescription: true,
  },
]

export const pageSeoKey = (page: string, part: 'title' | 'description' | 'ogTitle' | 'ogDescription') =>
  `seo.${page}.${part}`
