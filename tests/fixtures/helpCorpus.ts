/**
 * THE EVALUATION CORPUS — how „the bot works badly" becomes a number.
 *
 * Every question below is one a Georgian visitor could plausibly type, written
 * the way people actually write: short, colloquial, mistyped, sometimes with no
 * question word at all. `want` is the topic id it should reach, or 'none' when
 * we genuinely have no answer and saying so is the correct behaviour.
 *
 * RULES FOR ADDING TO THIS FILE — it only stays useful if they hold:
 *  1. Add the question BEFORE fixing the matcher, not after. A corpus written
 *     to match the current implementation measures nothing.
 *  2. Never delete a case because it fails. A failing case is the backlog.
 *  3. Real production misses go in marked `// PROD` — those are not guesses
 *     about what people ask, they are what people asked.
 *
 * `none` cases are as important as the rest: a matcher that answers everything
 * is not accurate, it is confident. Accuracy that ignores false positives is
 * the number that lets a bad bot look good.
 */

export type Case = { q: string; want: string }

export const CORPUS: Case[] = [
  /* ── what is this ─────────────────────────────────────────────────────── */
  { q: 'რა არის მცოდნე', want: 'what-is' },
  { q: 'რას აკეთებთ', want: 'what-is' },
  { q: 'ეს რა საიტია', want: 'what-is' },
  { q: 'რისთვის არის ეს პლატფორმა', want: 'what-is' },
  { q: 'მცოდნე რას სთავაზობს', want: 'what-is' },
  { q: 'რა სერვისი გაქვთ', want: 'what-is' },

  /* ── finding an expert ────────────────────────────────────────────────── */
  { q: 'როგორ ვიპოვო ექსპერტი', want: 'find-expert' },
  { q: 'ბიზნესზე ვინმე მჭირდება', want: 'find-expert' },            // PROD miss
  { q: 'იურისტი მჭირდება', want: 'find-expert' },
  { q: 'ფსიქოლოგი გყავთ', want: 'find-expert' },
  { q: 'როგორ ავირჩიო სპეციალისტი', want: 'find-expert' },
  { q: 'რა სფეროები გაქვთ', want: 'find-expert' },
  { q: 'მარკეტინგში ვინმე თუ არის', want: 'find-expert' },
  { q: 'ბუღალტერი მჭირდება', want: 'find-expert' },
  { q: 'ვინ მყავს ასარჩევი', want: 'find-expert' },

  /* ── price ────────────────────────────────────────────────────────────── */
  { q: 'რა ღირს', want: 'price' },
  { q: 'რამდენი ჯდება კონსულტაცია', want: 'price' },
  { q: 'ფასები', want: 'price' },
  { q: 'უფასოა თუ ფასიანი', want: 'price' },
  { q: 'რა ეღირება ერთი შეხვედრა', want: 'price' },
  { q: 'ძვირია?', want: 'price' },
  { q: 'ფასი მაინტერესებს', want: 'price' },
  { q: 'რამდნეი ჯდება', want: 'price' },                             // typo
  { q: 'ფასიანია?', want: 'price' },

  /* ── booking ──────────────────────────────────────────────────────────── */
  { q: 'როგორ დავჯავშნო', want: 'how-to-book' },
  { q: 'როგორ ჩავეწერო', want: 'how-to-book' },
  { q: 'დაჯავშნა როგორ ხდება', want: 'how-to-book' },
  { q: 'მინდა შეხვედრა დავნიშნო', want: 'how-to-book' },
  { q: 'როგორ დავჯვაშნო შეხვედრა', want: 'how-to-book' },            // transposition
  { q: 'ჯავშნის გაკეთება მინდა', want: 'how-to-book' },

  /* ── where the session happens ────────────────────────────────────────── */
  { q: 'სად ტარდება სესია', want: 'where-session' },
  { q: 'ზუმით არის?', want: 'where-session' },
  { q: 'რა პროგრამა მჭირდება', want: 'where-session' },
  { q: 'სად შევხვდები ექსპერტს', want: 'where-session' },
  { q: 'ონლაინ არის თუ პირისპირ', want: 'where-session' },
  { q: 'კამერა მჭირდება?', want: 'where-session' },
  { q: 'ვიდეოზარით იქნება?', want: 'where-session' },

  /* ── cancelling / moving ──────────────────────────────────────────────── */
  { q: 'როგორ გავაუქმო', want: 'cancel' },
  { q: 'გადატანა შეიძლება?', want: 'cancel' },
  { q: 'ვერ მოვალ რა ვქნა', want: 'cancel' },
  { q: 'თარიღი შემიძლია შევცვალო', want: 'cancel' },
  { q: 'ჯავშნის გაუქმება მინდა', want: 'cancel' },
  { q: 'სხვა დღეს გადავიტანო', want: 'cancel' },

  /* ── the expert did not show ──────────────────────────────────────────── */
  { q: 'ექსპერტი არ გამოჩნდა', want: 'expert-noshow' },
  { q: 'არავინ იყო შეხვედრაზე', want: 'expert-noshow' },
  { q: 'ექსპერტმა დამაცდინა', want: 'expert-noshow' },

  /* ── payment ──────────────────────────────────────────────────────────── */
  { q: 'უსაფრთხოა?', want: 'payment-safety' },
  { q: 'ბარათი უსაფრთხოდ არის?', want: 'payment-safety' },
  { q: 'როგორ გადავიხადო', want: 'payment-methods' },
  { q: 'ბარათით შემიძლია', want: 'payment-methods' },
  { q: 'გადახდის მეთოდები', want: 'payment-methods' },
  { q: 'ინვოისი მჭირდება', want: 'invoice' },
  { q: 'ქვითარს გამომიწერთ', want: 'invoice' },
  { q: 'კომპანიაზე დოკუმენტი მჭირდება', want: 'invoice' },

  /* ── becoming an expert ───────────────────────────────────────────────── */
  { q: 'როგორ გავხდე ექსპერტი', want: 'become-expert' },
  { q: 'მინდა თქვენთან მუშაობა', want: 'become-expert' },
  { q: 'განაცხადი როგორ შევავსო', want: 'become-expert' },
  { q: 'სპეციალისტი ვარ როგორ შემოგიერთდეთ', want: 'become-expert' },
  { q: 'ექსპერტად დარეგისტრირება', want: 'become-expert' },
  { q: 'რა კომისიას იღებთ', want: 'commission' },
  { q: 'რამდენ პროცენტს იტოვებთ', want: 'commission' },
  { q: 'როდის მივიღებ თანხას', want: 'payout' },
  { q: 'ფული როდის გადმომერიცხება', want: 'payout' },

  /* ── account ──────────────────────────────────────────────────────────── */
  { q: 'პაროლი დამავიწყდა', want: 'account-security' },
  { q: 'ვერ შევდივარ ანგარიშზე', want: 'account-security' },
  { q: 'როგორ დავიცვა ანგარიში', want: 'account-security' },
  { q: 'ანგარიშის წაშლა მინდა', want: 'delete-account' },
  { q: 'როგორ წავშალო პროფილი', want: 'delete-account' },

  /* ── abuse ────────────────────────────────────────────────────────────── */
  { q: 'ექსპერტმა უხეშად მომექცა', want: 'report-abuse' },
  { q: 'საჩივარი მაქვს', want: 'report-abuse' },

  /* ── answers written 2026-08-04 from the unanswered log ───────────────── */
  { q: 'როგორ დავრეგისტრირდე', want: 'signup' },                      // PROD
  { q: 'როგორ შევქმნა ანგარიში', want: 'signup' },
  { q: 'რეგისტრაცია უფასოა?', want: 'signup' },
  { q: 'რამდენი ხანი გრძელდება სესია', want: 'duration' },            // PROD ×2
  { q: 'რამდენი წუთია კონსულტაცია', want: 'duration' },
  { q: 'სად მდებარეობთ', want: 'location' },                          // PROD
  { q: 'ოფისი გაქვთ?', want: 'location' },
  { q: 'ტელეფონის ნომერი გაქვთ?', want: 'contact' },
  { q: 'რომელ ენაზე ტარდება', want: 'language' },
  { q: 'ინგლისურად შეიძლება?', want: 'language' },
  { q: 'ექსპერტს წინასწარ დაველაპარაკო?', want: 'pre-contact' },
  { q: 'დაჯავშნამდე მივწერო შემიძლია?', want: 'pre-contact' },

  /* ── things we genuinely do not answer ────────────────────────────────── *
   * Every one of these must return `none`. They are the half of accuracy that
   * a keyword matcher quietly fails: answering them at all is worse than
   * admitting we cannot.                                                    */
  { q: 'ამინდი როგორია თბილისში', want: 'none' },
  { q: 'რა ფერია თქვენი ლოგო', want: 'none' },
  { q: 'ვინ დააფუძნა კომპანია', want: 'none' },
  { q: 'რამდენი თანამშრომელი გყავთ', want: 'none' },
  { q: 'ინვესტიცია გინდათ?', want: 'none' },
  { q: 'რეკლამა გავაკეთოთ ერთად', want: 'none' },
  { q: 'ააა', want: 'none' },
  { q: '?????', want: 'none' },
]

/* ═════════════ THE GAPS — questions with no answer to reach ═══════════════
 *
 * These are separated deliberately. They are NOT matcher failures: they are
 * real questions that the FAQ has no entry for, several of them taken straight
 * out of production. Listing them here rather than in CORPUS keeps the two
 * numbers honest — „the matcher misses" and „we never wrote that answer" are
 * different problems with different fixes, and averaging them together hides
 * both.
 *
 * `need` names the topic that would have to EXIST for the question to be
 * answerable. Every entry here is a content decision for the owner, not
 * something a matcher change can solve.
 */
export const GAPS: { q: string; need: string; note: string }[] = [
  { q: 'თუ დავაგვიანე რა მოხდება', need: 'client-late',
    note: 'NO RULE EXISTS IN THE PRODUCT. The 15-minute grace and the no-show policy cover the EXPERT only; nothing in the code says what happens when the CLIENT is late. This answer cannot be written from behaviour — it is a policy decision for the owner, and inventing one is exactly the failure this widget is built to avoid.' },
]