// THE PUBLIC PROVIDER LIST — the catalogue's rows, for the surfaces that are
// not the catalogue.
//
// ⚠️ IT REPLACES `/api/tutors` (2026-08-24), which served the consultation
// table and was the catalogue's own fetch. The catalogue does not fetch any
// more — the whole roster arrives server-rendered and is filtered in the
// browser — so what is left is the two client surfaces that show a HANDFUL of
// providers and have no server render of their own: the client dashboard's
// „აღმოაჩინე" row and anything else that wants „a few people, optionally in
// this sphere".
//
// One rule, one query: `queryProviders` and its VISIBLE rule, exactly what
// /experts shows. A surface that could list somebody the catalogue hides would
// be publishing a profile nobody approved.

import { NextResponse } from 'next/server'
import { queryProviders } from '@/app/experts/_providers'

export const dynamic = 'force-dynamic'

/** A soft cap. The catalogue takes the whole roster; a rail takes a rail. */
const MAX = 60

export async function GET(req: Request) {
  const url = new URL(req.url)
  const rawLimit = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(MAX, Math.round(rawLimit)) : 18
  // A category SLUG, bounded before it reaches a query — this is a URL anybody
  // can craft. Unknown slugs simply match nobody.
  const cat = (url.searchParams.get('category') ?? '').trim().toLowerCase()
  const cats = /^[a-z0-9-]{1,40}$/.test(cat) ? [cat] : []

  try {
    const { rows } = await queryProviders({ groups: [], topics: [], cities: [], cats, limit })
    return NextResponse.json(rows)
  } catch {
    // A dashboard rail must not take the page down. An empty list renders the
    // rail's own „nothing here" state, which is honest about the outcome.
    return NextResponse.json([])
  }
}
