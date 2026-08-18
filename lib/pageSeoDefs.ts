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
    page: 'categories',
    label: 'სფეროები',
    title: 'კონსულტაციის სფეროები — აირჩიე მიმართულება | მცოდნე',
    description: 'აირჩიე შენი პროფესიული სფერო — ბიზნესი, ფინანსები, კარიერა, სამართალი და სხვ. — და იპოვე ხელით შერჩეული ექსპერტი.',
    ogTitle: 'სფეროები — მცოდნე',
    ogDescription: 'აირჩიე შენი პროფესიული სფერო და იპოვე ხელით შერჩეული ექსპერტი.',
  },
  {
    page: 'services',
    label: 'სერვისები',
    title: 'ხელოსანი სახლში — სანტექნიკოსი, ელექტრიკოსი, დალაგება | მცოდნე',
    description: 'აღწერე რა გჭირდება — სანტექნიკა, ელექტრიკა, დალაგება, გადაზიდვა, ტექნიკის შეკეთება — და ხელოსნები ფასს შემოგთავაზებენ. უფასოა.',
    ogTitle: 'სერვისები — მცოდნე',
    ogDescription: 'აღწერე რა გჭირდება და ხელოსნები ფასს შემოგთავაზებენ.',
  },
  {
    page: 'konsultacia',
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
