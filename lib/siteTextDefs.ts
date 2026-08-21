// Registry of editable site texts. Pure data (no prisma) so it's safe to import
// in client components (the provider's fallback) AND on the server. Each entry's
// `default` is the exact string currently shipped; a SiteText DB row overrides
// it. To make a new string editable: add an entry here + render it with
// <SiteText k="..."/> (or useSiteText) where it appears.

export type SiteTextDef = {
  key: string
  group: string      // admin UI grouping
  label: string      // human label in the admin editor
  default: string
  multiline?: boolean
  /**
   * Belongs to a feature-flagged vertical. The admin editor hides these while
   * the vertical is dark (app/api/admin/site-texts GET filters on it), so a
   * hidden surface cannot leak into the CMS as a group of keys that edit
   * nothing anyone can see. Nothing else reads this field — the DEFAULTS map
   * below deliberately still includes them, because the pages themselves must
   * resolve their copy the moment the flag flips.
   */
  vertical?: 'abroad'
  /**
   * The surface that rendered this key was DELETED, but the key itself must
   * never be. A production SiteText row may hold copy the owner typed by hand
   * under this exact string; dropping the entry would orphan it silently and
   * for good (tests/siteTexts.test.ts §„NO KEY MAY EVER BE RENAMED OR
   * REMOVED"). Retiring instead keeps the key known — the row survives, the
   * string can never be reused for something else, and putting the section back
   * restores the text with it — while the admin editor hides the field, because
   * a control that edits a page nobody can see is exactly the dead control the
   * whole registry exists to prevent. Same mechanism as `vertical`, different
   * reason: a dark vertical is not built yet, a retired key is no longer built.
   */
  retired?: true
}

import { PAGE_SEO, pageSeoKey } from '@/lib/pageSeoDefs'

/**
 * The SEO block, expanded from lib/pageSeoDefs so the defaults here and the
 * strings the pages actually serve cannot drift. This is what Google prints in
 * the results list and what Facebook prints under a shared link.
 *
 * /contact's DESCRIPTION is absent by design — it prints SUPPORT_EMAIL, and the
 * address has one source (lib/supportEmails) so it can never be typed two ways.
 * Its TITLE is editable like every other.
 */
const SEO_TEXTS: SiteTextDef[] = PAGE_SEO.flatMap(p => {
  const group = `SEO — ${p.label}`
  // A retired page's rows are retired rows — see PageSeoDef.retired.
  const retired = p.retired ? { retired: true as const } : {}
  const rows: SiteTextDef[] = [
    { key: pageSeoKey(p.page, 'title'), group, label: 'Google-ის სათაური', default: p.title, ...retired },
    { key: pageSeoKey(p.page, 'ogTitle'), group, label: 'გაზიარების სათაური (Facebook)', default: p.ogTitle, ...retired },
  ]
  if (!p.lockedDescription) {
    rows.splice(1, 0, { key: pageSeoKey(p.page, 'description'), group, label: 'Google-ის აღწერა', multiline: true, default: p.description, ...retired })
    rows.push({ key: pageSeoKey(p.page, 'ogDescription'), group, label: 'გაზიარების აღწერა (Facebook)', multiline: true, default: p.ogDescription, ...retired })
  }
  return rows
})

