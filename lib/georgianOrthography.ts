// The Georgian copy rules — ONE source, read by two very different consumers:
//
//   tests/georgianOrthography.test.ts  lints the copy we WRITE (the source tree)
//   app/api/admin/site-texts/route.ts  rejects the copy an ADMIN TYPES (the CMS)
//
// WHY BOTH. The source lint shipped first and passed on all 333 files, and the
// site still served „ვიდეო-სესია" and „ვიდეოშესავალს" on every page. SiteText
// rows in the database OVERRIDE the defaults in lib/siteTextDefs.ts, so an admin
// editing a headline in ადმინი → ტექსტები can put anything on the home page and
// no amount of source linting will ever see it. A gate that guards only the
// files is a gate on the smaller half of the copy.
//
// ── THE RULE, AND THE EVIDENCE ────────────────────────────────────────────────
// Georgian writes a single-concept compound as ONE word. The hyphen belongs to
// two-concept compounds (მედიკო-ბიოლოგიური), to compounds whose first member is
// a TRUNCATED STEM (სახლ-მუზეუმი — and so ბიზნეს-გეგმა, ექსპერტ-კონსულტაცია,
// ქუქი-ფაილი, which are CORRECT and deliberately not matched below), and to
// reduplication (ნელ-ნელა).
//
// An indeclinable borrowed prefix is not a truncated stem, so it attaches
// directly. Every headword here was read out of the სასკოლო ორთოგრაფიული
// ლექსიკონი (არნ. ჩიქობავას ენათმეცნიერების ინსტიტუტი, 2011), nplg.gov.ge/saskolo:
//
//   ვიდეო + consonant  ვიდეოთამაში, ვიდეოკლიპი, ვიდეომასალა, ვიდეორგოლი,
//                      ვიდეოჩანაწერი — five headwords, none hyphenated
//   ვებ                ვებგვერდი (also ka.wikipedia)
//   ო-prefix + vowel   ფოტოალბომი, ფოტოაპარატი, ფოტოასლი, ფოტოეტიუდი,
//                      ფოტოეფექტი, მიკროავტობუსი, მიკროელემენტები
//   ო + ო              ფოტოობიექტივი ← the exact shape of ვიდეოოთახი. There is
//                      NO double-vowel-clash exception; 18 call sites shipped
//                      „ვიდეო-ოთახი" on the belief that there is.
//
// ფოტოასლი and ფოტოხელოვნება take NATIVE Georgian second elements, so these are
// compounds Georgian BUILT — not loanwords imported whole, which is the obvious
// objection to the list above and the reason it is worth spelling out.

export type CopyRule = {
  id: string
  /** Deliberately NOT global — checkGeorgianCopy clones it per call, so no lastIndex state. */
  re: RegExp
  /** What to write instead. Shown verbatim to the admin in the CMS error. */
  fix: string
  /** Why, for whoever wonders in a year. */
  why: string
}

