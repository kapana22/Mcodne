import { NextResponse } from 'next/server'
import { queryTutors } from '@/lib/tutorsQuery'

// Thin wrapper over the shared queryTutors() (lib/tutorsQuery) — the SAME
// function the server-rendered /tutors page calls for its initial list, so the
// SSR seed and every client refetch share one query + one output shape. This
// route only parses searchParams; the query/shaping logic lives in the lib.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const typeParam = searchParams.get('type')
  const serviceType =
    typeParam === 'CONSULTATION' || typeParam === 'RECURRING' ? typeParam : null

  const shaped = await queryTutors({
    q: searchParams.get('q'),
    category: searchParams.get('category'),
    serviceType,
    onlyFeatured: searchParams.get('featured') === '1',
    limit: Number(searchParams.get('limit') ?? 200),
  })

  return NextResponse.json(shaped)
}