export const SITE_TEXTS: SiteTextDef[] = [
  // ── Landing hero ──
  // ⚠️ THE HEADLINE MOVED FROM A QUESTION TO A VERB (2026-08-20). It read
  // „რა გჭირდება? — აღწერე, და შემოგთავაზებენ", which is the TENDER framing:
  // it puts the work on the visitor before the site has said what it is, and
  // it describes the half of the product the hierarchy says comes second.
  // Every marketplace that reads as professional opens the same way — Fiverr
  // „Find the right freelance service", Thumbtack „Find local pros for any
  // project", Malt „Find the freelancer who fits your project": a verb, and the
  // name of WHO you will meet.
  // ⚠️ THESE ARE DEFAULTS AND THE LIVE SITE READS THE `SiteText` TABLE. Change
  // one here and the page does not move until the row changes too — that is
  // documented in CLAUDE.md and it is the reason the live title still said
  // „ონლაინ კონსულტაცია" weeks after the source stopped saying it.
  { key: 'home.hero.line1', group: 'მთავარი — Hero', label: 'სათაური, 1-ლი ხაზი', default: 'იპოვე ექსპერტი,' },
  { key: 'home.hero.line2', group: 'მთავარი — Hero', label: 'სათაური, აქცენტი (მწვანე)', default: 'რომელიც გააკეთებს' },
  { key: 'home.hero.subtitle', group: 'მთავარი — Hero', label: 'ქვესათაური', multiline: true, default: 'ბუღალტერი, იურისტი, ფსიქოლოგი, სანტექნიკოსი — თბილისში. ყველა პროფილი ხელით მოწმდება,' },
  // ⚠️ „მოთხოვნა უფასოა" LEFT (2026-08-20). Owner: „უფასო და ესეთი რამები, რაც
  // არაპროფესიონალურია და საიტს ნდობას უკარგავს, არ გამოიყენო." He is right and
  // so is the market: Fiverr, Upwork and Thumbtack put counts and verification
  // in this slot, never the price of asking — which only invites the question
  // „so what DOES cost?".
  { key: 'home.hero.subtitleEmphasis', group: 'მთავარი — Hero', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'ფასი პროფილზევე წერია.' },
  { key: 'home.hero.trustChip', group: 'მთავარი — Hero', label: 'ნდობის ხაზი (პატარა, ზემოთ)', default: 'ხელით შერჩეული ბაზა' },
  // Shown ONLY while the catalog has no ratings yet — once real reviews exist
  // the same slot prints „4.8★ საშუალო შეფასება", which is computed.
  { key: 'home.hero.browseAll', group: 'მთავარი — Hero', label: 'ტექსტი სანამ შეფასებები არაა', default: 'გადახედე მთელ ბაზას' },

  // ── Home · Categories section ──
  { key: 'home.categories.eyebrow', group: 'მთავარი — კატეგორიები', label: 'პატარა იარლიყი (ზემოთ)', default: 'კატეგორიები' },
  { key: 'home.categories.title', group: 'მთავარი — კატეგორიები', label: 'სათაური', default: 'აირჩიე შენი კატეგორია' },
  { key: 'home.categories.subtitle', group: 'მთავარი — კატეგორიები', label: 'ქვესათაური', default: 'აირჩიე მიმართულება და ნახე, ვინ მუშაობს ამაზე.' },
  { key: 'home.categories.allEyebrow', group: 'მთავარი — კატეგორიები', label: 'იარლიყი კატეგორიების სიის ზემოთ', default: 'ყველა კატეგორია' },

  // ── Home · Experts section ──
  // `home.experts.title` is the section h2 — but ONLY while no sphere is
  // selected. Tap a sphere and the heading becomes „{სფერო} — N ექსპერტი",
  // which is generated and cannot be edited. Worth knowing before someone
  // concludes the field is broken because their text „disappeared".
  { key: 'home.experts.eyebrow', group: 'მთავარი — ექსპერტები', label: 'პატარა იარლიყი (ზემოთ)', default: 'ექსპერტები' },
  { key: 'home.experts.empty', group: 'მთავარი — ექსპერტები', label: 'როცა კატეგორიაში ექსპერტი არაა', default: 'ამ კატეგორიაში ჯერ არ არის ექსპერტი' },
  { key: 'home.experts.allCta', group: 'მთავარი — ექსპერტები', label: 'ღილაკი სიის ბოლოს', default: 'ნახე ყველა ექსპერტი' },
  { key: 'home.experts.title', group: 'მთავარი — ექსპერტები', label: 'სათაური (როცა კატეგორია არჩეული არაა)', default: 'ხელით შერჩეული ექსპერტები.' },

  // ── Home · How it works ──
  // The WHOLE section is editable, top to bottom (2026-08-04). Before that, the
  // eyebrow, the h2, the CTA label and step 3 were hardcoded while steps 1–2
  // were not — so the admin could edit two thirds of one section and had no way
  // to tell which third was which. Half an editable section is worse than none:
  // it teaches you the panel is unreliable.
  { key: 'home.how.eyebrow', group: 'მთავარი — როგორ მუშაობს', label: 'პატარა იარლიყი (ზემოთ)', default: 'როგორ მუშაობს' },
  // Two lines on purpose — the line break is authored, not automatic. Rendered
  // with `whitespace-pre-line`, so a plain Enter in the admin textarea is the
  // line break. Keep it two lines: one long line re-wraps badly at 390px.
  { key: 'home.how.title', group: 'მთავარი — როგორ მუშაობს', label: 'სათაური (ორ ხაზად)', multiline: true, default: 'სამი ნაბიჯი —\nდა შეთავაზებები მოდის.' },
  { key: 'home.how.subtitle', group: 'მთავარი — როგორ მუშაობს', label: 'ქვესათაური', default: 'აღწერე, მიიღე, აირჩიე.' },
  { key: 'home.how.cta', group: 'მთავარი — როგორ მუშაობს', label: 'ღილაკი', default: 'მოთხოვნის დატოვება' },
  { key: 'home.how.step1.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'აღწერე რა გჭირდება' },
  { key: 'home.how.step1.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'ორიოდე კითხვა. ანგარიში არ სჭირდება.' },
  { key: 'home.how.step2.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'მიიღე შეთავაზებები' },
  { key: 'home.how.step2.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'ექსპერტები თავად წერენ ფასს და ვადას — მაქსიმუმ სამი შეთავაზება.' },
  // Step 3 has TWO versions and only one of them is on screen. These keys are
  // the PAYMENTS_LIVE=false version, which is what the site shows today. The
  // „დაცული გადახდა" version stays in code until payments actually ship —
  // an editable field for a string nobody can see is a dead control.
  { key: 'home.how.step3.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'აირჩიე და შეთანხმდი' },
  { key: 'home.how.step3.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'ნომერს მხოლოდ ის ექსპერტი ნახავს, ვისაც აირჩევ.' },

  // ── Home · What every booking includes — RETIRED 2026-08-08 (owner) ──
  // The three-cell strip at the foot of „როგორ მუშაობს" was deleted from
  // app/HomeClient.tsx. These seven entries stay, `retired`, and are hidden from
  // the admin editor — see the field's doc comment on SiteTextDef for why the
  // keys themselves can never be dropped. Whatever the owner had typed here
  // (the live panel showed „რას გთავაზობთ?" / „ინდივიდუალური მიდგომა" /
  // „მარტივი პროცესი") is still in the DB under these exact strings and comes
  // back untouched the moment the strip is rendered again.
  //
  // The `home.why.*` KEY NAMES are historical (the section used to be called
  // „რატომ მცოდნე") and must NOT be renamed — a SiteText DB row is keyed by the
  // key string, so renaming one silently drops whatever the admin had typed.
  { key: 'home.includes.eyebrow', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'პატარა იარლიყი (ზემოთ)', default: 'ყოველი ჯავშანი მოიცავს', retired: true },
  { key: 'home.why.card1.title', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 1 — სათაური', default: 'ხელით მოდერაცია', retired: true },
  { key: 'home.why.card1.body', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 1 — ტექსტი', multiline: true, default: 'ვამოწმებთ ყოველ განაცხადს — გამოცდილებას და რეპუტაციას.', retired: true },
  { key: 'home.why.card2.title', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 2 — სათაური', default: 'HD ვიდეოსესია', retired: true },
  { key: 'home.why.card2.body', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 2 — ტექსტი', multiline: true, default: 'ვიდეოოთახი, მიმოწერა და ფაილები — ბრაუზერიდან.', retired: true },
  { key: 'home.why.card3.title', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 3 — სათაური', default: 'გამჭვირვალე ფასი', retired: true },
  { key: 'home.why.card3.body', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 3 — ტექსტი', multiline: true, default: 'ერთი ფასი, ფარული საკომისიოს გარეშე.', retired: true },

  // ── Home · „ხარ ექსპერტი?" CTA ──
  // The paragraph became editable 2026-08-05: it lost its commission clause,
  // and with it the PAYMENTS_LIVE branch + COMMISSION_PCT template that had
  // kept it in code (a field holding a template is a field that can be saved
  // broken). The heading's second, green line is still branched, so it stays.
  // ⚠ The paragraph no longer follows PAYMENTS_LIVE — re-type it here the day
  // paid bookings ship.
  { key: 'home.expertCta.eyebrow', group: 'მთავარი — გახდი ექსპერტი', label: 'პატარა იარლიყი (ზემოთ)', default: 'ექსპერტებისთვის' },
  { key: 'home.expertCta.title', group: 'მთავარი — გახდი ექსპერტი', label: 'სათაური (1-ლი ხაზი)', default: 'მიიღე კლიენტები.' },
  { key: 'home.expertCta.body', group: 'მთავარი — გახდი ექსპერტი', label: 'ტექსტი სათაურის ქვეშ', multiline: true, default: 'შენ ადგენ ფასს, დროსა და მოცულობას. დანარჩენს ჩვენ ვუვლით.' },
  { key: 'home.expertCta.cta', group: 'მთავარი — გახდი ექსპერტი', label: 'ღილაკი', default: 'შემოგვიერთდი' },

  // ── Categories page — RETIRED 2026-08-19 (stage 8) ──
  // app/categories/∗ was deleted; the URLs 308 to /experts?category=. The keys
  // stay (a SiteText DB row is keyed by them — see `retired` on SiteTextDef)
  // and are hidden from the editor. Nothing reads them.
  { key: 'categories.hero.title', group: 'კატეგორიები', label: 'სათაური', default: 'აირჩიე შენი კატეგორია', retired: true },
  { key: 'categories.hero.subtitle', group: 'კატეგორიები', label: 'ქვესათაური', multiline: true, default: 'აირჩიე მიმართულება, შეადარე ექსპერტები და დატოვე მოთხოვნა.', retired: true },
  { key: 'categories.emptySpheres.eyebrow', group: 'კატეგორიები', label: 'ცარიელი კატეგორიების იარლიყი', default: 'ჯერ ცარიელი კატეგორიები', retired: true },
  { key: 'categories.empty.title', group: 'კატეგორიები', label: 'ცარიელი გვერდი — სათაური', default: 'კატეგორიები ჯერ არ არის', retired: true },
  { key: 'categories.empty.body', group: 'კატეგორიები', label: 'ცარიელი გვერდი — ტექსტი', multiline: true, default: 'მალე დავამატებთ. სცადე მოგვიანებით.', retired: true },
  { key: 'categories.empty.cta', group: 'კატეგორიები', label: 'ცარიელი გვერდი — ღილაკი', default: 'ექსპერტების ძებნა', retired: true },

  // ── The profession hub — RETIRED 2026-08-19 (stage 10) ──
  // The KEYS say konsultacia (the address it had until stage 8); the page moved
  // to /experts then, and in stage 10 the CATALOGUE took that address — a hub of
  // professions is a pre-filtered catalogue, and every landing it indexed still
  // answers at /experts/<profession>. The keys stay (a SiteText DB row is keyed
  // by them — see `retired` on SiteTextDef) and are hidden from the editor.
  { key: 'konsultacia.eyebrow', group: 'კონსულტაციები (hub)', label: 'პატარა იარლიყი', default: 'კონსულტაციები', retired: true },
  { key: 'konsultacia.title', group: 'კონსულტაციები (hub)', label: 'სათაური', default: 'ონლაინ კონსულტაცია სპეციალისტთან', retired: true },
  { key: 'konsultacia.subtitle', group: 'კონსულტაციები (hub)', label: 'ქვესათაური', multiline: true, default: 'აირჩიე, რომელი სპეციალისტი გჭირდება, და ნახე რას გაივლი მასთან ერთსაათიან ვიდეოსესიაზე. ფასს ექსპერტი თავად ადგენს და პროფილში წინასწარ ხედავ.', retired: true },

  // ── Blog ──
  { key: 'blog.eyebrow', group: 'ბლოგი', label: 'პატარა იარლიყი', default: 'ბლოგი' },
  { key: 'blog.title', group: 'ბლოგი', label: 'სათაური', default: 'პრაქტიკული ცოდნა, პირდაპირ ექსპერტებისგან' },
  { key: 'blog.subtitle', group: 'ბლოგი', label: 'ქვესათაური', multiline: true, default: 'პრაქტიკული სახელმძღვანელოები, კონსულტანტების ჩანაწერები და ინდუსტრიის ანალიზი — ქართველი ექსპერტებისგან.' },
  { key: 'blog.empty.badge', group: 'ბლოგი', label: 'ცარიელი გვერდი — აბრა', default: 'მალე გამოვა' },
  { key: 'blog.empty.title', group: 'ბლოგი', label: 'ცარიელი გვერდი — სათაური', default: 'ბლოგი მალე ამოქმედდება' },
  { key: 'blog.empty.body', group: 'ბლოგი', label: 'ცარიელი გვერდი — ტექსტი', multiline: true, default: 'პირველი სტატიები მზადდება. დაგვიკავშირდი და შეგატყობინებთ გამოსვლისას.' },
  { key: 'blog.empty.cta', group: 'ბლოგი', label: 'ცარიელი გვერდი — ღილაკი', default: 'მაცნობე გამოსვლისას' },

  // ── About page ──
  { key: 'about.hero.title', group: 'ჩვენ შესახებ', label: 'სათაური', default: 'ცოდნა, რომელსაც შენ ენდობი' },
  { key: 'about.hero.body', group: 'ჩვენ შესახებ', label: 'შესავალი', multiline: true, default: 'ბევრი ეძებს პასუხს რთულ პროფესიულ კითხვაზე, მაგრამ ვერ პოულობს ექსპერტს, ვისაც ენდობა. მცოდნე გაკავშირებს გამოცდილ სპეციალისტთან — მოკლედ, პირდაპირ და უსაფრთხოდ.' },
  { key: 'about.principles.title', group: 'ჩვენ შესახებ', label: 'პრინციპები — სათაური', default: 'ჩვენი პრინციპები' },
  { key: 'about.value1.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 1 — სათაური', default: 'გადამოწმებული ცოდნა' },
  { key: 'about.value1.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 1 — ტექსტი', multiline: true, default: 'ხელით ვამოწმებთ გამოცდილებას, პორტფოლიოსა და რეპუტაციას.' },
  { key: 'about.value2.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 2 — სათაური', default: 'გამჭვირვალე ფასი' },
  { key: 'about.value2.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 2 — ტექსტი', multiline: true, default: 'ერთი ფასი, გადახდა დაჯავშნისას. დაცული გადახდები — მალე.' },
  { key: 'about.value3.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 3 — სათაური', default: 'ღირებული დრო' },
  { key: 'about.value3.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 3 — ტექსტი', multiline: true, default: 'ფასი წინასწარ ცნობილია. სესია სტრუქტურული და შედეგზე ორიენტირებული.' },
  { key: 'about.value4.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 4 — სათაური', default: 'ქართული საზოგადოება' },
  { key: 'about.value4.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 4 — ტექსტი', multiline: true, default: 'ცოდნა ქართულად — ბიზნესი, სამართალი, კარიერა, ფსიქოლოგია.' },
  { key: 'about.create.title', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — სათაური', default: 'პირდაპირი წვდომა ცოდნაზე' },
  { key: 'about.create.p1', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — აბზაცი 1', multiline: true, default: 'კარგი კონსულტაცია ძნელი საპოვნია — ცოდნა არსებობს, მაგრამ ხელმისაწვდომი არაა. მცოდნე ამ ხარვეზს ავსებს.' },
  { key: 'about.create.p2', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — აბზაცი 2', multiline: true, default: 'გაკავშირებთ ხელით შერჩეულ ქართველ ექსპერტთან — სამუშაოზე, რომელიც გჭირდება, ან წინასწარ კონსულტაციაზე. ერთმა სწორმა ადამიანმა შეიძლება შენი პროექტი თუ საქმე შეცვალოს.' },
  { key: 'about.cta.title', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — სათაური', default: 'ხარ ექსპერტი? გვინდა შენი ცოდნა' },
  { key: 'about.cta.body', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — ტექსტი', multiline: true, default: 'გაქვს გამოცდილება? შემოგვიერთდი — განაცხადს 24–48 საათში განვიხილავთ.' },

  // ── /join — THE BARE DOOR, what a signed-out visitor meets ─────────────
  //
  // ⚠️ NO NEW SENTENCES, AND NOTHING VAGUE (2026-08-20). Owner, on the first
  // draft of this block: „ძალიან ცუდად წერ ტექსტებს… მარტივი ტექსტი უნდა
  // იყოს, არ უნდა ეწეროს გაურკვეველი, გამოგონილი ინფორმაციები." „შემოგვიერთდი"
  // and „დანარჩენს ჩვენ მოვაწყობთ" both went out on that sentence: one is a
  // word nobody uses, the other promises something unnamed.
  //
  // What is left is concrete and already written on this site: the eyebrow is
  // the home band's, the two body sentences are the home band's headline and
  // the SEO row's own line, and the note is the half of `apply.hero.note` that
  // is true for BOTH halves („24–48 საათი" is the consultation queue's promise;
  // the trades queue calls instead, so the shared door may not print it).
  //
  // The HEADING is not a row — it is `JOIN_DOOR_LABEL` in lib/capabilities,
  // because it must be the same word as the header link that leads here.
  { key: 'join.hero.eyebrow', group: 'რეგისტრაცია — კარი', label: 'პატარა იარლიყი', default: 'ექსპერტებისთვის' },
  { key: 'join.hero.body', group: 'რეგისტრაცია — კარი', label: 'ტექსტი სათაურის ქვეშ', multiline: true, default: 'მიიღე კლიენტები. ფასს, დროსა და მოცულობას შენ ადგენ.' },
  { key: 'join.hero.ask', group: 'რეგისტრაცია — კარი', label: 'ხაზი ამომრჩევის ზემოთ', default: 'აირჩიე, რას აკეთებ.' },
  { key: 'join.hero.note', group: 'რეგისტრაცია — კარი', label: 'პატარა ხაზი ღილაკის ქვეშ', default: 'რეგისტრაცია 2 წუთია' },

  // ── /apply — the public „გახდი ექსპერტი" page ──────────────────────────
  // The whole page was hardcoded. It is the recruiting funnel — the copy most
  // likely to be rewritten after the first few applications come in — and it
  // had not one editable field.
  //
  // NOT here, and why: the money card and the commission FAQ are
  // PAYMENTS_LIVE-branched and interpolate COMMISSION_PCT, so they stay in code
  // (an editable template can be saved broken, and it has to change the day
  // payments ship anyway). Page metadata / JSON-LD stay in code too — they are
  // resolved before React renders, so this registry cannot reach them.
  { key: 'apply.hero.eyebrow', group: 'გახდი ექსპერტი — შესავალი', label: 'პატარა იარლიყი', default: 'ექსპერტებისთვის' },
  { key: 'apply.hero.title', group: 'გახდი ექსპერტი — შესავალი', label: 'სათაური', default: 'გახდი ექსპერტი მცოდნეზე' },
  { key: 'apply.hero.body', group: 'გახდი ექსპერტი — შესავალი', label: 'შესავალი ტექსტი', multiline: true, default: 'შენი გამოცდილება ვიღაცის პასუხგაუცემელი კითხვაა. მცოდნე ქართველ სპეციალისტებს აკავშირებს იმ ადამიანებთან, რომლებსაც კონკრეტულ საკითხზე პასუხი სჭირდებათ — ერთსაათიან ონლაინ კონსულტაციაზე, შენს მიერ დადგენილ დროსა და ფასად.' },
  { key: 'apply.hero.ctaPrimary', group: 'გახდი ექსპერტი — შესავალი', label: 'მთავარი ღილაკი', default: 'დაიწყე განაცხადი' },
  { key: 'apply.hero.ctaSecondary', group: 'გახდი ექსპერტი — შესავალი', label: 'მეორე ღილაკი', default: 'უკვე გაქვს ანგარიში?' },
  { key: 'apply.hero.note', group: 'გახდი ექსპერტი — შესავალი', label: 'პატარა ხაზი ღილაკების ქვეშ', multiline: true, default: 'რეგისტრაცია 2 წუთია · განაცხადს ინდივიდუალურად განვიხილავთ 24–48 საათში' },

  { key: 'apply.how.eyebrow', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'პატარა იარლიყი', default: 'როგორ მუშაობს' },
  { key: 'apply.how.step1.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'შეავსე განაცხადი' },
  { key: 'apply.how.step1.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'შეავსე მოკლე ინფორმაცია შენს შესახებ, აირჩიე მიმართულება და მიუთითე ფასი.' },
  { key: 'apply.how.step2.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'ჩვენ გადავხედავთ' },
  { key: 'apply.how.step2.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'თითოეულ განაცხადს დეტალურად განვიხილავთ და პასუხს 24–48 საათში მიიღებ.' },
  { key: 'apply.how.step3.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'გამოაქვეყნე თავისუფალი დრო' },
  { key: 'apply.how.step3.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'დამტკიცების შემდეგ შენი პროფილი გამოჩნდება ძიებაში, ხოლო მომხმარებლები დაჯავშნას შენი გამოქვეყნებული გრაფიკის მიხედვით შეძლებენ.' },

  { key: 'apply.who.eyebrow', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'პატარა იარლიყი', default: 'ვის ვეძებთ' },
  // One profession per LINE. Empty lines are ignored, so the list length is
  // edited by pressing Enter — no code change to add or drop a row.
  { key: 'apply.who.list', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'სია — ერთი პროფესია ერთ ხაზზე', multiline: true, default: 'ბუღალტერი ან საგადასახადო კონსულტანტი\nიურისტი\nფინანსისტი\nმარკეტოლოგი\nბიზნესის ან კარიერის კონსულტანტი\nHR, IT, პროდაქტ-მენეჯერი ან დიზაინის სპეციალისტი\nფსიქოლოგი\nუძრავი ქონების, რელოკაციის ან კრიპტოს ექსპერტი' },
  { key: 'apply.who.note', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'ხაზი სიის ქვეშ', multiline: true, default: 'თუ შენი მიმართულება სიაში არ არის, დაამატე განაცხადში.' },

  { key: 'apply.get.eyebrow', group: 'გახდი ექსპერტი — რას იღებ', label: 'პატარა იარლიყი', default: 'რას იღებ' },
  { key: 'apply.get.card1.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 1 — სათაური', default: 'ფასს შენ ადგენ' },
  { key: 'apply.get.card1.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 1 — ტექსტი', multiline: true, default: 'თითოეულ სერვისს ცალ-ცალკე მიუთითე ფასი — მომხმარებელი ზუსტად შენს მიერ განსაზღვრულ ფასს დაინახავს.' },
  { key: 'apply.get.card2.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 2 — სათაური', default: 'დროც შენია' },
  { key: 'apply.get.card2.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 2 — ტექსტი', multiline: true, default: 'მიუთითებ შენთვის მოსახერხებელ თავისუფალ დროს — ჯავშნები მხოლოდ ამ საათებში იქნება შესაძლებელი.' },
  { key: 'apply.get.card3.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 3 — სათაური', default: 'პროფილი ძებნაში' },
  { key: 'apply.get.card3.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 3 — ტექსტი', multiline: true, default: 'დამტკიცების შემდეგ ჩნდები კატალოგსა და შენი კატეგორიის გვერდზე.' },
  // Card 4 was PAYMENTS_LIVE-branched with a COMMISSION_PCT template until
  // 2026-08-05. ⚠ It no longer follows the flag — re-type it here when paid
  // bookings ship.
  { key: 'apply.get.card4.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 4 — სათაური', default: 'საკომისიო' },
  { key: 'apply.get.card4.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 4 — ტექსტი', multiline: true, default: 'ფასს შენ ადგენ. პლატფორმა 15%-ს იტოვებს — ონლაინ გადახდების ამოქმედების შემდეგ.' },

  { key: 'apply.faq.eyebrow', group: 'გახდი ექსპერტი — კითხვები', label: 'პატარა იარლიყი', default: 'ხშირად დასმული კითხვები' },
  { key: 'apply.faq.q1', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 1', default: 'რა მჭირდება დასაწყებად?' },
  { key: 'apply.faq.a1', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 1', multiline: true, default: 'რეალური გამოცდილება შენს მიმართულებაში და მოკლე აღწერა იმისა, რაშიც ეხმარები კლიენტს. განაცხადს ხელით ვამოწმებთ.' },
  { key: 'apply.faq.q2', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 2', default: 'რამდენი დრო სჭირდება განაცხადს?' },
  { key: 'apply.faq.a2', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 2', multiline: true, default: 'რამდენიმე წუთი. დანარჩენს — ვიდეო, სერტიფიკატები, ბმულები — პროფილში ავსებ დამტკიცების შემდეგ.' },
  { key: 'apply.faq.q3', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 3', default: 'ვინ ადგენს ფასს?' },
  { key: 'apply.faq.a3', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 3', multiline: true, default: 'შენ. ფასს თითოეულ სერვისზე ცალკე ადგენ და კლიენტი მას წინასწარ ხედავს.' },
  { key: 'apply.faq.q4', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 4', default: 'როგორ ტარდება კონსულტაცია?' },
  { key: 'apply.faq.a4', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 4', multiline: true, default: 'სამუშაო, რომელიც ადგილზე კეთდება, კლიენტის მისამართზე სრულდება. კონსულტაცია ვიდეოსესიის ფორმატში ტარდება, პირდაპირ ბრაუზერიდან — დამატებითი აპლიკაცია არც შენ დაგჭირდება და არც კლიენტს.' },
  // Q6 is the money question. It sits FOURTH on the page (see ApplyMarketing's
  // FAQ array) but is numbered 6 because keys may never be renumbered — its
  // predecessor was hardcoded, so there is simply no q6 row anywhere yet.
  { key: 'apply.faq.q6', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა — გადახდები', default: 'რა ხდება გადახდებთან დაკავშირებით?' },
  { key: 'apply.faq.a6', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი — გადახდები', multiline: true, default: 'პლატფორმა 15%-ს იტოვებს. ონლაინ გადახდები ჯერ არ ამოქმედებულა — როცა ამოქმედდება, წინასწარ შეგატყობინებთ.' },
  { key: 'apply.faq.q5', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 5', default: 'შემიძლია დრო თავად განვსაზღვრო?' },
  { key: 'apply.faq.a5', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 5', multiline: true, default: 'დიახ. შენ აქვეყნებ თავისუფალ დროებს და მხოლოდ იმ საათებში გიჯავშნიან. ნებისმიერ დროს შეგიძლია პროფილი პაუზაზე დააყენო.' },

  { key: 'apply.cta.title', group: 'გახდი ექსპერტი — დასასრული', label: 'სათაური', default: 'მზად ხარ?' },
  { key: 'apply.cta.body', group: 'გახდი ექსპერტი — დასასრული', label: 'ტექსტი', multiline: true, default: 'განაცხადი ორ ეკრანზეა და რამდენიმე წუთს წაიღებს.' },
  { key: 'apply.cta.button', group: 'გახდი ექსპერტი — დასასრული', label: 'ღილაკი', default: 'დაიწყე განაცხადი' },

  // ── Footer ──
  { key: 'footer.col1.title', group: 'Footer', label: 'სვეტი 1 — სათაური', default: 'პროდუქტი' },
  { key: 'footer.col2.title', group: 'Footer', label: 'სვეტი 2 — სათაური', default: 'კომპანია' },
  { key: 'footer.col3.title', group: 'Footer', label: 'სვეტი 3 — სათაური', default: 'სამართალი' },
  { key: 'footer.location', group: 'Footer', label: 'მდებარეობა (ქვედა ზოლი)', default: 'თბილისი, საქართველო' },

  // ── Help page ──
  { key: 'help.hero.title', group: 'დახმარება', label: 'სათაური', default: 'ხშირად დასმული კითხვები' },
  { key: 'help.contact.title', group: 'დახმარება', label: 'კონტაქტი — სათაური', default: 'დაგვიკავშირდი' },
  { key: 'help.contact.sub', group: 'დახმარება', label: 'კონტაქტი — ქვესათაური', default: 'ჩვენი გუნდი პასუხობს ორშ – პარ 10:00 – 19:00.' },
  // The two support channels. The email card's DESCRIPTION is not here — it
  // prints SUPPORT_EMAIL, which has ONE source (lib/supportEmails) precisely so
  // the address cannot be typed differently in two places.
  { key: 'help.channel1.title', group: 'დახმარება', label: 'არხი 1 — სახელი', default: 'ელფოსტა' },
  { key: 'help.channel1.hours', group: 'დახმარება', label: 'არხი 1 — საათები', default: 'ორშ – პარ 10:00 – 19:00 · შაბ – კვ ელფოსტა' },
  { key: 'help.channel1.cta', group: 'დახმარება', label: 'არხი 1 — ღილაკი', default: 'წერილის გაგზავნა' },
  { key: 'help.channel2.title', group: 'დახმარება', label: 'არხი 2 — სახელი', default: 'საკონტაქტო ფორმა' },
  { key: 'help.channel2.body', group: 'დახმარება', label: 'არხი 2 — ტექსტი', default: 'აღწერე საკითხი დეტალურად' },
  { key: 'help.channel2.hours', group: 'დახმარება', label: 'არხი 2 — პასუხის ვადა', default: 'პასუხი 24 საათში' },
  { key: 'help.channel2.cta', group: 'დახმარება', label: 'არხი 2 — ღილაკი', default: 'ფორმის გახსნა' },

  // ── /help — the FAQ itself ───────────────────────────────────────────────
  // Generated from lib/helpTopics (the live content) so the defaults here and
  // the code are byte-identical. The key is built from the item's permanent
  // `id`, which is why ids may never be renumbered.
  //
  // Seven ANSWERS are deliberately absent: they interpolate CANCEL_CUTOFF_HOURS
  // / COMMISSION_PCT / SUPPORT_EMAIL or branch on PAYMENTS_LIVE, and a
  // hand-typed „24 საათი" becomes a lie the day the constant moves. Their
  // QUESTIONS are editable; only the answers are pinned. See
  // HELP_LOCKED_ANSWER_IDS.

  // ── დახმარება · დაწყება ──
  { key: 'help.faq.what-is.q', group: 'დახმარება — დაწყება', label: 'კითხვა', default: 'რა არის მცოდნე?' },
  { key: 'help.faq.what-is.a', group: 'დახმარება — დაწყება', label: 'პასუხი', multiline: true, default: 'პლატფორმა, სადაც აღწერ რა გჭირდება და ხელით შერჩეული ექსპერტები თავად გამოგიგზავნიან შეთავაზებას — ხელშეკრულებიდან და დეკლარაციიდან დალაგებამდე. ბევრ მათგანთან ჯერ კონსულტაციაც შეგიძლია, ჩატით ან ვიდეოთი — ეს იმის გარკვევაა, სწორ ადამიანთან ხარ თუ არა.' },
  { key: 'help.faq.find-expert.q', group: 'დახმარება — დაწყება', label: 'კითხვა', default: 'როგორ ვიპოვო შესაფერისი ექსპერტი?' },
  { key: 'help.faq.find-expert.a', group: 'დახმარება — დაწყება', label: 'პასუხი', multiline: true, default: 'გვერდზე „ექსპერტები“ გაფილტრე კატეგორიით, ფასითა და შეფასებით. პროფილში ნახავ ვიდეოგაცნობას, გამოცდილებასა და შეფასებებს.' },
  { key: 'help.faq.price.q', group: 'დახმარება — დაწყება', label: 'კითხვა', default: 'რა ჯდება პირველი გაცნობა?' },
  // პასუხი „price" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS

  // ── დახმარება · დაჯავშნა და სესია ──
  { key: 'help.faq.how-to-book.q', group: 'დახმარება — დაჯავშნა და სესია', label: 'კითხვა', default: 'როგორ დავჯავშნო სესია?' },
  // პასუხი „how-to-book" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.where-session.q', group: 'დახმარება — დაჯავშნა და სესია', label: 'კითხვა', default: 'სად ტარდება სესია?' },
  { key: 'help.faq.where-session.a', group: 'დახმარება — დაჯავშნა და სესია', label: 'პასუხი', multiline: true, default: 'პირდაპირ პლატფორმაზე — არ გჭირდება Zoom ან სხვა აპლიკაცია. საკმარისია ბრაუზერი და კამერა.' },
  { key: 'help.faq.cancel.q', group: 'დახმარება — დაჯავშნა და სესია', label: 'კითხვა', default: 'შეიძლება თუ არა გავაუქმო ან გადავიტანო?' },
  // პასუხი „cancel" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.expert-noshow.q', group: 'დახმარება — დაჯავშნა და სესია', label: 'კითხვა', default: 'რა მოხდება, თუ ექსპერტი არ გამოცხადდა?' },
  { key: 'help.faq.expert-noshow.a', group: 'დახმარება — დაჯავშნა და სესია', label: 'პასუხი', multiline: true, default: 'უფასოდ შემოგთავაზებთ გადატანას ან სხვა ექსპერტს. გადახდის ამოქმედების შემდეგ თანხა სრულად დაბრუნდება.' },

  // ── დახმარება · ანგარიში და შეხვედრა ──
  // Added 2026-08-04 from the unanswered log — every one of these was typed by
  // a real visitor and got „I have no answer for that".
  { key: 'help.faq.signup.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'როგორ დავრეგისტრირდე?' },
  { key: 'help.faq.signup.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'რეგისტრაცია უფასოა — გახსენი „დარეგისტრირდი“ და შედი Google-ით ან ელფოსტითა და პაროლით. ანგარიში მხოლოდ დაჯავშნისთვის გჭირდება; ექსპერტების დათვალიერება რეგისტრაციის გარეშეც შეგიძლია.' },
  { key: 'help.faq.duration.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'რამდენი ხანი გრძელდება კონსულტაცია?' },
  { key: 'help.faq.duration.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'ხანგრძლივობას ექსპერტი ადგენს თითოეული სერვისისთვის — ყველაზე ხშირად 15, 30 ან 60 წუთი. დაჯავშნამდე ზუსტად ხედავ, რომელ ვარიანტს ირჩევ და რამდენი ხანი გაგრძელდება.' },
  { key: 'help.faq.location.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'სად მდებარეობთ? ოფისში უნდა მოვიდე?' },
  { key: 'help.faq.location.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'დამოკიდებულია იმაზე, რა გჭირდება. სამუშაო, რომელიც ადგილზე კეთდება, შენს მისამართზე სრულდება — ამას ექსპერტთან შეათანხმებ. კონსულტაცია ონლაინ ტარდება, პირდაპირ ბრაუზერში — საჭიროა მხოლოდ ინტერნეტი, კამერა და მიკროფონი.' },
  { key: 'help.faq.contact.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'ტელეფონის ნომერი გაქვთ?' },
  // პასუხი „contact" გამოთვლადია (SUPPORT_EMAIL) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.language.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'რომელ ენაზე ტარდება კონსულტაცია?' },
  { key: 'help.faq.language.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'ენას ექსპერტი უთითებს და პროფილშივე ხედავ — უმეტესობა ქართულად მუშაობს, ნაწილი ინგლისურადაც. აირჩიე ის, ვისაც შენთვის სასურველი ენა უწერია.' },
  { key: 'help.faq.pre-contact.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'შემიძლია ექსპერტს დაჯავშნამდე მივწერო?' },
  { key: 'help.faq.pre-contact.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'დიახ — ექსპერტს შეტყობინებას დაჯავშნამდეც უგზავნი და საკითხს წინასწარ დააზუსტებ. ამისთვის ანგარიშში შესვლა დაგჭირდება, გადახდა კი არა. მიმოწერა „შეტყობინებებში“ გამოჩნდება.' },

  // ── დახმარება · გადახდა ──
  { key: 'help.faq.payment-safety.q', group: 'დახმარება — გადახდა', label: 'კითხვა', default: 'უსაფრთხოა თუ არა გადახდა?' },
  { key: 'help.faq.payment-safety.a', group: 'დახმარება — გადახდა', label: 'პასუხი', multiline: true, default: 'ახლა დაჯავშნა უფასოა, ბარათს არ ვთხოვთ. გაშვების შემდეგ თანხა დაცული იქნება — ექსპერტს მხოლოდ სესიის შემდეგ გადაერიცხება.' },
  { key: 'help.faq.payment-methods.q', group: 'დახმარება — გადახდა', label: 'კითხვა', default: 'რომელი გადახდის მეთოდები მიიღება?' },
  { key: 'help.faq.payment-methods.a', group: 'დახმარება — გადახდა', label: 'პასუხი', multiline: true, default: 'ონლაინ გადახდა ჯერ არ არის — ახლა დაჯავშნა უფასოა. მეთოდების სიას ამოქმედებისთანავე გამოვაქვეყნებთ.' },
  { key: 'help.faq.invoice.q', group: 'დახმარება — გადახდა', label: 'კითხვა', default: 'შემიძლია მივიღო ინვოისი?' },
  { key: 'help.faq.invoice.a', group: 'დახმარება — გადახდა', label: 'პასუხი', multiline: true, default: 'ინვოისები გადახდებთან ერთად ამოქმედდება — ავტომატურად მოვა ელფოსტაზე. მანამდე დაჯავშნა უფასოა.' },

  // ── დახმარება · ექსპერტებისთვის ──
  { key: 'help.faq.become-expert.q', group: 'დახმარება — ექსპერტებისთვის', label: 'კითხვა', default: 'როგორ ვხდები ექსპერტი?' },
  { key: 'help.faq.become-expert.a', group: 'დახმარება — ექსპერტებისთვის', label: 'პასუხი', multiline: true, default: '„გახდი ექსპერტი“ გვერდზე შეავსე განაცხადი — გამოცდილება, სპეციალიზაცია, პორტფოლიო. პასუხს 24–48 საათში მიიღებ.' },
  { key: 'help.faq.commission.q', group: 'დახმარება — ექსპერტებისთვის', label: 'კითხვა', default: 'რა კომისიას იღებს პლატფორმა?' },
  // პასუხი „commission" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.payout.q', group: 'დახმარება — ექსპერტებისთვის', label: 'კითხვა', default: 'როდის მივიღებ თანხას?' },
  { key: 'help.faq.payout.a', group: 'დახმარება — ექსპერტებისთვის', label: 'პასუხი', multiline: true, default: 'გადახდები მალე ამოქმედდება — მანამდე სესიები უფასოა. გაშვების შემდეგ შემოსავალი რეგულარული გრაფიკით გადმოგერიცხება.' },

  // ── დახმარება · ანგარიში და უსაფრთხოება ──
  { key: 'help.faq.account-security.q', group: 'დახმარება — ანგარიში და უსაფრთხოება', label: 'კითხვა', default: 'როგორ დავიცვა ჩემი ანგარიში?' },
  // პასუხი „account-security" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.delete-account.q', group: 'დახმარება — ანგარიში და უსაფრთხოება', label: 'კითხვა', default: 'როგორ წავშალო ანგარიში?' },
  // პასუხი „delete-account" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.report-abuse.q', group: 'დახმარება — ანგარიში და უსაფრთხოება', label: 'კითხვა', default: 'რა ხდება, თუ ექსპერტი დისკრიმინაციულად მოიქცა?' },
  // პასუხი „report-abuse" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS

  // ── Footer ──
  { key: 'footer.tagline', group: 'Footer', label: 'აღწერა', multiline: true, default: 'მცოდნე — აღწერე რა გჭირდება და მიიღე შეთავაზებები ხელით შერჩეული ექსპერტებისგან.' },

  // ── /abroad — the diaspora landing (FEATURE_ABROAD) ──────────────────────
  // EVERY visible string on that page is here, deliberately: the audience is
  // 40–60-year-old emigrants arriving from a Facebook post, and the wording is
  // the thing most likely to need same-day tuning once the first posts run.
  // Whoever tunes it should not need a deploy.
  //
  // The three „card" prices are stored in LARI (the currency Consultation.price
  // is in, and the currency that is actually charged) and converted for display
  // by lib/abroad → eurLabel. Editing the lari number here moves the euro figure
  // with it; the rate itself is ABROAD_EUR_PER_GEL in lib/flags.ts.
  { key: 'abroad.hero.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'Hero — სათაური', multiline: true, default: 'ცხოვრობ საზღვარგარეთ? მოაგვარე საქმეები საქართველოში — ონლაინ' },
  { key: 'abroad.hero.subtitle', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'Hero — ქვესათაური', multiline: true, default: 'ქართველი იურისტი, ბუღალტერი და კარიერის ექსპერტი ვიდეოსესიაზე. ჩამოსვლა და რიგში დგომა არ დაგჭირდება — საკმარისია ტელეფონი.' },
  { key: 'abroad.hero.cta', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'Hero — ღილაკი', default: 'ნახე ექსპერტები' },

  { key: 'abroad.cards.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისები — სათაური', default: 'რა გჭირდება?' },
  { key: 'abroad.card1.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 1 — სათაური', default: 'ქონება, მინდობილობა და მემკვიდრეობა' },
  { key: 'abroad.card1.body', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 1 — ტექსტი', multiline: true, default: 'ბინა, მიწა თუ მემკვიდრეობა საქართველოში — რა დოკუმენტი გჭირდება, რა უნდა ეწეროს მინდობილობაში და როგორ გააფორმო ჩამოსვლის გარეშე.' },
  { key: 'abroad.card1.priceGel', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 1 — ფასი ლარში (ევრო თავად გამოითვლება)', default: '120' },
  { key: 'abroad.card1.cta', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 1 — ღილაკი', default: 'იურისტთან' },

  { key: 'abroad.card2.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 2 — სათაური', default: 'გადასახადები და ინდივიდუალური მეწარმე' },
  { key: 'abroad.card2.body', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 2 — ტექსტი', multiline: true, default: 'უცხოეთიდან მიღებული შემოსავალი, ქონების გადასახადი, ინდივიდუალური მეწარმის სტატუსი. ბუღალტერი გეტყვის, რა გევალება და რა — არა.' },
  { key: 'abroad.card2.priceGel', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 2 — ფასი ლარში (ევრო თავად გამოითვლება)', default: '150' },
  { key: 'abroad.card2.cta', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 2 — ღილაკი', default: 'ბუღალტერთან' },

  // ⚠️ CARD 3 WAS „შვილს გაკვეთილი მინდა" (school tutoring) and was replaced
  // 2026-08-04. The development plan's §6 „რას არ ვაკეთებთ" excludes tutoring
  // outright — „ბაზარი დაკავებულია და მოდელიც არ გვერგება" — so the card was
  // selling the one thing the business had decided not to sell. Its replacement
  // points at the plan's own „კარიერა" line (§4 item 6), whose stated buyer is
  // „ვისაც სამსახური აქვს და გადასვლა უნდა" — which is precisely a Georgian
  // working abroad. Do not reintroduce a tutoring card here.
  { key: 'abroad.card3.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 3 — სათაური', default: 'ვფიქრობ დაბრუნებაზე — რა მელოდება?' },
  { key: 'abroad.card3.body', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 3 — ტექსტი', multiline: true, default: 'ხელფასი, ვაკანსიები, საკუთარი საქმის დაწყება. ესაუბრე იმას, ვინც დღეს საქართველოში ქირაობს ან ბიზნესს უძღვება.' },
  { key: 'abroad.card3.priceGel', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 3 — ფასი ლარში (ევრო თავად გამოითვლება)', default: '150' },
  { key: 'abroad.card3.cta', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'სერვისი 3 — ღილაკი', default: 'ესაუბრე ექსპერტს' },

  { key: 'abroad.how.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'როგორ მუშაობს — სათაური', default: 'როგორ მუშაობს' },
  { key: 'abroad.how.step1.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ნაბიჯი 1 — სათაური', default: 'აირჩიე ექსპერტი' },
  { key: 'abroad.how.step1.desc', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'ნახე ვინ რას აკეთებს, რა ღირს და როგორ შეაფასეს სხვებმა.' },
  { key: 'abroad.how.step2.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ნაბიჯი 2 — სათაური', default: 'დაასახელე შენთვის მოსახერხებელი დრო' },
  { key: 'abroad.how.step2.desc', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'დროები შენი ქვეყნის საათით ჩანს. ექსპერტი დაგიდასტურებს ან შემოგთავაზებს სხვას.' },
  { key: 'abroad.how.step3.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ნაბიჯი 3 — სათაური', default: 'შეხვდი ვიდეოზე' },
  { key: 'abroad.how.step3.desc', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'ბრაუზერიდან, პროგრამის დაყენების გარეშე. ბმულს წინასწარ მიიღებ.' },

  { key: 'abroad.experts.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ექსპერტები — სათაური', default: 'ვინ დაგელაპარაკება' },
  { key: 'abroad.experts.subtitle', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ექსპერტები — ქვესათაური', multiline: true, default: 'ხელით შერჩეული ქართველი ექსპერტები — გამოცდილება შემოწმებულია.' },
  { key: 'abroad.experts.empty', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ექსპერტები — ცარიელი მდგომარეობა', multiline: true, default: 'ექსპერტების სია მზადდება. მოგვწერე და შენს საკითხზე სპეციალისტს შეგირჩევთ.' },

  { key: 'abroad.cta.title', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ბოლო CTA — სათაური', default: 'ვერ იპოვე შენი საკითხი?' },
  { key: 'abroad.cta.body', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ბოლო CTA — ტექსტი', multiline: true, default: 'მოგვწერე ორი წინადადებით, რა გჭირდება — ექსპერტს შეგირჩევთ და დაგიბრუნდებით.' },
  { key: 'abroad.cta.button', group: 'დიასპორა (/abroad)', vertical: 'abroad', label: 'ბოლო CTA — ღილაკი', default: 'მომწერეთ' },

  // ── /signup · the marketing panel beside the form (added 2026-08-05) ──────
  // The whole panel, both roles, top to bottom. It was invisible to the admin
  // panel until now for ONE reason: its expert-side paragraph and its first
  // stat were PAYMENTS_LIVE-branched and interpolated COMMISSION_PCT, and a
  // template is a template that can be saved broken. With the commission line
  // removed (owner, 2026-08-05) both are plain sentences, so the whole panel
  // became editable at once — no half-editable section, per the rule above.
  //
  // ⚠ These sentences no longer follow PAYMENTS_LIVE, and since 2026-08-10
  // that is the point rather than a caveat. Owner: the commission is 15%, it
  // must be said everywhere, and „0%" must appear nowhere.
  //
  // The reason is not tidiness. An expert read „0%" in the biggest type on the
  // panel, priced their service against it, and would later find 15% withheld
  // („მოტყუებაში რომ არ შევიდეს"). „ახლა 0%, მოგვიანებით 15%" was the
  // 2026-08-05 attempt at honesty and it failed the same way: the number the
  // eye lands on is the one it believes, and the correction sat in the caption
  // underneath it.
  //
  // The figure is written out rather than interpolated — these defaults are
  // deliberately plain sentences so the whole panel stays editable (see above).
  // It MUST equal lib/flags COMMISSION_PCT, which is what the payout actually
  // computes with: 15. Change one, change the other.
  { key: 'signup.badge', group: 'რეგისტრაცია — პანელი', label: 'მწვანე იარლიყი (ორივე მხარეს)', default: 'უფასო' },

  { key: 'signup.learn.pill', group: 'რეგისტრაცია — ვსწავლობ', label: 'იარლიყის ტექსტი', default: 'რეგისტრაცია' },
  { key: 'signup.learn.title1', group: 'რეგისტრაცია — ვსწავლობ', label: 'სათაური, 1-ლი ხაზი', default: 'შემოგვიერთდი.' },
  { key: 'signup.learn.title2', group: 'რეგისტრაცია — ვსწავლობ', label: 'სათაური, აქცენტი (მწვანე)', default: 'ფასი წინასწარ ცნობილია.' },
  { key: 'signup.learn.subEmphasis', group: 'რეგისტრაცია — ვსწავლობ', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'ამჟამად ჯავშნა უფასოა' },
  { key: 'signup.learn.subRest', group: 'რეგისტრაცია — ვსწავლობ', label: 'ქვესათაური — გაგრძელება', default: '— დაცული გადახდა მალე.' },
  { key: 'signup.learn.step1.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 1 — სათაური', default: 'ფასი წინასწარ ცნობილია' },
  { key: 'signup.learn.step1.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 1 — აღწერა', default: 'გადაიხდი მხოლოდ დაჯავშნისას.' },
  { key: 'signup.learn.step2.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 2 — სათაური', default: 'დაცული გადახდა (მალე)' },
  { key: 'signup.learn.step2.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 2 — აღწერა', default: 'თანხა ერიცხება სესიის შემდეგ.' },
  { key: 'signup.learn.step3.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 3 — სათაური', default: 'ხელით განხილული' },
  { key: 'signup.learn.step3.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 3 — აღწერა', default: 'ყველა ექსპერტი — სანამ პლატფორმაზე მოვა.' },
  { key: 'signup.learn.trust.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნდობის ხაზი — სათაური', default: 'ექსპერტებს ხელით განვიხილავთ' },
  { key: 'signup.learn.trust.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნდობის ხაზი — აღწერა', default: 'გამოცდილება და რეპუტაცია გამოწმებული.' },

  /* ⚠️ THE THIRD IDENTITY (2026-08-18). Owner: „სამი ვარიანტი უნდა დაემატოს …
     მესამე სერვისები — ვინც ტვირთავს, ჩვეულებრივი ადამიანი და ბიზნესი."
     Individual-vs-business is NOT asked here on purpose — it is the first
     question on /apply/master, where the answer changes which fields appear.
     Asking it twice would make the signup form pretend to a decision it cannot
     act on. */
  { key: 'signup.serve.pill', group: 'რეგისტრაცია — სერვისი', label: 'იარლიყის ტექსტი', default: 'სერვისის განაცხადი' },
  { key: 'signup.serve.title1', group: 'რეგისტრაცია — სერვისი', label: 'სათაური, 1-ლი ხაზი', default: 'დაარეგისტრირე შენი სერვისი.' },
  { key: 'signup.serve.title2', group: 'რეგისტრაცია — სერვისი', label: 'სათაური, აქცენტი (მწვანე)', default: 'შეკვეთები შენს ქალაქში.' },
  { key: 'signup.serve.sub', group: 'რეგისტრაცია — სერვისი', label: 'ქვესათაური', multiline: true, default: 'კლიენტი წერს, რა გაფუჭდა. შენ ფასს თვითონ წერ.' },
  { key: 'signup.serve.step1.title', group: 'რეგისტრაცია — სერვისი', label: 'ნაბიჯი 1 — სათაური', default: 'შეავსე განაცხადი' },
  { key: 'signup.serve.step1.desc', group: 'რეგისტრაცია — სერვისი', label: 'ნაბიჯი 1 — აღწერა', default: 'რას აკეთებ და რომელ ქალაქში.' },
  { key: 'signup.serve.step2.title', group: 'რეგისტრაცია — სერვისი', label: 'ნაბიჯი 2 — სათაური', default: 'გადავამოწმებთ' },
  { key: 'signup.serve.step2.desc', group: 'რეგისტრაცია — სერვისი', label: 'ნაბიჯი 2 — აღწერა', default: 'გადავამოწმებთ და ექსპერტებს გადავცემთ.' },
  { key: 'signup.serve.step3.title', group: 'რეგისტრაცია — სერვისი', label: 'ნაბიჯი 3 — სათაური', default: 'მოთხოვნები მოგდის' },
  { key: 'signup.serve.step3.desc', group: 'რეგისტრაცია — სერვისი', label: 'ნაბიჯი 3 — აღწერა', default: 'მხოლოდ შენი მიმართულების და შენი ქალაქის.' },

  { key: 'signup.teach.pill', group: 'რეგისტრაცია — ვასწავლი', label: 'იარლიყის ტექსტი', default: 'ექსპერტის განაცხადი' },
  { key: 'signup.teach.title1', group: 'რეგისტრაცია — ვასწავლი', label: 'სათაური, 1-ლი ხაზი', default: 'გახდი მცოდნე.' },
  { key: 'signup.teach.title2', group: 'რეგისტრაცია — ვასწავლი', label: 'სათაური, აქცენტი (მწვანე)', default: 'შენი ცოდნა — შენი შემოსავალი.' },
  { key: 'signup.teach.sub', group: 'რეგისტრაცია — ვასწავლი', label: 'ქვესათაური', multiline: true, default: 'შენ ირჩევ ფასს, დროსა და თემას.' },
  // RETIRED 2026-08-10: it repeated the commission two lines above the stat
  // tile that already carries it. One mention per surface (owner).
  { key: 'signup.teach.subEmphasis', group: 'რეგისტრაცია — ვასწავლი', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'გასამრჯელო — სესიის შემდეგ.', retired: true },
  { key: 'signup.teach.stat1.n', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1', default: '15%' },
  { key: 'signup.teach.stat1.label', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1 — იარლიყი', default: 'საკომისიო' },
  { key: 'signup.teach.stat1.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1 — ქვეტექსტი', default: 'ონლაინ გადახდების ამოქმედების შემდეგ' },
  { key: 'signup.teach.stat2.n', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 2', default: 'შენ' },
  { key: 'signup.teach.stat2.label', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 2 — იარლიყი', default: 'ადგენ ფასს' },
  { key: 'signup.teach.stat2.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 2 — ქვეტექსტი', default: 'დროსა და თემას' },
  { key: 'signup.teach.stat3.n', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 3', default: '1 სთ' },
  { key: 'signup.teach.stat3.label', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 3 — იარლიყი', default: 'კონსულტაცია' },
  { key: 'signup.teach.stat3.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 3 — ქვეტექსტი', default: 'ვიდეოზარით' },
  { key: 'signup.teach.processEyebrow', group: 'რეგისტრაცია — ვასწავლი', label: 'პროცესის იარლიყი', default: 'პროცესი · 4 ნაბიჯი' },
  { key: 'signup.teach.step1.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 1 — სათაური', default: 'შეავსე განაცხადი' },
  { key: 'signup.teach.step1.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 1 — გვერდით', default: 'მოკლე ფორმა' },
  { key: 'signup.teach.step2.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 2 — სათაური', default: 'ჩვენი განხილვა' },
  { key: 'signup.teach.step2.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 2 — გვერდით', default: '24–48 საათი' },
  { key: 'signup.teach.step3.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 3 — სათაური', default: 'პროფილი ცოცხალდება' },
  { key: 'signup.teach.step3.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 3 — გვერდით', default: 'დასტურის შემდეგ' },
  { key: 'signup.teach.step4.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 4 — სათაური', default: 'პირველი ჯავშანი' },
  { key: 'signup.teach.step4.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 4 — გვერდით', default: 'დაამატე დროები' },

  // SEO LAST, deliberately. These ~32 Google/Facebook metadata fields used to
  // sit at the HEAD of this array, so „ტექსტები" opened on nine groups of
  // metadata and the most-edited copy on the whole site — the home hero — was
  // about thirty fields down. Order here IS the reading order in the panel, and
  // the panel should open on what people actually change.
  ...SEO_TEXTS,
]

export const SITE_TEXT_DEFAULTS: Record<string, string> = Object.fromEntries(
  SITE_TEXTS.map(t => [t.key, t.default]),
)

/**
 * The same map WITHOUT retired keys — what a browser is allowed to receive.
 *
 * ⚠️ `retired: true` STOPPED RENDERING, IT NEVER STOPPED DELIVERY (fixed
 * 2026-08-20). `getSiteTextMap` spread every key into one object and
 * app/layout handed the whole thing to `<SiteTextProvider>`, a CLIENT
 * component — so every retired default was serialized into the RSC payload of
 * EVERY page on the site. Measured that day: seven copies of the retired word
 * „ხელოსნები" in the HTML of every page measured — the home, the catalogue,
 * the door, the intake, help, about, signup and the workspace — all of it from
 * `seo.masters.*` and `seo.services.*`, pages that had not existed for a day.
 * (Written without the paths: tests/requests scans this tree for anything that
 * names the intake route, and a comment is indistinguishable from a link.) View-source found it; the comments
 * above claimed „no page reads them", which was true and beside the point.
 *
 * A retired key is kept (never deleted — the registry is the record of what a
 * URL used to say) and it stays readable on the SERVER, where a redirect or an
 * old sitemap entry may still want it. It just does not travel.
 */
export const SITE_TEXT_PUBLIC_DEFAULTS: Record<string, string> = Object.fromEntries(
  SITE_TEXTS.filter(t => !t.retired).map(t => [t.key, t.default]),
)

/** Is this key retired? The one place the answer is computed. */
const RETIRED_KEYS = new Set(SITE_TEXTS.filter(t => t.retired).map(t => t.key))
export function isRetiredSiteTextKey(key: string): boolean {
  return RETIRED_KEYS.has(key)
}

// Guard: only known keys can be written from the admin API.
export function isKnownSiteTextKey(key: string): boolean {
  return key in SITE_TEXT_DEFAULTS
}