export const COPY_RULES: CopyRule[] = [
  /* ── orthography: a borrowed indeclinable prefix takes no hyphen ────────── */
  { id: 'video-hyphen', re: /ვიდეო-(?=[ა-ჰ])/, fix: 'ვიდეოსესია, ვიდეოოთახი, ვიდეოკონსულტაცია — დეფისის გარეშე',
    why: 'ვიდეოთამაში / ვიდეორგოლი / ვიდეოკლიპი — სასკოლო ორთოგრაფიული ლექსიკონი' },
  { id: 'web-hyphen', re: /ვებ-(?=[ა-ჰ])/, fix: 'ვებგვერდი, ვებსაიტი — დეფისის გარეშე',
    why: 'ვებგვერდი — სასკოლო ორთოგრაფიული ლექსიკონი' },
  { id: 'online-hyphen', re: /ონლაინ-(?=[ა-ჰ])/, fix: 'ონლაინკურსი ერთად, ან ორ სიტყვად — „ონლაინ კონსულტაცია"',
    why: 'ონლაინკურსები — ambebi.ge' },
  { id: 'micro-hyphen', re: /მიკრო-(?=[ა-ჰ])/, fix: 'მიკროსერვისი — დეფისის გარეშე',
    why: 'მიკროავტობუსი / მიკროელემენტები — სასკოლო ორთოგრაფიული ლექსიკონი' },

  /* ── terminology: one concept, one word ─────────────────────────────────
   * Inflected forms are listed explicitly because Georgian gives a regex no
   * word boundary to stand on: a bare /ჩატ/ fires inside „ჩატვირთვა". */
  { id: 'term-video-intro', re: /ვიდეო(შესავალ|ინტრო)[ა-ჰ]*/, fix: 'ვიდეოგაცნობა',
    why: 'პროფილისა და /apply-ის სათაური „ვიდეოგაცნობაა" — სამი სახელი ერთ ფუნქციაზე იყო' },
  { id: 'term-tutor', re: /(ტუტორ|რეპეტიტორ)(ი|ს|ში|თან|ებ)[ა-ჰ]*/, fix: 'ექსპერტი', why: 'CLAUDE.md' },
  { id: 'term-chat', re: /ჩატ(ი|ს|ში|ზე|იდან|ებ)(?![ა-ჰ])/, fix: 'მიმოწერა', why: 'CLAUDE.md ლექსიკონი' },
  { id: 'term-dashboard', re: /დაშბორდ[ა-ჰ]*/, fix: 'ჩემი სივრცე', why: 'CLAUDE.md ლექსიკონი' },
  { id: 'term-slot', re: /სლოტ(ი|ს|ში|ზე|ებ)[ა-ჰ]*/, fix: 'დრო / თავისუფალი დრო', why: 'CLAUDE.md ლექსიკონი' },
  { id: 'term-escrow', re: /ესქროუ[ა-ჰ]*/, fix: 'დაცული გადახდა', why: 'CLAUDE.md ლექსიკონი' },

  /* ── morphology: the perfect is not the aorist ──────────────────────────
   *
   * SHIPPED 2026-08-11 on the 404 page: „თუ ეს ბმული სადმე გინახე" — meant as
   * „if you have seen this link somewhere", i.e. the perfect (თურმეობითი),
   * whose 2nd-person form is გინახავს. „გინახე" is not a wrong choice between
   * two forms; it is not a form at all. The object marker გ- with an aorist
   * ending gives „გნახე" (= „I saw YOU"), and the ი- version vowel belongs to
   * the perfect, which ends in -ავს. Gluing the two halves together produces a
   * word Georgian does not have.
   *
   * THE LIMITS, stated so nobody trusts this further than it goes. This is a
   * blocklist of the exact forms that are always wrong, in the same spirit as
   * the terminology rules above — Georgian inflection gives a regex no word
   * boundary to stand on, so a general morphology check is not a regex, it is a
   * parser. A first attempt at a pattern („perfect prefix + aorist ending")
   * matched 20 words in the tree and every single one was a legitimate
   * imperative or noun (მიიღე, მიუთითე, მიწერე, მისამართზე…). Precision over
   * reach: add forms here as they are found, never a shape that guesses. */
  { id: 'perfect-nakhva', re: /(გვ|[გმ])ინახე(თ)?(?![ა-ჰ])/, fix: 'გინახავს / მინახავს — თურმეობითი, არა აორისტი',
    why: '„გინახე" ფორმა არ არსებობს: გ- ობიექტს აორისტში „გნახე" გამოაქვს, თურმეობითი კი -ავს-ზე თავდება' },

  /* ── typography ─────────────────────────────────────────────────────────
   * A „ closed by an ASCII " instead of “ (U+201C). Stops at `<` because a
   * quoted phrase may wrap markup and the " ending an HTML attribute is not
   * the quote's closer. */
  { id: 'ascii-close-quote', re: /„[^„“<]*?"/, fix: 'ქართული ბრჭყალი იხურება „…“ (U+201C), არა "',
    why: 'CLAUDE.md — ქართული ბრჭყალები' },
]

export type CopyViolation = { id: string; found: string; fix: string; why: string }

/** Every rule this text breaks. Empty array = clean. */
export function checkGeorgianCopy(text: string): CopyViolation[] {
  const out: CopyViolation[] = []
  if (!text) return out
  for (const rule of COPY_RULES) {
    // Cloned per call: a shared /g regex carries lastIndex between calls and
    // would skip every other match.
    const m = text.match(new RegExp(rule.re.source, 'u'))
    if (m) out.push({ id: rule.id, found: m[0], fix: rule.fix, why: rule.why })
  }
  return out
}

/** One line an admin can act on, e.g. for a 400 response body. */
export function describeViolations(v: CopyViolation[]): string {
  return v.map(x => `„${x.found}“ → ${x.fix}`).join('; ')
}
