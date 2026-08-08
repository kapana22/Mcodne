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
  const rows: SiteTextDef[] = [
    { key: pageSeoKey(p.page, 'title'), group, label: 'Google-ის სათაური', default: p.title },
    { key: pageSeoKey(p.page, 'ogTitle'), group, label: 'გაზიარების სათაური (Facebook)', default: p.ogTitle },
  ]
  if (!p.lockedDescription) {
    rows.splice(1, 0, { key: pageSeoKey(p.page, 'description'), group, label: 'Google-ის აღწერა', multiline: true, default: p.description })
    rows.push({ key: pageSeoKey(p.page, 'ogDescription'), group, label: 'გაზიარების აღწერა (Facebook)', multiline: true, default: p.ogDescription })
  }
  return rows
})

export const SITE_TEXTS: SiteTextDef[] = [
  // ── Landing hero ──
  { key: 'home.hero.line1', group: 'მთავარი — Hero', label: 'სათაური, 1-ლი ხაზი', default: 'ვიდეოსესია ექსპერტთან —' },
  { key: 'home.hero.line2', group: 'მთავარი — Hero', label: 'სათაური, აქცენტი (მწვანე)', default: 'პასუხი, ძებნის ნაცვლად.' },
  { key: 'home.hero.subtitle', group: 'მთავარი — Hero', label: 'ქვესათაური', multiline: true, default: 'გამოცდილი ქართველი ექსპერტები ბიზნესში, კარიერასა და გადასახადებში.' },
  { key: 'home.hero.subtitleEmphasis', group: 'მთავარი — Hero', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'დაჯავშნე და შეხვდი ვიდეოზე.' },
  { key: 'home.hero.trustChip', group: 'მთავარი — Hero', label: 'ნდობის ხაზი (პატარა, ზემოთ)', default: 'ხელით შერჩეული ბაზა' },
  // Shown ONLY while the catalog has no ratings yet — once real reviews exist
  // the same slot prints „4.8★ საშუალო შეფასება", which is computed.
  { key: 'home.hero.browseAll', group: 'მთავარი — Hero', label: 'ტექსტი სანამ შეფასებები არაა', default: 'გადახედე მთელ ბაზას' },

  // ── Home · Categories section ──
  { key: 'home.categories.eyebrow', group: 'მთავარი — კატეგორიები', label: 'პატარა იარლიყი (ზემოთ)', default: 'კატეგორიები' },
  { key: 'home.categories.title', group: 'მთავარი — კატეგორიები', label: 'სათაური', default: 'აირჩიე შენი სფერო' },
  { key: 'home.categories.subtitle', group: 'მთავარი — კატეგორიები', label: 'ქვესათაური', default: 'შეადარე ექსპერტები და დაჯავშნე ვიდეოსესია.' },
  { key: 'home.categories.allEyebrow', group: 'მთავარი — კატეგორიები', label: 'იარლიყი სფეროების სიის ზემოთ', default: 'ყველა სფერო' },

  // ── Home · Experts section ──
  // `home.experts.title` is the section h2 — but ONLY while no sphere is
  // selected. Tap a sphere and the heading becomes „{სფერო} — N ექსპერტი",
  // which is generated and cannot be edited. Worth knowing before someone
  // concludes the field is broken because their text „disappeared".
  { key: 'home.experts.eyebrow', group: 'მთავარი — ექსპერტები', label: 'პატარა იარლიყი (ზემოთ)', default: 'ექსპერტები' },
  { key: 'home.experts.empty', group: 'მთავარი — ექსპერტები', label: 'როცა სფეროში ექსპერტი არაა', default: 'ამ სფეროში ჯერ არ არის ექსპერტი' },
  { key: 'home.experts.allCta', group: 'მთავარი — ექსპერტები', label: 'ღილაკი სიის ბოლოს', default: 'ნახე ყველა ექსპერტი' },
  { key: 'home.experts.title', group: 'მთავარი — ექსპერტები', label: 'სათაური (როცა სფერო არჩეული არაა)', default: 'ხელით შერჩეული ექსპერტები.' },

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
  { key: 'home.how.title', group: 'მთავარი — როგორ მუშაობს', label: 'სათაური (ორ ხაზად)', multiline: true, default: 'სამი ნაბიჯი —\nვიდრე უკვე ელაპარაკები.' },
  { key: 'home.how.subtitle', group: 'მთავარი — როგორ მუშაობს', label: 'ქვესათაური', default: 'რეგისტრაცია, არჩევა, ვიდეოსესია.' },
  { key: 'home.how.cta', group: 'მთავარი — როგორ მუშაობს', label: 'ღილაკი', default: 'აირჩიე ექსპერტი' },
  { key: 'home.how.step1.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'აირჩიე ექსპერტი' },
  { key: 'home.how.step1.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'გადახედე პროფილებს, შეფასებებს და ვიდეოგაცნობას.' },
  { key: 'home.how.step2.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'აირჩიე სერვისი და დრო' },
  { key: 'home.how.step2.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'აირჩიე სერვისი და დრო კალენდრიდან — ექსპერტი ადასტურებს.' },
  // Step 3 has TWO versions and only one of them is on screen. These keys are
  // the PAYMENTS_LIVE=false version, which is what the site shows today. The
  // „დაცული გადახდა" version stays in code until payments actually ship —
  // an editable field for a string nobody can see is a dead control.
  { key: 'home.how.step3.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'შეხვდი ვიდეოზე' },
  { key: 'home.how.step3.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'დანიშნულ დროს ბმულით შეხვალ — დაჯავშნა ახლა უფასოა.' },

  // ── Home · What every booking includes ──
  // The `home.why.*` KEY NAMES are historical (the section used to be called
  // „რატომ მცოდნე") and must NOT be renamed — a SiteText DB row is keyed by the
  // key string, so renaming one silently drops whatever the admin had typed.
  // The GROUP LABEL is what the admin reads, and it now matches the heading
  // that is actually on the page.
  { key: 'home.includes.eyebrow', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'პატარა იარლიყი (ზემოთ)', default: 'ყოველი ჯავშანი მოიცავს' },
  { key: 'home.why.card1.title', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 1 — სათაური', default: 'ხელით მოდერაცია' },
  { key: 'home.why.card1.body', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 1 — ტექსტი', multiline: true, default: 'ვამოწმებთ ყოველ განაცხადს — გამოცდილებას და რეპუტაციას.' },
  { key: 'home.why.card2.title', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 2 — სათაური', default: 'HD ვიდეოსესია' },
  { key: 'home.why.card2.body', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 2 — ტექსტი', multiline: true, default: 'ვიდეოოთახი, მიმოწერა და ფაილები — ბრაუზერიდან.' },
  { key: 'home.why.card3.title', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 3 — სათაური', default: 'გამჭვირვალე ფასი' },
  { key: 'home.why.card3.body', group: 'მთავარი — ყოველი ჯავშანი მოიცავს', label: 'ბარათი 3 — ტექსტი', multiline: true, default: 'ერთი ფასი, ფარული საკომისიოს გარეშე.' },

  // ── Home · „ხარ ექსპერტი?" CTA ──
  // The paragraph became editable 2026-08-05: it lost its commission clause,
  // and with it the PAYMENTS_LIVE branch + COMMISSION_PCT template that had
  // kept it in code (a field holding a template is a field that can be saved
  // broken). The heading's second, green line is still branched, so it stays.
  // ⚠ The paragraph no longer follows PAYMENTS_LIVE — re-type it here the day
  // paid bookings ship.
  { key: 'home.expertCta.eyebrow', group: 'მთავარი — გახდი ექსპერტი', label: 'პატარა იარლიყი (ზემოთ)', default: 'ექსპერტებისთვის' },
  { key: 'home.expertCta.title', group: 'მთავარი — გახდი ექსპერტი', label: 'სათაური (1-ლი ხაზი)', default: 'გააზიარე შენი ცოდნა.' },
  { key: 'home.expertCta.body', group: 'მთავარი — გახდი ექსპერტი', label: 'ტექსტი სათაურის ქვეშ', multiline: true, default: 'შენ ადგენ ფასს, დროსა და თემას. დანარჩენს ჩვენ ვუვლით. ახლა დაჯავშნა უფასოა და საკომისიოს არ ვიკავებთ.' },
  { key: 'home.expertCta.cta', group: 'მთავარი — გახდი ექსპერტი', label: 'ღილაკი', default: 'გახდი ექსპერტი' },

  // ── Categories page ──
  { key: 'categories.hero.title', group: 'სფეროები', label: 'სათაური', default: 'აირჩიე შენი სფერო' },
  { key: 'categories.hero.subtitle', group: 'სფეროები', label: 'ქვესათაური', multiline: true, default: 'აირჩიე მიმართულება, შეადარე ექსპერტები და დაჯავშნე ვიდეოსესია.' },
  { key: 'categories.emptySpheres.eyebrow', group: 'სფეროები', label: 'ცარიელი სფეროების იარლიყი', default: 'ჯერ ცარიელი სფეროები' },
  { key: 'categories.empty.title', group: 'სფეროები', label: 'ცარიელი გვერდი — სათაური', default: 'სფეროები ჯერ არ არის' },
  { key: 'categories.empty.body', group: 'სფეროები', label: 'ცარიელი გვერდი — ტექსტი', multiline: true, default: 'მალე დავამატებთ. სცადე მოგვიანებით.' },
  { key: 'categories.empty.cta', group: 'სფეროები', label: 'ცარიელი გვერდი — ღილაკი', default: 'ექსპერტების ძებნა' },

  // ── /konsultacia — the profession-pages hub ──
  { key: 'konsultacia.eyebrow', group: 'კონსულტაციები (hub)', label: 'პატარა იარლიყი', default: 'კონსულტაციები' },
  { key: 'konsultacia.title', group: 'კონსულტაციები (hub)', label: 'სათაური', default: 'ონლაინ კონსულტაცია სპეციალისტთან' },
  { key: 'konsultacia.subtitle', group: 'კონსულტაციები (hub)', label: 'ქვესათაური', multiline: true, default: 'აირჩიე, რომელი სპეციალისტი გჭირდება, და ნახე რას გაივლი მასთან ერთსაათიან ვიდეოსესიაზე. ფასს ექსპერტი თავად ადგენს და პროფილში წინასწარ ხედავ.' },

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
  { key: 'about.create.p2', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — აბზაცი 2', multiline: true, default: 'გაკავშირებთ ხელით შერჩეულ ქართველ ექსპერტთან ერთ ვიდეოსესიაზე. ერთმა საუბარმა შეიძლება შენი პროექტი თუ კარიერა შეცვალოს.' },
  { key: 'about.cta.title', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — სათაური', default: 'ხარ ექსპერტი? გვინდა შენი ცოდნა' },
  { key: 'about.cta.body', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — ტექსტი', multiline: true, default: 'გაქვს გამოცდილება? შემოგვიერთდი — განაცხადს 24–48 საათში განვიხილავთ.' },

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
  { key: 'apply.hero.body', group: 'გახდი ექსპერტი — შესავალი', label: 'შესავალი ტექსტი', multiline: true, default: 'შენი გამოცდილება ვიღაცის გადაუჭრელი კითხვაა. მცოდნე ქართველ სპეციალისტებს აკავშირებს იმ ადამიანებთან, რომლებსაც კონკრეტულ საკითხზე პასუხი სჭირდებათ — ერთსაათიან ონლაინ კონსულტაციაზე, შენს მიერ დადგენილ დროსა და ფასად.' },
  { key: 'apply.hero.ctaPrimary', group: 'გახდი ექსპერტი — შესავალი', label: 'მთავარი ღილაკი', default: 'დაიწყე განაცხადი' },
  { key: 'apply.hero.ctaSecondary', group: 'გახდი ექსპერტი — შესავალი', label: 'მეორე ღილაკი', default: 'უკვე გაქვს ანგარიში?' },
  { key: 'apply.hero.note', group: 'გახდი ექსპერტი — შესავალი', label: 'პატარა ხაზი ღილაკების ქვეშ', multiline: true, default: 'რეგისტრაცია უფასოა · განაცხადს ხელით განვიხილავთ 24–48 საათში' },

  { key: 'apply.how.eyebrow', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'პატარა იარლიყი', default: 'როგორ მუშაობს' },
  { key: 'apply.how.step1.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'შეავსე მოკლე განაცხადი' },
  { key: 'apply.how.step1.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'ორი ეკრანი — ვინ ხარ, რა სფეროა და რა ღირს შენი კონსულტაცია.' },
  { key: 'apply.how.step2.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'ჩვენ ხელით გადავხედავთ' },
  { key: 'apply.how.step2.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'ყოველ განაცხადს ადამიანი კითხულობს — პასუხი 24–48 საათში.' },
  { key: 'apply.how.step3.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'გამოაქვეყნე თავისუფალი დრო' },
  { key: 'apply.how.step3.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'დამტკიცების შემდეგ პროფილი ჩნდება ძებნაში; ჯავშნები იმ დროიდან იწყება, რასაც გამოაქვეყნებ.' },

  { key: 'apply.who.eyebrow', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'პატარა იარლიყი', default: 'ვის ვეძებთ' },
  // One profession per LINE. Empty lines are ignored, so the list length is
  // edited by pressing Enter — no code change to add or drop a row.
  { key: 'apply.who.list', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'სია — ერთი პროფესია ერთ ხაზზე', multiline: true, default: 'ბუღალტერი ან საგადასახადო კონსულტანტი\nიურისტი\nფინანსისტი\nმარკეტოლოგი\nბიზნეს ან კარიერული კონსულტანტი\nHR, IT, პროდაქტის ან დიზაინის სპეციალისტი\nფსიქოლოგი\nუძრავი ქონების, რელოკაციის ან კრიპტოს ექსპერტი' },
  { key: 'apply.who.note', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'ხაზი სიის ქვეშ', multiline: true, default: 'სფერო სიაში არ არის? განაცხადში თავად ჩაწერ შენს მიმართულებას — ნიშური საქმეც მისაღებია.' },

  { key: 'apply.get.eyebrow', group: 'გახდი ექსპერტი — რას იღებ', label: 'პატარა იარლიყი', default: 'რას იღებ' },
  { key: 'apply.get.card1.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 1 — სათაური', default: 'ფასს შენ ადგენ' },
  { key: 'apply.get.card1.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 1 — ტექსტი', multiline: true, default: 'ყოველ სერვისზე ცალკე. რასაც დააყენებ, იმას ხედავს სტუდენტი.' },
  { key: 'apply.get.card2.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 2 — სათაური', default: 'დროც შენია' },
  { key: 'apply.get.card2.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 2 — ტექსტი', multiline: true, default: 'აქვეყნებ თავისუფალ საათებს; სხვა დროს არავინ გიჯავშნის.' },
  { key: 'apply.get.card3.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 3 — სათაური', default: 'პროფილი ძებნაში' },
  { key: 'apply.get.card3.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 3 — ტექსტი', multiline: true, default: 'დამტკიცების შემდეგ ჩნდები კატალოგსა და შენი სფეროს გვერდზე.' },
  // Card 4 was PAYMENTS_LIVE-branched with a COMMISSION_PCT template until
  // 2026-08-05. ⚠ It no longer follows the flag — re-type it here when paid
  // bookings ship.
  { key: 'apply.get.card4.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 4 — სათაური', default: 'სრული თანხა შენია' },
  { key: 'apply.get.card4.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 4 — ტექსტი', multiline: true, default: 'ამჟამად ჯავშნა უფასოა და საკომისიოს არ ვიკავებთ.' },

  { key: 'apply.faq.eyebrow', group: 'გახდი ექსპერტი — კითხვები', label: 'პატარა იარლიყი', default: 'ხშირად დასმული კითხვები' },
  { key: 'apply.faq.q1', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 1', default: 'რა მჭირდება დასაწყებად?' },
  { key: 'apply.faq.a1', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 1', multiline: true, default: 'რეალური გამოცდილება შენს სფეროში და მოკლე აღწერა იმისა, რაში ეხმარები ადამიანებს. განაცხადი ორ ეკრანზეა — ლიცენზიის ნომერი, დიპლომი ან სერტიფიკატი სავალდებულო არ არის.' },
  { key: 'apply.faq.q2', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 2', default: 'რამდენი დრო სჭირდება განაცხადს?' },
  { key: 'apply.faq.a2', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 2', multiline: true, default: 'რამდენიმე წუთი. დანარჩენს — ვიდეო, სერტიფიკატები, ბმულები — პროფილში ავსებ დამტკიცების შემდეგ.' },
  { key: 'apply.faq.q3', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 3', default: 'ვინ ადგენს ფასს?' },
  { key: 'apply.faq.a3', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 3', multiline: true, default: 'შენ. ფასს თითოეულ სერვისზე ცალკე ადგენ და სტუდენტი მას წინასწარ ხედავს — ფარული საკომისიო არ ემატება.' },
  { key: 'apply.faq.q4', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 4', default: 'როგორ ტარდება კონსულტაცია?' },
  { key: 'apply.faq.a4', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 4', multiline: true, default: 'ვიდეოსესიის ფორმატში, ბრაუზერიდან — ცალკე აპლიკაცია არც შენ გჭირდება და არც სტუდენტს.' },
  // Q6 is the money question. It sits FOURTH on the page (see ApplyMarketing's
  // FAQ array) but is numbered 6 because keys may never be renumbered — its
  // predecessor was hardcoded, so there is simply no q6 row anywhere yet.
  { key: 'apply.faq.q6', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა — გადახდები', default: 'რა ხდება გადახდებთან დაკავშირებით?' },
  { key: 'apply.faq.a6', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი — გადახდები', multiline: true, default: 'ამ ეტაპზე ჯავშნა უფასოა და საკომისიოს არ ვიკავებთ — ექსპერტი სრულ თანხას იღებს. ონლაინ გადახდების ამოქმედებამდე ამის შესახებ წინასწარ შეგატყობინებთ.' },
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
  { key: 'help.faq.what-is.a', group: 'დახმარება — დაწყება', label: 'პასუხი', multiline: true, default: 'პლატფორმა, სადაც ხელით შერჩეულ ექსპერტებთან ჯავშნი ინდივიდუალურ ვიდეოკონსულტაციას — ბიზნესი, ფინანსები, კარიერა, სამართალი და სხვა.' },
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
  { key: 'help.faq.location.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'არსად მოსვლა არ გჭირდება — ყველა კონსულტაცია ონლაინ, ვიდეოსესიის ფორმატში ტარდება, პირდაპირ ბრაუზერში. საჭიროა მხოლოდ ინტერნეტი, კამერა და მიკროფონი.' },
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
  { key: 'footer.tagline', group: 'Footer', label: 'აღწერა', multiline: true, default: 'მცოდნე — ხელით შერჩეული ქართველი ექსპერტები ვიდეოსესიაზე.' },

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
  // ⚠ These sentences no longer follow PAYMENTS_LIVE. When online payments go
  // live, „0% საკომისიო" and „სრული თანხა შენია" must be re-typed HERE, in the
  // admin panel — nothing in the code will correct them.
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

  { key: 'signup.teach.pill', group: 'რეგისტრაცია — ვასწავლი', label: 'იარლიყის ტექსტი', default: 'ექსპერტის განაცხადი' },
  { key: 'signup.teach.title1', group: 'რეგისტრაცია — ვასწავლი', label: 'სათაური, 1-ლი ხაზი', default: 'გახდი მცოდნე.' },
  { key: 'signup.teach.title2', group: 'რეგისტრაცია — ვასწავლი', label: 'სათაური, აქცენტი (მწვანე)', default: 'შენი ცოდნა — შენი შემოსავალი.' },
  { key: 'signup.teach.sub', group: 'რეგისტრაცია — ვასწავლი', label: 'ქვესათაური', multiline: true, default: 'შენ ირჩევ ფასს, დროსა და თემას.' },
  { key: 'signup.teach.subEmphasis', group: 'რეგისტრაცია — ვასწავლი', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'სრული თანხა შენია.' },
  { key: 'signup.teach.stat1.n', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1', default: '0%' },
  { key: 'signup.teach.stat1.label', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1 — იარლიყი', default: 'საკომისიო' },
  { key: 'signup.teach.stat1.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1 — ქვეტექსტი', default: 'ახლა სრული თანხა შენია' },
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

// Guard: only known keys can be written from the admin API.
export function isKnownSiteTextKey(key: string): boolean {
  return key in SITE_TEXT_DEFAULTS
}
