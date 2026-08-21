// MATCHING WHAT SOMEBODY TYPED TO WHAT WE CAN NAME.
//
// PURE: no prisma, no react, no I/O. Every rule here is executed by
// tests/topicMatch.test.ts against a corpus of real Georgian phrases, because
// „the search feels better now" is not a claim anybody can check.
//
// ⚠️ WHAT WAS HERE BEFORE, AND WHY IT HAD TO GO. The old matcher was one line:
//
//     const q = stem(query)                      // strips ONE case ending
//     hay.some(h => h.includes(q) || q.includes(h))
//
// It stemmed and compared WHOLE STRINGS. That has three failures, and the
// owner walked into the first of them by typing the most ordinary sentence
// there is („მჭირდება სახლის დალაგება", 2026-08-17):
//
//   1. NO TOKENS. „დავა მაქვს სასამართლოში" can never find „სასამართლო დავა":
//      the label's two words are not a contiguous substring of that query, and
//      the query's words are not a substring of the label. Two-word topics were
//      effectively unfindable unless typed verbatim.
//   2. NO RANKING. Every hit came out in catalogue order, so a topic that
//      matched a whole word ranked below one that matched two letters of a
//      group heading.
//   3. NO TOLERANCE. One typo, or one ending the hand-written list does not
//      carry, and the answer is „nothing found".
//
// ⚠️ AND WHAT AN ALGORITHM CANNOT FIX. If no topic mentions cleaning, no
// matcher finds „დალაგება" — that is a VOCABULARY gap, and it is closed by
// adding topics and synonyms, not by scoring harder. The two problems get
// confused constantly; this file solves the second and the corpus test names
// the first out loud when it bites.

/* ═══════════ tokens ═════════════════════════════════════════════════════ */

/** The words people put around a request that carry no information about WHAT
 *  they need. Dropped before scoring so „მჭირდება იურისტი" scores on one token
 *  rather than diluting across two. Deliberately short: a stopword list that
 *  grows starts eating real words, and „ბავშვის" (whose child?) is a real
 *  word here. */
const STOPWORDS = new Set([
  'მჭირდება', 'მინდა', 'ვეძებ', 'სჭირდება', 'მაქვს', 'მოვძებნო', 'მჭირდებოდა',
  'გამარჯობა', 'გთხოვთ', 'შეიძლება', 'იქნებ', 'ვისწავლო', 'სწავლა',
  'არის', 'ვარ', 'ხარ', 'რომ', 'და', 'ან', 'თუ', 'ეს', 'ის', 'რა',
  'ერთი', 'ძალიან', 'კარგი', 'კარგად', 'ვინმე', 'ადამიანი', 'სპეციალისტი',
])

/** The Georgian case endings, longest first so „ებისთვის" is stripped before
 *  „ის". Lifted from the original stemmer — it was the one part of it that was
 *  doing real work, and it keeps doing it, now PER TOKEN. */
const CASE_ENDINGS = [
  'ებისთვის', 'ისთვის', 'ებში', 'ებზე', 'ებთან', 'ებით', 'ებს', 'ებ',
  'ისა', 'ის', 'ში', 'ზე', 'თან', 'ით', 'ად', 'ს', 'ი',
]

/** One word, reduced to what it is about. Short words are left alone: stripping
 *  „ი" off a four-letter word usually removes the word. */
export function stemWord(w: string): string {
  const v = w.trim().toLowerCase()
  for (const e of CASE_ENDINGS) {
    if (v.length > e.length + 2 && v.endsWith(e)) return v.slice(0, -e.length)
  }
  return v
}

/** A phrase → the stems worth scoring. Punctuation and stopwords go; order does
 *  not matter after this, which is the whole point of tokenising. */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w))
    .map(stemWord)
    .filter(w => w.length >= 2)
}

/* ═══════════ how close two words are ════════════════════════════════════ */

/** Levenshtein, bounded: anything past `max` is „not close", and stopping there
 *  keeps this O(n·max) instead of O(n·m) on a list walked per keystroke. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      if (cur[j] < best) best = cur[j]
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/**
 * How well one typed word matches one catalogue word, 0 → 1.
 *
 * The tiers are ordered by how sure we are, and the gaps between them are what
 * makes ranking mean something:
 *   1.00  the same word
 *   0.80  one starts with the other, ≥4 letters — „ინგლის" vs „ინგლისური".
 *         Below 4 this fires on „და…", which matches half the catalogue.
 *   0.55  one typo, and only on words long enough (≥5) that a single edit is
 *         far more likely to be a slip than a different word. „კონტრაქტი" vs
 *         „კონტრაკტი" yes; „ხე" vs „ხო" never.
 */
