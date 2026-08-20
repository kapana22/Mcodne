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
    title: 'ონლაინ კონსულტაცია ქართველ ექსპერტებთან | მცოდნე',
    description: 'დაჯავშნე ონლაინ კონსულტაცია ქართველ ექსპერტთან — ბიზნესი, ფინანსები, კარიერა და სამართალი. ხელით შერჩეული ბაზა, ვიდეოსესია, გამჭვირვალე ფასი.',
    ogTitle: 'მცოდნე — ონლაინ კონსულტაცია ექსპერტებთან',
    ogDescription: 'დაჯავშნე ონლაინ კონსულტაცია ქართველ ექსპერტთან — ბიზნესი, ფინანსები, კარიერა და სამართალი. ხელით შერჩეული ბაზა, ვიდეოსესია, გამჭვირვალე ფასი.',
  },
  {
    // THE CATALOGUE. The KEY is historical — the page was /tutors until stage 10
    // (2026-08-19) and now answers at /experts; the key never moves, because a
    // SiteText DB row is keyed by the string `seo.tutors.*` and renaming it
    // orphans whatever the admin typed. app/experts/page.tsx reads it as
    // pageMetadata('tutors', '/experts').
    page: 'tutors',
    label: 'ექსპერტების ძებნა',
    title: 'ონლაინ კონსულტაცია ექსპერტთან — იპოვე და დაჯავშნე | მცოდნე',
    description: 'იპოვე ქართველი ექსპერტი და დაჯავშნე ონლაინ კონსულტაცია — ბიზნესი, კარიერა, ფინანსური და იურიდიული საკითხები. ხელით შერჩეული ბაზა, ვიდეოსესია.',
    ogTitle: 'ექსპერტები — მცოდნე',
    ogDescription: 'იპოვე ქართველი ექსპერტი და დაჯავშნე ონლაინ კონსულტაცია — ბიზნესი, კარიერა, ფინანსური და იურიდიული საკითხები. ხელით შერჩეული ბაზა, ვიდეოსესია.',
  },
  {
    page: 'apply',
    label: 'გახდი ექსპერტი',
    title: 'გახდი ექსპერტი — გამოიმუშავე კონსულტაციებით | მცოდნე',
    description: 'გახდი ექსპერტი მცოდნეზე — გაუზიარე ცოდნა და გამოიმუშავე ვიდეოკონსულტაციებით. დროსა და ფასს შენ ადგენ.',
    ogTitle: 'გახდი ექსპერტი — მცოდნე',
    ogDescription: 'გახდი ექსპერტი მცოდნეზე — გაუზიარე ცოდნა და გამოიმუშავე ვიდეოკონსულტაციებით. დროსა და ფასს შენ ადგენ.',
  },
  {
    page: 'help',
    label: 'დახმარება',
    title: 'დახმარება — ჯავშანი, ფასი, გაუქმება | მცოდნე',
    description: 'როგორ დავჯავშნო კონსულტაცია, რა ღირს, როგორ გავაუქმო და როგორ ტარდება ვიდეოსესია — ხშირად დასმული კითხვები და დახმარების არხები.',
    ogTitle: 'დახმარება — მცოდნე',
    ogDescription: 'როგორ დავჯავშნო, რა ღირს, როგორ გავაუქმო — პასუხები ხშირად დასმულ კითხვებზე.',
  },
  {
    page: 'about',
    label: 'ჩვენს შესახებ',
    title: 'ჩვენს შესახებ — ქართული ექსპერტ-კონსულტაციები | მცოდნე',
    description: 'მცოდნე ქართული ექსპერტული ცოდნის პლატფორმაა — ვაკავშირებთ ადამიანებს გამოცდილ ექსპერტებთან ბიზნესის, ფინანსების, სამართლისა და კარიერის საკითხებზე. ერთსაათიანი ონლაინ კონსულტაცია.',
    ogTitle: 'ჩვენს შესახებ — მცოდნე',
    ogDescription: 'ქართული ექსპერტული ცოდნის პლატფორმა — ვაკავშირებთ ადამიანებს გამოცდილ ექსპერტებთან.',
  },
  {
    page: 'blog',
    label: 'ბლოგი',
    title: 'ბლოგი — პრაქტიკული რჩევები ექსპერტებისგან | მცოდნე',
    description: 'პრაქტიკული სახელმძღვანელოები ქართველი ექსპერტებისგან — ბიზნესი, გადასახადები, სამართალი, მარკეტინგი, ფინანსები და კარიერა. კონკრეტული რჩევა, არა ზოგადი თეორია.',
    ogTitle: 'ბლოგი — მცოდნე',
    ogDescription: 'პრაქტიკული სახელმძღვანელოები ქართველი ექსპერტებისგან — ბიზნესი, გადასახადები, სამართალი, მარკეტინგი.',
  },
  {
    // ⚠️ RETIRED 2026-08-19 (stage 8): /categories/* 308s to /experts?category=.
    // Kept for the DB rows under `seo.categories.*` — never delete a key.
    page: 'categories',
    retired: true,
    label: 'კატეგორიები',
    title: 'კონსულტაციის კატეგორიები — აირჩიე მიმართულება | მცოდნე',
    description: 'აირჩიე შენი პროფესიული სფერო — ბიზნესი, ფინანსები, კარიერა, სამართალი და სხვ. — და იპოვე ხელით შერჩეული ექსპერტი.',
    ogTitle: 'კატეგორიები — მცოდნე',
    ogDescription: 'აირჩიე შენი პროფესიული სფერო და იპოვე ხელით შერჩეული ექსპერტი.',
  },
  {
    page: 'apply-master',
    label: 'დაარეგისტრირე შენი სერვისი',
    title: 'დაარეგისტრირე შენი სერვისი — მიიღე შეკვეთები | მცოდნე',
    description: 'დარეგისტრირდი ხელოსნად და მიიღე შეკვეთები შენს ქალაქში — სანტექნიკა, ელექტრიკა, დალაგება, ტექნიკის შეკეთება. რეგისტრაცია უფასოა.',
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
    description: 'აღწერე რა გჭირდება — სანტექნიკა, ელექტრიკა, დალაგება, ტექნიკის შეკეთება — და ხელოსნები ფასს შემოგთავაზებენ. უფასოა.',
    ogTitle: 'სერვისები — მცოდნე',
    ogDescription: 'აღწერე რა გჭირდება და ხელოსნები ფასს შემოგთავაზებენ.',
  },
  {
    // ⚠️ RETIRED 2026-08-19 (stage 10): the trades catalogue and the expert one
    // became ONE list at /experts, and /masters 308s there. Kept for the DB rows
    // under `seo.masters.*` — never delete a key.
    page: 'masters',
    retired: true,
    label: 'ხელოსნები',
    // ⚠️ THE CATALOGUE'S PROMISE IS THE LIST AND THE FILTER — nothing else.
    // the deleted /services door sold the intake; this page shows who is there, so its SERP
    // text must describe browsing and must NOT advertise ratings, reviews or
    // response times. There is no such data, and a description that promises
    // it is a promise broken in the first second on the page. Same four trades
    // as that door, and it stays in step with LIVE_SERVICE_GROUP_IDS.
    title: 'ხელოსნები — სანტექნიკოსი, ელექტრიკოსი, დამლაგებელი | მცოდნე',
    description: 'ნახე ხელოსნები — სანტექნიკა, ელექტრიკა, დალაგება, ტექნიკის შეკეთება. გაფილტრე სერვისითა და ქალაქით.',
    ogTitle: 'ხელოსნები — მცოდნე',
    ogDescription: 'ნახე ხელოსნები სერვისისა და ქალაქის მიხედვით.',
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
    description: 'ონლაინ კონსულტაცია ქართველ სპეციალისტთან — ბუღალტერი, იურისტი, ფინანსისტი, ფსიქოლოგი, მარკეტოლოგი და სხვა. აირჩიე მიმართულება და დაჯავშნე ვიდეოსესია.',
    ogTitle: 'ონლაინ კონსულტაცია სპეციალისტთან | მცოდნე',
    ogDescription: 'აირჩიე სპეციალისტი და დაჯავშნე ვიდეოსესია მოსახერხებელ დროს.',
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
