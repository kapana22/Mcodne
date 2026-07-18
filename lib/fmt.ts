// Shared display formatters.
//
// fmtRating — THE one rating precision for the whole product (DESIGN_FIX_PROMPT
// 1.4). Card, quick-book rail, video preview, compare table, profile hero,
// sticky booking card, reviews header, /ask and the landing page must all
// render an expert's rating through this helper, so the same expert can never
// show "4.87" on one surface and "4.9" on another.
export function fmtRating(r: number): string {
  return r.toFixed(1)
}