export function wordScore(q: string, h: string): number {
  if (q === h) return 1
  const min = Math.min(q.length, h.length)
  if (min >= 4 && (q.startsWith(h) || h.startsWith(q))) return 0.8
  if (min >= 5 && editDistance(q, h, 1) <= 1) return 0.55
  return 0
}

/* ═══════════ scoring a candidate ════════════════════════════════════════ */

type MatchCandidate = {
  /** Everything this topic can be called: its label, its synonyms. */
  phrases: string[]
  /** The heading it lives under. Matched too, so „ენები" surfaces every
   *  language without each one having to list the word — at a discount, so a
   *  heading match always ranks below a topic that matched a real word. */
  groupLabel?: string
}

/**
 * Below this a hit is noise.
 *
 * ⚠️ TUNED AGAINST THE CORPUS, and 0.45 was wrong — it cut „ქიმიის რეპეტიტორი".
 * Two tokens, one of them ours by a strong prefix (0.8) and one a profession
 * word the catalogue does not carry (0), averages to 0.40. That is not noise;
 * it is the single most common shape a person types — one word we know plus one
 * we do not. Anything with NO matching word at all still scores 0 and is cut,
 * which is what §C's nonsense cases pin.
 */
export const MATCH_THRESHOLD = 0.35

/**
 * Score a candidate against a typed phrase, 0 → ~1.2.
 *
 * COVERAGE, NOT COUNT. The score is the mean of how well each QUERY token was
 * matched, so „ინგლისური" (one token, matched) beats „ინგლისური მასწავლებელი
 * ბავშვისთვის ონლაინ" scoring one hit out of four. That is the right bias: the
 * more a person tells us, the more of it a good answer should account for.
 *
 * Then two adjustments, both small on purpose:
 *   · +0.2 if any catalogue word matched EXACTLY. Distinguishes „ვიზა" the word
 *     from „ვიზიტი" the near-miss when both otherwise score alike.
 *   · the group heading is scored at 0.6 weight — enough that a FULL heading
 *     match surfaces its group on its own, never enough to outrank a topic
 *     that matched a real word. See the note at the call site.
 */
export function scoreCandidate(queryTokens: string[], c: MatchCandidate): number {
  if (queryTokens.length === 0) return 0

  const hay = c.phrases.flatMap(tokenize)
  if (hay.length === 0) return 0

  let total = 0
  let exact = false
  for (const q of queryTokens) {
    let best = 0
    for (const h of hay) {
      const s = wordScore(q, h)
      if (s > best) best = s
      if (s === 1) exact = true
      if (best === 1) break
    }
    total += best
  }
  let score = total / queryTokens.length
  if (exact) score += 0.2

  // ── The group heading ──────────────────────────────────────────────────
  //
  // ⚠️ IT IS A TIEBREAKER WHEN THE TOPIC MATCHED, AND A LIFELINE WHEN IT DID
  // NOT — never a contributor to coverage. A flat weight was tried first and
  // produced a real, caught-in-testing failure: „ლოგო მჭირდება ჩემი
  // ბიზნესისთვის" returned ბიზნესგეგმა above ლოგო, because „ბიზნეს" matched
  // the HEADING „ბიზნესი და სტრატეგია" exactly (a full-weight bonus) while
  // ლოგო had merely matched the word the person actually typed. A heading is
  // context, not content; scoring it as content lets the least specific thing
  // on the page win.
  //
  //   topic matched   → +0.1 × g. Enough to order two equally good answers,
  //                     never enough to reorder a better one below a worse one.
  //   topic scored 0  → 0.5 × g. This is the „ენები" case: somebody typed a
  //                     heading and means its members. It clears the threshold
  //                     and lands below every real match, which is exactly
  //                     where a whole group belongs.
  if (c.groupLabel) {
    const gh = tokenize(c.groupLabel)
    let g = 0
    for (const q of queryTokens) for (const h of gh) g = Math.max(g, wordScore(q, h))
    score = score > 0 ? score + g * 0.1 : g * 0.5
  }
  return score
}

/**
 * Rank candidates against a phrase.
 *
 * Ties break on the ORIGINAL ORDER, which is the catalogue's own — a stable
 * sort, so two equally good answers appear in the order somebody curated rather
 * than in whatever order the engine happened to walk.
 */
export function rankCandidates<T>(
  query: string,
  items: T[],
  toCandidate: (t: T) => MatchCandidate,
  limit = 24,
): { item: T; score: number }[] {
  const q = tokenize(query)
  if (q.length === 0) return []
  return items
    .map((item, i) => ({ item, i, score: scoreCandidate(q, toCandidate(item)) }))
    .filter(r => r.score >= MATCH_THRESHOLD)
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .slice(0, limit)
    .map(({ item, score }) => ({ item, score }))
}
