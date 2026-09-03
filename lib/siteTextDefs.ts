// Registry of editable site texts. Pure data (no prisma) so it's safe to import
// in client components (the provider's fallback) AND on the server. Each entry's
// `default` is the exact string currently shipped; a SiteText DB row overrides
// it. To make a new string editable: add an entry here + render it with
// <SiteText k="..."/> (or useSiteText) where it appears.

import { contactCostRangeLabel } from '@/lib/credits'

export type SiteTextDef = {
  key: string
  group: string      // admin UI grouping
  label: string      // human label in the admin editor
  default: string
  multiline?: boolean
  /**
   * The surface that rendered this key was DELETED, but the key itself must
   * never be. A production SiteText row may hold copy the owner typed by hand
   * under this exact string; dropping the entry would orphan it silently and
   * for good (tests/siteTexts.test.ts §„NO KEY MAY EVER BE RENAMED OR
   * REMOVED"). Retiring instead keeps the key known — the row survives, the
   * string can never be reused for something else, and putting the section back
   * restores the text with it — while the admin editor hides the field, because
   * a control that edits a page nobody can see is exactly the dead control the
   * whole registry exists to prevent.
   *
   * ⚠️ THIS IS NOW THE ONLY REASON A KEY IS HIDDEN. A sibling field `vertical`
   * hid the keys of a vertical that was dark rather than deleted; /abroad and
   * /business were both removed on 2026-09-03, their keys are `retired`, and a
   * field with no members left is a control that lies.
   */
  retired?: true
}

import { PAGE_SEO, pageSeoKey } from '@/lib/pageSeoDefs'
import { MESSAGE_TEXTS, messageTextKey } from '@/lib/messageTextDefs'

/**
 * The SEO block, expanded from lib/pageSeoDefs so the defaults here and the
 * strings the pages actually serve cannot drift. This is what Google prints in
 * the results list and what Facebook prints under a shared link.
 *
 * /contact's DESCRIPTION is absent by design — it prints SUPPORT_EMAIL, and the
 * address has one source (lib/supportEmails) so it can never be typed two ways.
 * Its TITLE is editable like every other.
 */
/**
 * The words in every letter and text, expanded from lib/messageTextDefs.
 *
 * ⚠️ THEY LIVE IN *THIS* REGISTRY RATHER THAN A TABLE OF THEIR OWN, and that is
 * the whole point. The owner went looking for them and asked „სადა ტექსტები ვერ
 * ვნახე ადმინშში" — a second copy system with a second editor and a second set
 * of rules is one more place to look, not one fewer. Riding SITE_TEXTS means
 * the editor, the save route, the tag invalidation and the orphan report all
 * already work, and „the copy is the owner's" means the same thing on a page
 * and in an email.
 *
 * Same shape as SEO_TEXTS directly below, for the same reason.
 */
