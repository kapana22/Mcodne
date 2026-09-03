import React from 'react'
import { phMark } from '@/components/CategoryMarks'

/**
 * A MARK FOR EVERY TOPIC GROUP — the icon column on the intake's category list,
 * the chips on /join and the chips in /work/profile's editor, and the plate on
 * each row of the client's own request list.
 *
 * ⚠️ WHY IT EXISTS (2026-09-02). Owner, holding a competitor's category list
 * with an icon on every row: „ესე დავამატოთ აიქონები შესაბამისი კატეგორიის."
 * Thirty-one Georgian phrases in a column gave somebody who does not know our
 * vocabulary nothing to aim at.
 *
 * ⚠️ AND EVERY GROUP GETS A DIFFERENT ONE, WHICH THE REFERENCE DID NOT DO. In
 * that screenshot all six rows carried the SAME worker glyph — the column cost
 * its width and told the reader nothing they could not read faster in the
 * label. A mark that repeats is worse than no mark. `tests/topicMarks` fails on
 * a duplicate for exactly that reason, and it caught one on the first draft.
 *
 * ⚠️ A SEPARATE FILE FROM `lib/requestTopics`. That module is imported by
 * `middleware.ts`, i.e. by every route on the site; putting JSX and an icon
 * import in it would pull the set into the edge bundle for pages that never
 * draw one. Same split, same reason, as `lib/categoryMarks`.
 *
 * The drawings are Phosphor duotone — see components/CategoryMarks for why that
 * set and not the hand-drawn one this replaced.
 */
const GROUP_MARK: Record<string, string> = {
  /* ── the professional half ─────────────────────────────────────────────── */
  school: 'school',            // an open book
  exams: 'exams',              // a sat paper, not a certificate
  languages: 'languages',
  higher: 'higher',            // a mortarboard
  digital: 'digital',          // </> — university-of-code, not `it`'s chip
  arts: 'arts',                // music notes; the label leads with music
  sport: 'sport',              // a barbell
  business: 'business',
  finance: 'finance',
  law: 'law',
  marketing: 'marketing',
  it: 'it',                    // a processor — NOT the brackets `digital` has
  design: 'design',
  psychology: 'psych',
  career: 'career',
  media: 'media',
  property: 'property',
  relocation: 'relocation',
  grants: 'grants',            // a sealed certificate — an award, not a page
  logistics: 'logistics',      // a lorry; `moving` is the carton
  health: 'health',            // a heartbeat — NOT `sport`'s barbell
  events: 'events',
  systems: 'systems',

  /* ── the everyday half ─────────────────────────────────────────────────── */
  cleaning: 'cleaning',
  plumbing: 'plumbing',
  electrical: 'electrical',
  repairs: 'repairs',          // a paint roller
  appliances: 'appliances',
  agriculture: 'agriculture',  // a tractor
  moving: 'moving',            // a carton; `logistics` is the lorry
  outdoor: 'outdoor',          // a tree
}

/**
 * ⚠️ `null`, NOT A DEFAULT DRAWING. A group this file has not been told about
 * gets NO icon and the row simply has none — honest, and visibly unfinished. A
 * fallback glyph would look correct and mean the wrong thing, and the reader
 * has no way to tell those two apart.
 */
export function topicGroupMark(
  groupId: string | null | undefined,
  className = 'w-5 h-5',
): React.ReactElement | null {
  const key = groupId ? GROUP_MARK[groupId] : undefined
  return key ? phMark(key, className) : null
}

// ⚠️ `MARKED_GROUP_IDS` WAS HERE, exported „for tests/topicMarks" (deleted
// 2026-09-03). That test reads this file AS TEXT and always has — importing it
// pulls in components/Icon, whose glyphs are ready-rendered JSX that throws
// under a plain `tsx` run — so the export had no reader and its own comment
// named one that could not exist.
