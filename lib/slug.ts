// Slugify a (possibly Georgian) title into a URL-safe slug. Used for
// admin-created BLOG POSTS and CATEGORIES, and for expert profile slugs
// (lib/expertSlug). Anything non-Georgian collapses to hyphens; an empty result
// falls back to a stable stub the caller can suffix for uniqueness.
//
// ── WHY ფ→p, ც→ts, ყ→q AND NOT THE "PRETTIER" f/c/y ─────────────────────────
// This map's PRIMARY job is expert profile slugs (lib/expertSlug), i.e. PEOPLE'S
// NAMES. Georgian surnames have an established Latin spelling used on passports
// and in international reference works, and it is the p/ts/q one:
//
//   ფოფხაძე      → Popkhadze        (NOT Fofkhadze)
//   ლორთქიფანიძე → Lortkipanidze    (NOT Lortkifanidze)
//   ცარციძე      → Tsartsidze       (NOT Carcidze)
//
// Verified against Wikipedia's Georgian-surname entries on 2026-08-02.
//
// ⚠️ On that date these three letters were briefly changed to f/c/y, because
// „ფინანსისტი" transliterates to `pinansisti`, which reads as a typo. That is
// true — but it only bites BORROWED words, and borrowed words are not what this
// function is for. The change was reverted within the hour once the surname
// evidence came in: it would have produced `mariam-fofkhadze` for every expert
// registering from that point on, which is simply their name spelled wrong.
//
// The rule that falls out of this: BORROWED words get a HAND-WRITTEN slug
// (that is exactly what lib/professionSeo does — `finansisti`, `fsikologi`),
// and this map stays tuned for names.
//
// ⚠️ A letter changed here changes FUTURE slugs only. Existing rows keep what
// they were assigned — see the permanence note in lib/expertSlug.ts. Never
// re-slugify existing content: every shared link breaks.
const KA_LATIN: Record<string, string> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i',
  კ: 'k', ლ: 'l', მ: 'm', ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh', რ: 'r', ს: 's',
  ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q', შ: 'sh', ჩ: 'ch', ც: 'ts',
  ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h',
}

export function slugify(input: string): string {
  const translit = Array.from(input.toLowerCase())
    .map(ch => KA_LATIN[ch] ?? ch)
    .join('')
  const slug = translit
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'cat'
}