const MESSAGE_COPY: SiteTextDef[] = MESSAGE_TEXTS.flatMap(g =>
  g.texts.map(t => ({
    key: messageTextKey(g.key, t.part),
    group: `წერილი — ${g.label}`,
    label: t.vars?.length ? `${t.label}  ·  ${t.vars.map(v => `{${v}}`).join(' ')}` : t.label,
    default: t.default,
    ...(t.multiline ? { multiline: true as const } : {}),
    // A retired message's copy is retired copy — see MessageTextGroup.retired.
    ...(g.retired ? { retired: true as const } : {}),
  })),
)

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
  { key: 'home.hero.line1', group: 'მთავარი — Hero', label: 'სათაური, 1-ლი ხაზი', default: 'იპოვე ექსპერტი,', retired: true },
  { key: 'home.hero.line2', group: 'მთავარი — Hero', label: 'სათაური, აქცენტი (მწვანე)', default: 'რომელიც გააკეთებს', retired: true },
  { key: 'home.hero.subtitle', group: 'მთავარი — Hero', label: 'ქვესათაური', multiline: true, default: 'ბუღალტერი, იურისტი, ფსიქოლოგი, სანტექნიკოსი — თბილისში. ყველა პროფილი ხელით მოწმდება,', retired: true },
  // ⚠️ „მოთხოვნა უფასოა" LEFT (2026-08-20). Owner: „უფასო და ესეთი რამები, რაც
  // არაპროფესიონალურია და საიტს ნდობას უკარგავს, არ გამოიყენო." He is right and
  // so is the market: Fiverr, Upwork and Thumbtack put counts and verification
  // in this slot, never the price of asking — which only invites the question
  // „so what DOES cost?".
  { key: 'home.hero.subtitleEmphasis', group: 'მთავარი — Hero', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'ფასი პროფილზევე წერია.', retired: true },
  // ⚠️ RETIRED 2026-08-21 (the redesign — see app/_home/hero). The trust strip
  // and the ratings-fallback line belonged to the hero's stats lattice, and the
  // design canvas replaces the whole lattice with six real priced cards
  // directly underneath. The keys stay: a production row may hold copy typed
  // under these exact strings.
  { key: 'home.hero.trustChip', group: 'მთავარი — Hero', label: 'ნდობის ხაზი (პატარა, ზემოთ)', default: 'ხელით შერჩეული ბაზა', retired: true },
  { key: 'home.hero.browseAll', group: 'მთავარი — Hero', label: 'ტექსტი სანამ შეფასებები არაა', default: 'გადახედე მთელ ბაზას', retired: true },
  // ── THE ONE FIELD (2026-08-21) ──
  // The placeholder is a worked EXAMPLE, not an instruction („მაგ. …"): a
  // marketplace box that says „ძებნა" teaches nothing, and the chip rail under
  // it is the same lesson in eight more words. Keep it a real, bookable thing.
  { key: 'home.hero.searchPlaceholder', group: 'მთავარი — Hero', label: 'საძიებო ველი — მინიშნება', default: 'მაგ. ბინის დალაგება', retired: true },
  { key: 'home.hero.searchCta', group: 'მთავარი — Hero', label: 'საძიებო ველი — ღილაკი', default: 'ვეძებოთ', retired: true },
  // Read aloud, never seen — the label a screen reader announces for the field.
  // A placeholder is not a label: it vanishes the moment somebody types.
  { key: 'home.hero.searchLabel', group: 'მთავარი — Hero', label: 'საძიებო ველი — ხმოვანი წარწერა', default: 'რას ეძებ?', retired: true },

  // ── Home · Categories section ──
  // ⚠️ ONE HEADING NOW (2026-08-21). The section was an eyebrow + a heading + a
  // subtitle + a second label over a text list of every sphere; the design
  // canvas is a heading over six tiles that each carry their own expert count,
  // which says everything the three removed lines were saying in prose.
  // The four old keys are RETIRED, not reused: a production row still holds the
  // sentence „აირჩიე მიმართულება და ნახე, ვინ მუშაობს ამაზე." and printing it
  // under a grid that already answers it would be the CMS contradicting itself.
  { key: 'home.categories.eyebrow', group: 'მთავარი — კატეგორიები', label: 'პატარა იარლიყი (ზემოთ)', default: 'კატეგორიები', retired: true },
  { key: 'home.categories.title', group: 'მთავარი — კატეგორიები', label: 'სათაური', default: 'აირჩიე შენი კატეგორია', retired: true },
  { key: 'home.categories.subtitle', group: 'მთავარი — კატეგორიები', label: 'ქვესათაური', default: 'აირჩიე მიმართულება და ნახე, ვინ მუშაობს ამაზე.', retired: true },
  { key: 'home.categories.allEyebrow', group: 'მთავარი — კატეგორიები', label: 'იარლიყი კატეგორიების სიის ზემოთ', default: 'ყველა კატეგორია', retired: true },
  { key: 'home.spheres.title', group: 'მთავარი — კატეგორიები', label: 'სათაური', default: 'კატეგორიები', retired: true },

  // ── Home · Experts section ──
  // `home.experts.title` is the section h2 — but ONLY while no sphere is
  // selected. Tap a sphere and the heading becomes „{სფერო} — N ექსპერტი",
  // which is generated and cannot be edited. Worth knowing before someone
  // concludes the field is broken because their text „disappeared".
  // ⚠️ ALL FOUR RETIRED 2026-08-21. The sphere chips went with the redesign, so
  // the „selected sphere" heading, its eyebrow and the per-sphere empty state
  // describe an interaction that no longer exists on this page. The section is
  // one heading and one link now — new keys below, because a production row
  // still holds „ხელით შერჩეული ექსპერტები." under the old string and the
  // section it titles is a merged catalogue, not a roster of experts.
  { key: 'home.experts.eyebrow', group: 'მთავარი — ექსპერტები', label: 'პატარა იარლიყი (ზემოთ)', default: 'ექსპერტები', retired: true },
  { key: 'home.experts.empty', group: 'მთავარი — ექსპერტები', label: 'როცა კატეგორიაში ექსპერტი არაა', default: 'ამ კატეგორიაში ჯერ არ არის ექსპერტი', retired: true },
  { key: 'home.experts.allCta', group: 'მთავარი — ექსპერტები', label: 'ღილაკი სიის ბოლოს', default: 'ნახე ყველა ექსპერტი', retired: true },
  { key: 'home.experts.title', group: 'მთავარი — ექსპერტები', label: 'სათაური (როცა კატეგორია არჩეული არაა)', default: 'ხელით შერჩეული ექსპერტები.', retired: true },
  // „ახლა ხელმისაწვდომია" is a claim the grid under it has to keep: every card
  // is a live, listed, priced offer. If that ever stops being true, change the
  // query, not this line.
  { key: 'home.now.title', group: 'მთავარი — ახლა ხელმისაწვდომია', label: 'სათაური', default: 'ახლა ხელმისაწვდომია', retired: true },
  { key: 'home.now.allCta', group: 'მთავარი — ახლა ხელმისაწვდომია', label: 'ბმული სათაურის გვერდით', default: 'ყველა', retired: true },

  // ── Home · How it works ──
  // The WHOLE section is editable, top to bottom (2026-08-04). Before that, the
  // eyebrow, the h2, the CTA label and step 3 were hardcoded while steps 1–2
  // were not — so the admin could edit two thirds of one section and had no way
  // to tell which third was which. Half an editable section is worse than none:
  // it teaches you the panel is unreliable.
  { key: 'home.how.eyebrow', group: 'მთავარი — როგორ მუშაობს', label: 'პატარა იარლიყი (ზემოთ)', default: 'როგორ მუშაობს', retired: true },
  // Two lines on purpose — the line break is authored, not automatic. Rendered
  // with `whitespace-pre-line`, so a plain Enter in the admin textarea is the
  // line break. Keep it two lines: one long line re-wraps badly at 390px.
  { key: 'home.how.title', group: 'მთავარი — როგორ მუშაობს', label: 'სათაური (ორ ხაზად)', multiline: true, default: 'სამი ნაბიჯი —\nდა შეთავაზებები მოდის.', retired: true },
  { key: 'home.how.subtitle', group: 'მთავარი — როგორ მუშაობს', label: 'ქვესათაური', default: 'აღწერე, მიიღე, აირჩიე.', retired: true },
  { key: 'home.how.cta', group: 'მთავარი — როგორ მუშაობს', label: 'ღილაკი', default: 'მოთხოვნის დატოვება', retired: true },
  { key: 'home.how.step1.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'აღწერე რა გჭირდება', retired: true },
  { key: 'home.how.step1.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'ორიოდე კითხვა. ანგარიში არ სჭირდება.', retired: true },
  { key: 'home.how.step2.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'მიიღე შეთავაზებები', retired: true },
  { key: 'home.how.step2.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'ექსპერტები თავად წერენ ფასს და ვადას — მაქსიმუმ სამი შეთავაზება.', retired: true },
  // Step 3 has TWO versions and only one of them is on screen. These keys are
  // the PAYMENTS_LIVE=false version, which is what the site shows today. The
  // „დაცული გადახდა" version stays in code until payments actually ship —
  // an editable field for a string nobody can see is a dead control.
  { key: 'home.how.step3.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'აირჩიე და შეთანხმდი', retired: true },
  { key: 'home.how.step3.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'ნომერს მხოლოდ ის ექსპერტი ნახავს, ვისაც აირჩევ.', retired: true },

  // ── Home · How it works, THE BROWSE FLOW (2026-08-21) ──
  // ⚠️ NEW KEYS, NOT THE `home.how.*` ONES ABOVE, and that is the whole point.
  // Those nine describe the REQUEST funnel („აღწერე რა გჭირდება → მიიღე
  // შეთავაზებები"), a production row holds the owner's own wording under each,
  // and the section they titled is now three steps about choosing from a priced
  // list. Reusing the key would print the request wording under a heading about
  // browsing — the CMS lying, quietly, on the busiest page on the site. The old
  // rows survive untouched and come back with the section if it ever returns.
  { key: 'home.steps.title', group: 'მთავარი — როგორ მუშაობს', label: 'სათაური', default: 'როგორ მუშაობს', retired: true },
  { key: 'home.steps.s1.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'აირჩიე', retired: true },
  { key: 'home.steps.s1.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'ფასი პროფილზე წერია — ხედავ და ირჩევ, არაფერს ელოდები.', retired: true },
  { key: 'home.steps.s2.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'შეთანხმდი', retired: true },
  { key: 'home.steps.s2.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'დეტალებს პირდაპირ ექსპერტთან აზუსტებ. თუ დრო სჭირდება — საათსაც ირჩევ.', retired: true },
  { key: 'home.steps.s3.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'შესრულდა', retired: true },
  // ⚠️ THE SECOND SENTENCE WAS A PROMISE ABOUT CONTACT (2026-08-21). „კონტაქტს
  // მხოლოდ არჩეული იღებს" was true until the phone number stopped being
  // released to anybody (lib/requests → clientIdentityOpen). THE LIVE PAGE MAY
  // STILL SAY THE OLD SENTENCE: this is only the default, and a `SiteText` row
  // overrides it — that row has to be edited in /admin the day this ships, not
  // before, because until then the deployed code still shows the number.
  { key: 'home.steps.s3.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'სამუშაო სრულდება შეთანხმებულ ფასში. ყველაფერს მიმოწერაში თანხმდებით.', retired: true },

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
  { key: 'home.expertCta.eyebrow', group: 'მთავარი — გახდი ექსპერტი', label: 'პატარა იარლიყი (ზემოთ)', default: 'ექსპერტებისთვის', retired: true },
  { key: 'home.expertCta.title', group: 'მთავარი — გახდი ექსპერტი', label: 'სათაური (1-ლი ხაზი)', default: 'მიიღე კლიენტები.', retired: true },
  { key: 'home.expertCta.body', group: 'მთავარი — გახდი ექსპერტი', label: 'ტექსტი სათაურის ქვეშ', multiline: true, default: 'შენ ადგენ ფასს, დროსა და მოცულობას. დანარჩენს ჩვენ ვუვლით.', retired: true },
  { key: 'home.expertCta.cta', group: 'მთავარი — გახდი ექსპერტი', label: 'ღილაკი', default: 'შემოგვიერთდი', retired: true },

  // ── Home · the supply band (2026-08-21) ──
  // ⚠️ THE BUTTON'S LABEL IS NOT HERE, and must not be added. „დაარეგისტრირე
  // სერვისი" is `JOIN_DOOR_LABEL` in lib/capabilities, shared with the header
  // and the footer: the site's three supply links say one thing and point at
  // one door. An editable fourth copy is exactly how „გახდი ექსპერტი" outlived
  // its own retirement in one corner of the site.
  // The four `home.expertCta.*` keys above are retired for the usual reason —
  // their rows hold the old pitch („მიიღე კლიენტები." / „შენ ადგენ ფასს…"),
  // which is about a consultation practice; this band sells listing a SERVICE.
  { key: 'home.supply.title', group: 'მთავარი — დაარეგისტრირე სერვისი', label: 'სათაური', default: 'შენი სერვისი — შენი ფასი', retired: true },
  { key: 'home.supply.body', group: 'მთავარი — დაარეგისტრირე სერვისი', label: 'ტექსტი სათაურის ქვეშ', multiline: true, default: 'დაარეგისტრირე რასაც აკეთებ და დაწერე ფასი. კლიენტი ბარათიდანვე ხედავს, რას ყიდი და რა ღირს.', retired: true },
  // How long it takes, beside the button. Two words, and they answer the one
  // objection („not now") before it is formed.
  { key: 'home.supply.note', group: 'მთავარი — დაარეგისტრირე სერვისი', label: 'ღილაკის გვერდით — რამდენი დრო', default: '2 წუთი' },

  /* ═══════════════════════════════════════════════════════════════════════
   * THE 2026-08-31 REDESIGN — the owner's design canvas („mcodne.ge პროფილის
   * რედიზაინი"), ported screen by screen.
   *
   * ⚠️ EVERY KEY BELOW IS NEW, AND NOT ONE OF THEM REUSES AN OLD ONE. That is
   * the rule this file has followed twice before and it is not tidiness: the
   * LIVE site reads the `SiteText` TABLE, and those rows still hold the
   * previous wording. Reusing `home.hero.line1` would print „იპოვე ექსპერტი,"
   * — a browse headline — over a hero whose one button files a request. The
   * superseded keys are marked `retired: true` above rather than deleted,
   * because a production row is keyed by them.
   *
   * ⚠️ NO COMMISSION SENTENCE ANYWHERE IN HERE. Owner, 2026-08-31:
   * „საკომისიოები არასდ [არასდროს] დაწერო." The canvas's „0% საკომისიო
   * სამუშაოს ფასიდან" and „საკომისიოს არც ექსპერტს ვართმევთ" are both gone.
   * /terms is untouched — that copy is legal and the owner's.
   * ═══════════════════════════════════════════════════════════════════════ */

  // ── Home — the hero, which is the intake ──
  { key: 'home.ask.line1', group: 'მთავარი — Hero', label: 'სათაური, 1-ლი ხაზი', default: 'დაწერე, რა გჭირდება.' },
  { key: 'home.ask.line2', group: 'მთავარი — Hero', label: 'სათაური, მე-2 ხაზი', default: 'ფასს თავად შემოგთავაზებენ.' },
  // ⚠️ RETIRED 2026-08-31 BY THE OWNER („ესეც წაშალე"). The hero card is a
  // headline, a field and four steps now; the sub-line said in a sentence what
  // step 01 says with a drawing over it. The row stays — it may hold copy
  // somebody typed by hand — and the key is skipped in the admin editor.
  { key: 'home.ask.sub', group: 'მთავარი — Hero', label: 'ქვესათაური', multiline: true, default: 'ერთი წინადადება კმარა. მოთხოვნა უფასოა და არაფერს გავალდებულებს.', retired: true },
  { key: 'home.ask.placeholder', group: 'მთავარი — Hero', label: 'ველი — მინიშნება', default: 'რა უნდა გაკეთდეს?' },
  // ⚠️ A LABEL, NOT A SECOND PLACEHOLDER. It is `sr-only`, and it exists
  // because a placeholder disappears the moment somebody types — a screen
  // reader announcing „edit text, blank" is describing a control nobody can use.
  { key: 'home.ask.label', group: 'მთავარი — Hero', label: 'ველი — ხმოვანი წარწერა', default: 'რა უნდა გაკეთდეს?' },
  { key: 'home.ask.cta', group: 'მთავარი — Hero', label: 'ველის ღილაკი', default: 'ფასის მოთხოვნა' },
  // ⚠️ RETIRED 2026-08-31 WITH THE CHIPS IT LABELLED („ეს წაშალე და ხაზი").
  { key: 'home.ask.examplesLabel', group: 'მთავარი — Hero', label: 'მაგალითების წინ', default: 'მაგალითად:', retired: true },

  // ── Home — the category tiles ──
  { key: 'home.tiles.title', group: 'მთავარი — კატეგორიები', label: 'სათაური', default: 'რაში ეხმარებიან ხშირად' },
  { key: 'home.tiles.allCta', group: 'მთავარი — კატეგორიები', label: 'ბმული სათაურის გვერდით', default: 'ყველა კატეგორია' },
  { key: 'home.tiles.allTile', group: 'მთავარი — კატეგორიები', label: 'ბოლო ფილა', default: 'ყველა სერვისი' },
  // ⚠️ THE EIGHTH TILE (2026-08-31). The grid is 4×2 and six spheres are
  // populated, so with the catalogue door it stood at seven and one hole. The
  // hole could not be filled with a seventh SPHERE — measured that day, every
  // remaining category has 0 experts and is HIDDEN, and a tile that opens „ვერ
  // ვიპოვეთ" is the dead end the count line exists to prevent. So the eighth
  // door is the site's own action: the visitor who does not see their sphere
  // among six should be describing what they need, not filtering an empty list.
  // Both defaults are the owner's existing words — the top bar's CTA and the
  // home page's own title — rather than new copy written here.
  { key: 'home.tiles.askTile', group: 'მთავარი — კატეგორიები', label: 'მოთხოვნის ფილა', default: 'მოთხოვნის გაგზავნა' },
  { key: 'home.tiles.askMeta', group: 'მთავარი — კატეგორიები', label: 'მოთხოვნის ფილა — ქვეწარწერა', default: 'აღწერე რა გჭირდება' },

  // ── Home — the three steps ──
  // ⚠️ THEY DESCRIBE THE REQUEST AGAIN. `home.steps.*` (retired above) describe
  // BROWSING — they were rewritten that way on 2026-08-21 when the hero became
  // a search box. The hero is the intake again, so the steps are again about
  // what happens after that button. „3-მდე" is `DEFAULT_OFFER_LIMIT`
  // (lib/requests), not a marketing number.
  /* ⚠️ TWO OF THIS GROUP ARE RETIRED, NOT DELETED (2026-08-31). The four steps
   * moved ONTO the hero card (app/_home/how.tsx → FlowSteps), where they sit
   * under the search field with no section heading of their own and no line
   * beside a button — so „როგორ მუშაობს" as an h2 and „კლიენტისთვის სრულიად
   * უფასოა." have no surface left. `retired` is this file's word for exactly
   * that: the key stays, a production SiteText row typed under it stays
   * readable, and only the admin editor stops offering it. „ფასის მოთხოვნა"
   * goes with them: the card's own button is `home.ask.cta`, which says the
   * same words one surface up, and two editable copies of one label is how the
   * two come to disagree. The eight step keys below are LIVE and are what the
   * card prints. */
  { key: 'home.flow.title', group: 'მთავარი — როგორ მუშაობს', label: 'სათაური', default: 'როგორ მუშაობს', retired: true },
  // ⚠️ FOUR STEPS SINCE 2026-08-31, AND THE WORDS ARE THE OWNER'S OWN — pasted
  // into the session verbatim, numbered 01–04. It was three, from the design
  // canvas; this splits „choose" into COMPARE and START, which is the honest
  // shape of the journey: comparing offers and then working with the person you
  // picked are two different acts, and the second one is where the phone number
  // opens. No key here has a SiteText row yet (these were created today), so
  // the defaults ARE what the live page prints — changing them here changes it.
  /* ⚠️ „აღწერე, რა გჭირდება" IS THE OWNER'S OWN WORDING, pasted into the
   * session as step 01 of four. It was briefly shortened to „აღწერე მოთხოვნა"
   * on a real argument — the card's headline two hundred pixels above says
   * „დაწერე, რა გჭირდება", so the long form repeats it — but the owner's copy
   * is the owner's copy, and the two verbs are not the same word. If the
   * repetition ever grates, the line to change is the HEADLINE's, not this one:
   * this is the step, and steps are what somebody reads to find out what
   * happens next. */
  { key: 'home.flow.s1.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'აღწერე, რა გჭირდება' },
  { key: 'home.flow.s1.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'დაწერე, რაში გჭირდება დახმარება.' },
  { key: 'home.flow.s2.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'მიიღე შეთავაზებები' },
  { key: 'home.flow.s2.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'ექსპერტები გაეცნობიან მოთხოვნას და შეთავაზებას გამოგიგზავნიან.' },
  { key: 'home.flow.s3.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'შეადარე და აირჩიე' },
  /* ⚠️ „შეფასებები" LEFT THIS SENTENCE (2026-09-02), AND THE FEATURE DID NOT.
     `Review` is a real model, /experts has a „მინ. რეიტინგი" filter, and the
     provider card is written to show a rating the day one exists. Measured
     2026-09-02: the table holds ZERO rows. So step 3 was telling every visitor
     to compare something no card on the site can show, three scrolls above the
     grid that cannot show it.

     The filter already handles this correctly — `ratingUseless(facets)` hides
     it while there is nothing to filter by — and this line is the same rule
     applied to the copy. It goes back the day reviews exist. */
  { key: 'home.flow.s3.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'შეადარე ფასები და გამოცდილება, აირჩიე ექსპერტი.' },
  { key: 'home.flow.s4.title', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 4 — სათაური', default: 'დაიწყე თანამშრომლობა' },
  { key: 'home.flow.s4.desc', group: 'მთავარი — როგორ მუშაობს', label: 'ნაბიჯი 4 — აღწერა', multiline: true, default: 'დაუკავშირდი ექსპერტს და დაიწყე.' },
  { key: 'home.flow.free', group: 'მთავარი — როგორ მუშაობს', label: 'ღილაკის გვერდით', default: 'კლიენტისთვის სრულიად უფასოა.', retired: true },
  { key: 'home.flow.cta', group: 'მთავარი — როგორ მუშაობს', label: 'ღილაკი', default: 'ფასის მოთხოვნა', retired: true },


  // ── Home — the roster, which is the SECOND door ──
  // ⚠️ „ან" IS THE WHOLE HEADING. This section used to lead the page; it is now
  // the alternative for somebody who would rather choose than describe.
  // The subtitle promises the PRICE only. The canvas also promised „პასუხის
  // სიჩქარე", and the reply chip beside it is measured (lib/responseStats) —
  // so most cards carry none of it yet, and a heading must not promise what
  // most of the grid under it cannot show.
  { key: 'home.pick.title', group: 'მთავარი — ექსპერტები', label: 'სათაური', default: 'ან პირდაპირ აირჩიე' },
  { key: 'home.pick.sub', group: 'მთავარი — ექსპერტები', label: 'ქვესათაური', default: 'ფასი თავიდანვე ჩანს' },
  { key: 'home.pick.allCta', group: 'მთავარი — ექსპერტები', label: 'ბმული სათაურის გვერდით', default: 'კატალოგი' },

  // ── Home — the closing supply band ──
  // ⚠️ THE BUTTON'S WORD IS NOT HERE. „დაარეგისტრირე სერვისი" is
  // `JOIN_DOOR_LABEL` in lib/capabilities, shared with the header and the
  // footer: the site's three supply links say one thing and point at one door.
  // ⚠️ THE PRICE IN THE BODY IS INTERPOLATED, and it is interpolated because it
  // was TYPED here until 2026-09-02 and went stale. The price moved 1₾ → 3₾ on
  // 2026-09-01 (the owner's design canvas → „Expert Jobs"); `ClosingBand`'s
  // tile reads the constant and printed 3₾, this line did not and printed 1₾ —
  // two prices for one thing, forty pixels apart, on the page that recruits
  // providers, with 3₾ actually charged. lib/credits already says the rule this
  // line was breaking: „THE PRICE IS SPELLED ONCE, HERE, NEVER ON A SCREEN."
  // ⚠️ The sentence is
  // the product's own rule (lib/credits → CONTACT_COST_NOTE), not the canvas's
  // „1₾ როცა კლიენტი გიპასუხებს" — the charge fires when the PROVIDER opens the
  // client's contact, which is a different moment and a different promise.
  { key: 'home.supply2.eyebrow', group: 'მთავარი — დაარეგისტრირე სერვისი', label: 'პატარა იარლიყი', default: 'ექსპერტებისთვის' },
  { key: 'home.supply2.title', group: 'მთავარი — დაარეგისტრირე სერვისი', label: 'სათაური', default: 'დაარეგისტრირე სერვისი და იმუშავე შენი ფასით' },
  { key: 'home.supply2.body', group: 'მთავარი — დაარეგისტრირე სერვისი', label: 'ტექსტი სათაურის ქვეშ', multiline: true, default: `შეთავაზების გაგზავნა უფასოა. კლიენტის კონტაქტი ${contactCostRangeLabel()} ღირს — ერთხელ იხდი, მერე ყოველთვის გიჩანს.` },

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
  { key: 'blog.subtitle', group: 'ბლოგი', label: 'ქვესათაური', multiline: true, default: 'პრაქტიკული სახელმძღვანელოები ქართველი ექსპერტებისგან.' },
  { key: 'blog.empty.badge', group: 'ბლოგი', label: 'ცარიელი გვერდი — აბრა', default: 'მალე გამოვა' },
  { key: 'blog.empty.title', group: 'ბლოგი', label: 'ცარიელი გვერდი — სათაური', default: 'ბლოგი მალე ამოქმედდება' },
  { key: 'blog.empty.body', group: 'ბლოგი', label: 'ცარიელი გვერდი — ტექსტი', multiline: true, default: 'პირველი სტატიები მზადდება. დაგვიკავშირდი და შეგატყობინებთ გამოსვლისას.' },
  { key: 'blog.empty.cta', group: 'ბლოგი', label: 'ცარიელი გვერდი — ღილაკი', default: 'მაცნობე გამოსვლისას' },

  // ── About page ──
  { key: 'about.hero.title', group: 'ჩვენ შესახებ', label: 'სათაური', default: 'ცოდნა, რომელსაც შენ ენდობი' },
  { key: 'about.hero.body', group: 'ჩვენ შესახებ', label: 'შესავალი', multiline: true, default: 'ბევრი ეძებს ექსპერტს, ვისაც ენდობა. მცოდნე გაკავშირებს გამოცდილთან.' },
  { key: 'about.principles.title', group: 'ჩვენ შესახებ', label: 'პრინციპები — სათაური', default: 'ჩვენი პრინციპები' },
  /* ⚠️ RETIRED 2026-09-02 — the verification claim, measured false. 1 of 26
     published providers carries the ✓, and the whole ProviderApplication table
     holds THREE rows (2 approved), so „ხელით ვამოწმებთ გამოცდილებას,
     პორტფოლიოსა და რეპუტაციას" described a process almost nobody went through.
     It is the same claim removed from the site description, the OG cards and
     the sign-in screen on the same day. Kept as keys, never deleted: a
     production SiteText row may hold copy typed under them. */
  { key: 'about.value1.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 1 — სათაური', default: 'გადამოწმებული ცოდნა', retired: true },
  { key: 'about.value1.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 1 — ტექსტი', multiline: true, default: 'ხელით ვამოწმებთ გამოცდილებას, პორტფოლიოსა და რეპუტაციას.', retired: true },
  { key: 'about.value2.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 2 — სათაური', default: 'გამჭვირვალე ფასი' },
  /* ⚠️ „დაცული გადახდები — მალე." CAME OFF THIS LINE (2026-09-02). `PAYMENTS_LIVE`
     is false and carries no date, so „მალე" was a promise nobody could keep or
     check — the one kind of sentence CLAUDE.md rule 6 is about. The first half
     is true today and stays. */
  { key: 'about.value2.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 2 — ტექსტი', multiline: true, default: 'ფასი შეთავაზებაშივე წერია — ფარული დანამატები არ არის.' },
  /* ⚠️ RETIRED 2026-09-02 — it said principle 2 again. „ფასი წინასწარ
     ცნობილია" is „ფასი შეთავაზებაშივე წერია" in other words, one card to the
     left, and the rest („სამუშაო კონკრეტულია და შედეგზე ორიენტირებული") is a
     sentence that cannot be false and therefore says nothing. */
  { key: 'about.value3.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 3 — სათაური', default: 'ღირებული დრო', retired: true },
  { key: 'about.value3.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 3 — ტექსტი', multiline: true, default: 'ფასი წინასწარ ცნობილია. სამუშაო კონკრეტულია და შედეგზე ორიენტირებული.', retired: true },
  { key: 'about.value4.title', group: 'ჩვენ შესახებ', label: 'პრინციპი 4 — სათაური', default: 'ქართული საზოგადოება' },
  { key: 'about.value4.body', group: 'ჩვენ შესახებ', label: 'პრინციპი 4 — ტექსტი', multiline: true, default: 'ცოდნა ქართულად — ბიზნესი, სამართალი, კარიერა, ფსიქოლოგია.' },
  { key: 'about.create.title', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — სათაური', default: 'პირდაპირი წვდომა ცოდნაზე' , retired: true },
  { key: 'about.create.p1', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — აბზაცი 1', multiline: true, default: 'კარგი კონსულტაცია ძნელი საპოვნია — ცოდნა არსებობს, მაგრამ ხელმისაწვდომი არაა. მცოდნე ამ ხარვეზს ავსებს.' , retired: true },
  { key: 'about.create.p2', group: 'ჩვენ შესახებ', label: 'რას ვქმნით — აბზაცი 2', multiline: true, default: 'გაკავშირებთ ქართველ ექსპერტთან — სამუშაოზე, რომელიც გჭირდება, ან წინასწარ კონსულტაციაზე.' , retired: true },
  { key: 'about.cta.title', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — სათაური', default: 'ხარ ექსპერტი? გვინდა შენი ცოდნა' },
  { key: 'about.cta.body', group: 'ჩვენ შესახებ', label: 'ექსპერტის CTA — ტექსტი', multiline: true, default: 'გაქვს გამოცდილება? შემოგვიერთდი — განაცხადს 24–48 საათში განვიხილავთ.' },

  // ── /about — „როგორ მუშაობს", the owner's „How It Works + Help" canvas ───
  //
  // ⚠️ THE HEADER HAS NAMED /about „როგორ მუშაობს" ALL ALONG and the page never
  // answered the question — it opened on „ცოდნა, რომელსაც შენ ენდობი" and went
  // straight to principles. The canvas puts the answer first: a green card, a
  // კლიენტს/ექსპერტს switch, and the numbered steps under it. Everything that
  // was on the page is still on it, below the closing band — none of these keys
  // replaces one, they are added beside them („თუ აკლია რამე დამატე, არ
  // წაშალო").
  { key: 'about.how.title', group: 'როგორ მუშაობს', label: 'სათაური (მწვანე ბარათი)', default: 'როგორ მუშაობს' },
  { key: 'about.how.body', group: 'როგორ მუშაობს', label: 'ქვესათაური (მწვანე ბარათი)', multiline: true, default: 'ჩვენი საქმე დაკავშირებაა. ფასს და დეტალებს თქვენ ათანხმებთ.' },
  // ⚠️ THE CLIENT'S STEPS ARE NOT HERE, AND THAT IS THE POINT. They are
  // `home.flow.s1…s4`, rendered on the home page's green card since 2026-08-31
  // — the same four sentences telling the same story. A fifth copy of them
  // under an `about.*` key would be a second thing to edit and a second thing
  // to forget; the owner edits „აღწერე, რა გჭირდება" ONCE.
  //
  // The provider's side has no existing copy anywhere, so it gets its own keys.
  // ⚠️ NO COMMISSION SENTENCE. The canvas's third step ends „სამუშაოს ფასიდან
  // საკომისიოს არ ვიღებთ" and the owner has not decided the commission question
  // („ჯერ არ გადავწყვიტოთ"); it is written nowhere on the site and this is not
  // where it starts.
  { key: 'about.provider.s1.title', group: 'როგორ მუშაობს', label: 'ექსპერტს · ნაბიჯი 1 — სათაური', default: 'დაარეგისტრირე სერვისი' },
  { key: 'about.provider.s1.desc', group: 'როგორ მუშაობს', label: 'ექსპერტს · ნაბიჯი 1 — აღწერა', multiline: true, default: 'აირჩიე, რას აკეთებ, და დაადე საორიენტაციო ფასი. 2 წუთი.' },
  { key: 'about.provider.s2.title', group: 'როგორ მუშაობს', label: 'ექსპერტს · ნაბიჯი 2 — სათაური', default: 'მიიღე მოთხოვნები' },
  { key: 'about.provider.s2.desc', group: 'როგორ მუშაობს', label: 'ექსპერტს · ნაბიჯი 2 — აღწერა', multiline: true, default: 'მოთხოვნები მხოლოდ შენს სერვისებზე მოგდის. შეთავაზების გაგზავნა უფასოა.' },
  { key: 'about.provider.s3.title', group: 'როგორ მუშაობს', label: 'ექსპერტს · ნაბიჯი 3 — სათაური', default: 'გადაიხადე მხოლოდ პასუხზე' },
  // ⚠️ THE THIRD STEP HAS NO `desc` KEY, AND THAT IS DELIBERATE. Its sentence
  // quotes a PRICE — the canvas writes „1₾ ჩამოგეჭრება…" — and lib/credits
  // states the rule for that number: „THE PRICE IS SPELLED ONCE, HERE, NEVER ON
  // A SCREEN." So the page renders `CONTACT_COST_NOTE` + `CONTACT_REFUND_NOTE`
  // straight out of lib/credits, exactly as the provider's own screens do. An
  // editable copy would freeze today's lari into a database row and keep
  // printing it after a re-price, with nothing reporting the drift — the same
  // reasoning as `HELP_LOCKED_ANSWER_IDS`.
  // The closing band, one per side. The EXPERT side reuses `about.cta.title` /
  // `about.cta.body` above — „ხარ ექსპერტი? გვინდა შენი ცოდნა" is already
  // exactly this band's copy, and the owner has typed a row under those keys.
  { key: 'about.cta.client.title', group: 'როგორ მუშაობს', label: 'კლიენტს · დასასრული — სათაური', default: 'დაწერე მოთხოვნა' },
  { key: 'about.cta.client.body', group: 'როგორ მუშაობს', label: 'კლიენტს · დასასრული — ტექსტი', multiline: true, default: 'ერთი წინადადება — ფასს თავად შემოგთავაზებენ.' },
  { key: 'about.cta.client.button', group: 'როგორ მუშაობს', label: 'კლიენტს · დასასრული — ღილაკი', default: 'ფასის მოთხოვნა' },
  { key: 'about.cta.expert.button', group: 'როგორ მუშაობს', label: 'ექსპერტს · დასასრული — ღილაკი', default: 'რეგისტრაცია' },

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
  /* ⚠️ RETIRED 2026-08-31, NOT DELETED. The guest door stopped asking the
   * profession — /join is one page on both sides of the sign-up wall now
   * (app/join/_door/PublicDoor explains what the screen was and why the answer
   * was worth nothing) — so the eyebrow above the h1 and the bolded question
   * above the picker have no surface left. A production SiteText row may hold
   * copy typed under either key; `retired` keeps the key and the row and only
   * hides it from ადმინი → ტექსტები. */
  { key: 'join.hero.eyebrow', group: 'რეგისტრაცია — კარი', label: 'პატარა იარლიყი', default: 'ექსპერტებისთვის', retired: true },
  { key: 'join.hero.body', group: 'რეგისტრაცია — კარი', label: 'ტექსტი სათაურის ქვეშ', multiline: true, default: 'მიიღე კლიენტები. ფასს, დროსა და მოცულობას შენ ადგენ.' },
  { key: 'join.hero.ask', group: 'რეგისტრაცია — კარი', label: 'ხაზი ამომრჩევის ზემოთ', default: 'აირჩიე, რას აკეთებ.', retired: true },
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
  // ⚠️ RETIRED 2026-08-24, NOT DELETED — the six keys below plus the three
  // under „დასასრული". They were the /apply landing page: its hero (eyebrow,
  // title, body, two buttons, the note under them) and its closing call to
  // action. /apply WAS the consultation expert's application and went with the
  // consultation product; /join is the one door now and draws its own opening
  // from app/join/_door. The REST of this group still renders there — „როგორ
  // მუშაობს", „ვის ვეძებთ", „რას იღებ" and „კითხვები" are all live on /join —
  // which is why only these nine carry the flag.
  //
  // Retired rather than removed because a production SiteText row may hold copy
  // the owner typed under exactly these strings: the row survives, the key can
  // never be reused for something else, putting the section back restores the
  // text with it, and the admin editor stops showing a control that edits a page
  // nobody can open.
  { key: 'apply.hero.eyebrow', group: 'გახდი ექსპერტი — შესავალი', label: 'პატარა იარლიყი', default: 'ექსპერტებისთვის', retired: true },
  { key: 'apply.hero.title', group: 'გახდი ექსპერტი — შესავალი', label: 'სათაური', default: 'გახდი ექსპერტი მცოდნეზე', retired: true },
  { key: 'apply.hero.body', group: 'გახდი ექსპერტი — შესავალი', label: 'შესავალი ტექსტი', multiline: true, default: 'შენი გამოცდილება ვიღაცის პასუხგაუცემელი კითხვაა. მცოდნე ქართველ სპეციალისტებს აკავშირებს იმ ადამიანებთან, რომლებსაც კონკრეტულ საკითხზე პასუხი სჭირდებათ — ერთსაათიან ონლაინ კონსულტაციაზე, შენს მიერ დადგენილ დროსა და ფასად.', retired: true },
  { key: 'apply.hero.ctaPrimary', group: 'გახდი ექსპერტი — შესავალი', label: 'მთავარი ღილაკი', default: 'დაიწყე განაცხადი', retired: true },
  { key: 'apply.hero.ctaSecondary', group: 'გახდი ექსპერტი — შესავალი', label: 'მეორე ღილაკი', default: 'უკვე გაქვს ანგარიში?', retired: true },
  { key: 'apply.hero.note', group: 'გახდი ექსპერტი — შესავალი', label: 'პატარა ხაზი ღილაკების ქვეშ', multiline: true, default: 'რეგისტრაცია 2 წუთია · განაცხადს ინდივიდუალურად განვიხილავთ 24–48 საათში', retired: true },

  { key: 'apply.how.eyebrow', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'პატარა იარლიყი', default: 'როგორ მუშაობს' },
  { key: 'apply.how.step1.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 1 — სათაური', default: 'შეავსე განაცხადი' },
  { key: 'apply.how.step1.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'შეავსე მოკლე ინფორმაცია შენს შესახებ, აირჩიე მიმართულება და მიუთითე ფასი.' },
  { key: 'apply.how.step2.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 2 — სათაური', default: 'ჩვენ გადავხედავთ' },
  { key: 'apply.how.step2.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'თითოეულ განაცხადს დეტალურად განვიხილავთ და პასუხს 24–48 საათში მიიღებ.' },
  // ⚠️ IT READ „გამოაქვეყნე თავისუფალი დრო" UNTIL 2026-08-29, AND ITS OWN
  // DESCRIPTION HAD ALREADY STOPPED AGREEING WITH IT. Publishing availability
  // was the booking product's third step; that product went on 2026-08-24 and
  // step 3's `desc` was updated to what actually happens („კლიენტების
  // მოთხოვნებს მიიღებ — შეთავაზებას თავად აგზავნი"), while the TITLE above it
  // was not. So the recruiting page told every applicant that the first thing
  // they would do after approval is publish free time — a screen that does not
  // exist — with the correction printed underneath in smaller type.
  //
  // The new title is taken from the description's own words rather than
  // written: what the step IS, is receiving requests.
  //
  // ⚠️ THE DEFAULT IS HALF THE FIX. The live site reads the `SiteText` ROW and
  // falls back here only when there is none — run
  // `scripts/sitetext-step3-2026-08-29.ts`, or edit the key in
  // ადმინი → ტექსტები.
  { key: 'apply.how.step3.title', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 3 — სათაური', default: 'მიიღე მოთხოვნები' },
  { key: 'apply.how.step3.desc', group: 'გახდი ექსპერტი — როგორ მუშაობს', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'დამტკიცების შემდეგ მოთხოვნებს მიიღებ და შეთავაზებას თავად აგზავნი.' },

  { key: 'apply.who.eyebrow', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'პატარა იარლიყი', default: 'ვის ვეძებთ' },
  // One profession per LINE. Empty lines are ignored, so the list length is
  // edited by pressing Enter — no code change to add or drop a row.
  { key: 'apply.who.list', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'სია — ერთი პროფესია ერთ ხაზზე', multiline: true, default: 'ბუღალტერი ან საგადასახადო კონსულტანტი\nიურისტი\nფინანსისტი\nმარკეტოლოგი\nბიზნესის ან კარიერის კონსულტანტი\nHR, IT, პროდაქტ-მენეჯერი ან დიზაინის სპეციალისტი\nფსიქოლოგი\nუძრავი ქონების, რელოკაციის ან კრიპტოს ექსპერტი' },
  { key: 'apply.who.note', group: 'გახდი ექსპერტი — ვის ვეძებთ', label: 'ხაზი სიის ქვეშ', multiline: true, default: 'თუ შენი მიმართულება სიაში არ არის, დაამატე განაცხადში.' },

  { key: 'apply.get.eyebrow', group: 'გახდი ექსპერტი — რას იღებ', label: 'პატარა იარლიყი', default: 'რას იღებ' },
  { key: 'apply.get.card1.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 1 — სათაური', default: 'ფასს შენ ადგენ' },
  { key: 'apply.get.card1.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 1 — ტექსტი', multiline: true, default: 'თითოეულ სერვისს ცალ-ცალკე მიუთითე ფასი — კლიენტი ზუსტად შენ მიერ განსაზღვრულ ფასს დაინახავს.' },
  { key: 'apply.get.card2.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 2 — სათაური', default: 'დროც შენია' },
  { key: 'apply.get.card2.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 2 — ტექსტი', multiline: true, default: 'მოცულობასა და ვადას თითოეულ შეთავაზებაში შენ წერ — რასაც ვერ ასწრებ, უბრალოდ არ პასუხობ.' },
  { key: 'apply.get.card3.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 3 — სათაური', default: 'პროფილი ძებნაში' },
  { key: 'apply.get.card3.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 3 — ტექსტი', multiline: true, default: 'დამტკიცების შემდეგ ჩნდები კატალოგსა და შენი კატეგორიის გვერდზე.' },
  // Card 4 was PAYMENTS_LIVE-branched with a COMMISSION_PCT template until
  // 2026-08-05. ⚠ It no longer follows the flag — re-type it here when paid
  // bookings ship.
  { key: 'apply.get.card4.title', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 4 — სათაური', default: 'საკომისიო' },
  { key: 'apply.get.card4.body', group: 'გახდი ექსპერტი — რას იღებ', label: 'ბარათი 4 — ტექსტი', multiline: true, default: 'ფასს შენ ადგენ.' },

  { key: 'apply.faq.eyebrow', group: 'გახდი ექსპერტი — კითხვები', label: 'პატარა იარლიყი', default: 'ხშირად დასმული კითხვები' },
  { key: 'apply.faq.q1', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 1', default: 'რა მჭირდება დასაწყებად?' },
  { key: 'apply.faq.a1', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 1', multiline: true, default: 'რეალური გამოცდილება შენს მიმართულებაში. განაცხადს ხელით ვამოწმებთ.' },
  { key: 'apply.faq.q2', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 2', default: 'რამდენი დრო სჭირდება განაცხადს?' },
  { key: 'apply.faq.a2', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 2', multiline: true, default: 'რამდენიმე წუთი. დანარჩენს — ვიდეო, სერტიფიკატები, ბმულები — პროფილში ავსებ დამტკიცების შემდეგ.' },
  { key: 'apply.faq.q3', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 3', default: 'ვინ ადგენს ფასს?' },
  { key: 'apply.faq.a3', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 3', multiline: true, default: 'შენ. ფასს თითოეულ სერვისზე ცალკე ადგენ და კლიენტი მას წინასწარ ხედავს.' },
  { key: 'apply.faq.q4', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 4', default: 'როგორ სრულდება სამუშაო?' },
  { key: 'apply.faq.a4', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 4', multiline: true, default: 'ადგილზე შესასრულებელი — კლიენტის მისამართზე. დანარჩენს კლიენტთან ათანხმებ.' },
  // Q6 is the money question. It sits FOURTH on the page (see ApplyMarketing's
  // FAQ array) but is numbered 6 because keys may never be renumbered — its
  // predecessor was hardcoded, so there is simply no q6 row anywhere yet.
  { key: 'apply.faq.q6', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა — გადახდები', default: 'რა ხდება გადახდებთან დაკავშირებით?' },
  { key: 'apply.faq.a6', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი — გადახდები', multiline: true, default: 'ონლაინ გადახდები ჯერ არ ამოქმედებულა — როცა ამოქმედდება, წინასწარ შეგატყობინებთ.' },
  { key: 'apply.faq.q5', group: 'გახდი ექსპერტი — კითხვები', label: 'კითხვა 5', default: 'შემიძლია დატვირთვა თავად განვსაზღვრო?' },
  { key: 'apply.faq.a5', group: 'გახდი ექსპერტი — კითხვები', label: 'პასუხი 5', multiline: true, default: 'დიახ. რომელ მოთხოვნას უპასუხებ, შენ წყვეტ, ვადას კი შეთავაზებაში წერ. ნებისმიერ დროს შეგიძლია პროფილი პაუზაზე დააყენო.' },

  { key: 'apply.cta.title', group: 'გახდი ექსპერტი — დასასრული', label: 'სათაური', default: 'მზად ხარ?', retired: true },
  { key: 'apply.cta.body', group: 'გახდი ექსპერტი — დასასრული', label: 'ტექსტი', multiline: true, default: 'განაცხადი ორ ეკრანზეა და რამდენიმე წუთს წაიღებს.', retired: true },
  { key: 'apply.cta.button', group: 'გახდი ექსპერტი — დასასრული', label: 'ღილაკი', default: 'დაიწყე განაცხადი', retired: true },

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
  { key: 'help.faq.what-is.a', group: 'დახმარება — დაწყება', label: 'პასუხი', multiline: true, default: 'პლატფორმა, სადაც აღწერ რა გჭირდება და ექსპერტები შეთავაზებას გამოგიგზავნიან.' },
  { key: 'help.faq.find-expert.q', group: 'დახმარება — დაწყება', label: 'კითხვა', default: 'როგორ ვიპოვო შესაფერისი ექსპერტი?' },
  /* ⚠️ THIS ANSWER PROMISED THREE THINGS AND TWO OF THEM WERE EMPTY
     (2026-09-02). Measured that day, of 26 published profiles: ZERO carry a
     video (`videoUrl` exists and nobody has filled it) and the Review table
     holds ZERO rows — so „გაფილტრე… შეფასებით" named a filter the catalogue
     hides, and „ნახავ ვიდეოწარდგენას… და შეფასებებს" named two things no
     profile on the site displays. A help page that describes features the
     product has not got is the one page a confused person goes to.
     ⚠️ A SiteText ROW OVERRIDES THIS DEFAULT and holds the same claim — the
     default and the row must both change or the site keeps the old sentence. */
  { key: 'help.faq.find-expert.a', group: 'დახმარება — დაწყება', label: 'პასუხი', multiline: true, default: 'გვერდზე „ექსპერტები“ გაფილტრე კატეგორიითა და ფასით. პროფილში ნახავ გამოცდილებას, სერვისებსა და ფასებს.' },
  { key: 'help.faq.price.q', group: 'დახმარება — დაწყება', label: 'კითხვა', default: 'რა ჯდება?' },
  // პასუხი „price" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS

  // ── დახმარება · მოთხოვნა და შეთავაზება ──
  // ⚠️ THE HEADING SAID „დაჯავშნა და სესია" UNTIL 2026-08-31 and named a product
  // removed on 2026-08-24 — there is no booking and no session. Every `group:`
  // on the four entries below already read „მოთხოვნა და შეთავაზება"; only this
  // comment had not moved, so the file's own section index disagreed with the
  // admin panel's. The KEY IDS still say `how-to-book` / `where-session`: those
  // are DB keys and may never be renamed (see the ledger in
  // tests/siteTexts.test.ts), which is why the ids read older than the copy.
  { key: 'help.faq.how-to-book.q', group: 'დახმარება — მოთხოვნა და შეთავაზება', label: 'კითხვა', default: 'როგორ დავიწყო?' },
  // პასუხი „how-to-book" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.where-session.q', group: 'დახმარება — მოთხოვნა და შეთავაზება', label: 'კითხვა', default: 'სად სრულდება სამუშაო?' },
  { key: 'help.faq.where-session.a', group: 'დახმარება — მოთხოვნა და შეთავაზება', label: 'პასუხი', multiline: true, default: 'ადგილზე შესასრულებელი — შენს მისამართზე. დანარჩენს ექსპერტთან ათანხმებ.' },
  { key: 'help.faq.cancel.q', group: 'დახმარება — მოთხოვნა და შეთავაზება', label: 'კითხვა', default: 'შემიძლია გავაუქმო?' },
  // პასუხი „cancel" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.expert-noshow.q', group: 'დახმარება — მოთხოვნა და შეთავაზება', label: 'კითხვა', default: 'რა მოხდება, თუ ექსპერტმა სამუშაო არ შეასრულა?' },
  { key: 'help.faq.expert-noshow.a', group: 'დახმარება — მოთხოვნა და შეთავაზება', label: 'პასუხი', multiline: true, default: 'მოგვწერე — გამოვიძიებთ და სხვა ექსპერტს შემოგთავაზებთ.' },

  // ── დახმარება · ანგარიში და შეხვედრა ──
  // Added 2026-08-04 from the unanswered log — every one of these was typed by
  // a real visitor and got „I have no answer for that".
  { key: 'help.faq.signup.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'როგორ დავრეგისტრირდე?' },
  { key: 'help.faq.signup.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'რეგისტრაცია უფასოა. ანგარიში მხოლოდ მოთხოვნის დასატოვებლად გჭირდება — ექსპერტებს ისედაც ნახავ.' },
  { key: 'help.faq.duration.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'რამდენი ხანი გრძელდება?' },
  { key: 'help.faq.duration.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'ეს სამუშაოზეა დამოკიდებული და შეთავაზებაში წერია — ექსპერტი მოცულობასა და ვადას იქვე უთითებს.' },
  { key: 'help.faq.location.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'სად მდებარეობთ? ოფისში უნდა მოვიდე?' },
  { key: 'help.faq.location.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'ოფისში მოსვლა არ გჭირდება. ყველაფერი პლატფორმაზე და ექსპერტთან შეთანხმებით ხდება.' },
  { key: 'help.faq.contact.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'ტელეფონის ნომერი გაქვთ?' },
  // პასუხი „contact" გამოთვლადია (SUPPORT_EMAIL) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.language.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'რომელ ენაზე ტარდება შეხვედრა?' },
  { key: 'help.faq.language.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'ენა პროფილში წერია. აირჩიე ის, ვისაც შენთვის სასურველი უწერია.' },
  { key: 'help.faq.pre-contact.q', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'კითხვა', default: 'შემიძლია ექსპერტს წინასწარ მივწერო?' },
  { key: 'help.faq.pre-contact.a', group: 'დახმარება — ანგარიში და შეხვედრა', label: 'პასუხი', multiline: true, default: 'მიმოწერა შეთავაზების მიღების შემდეგ იხსნება. კითხვა თავად მოთხოვნაში დაწერე.' },

  // ── დახმარება · გადახდა ──
  { key: 'help.faq.payment-safety.q', group: 'დახმარება — გადახდა', label: 'კითხვა', default: 'უსაფრთხოა თუ არა გადახდა?' },
  { key: 'help.faq.payment-safety.a', group: 'დახმარება — გადახდა', label: 'პასუხი', multiline: true, default: 'მოთხოვნის დატოვება უფასოა, ბარათს არ ვთხოვთ.' },
  { key: 'help.faq.payment-methods.q', group: 'დახმარება — გადახდა', label: 'კითხვა', default: 'რომელი გადახდის მეთოდები მიიღება?' },
  { key: 'help.faq.payment-methods.a', group: 'დახმარება — გადახდა', label: 'პასუხი', multiline: true, default: 'ონლაინ გადახდა ჯერ არ არის. მოთხოვნის დატოვება უფასოა.' },
  { key: 'help.faq.invoice.q', group: 'დახმარება — გადახდა', label: 'კითხვა', default: 'შემიძლია მივიღო ინვოისი?' },
  { key: 'help.faq.invoice.a', group: 'დახმარება — გადახდა', label: 'პასუხი', multiline: true, default: 'ინვოისები გადახდებთან ერთად ამოქმედდება — ავტომატურად მოვა ელფოსტაზე. მანამდე მოთხოვნა უფასოა.' },

  // ── დახმარება · ექსპერტებისთვის ──
  { key: 'help.faq.become-expert.q', group: 'დახმარება — ექსპერტებისთვის', label: 'კითხვა', default: 'როგორ ვხდები ექსპერტი?' },
  { key: 'help.faq.become-expert.a', group: 'დახმარება — ექსპერტებისთვის', label: 'პასუხი', multiline: true, default: 'შეავსე განაცხადი და პასუხს 24–48 საათში მიიღებ.' },
  { key: 'help.faq.commission.q', group: 'დახმარება — ექსპერტებისთვის', label: 'კითხვა', default: 'რა კომისიას იღებს პლატფორმა?' },
  // პასუხი „commission" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.payout.q', group: 'დახმარება — ექსპერტებისთვის', label: 'კითხვა', default: 'როდის მივიღებ თანხას?' },
  { key: 'help.faq.payout.a', group: 'დახმარება — ექსპერტებისთვის', label: 'პასუხი', multiline: true, default: 'ონლაინ გადახდები ჯერ არ ამოქმედებულა.' },

  // ── დახმარება · ანგარიში და უსაფრთხოება ──
  { key: 'help.faq.account-security.q', group: 'დახმარება — ანგარიში და უსაფრთხოება', label: 'კითხვა', default: 'როგორ დავიცვა ჩემი ანგარიში?' },
  // პასუხი „account-security" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.delete-account.q', group: 'დახმარება — ანგარიში და უსაფრთხოება', label: 'კითხვა', default: 'როგორ წავშალო ანგარიში?' },
  // პასუხი „delete-account" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS
  { key: 'help.faq.report-abuse.q', group: 'დახმარება — ანგარიში და უსაფრთხოება', label: 'კითხვა', default: 'რა ხდება, თუ ექსპერტი დისკრიმინაციულად მოიქცა?' },
  // პასუხი „report-abuse" გამოთვლადია (კონსტანტა/ფლაგი) — იხ. HELP_LOCKED_ANSWER_IDS

  // ── Footer ──
  { key: 'footer.tagline', group: 'Footer', label: 'აღწერა', multiline: true, default: 'მცოდნე — აღწერე რა გჭირდება და მიიღე შეთავაზებები.' },

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
  { key: 'abroad.hero.title', group: 'დიასპორა (/abroad)', label: 'Hero — სათაური', multiline: true, default: 'ცხოვრობ საზღვარგარეთ? მოაგვარე საქმეები საქართველოში — ონლაინ', retired: true },
  { key: 'abroad.hero.subtitle', group: 'დიასპორა (/abroad)', label: 'Hero — ქვესათაური', multiline: true, default: 'ქართველი იურისტი, ბუღალტერი და კარიერის ექსპერტი ონლაინ.', retired: true },
  { key: 'abroad.hero.cta', group: 'დიასპორა (/abroad)', label: 'Hero — ღილაკი', default: 'ნახე ექსპერტები', retired: true },

  { key: 'abroad.cards.title', group: 'დიასპორა (/abroad)', label: 'სერვისები — სათაური', default: 'რა გჭირდება?', retired: true },
  { key: 'abroad.card1.title', group: 'დიასპორა (/abroad)', label: 'სერვისი 1 — სათაური', default: 'ქონება, მინდობილობა და მემკვიდრეობა', retired: true },
  { key: 'abroad.card1.body', group: 'დიასპორა (/abroad)', label: 'სერვისი 1 — ტექსტი', multiline: true, default: 'ბინა, მიწა თუ მემკვიდრეობა — რა დოკუმენტი გჭირდება და როგორ გააფორმო ჩამოსვლის გარეშე.', retired: true },
  { key: 'abroad.card1.priceGel', group: 'დიასპორა (/abroad)', label: 'სერვისი 1 — ფასი ლარში (ევრო თავად გამოითვლება)', default: '120', retired: true },
  { key: 'abroad.card1.cta', group: 'დიასპორა (/abroad)', label: 'სერვისი 1 — ღილაკი', default: 'იურისტთან', retired: true },

  { key: 'abroad.card2.title', group: 'დიასპორა (/abroad)', label: 'სერვისი 2 — სათაური', default: 'გადასახადები და ინდივიდუალური მეწარმე', retired: true },
  { key: 'abroad.card2.body', group: 'დიასპორა (/abroad)', label: 'სერვისი 2 — ტექსტი', multiline: true, default: 'უცხოური შემოსავალი, ქონების გადასახადი, ინდივიდუალური მეწარმის სტატუსი.', retired: true },
  { key: 'abroad.card2.priceGel', group: 'დიასპორა (/abroad)', label: 'სერვისი 2 — ფასი ლარში (ევრო თავად გამოითვლება)', default: '150', retired: true },
  { key: 'abroad.card2.cta', group: 'დიასპორა (/abroad)', label: 'სერვისი 2 — ღილაკი', default: 'ბუღალტერთან', retired: true },

  // ⚠️ CARD 3 WAS „შვილს გაკვეთილი მინდა" (school tutoring) and was replaced
  // 2026-08-04. The development plan's §6 „რას არ ვაკეთებთ" excludes tutoring
  // outright — „ბაზარი დაკავებულია და მოდელიც არ გვერგება" — so the card was
  // selling the one thing the business had decided not to sell. Its replacement
  // points at the plan's own „კარიერა" line (§4 item 6), whose stated buyer is
  // „ვისაც სამსახური აქვს და გადასვლა უნდა" — which is precisely a Georgian
  // working abroad. Do not reintroduce a tutoring card here.
  { key: 'abroad.card3.title', group: 'დიასპორა (/abroad)', label: 'სერვისი 3 — სათაური', default: 'ვფიქრობ დაბრუნებაზე — რა მელოდება?', retired: true },
  { key: 'abroad.card3.body', group: 'დიასპორა (/abroad)', label: 'სერვისი 3 — ტექსტი', multiline: true, default: 'ხელფასი, ვაკანსიები, საკუთარი საქმის დაწყება.', retired: true },
  { key: 'abroad.card3.priceGel', group: 'დიასპორა (/abroad)', label: 'სერვისი 3 — ფასი ლარში (ევრო თავად გამოითვლება)', default: '150', retired: true },
  { key: 'abroad.card3.cta', group: 'დიასპორა (/abroad)', label: 'სერვისი 3 — ღილაკი', default: 'ესაუბრე ექსპერტს', retired: true },

  { key: 'abroad.how.title', group: 'დიასპორა (/abroad)', label: 'როგორ მუშაობს — სათაური', default: 'როგორ მუშაობს', retired: true },
  { key: 'abroad.how.step1.title', group: 'დიასპორა (/abroad)', label: 'ნაბიჯი 1 — სათაური', default: 'აირჩიე ექსპერტი', retired: true },
  { key: 'abroad.how.step1.desc', group: 'დიასპორა (/abroad)', label: 'ნაბიჯი 1 — აღწერა', multiline: true, default: 'ნახე ვინ რას აკეთებს, რა ღირს და როგორ შეაფასეს სხვებმა.', retired: true },
  { key: 'abroad.how.step2.title', group: 'დიასპორა (/abroad)', label: 'ნაბიჯი 2 — სათაური', default: 'დაასახელე შენთვის მოსახერხებელი დრო', retired: true },
  { key: 'abroad.how.step2.desc', group: 'დიასპორა (/abroad)', label: 'ნაბიჯი 2 — აღწერა', multiline: true, default: 'დროები შენი ქვეყნის საათით ჩანს. ექსპერტი დაგიდასტურებს ან შემოგთავაზებს სხვას.', retired: true },
  { key: 'abroad.how.step3.title', group: 'დიასპორა (/abroad)', label: 'ნაბიჯი 3 — სათაური', default: 'შეხვდი ონლაინ', retired: true },
  { key: 'abroad.how.step3.desc', group: 'დიასპორა (/abroad)', label: 'ნაბიჯი 3 — აღწერა', multiline: true, default: 'ფორმატს ექსპერტთან ერთად ირჩევთ — დეტალებს მიმოწერაში ათანხმებთ.', retired: true },

  { key: 'abroad.experts.title', group: 'დიასპორა (/abroad)', label: 'ექსპერტები — სათაური', default: 'ვინ დაგელაპარაკება', retired: true },
  { key: 'abroad.experts.subtitle', group: 'დიასპორა (/abroad)', label: 'ექსპერტები — ქვესათაური', multiline: true, default: 'ქართველი ექსპერტები.', retired: true },
  { key: 'abroad.experts.empty', group: 'დიასპორა (/abroad)', label: 'ექსპერტები — ცარიელი მდგომარეობა', multiline: true, default: 'ექსპერტების სია მზადდება. მოგვწერე და შენს საკითხზე სპეციალისტს შეგირჩევთ.', retired: true },

  { key: 'abroad.cta.title', group: 'დიასპორა (/abroad)', label: 'ბოლო CTA — სათაური', default: 'ვერ იპოვე შენი საკითხი?', retired: true },
  { key: 'abroad.cta.body', group: 'დიასპორა (/abroad)', label: 'ბოლო CTA — ტექსტი', multiline: true, default: 'მოგვწერე ორი წინადადებით, რა გჭირდება — ექსპერტს შეგირჩევთ და დაგიბრუნდებით.', retired: true },
  { key: 'abroad.cta.button', group: 'დიასპორა (/abroad)', label: 'ბოლო CTA — ღილაკი', default: 'მომწერეთ', retired: true },

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
  { key: 'signup.learn.subEmphasis', group: 'რეგისტრაცია — ვსწავლობ', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'ამჟამად მოთხოვნა უფასოა' },
  // ⚠️ RETIRED 2026-08-31 — it repeated step 02's own heading („დაცული გადახდა
  // (მალე)") four lines above it. Same reason `signup.teach.subEmphasis` was
  // retired in 2026-08-10: one mention per surface (owner).
  { key: 'signup.learn.subRest', group: 'რეგისტრაცია — ვსწავლობ', label: 'ქვესათაური — გაგრძელება', default: '— დაცული გადახდა მალე.', retired: true },
  { key: 'signup.learn.step1.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 1 — სათაური', default: 'ფასი წინასწარ ცნობილია' },
  { key: 'signup.learn.step1.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 1 — აღწერა', default: 'გადაიხდი მხოლოდ მაშინ, როცა შეთავაზებას დაეთანხმები.' },
  { key: 'signup.learn.step2.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 2 — სათაური', default: 'დაცული გადახდა (მალე)' },
  // ⚠️ 2026-08-31 — „სესიის შემდეგ" → „სამუშაოს დასრულების შემდეგ". Only the
  // NOUN changed, and it changed because the old one names a product that was
  // removed on 2026-08-24: there is no session, no booking and no slot, so a
  // client's first screen was timing a payment against something that cannot
  // happen. No row exists under this key (checked), so the default is what the
  // page prints. The sentence is otherwise the owner's and stays theirs.
  { key: 'signup.learn.step2.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 2 — აღწერა', default: 'თანხა ერიცხება სამუშაოს დასრულების შემდეგ.' },
  { key: 'signup.learn.step3.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 3 — სათაური', default: 'ხელით განხილული' },
  { key: 'signup.learn.step3.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნაბიჯი 3 — აღწერა', default: 'ყველა ექსპერტი — სანამ პლატფორმაზე მოვა.' },
  // ⚠️ RETIRED 2026-08-31 — the trust strip under the client panel's numbered
  // list. It said what step 03 („ხელით განხილული / ყველა ექსპერტი — სანამ
  // პლატფორმაზე მოვა.") already said, eight lines above it, and it was the one
  // block the provider panel beside it does not have. The surface is gone from
  // app/signin/_signup.tsx; the keys stay known so a production row typed under
  // them survives and the strings can never be reused for something else.
  { key: 'signup.learn.trust.title', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნდობის ხაზი — სათაური', default: 'ექსპერტებს ხელით განვიხილავთ', retired: true },
  { key: 'signup.learn.trust.desc', group: 'რეგისტრაცია — ვსწავლობ', label: 'ნდობის ხაზი — აღწერა', default: 'გამოცდილება და რეპუტაცია გამოწმებული.', retired: true },

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

  // ⚠️ RETIRED 2026-08-24 — the whole `signup.teach.*` group below. It was the
  // CONSULTATION applicant's panel on /signup: „15% საკომისიო" as a stat tile
  // and a four-step review timeline. There is one provider now and one panel
  // (`signup.serve.*`), and those numbers were true of a consultation and false
  // of everybody who signs up today — a lead costs a provider nothing.
  //
  // Not deleted, and the rule is the file's own: a production row may hold copy
  // the owner typed under one of these keys, so the key stays known, the row
  // survives, the string can never be reused for something else, and the admin
  // editor simply stops offering a control over a panel nobody can open.
  { key: 'signup.teach.pill', group: 'რეგისტრაცია — ვასწავლი', label: 'იარლიყის ტექსტი', default: 'ექსპერტის განაცხადი', retired: true },
  { key: 'signup.teach.title1', group: 'რეგისტრაცია — ვასწავლი', label: 'სათაური, 1-ლი ხაზი', default: 'გახდი მცოდნე.', retired: true },
  { key: 'signup.teach.title2', group: 'რეგისტრაცია — ვასწავლი', label: 'სათაური, აქცენტი (მწვანე)', default: 'შენი ცოდნა — შენი შემოსავალი.', retired: true },
  { key: 'signup.teach.sub', group: 'რეგისტრაცია — ვასწავლი', label: 'ქვესათაური', multiline: true, default: 'შენ ირჩევ ფასს, დროსა და თემას.', retired: true },
  // RETIRED 2026-08-10: it repeated the commission two lines above the stat
  // tile that already carries it. One mention per surface (owner).
  { key: 'signup.teach.subEmphasis', group: 'რეგისტრაცია — ვასწავლი', label: 'ქვესათაური — აქცენტი (მუქი)', default: 'გასამრჯელო — სესიის შემდეგ.', retired: true },
  { key: 'signup.teach.stat1.n', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1', default: '15%', retired: true },
  { key: 'signup.teach.stat1.label', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1 — იარლიყი', default: 'საკომისიო', retired: true },
  { key: 'signup.teach.stat1.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 1 — ქვეტექსტი', default: 'ონლაინ გადახდების ამოქმედების შემდეგ', retired: true },
  { key: 'signup.teach.stat2.n', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 2', default: 'შენ', retired: true },
  { key: 'signup.teach.stat2.label', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 2 — იარლიყი', default: 'ადგენ ფასს', retired: true },
  { key: 'signup.teach.stat2.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 2 — ქვეტექსტი', default: 'დროსა და თემას', retired: true },
  { key: 'signup.teach.stat3.n', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 3', default: '1 სთ', retired: true },
  { key: 'signup.teach.stat3.label', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 3 — იარლიყი', default: 'კონსულტაცია', retired: true },
  { key: 'signup.teach.stat3.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ციფრი 3 — ქვეტექსტი', default: 'ვიდეოზარით', retired: true },
  { key: 'signup.teach.processEyebrow', group: 'რეგისტრაცია — ვასწავლი', label: 'პროცესის იარლიყი', default: 'პროცესი · 4 ნაბიჯი', retired: true },
  { key: 'signup.teach.step1.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 1 — სათაური', default: 'შეავსე განაცხადი', retired: true },
  { key: 'signup.teach.step1.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 1 — გვერდით', default: 'მოკლე ფორმა', retired: true },
  { key: 'signup.teach.step2.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 2 — სათაური', default: 'ჩვენი განხილვა', retired: true },
  { key: 'signup.teach.step2.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 2 — გვერდით', default: '24–48 საათი', retired: true },
  { key: 'signup.teach.step3.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 3 — სათაური', default: 'პროფილი ცოცხალდება', retired: true },
  { key: 'signup.teach.step3.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 3 — გვერდით', default: 'დასტურის შემდეგ', retired: true },
  { key: 'signup.teach.step4.title', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 4 — სათაური', default: 'პირველი ჯავშანი', retired: true },
  { key: 'signup.teach.step4.desc', group: 'რეგისტრაცია — ვასწავლი', label: 'ნაბიჯი 4 — გვერდით', default: 'დაამატე დროები', retired: true },

  // SEO LAST, deliberately. These ~32 Google/Facebook metadata fields used to
  // sit at the HEAD of this array, so „ტექსტები" opened on nine groups of
  // metadata and the most-edited copy on the whole site — the home hero — was
  // about thirty fields down. Order here IS the reading order in the panel, and
  // the panel should open on what people actually change.
  ...MESSAGE_COPY,
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

/**
 * Keys that are RESOLVED ON THE SERVER AND NEVER READ IN THE BROWSER.
 *
 * ⚠️ THE WHOLE PUBLIC MAP TRAVELS ON EVERY PAGE. app/layout hands it to
 * <SiteTextProvider>, a client component, so it is serialized into the RSC
 * payload of every request — measured on production 2026-08-21: 252 keys,
 * 37.8 KB, and on /privacy that payload was 69% of the document. A visitor
 * reading the privacy policy was downloading the copy of /join and the home
 * page along with it.
 *
 * `seo.*` (6.4 KB, 30 keys) is the clearest case: it exists to fill
 * `generateMetadata`, which runs on the server and emits <title> and
 * <meta> — no client component has ever read one. Shipping it is pure waste.
 *
 * This is NOT the retired list and must not be merged with it. A retired key
 * describes a page that no longer exists; a server-only key describes a page
 * that very much does, in a place the browser cannot see. Both stay readable
 * through `getSiteTextMap` on the server and through the admin panel.
 */
// ⚠️ `abroad.*` WAS ADDED HERE ON 2026-08-21 AND TAKEN STRAIGHT BACK OUT — and
// the argument that kept it out has since been overtaken. It ran: a dark
// feature is not a deleted one, so the diaspora copy must stay reachable from
// the browser for the day the flag flips. On 2026-09-03 the owner deleted the
// vertical instead of flipping it, so those 29 keys are `retired` now and no
// component renders them. They stay in the registry because a production
// SiteText row may hold copy typed under one of them; they are simply no longer
// anything the payload has to carry.
const SERVER_ONLY_PREFIXES = ['seo.']
export function isServerOnlySiteTextKey(key: string): boolean {
  return SERVER_ONLY_PREFIXES.some(p => key.startsWith(p))
}

// Guard: only known keys can be written from the admin API.
export function isKnownSiteTextKey(key: string): boolean {
  return key in SITE_TEXT_DEFAULTS
}
