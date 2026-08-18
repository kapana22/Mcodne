// WHO ACTUALLY DOES THIS WORK — the listing /services was missing.
//
// ⚠️ THE PAGE SHIPPED AS EIGHT CATEGORY TILES AND THAT WAS A MISREADING. The
// reasoning at the time was that there is no public provider data — no slug, no
// visibility flag, no reviews — so a directory would be the „empty room with a
// URL" this codebase refuses. But the visibility rule already existed and I did
// not see it: a master is publicly real when they have a ServiceProfile AND an
// active RequestAccess row, which is the SAME pair `hatsOf` uses to decide they
// are a master at all. One rule, two readers.
//
// ⚠️ BUSINESSES AND INDIVIDUALS BOTH, AND THE CARD SAYS WHICH. Owner,
// 2026-08-18: „სერვისების ნაწილი დარეგისტრირებული ბიზნესმენები და ნაწილი
// ინდივიდუალური." They are told about work identically and bid identically —
// what differs is who the client ends up dealing with, and that is exactly the
// thing a client is entitled to know before they choose.
//
// ⚠️ NO PROFILE LINK, DELIBERATELY. There is no public page to send anybody to
// yet: ServiceProfile has no slug and no photos. A card that looks clickable and
// is not is worse than one that does not pretend. The action here is the intake.

import { prisma } from '@/lib/prisma'
import { serviceLabels, areaLabels, priceHint } from '@/lib/serviceProfile'
import { Card } from '@/components/Card'

export async function Masters() {
  // The visibility rule, stated once: the master's own switch AND the admin's.
  // `available` is a holiday toggle the master owns; `RequestAccess.active` is
  // the moderation state. A public listing needs both to be true.
  const rows = await prisma.serviceProfile.findMany({
    where: {
      available: true,
      OR: [
        { user: { requestAccess: { active: true } } },
        { company: { requestAccess: { active: true } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 60,
    select: {
      id: true, services: true, areas: true, calloutFee: true, priceFrom: true,
      user: { select: { fullName: true } },
      company: { select: { name: true } },
    },
  })

  // Empty is an answer, not a gap — and saying nothing is better than drawing a
  // heading over a blank. The category tiles above already carry the page.
  if (rows.length === 0) return null

  return (
    <>
      <h2 className="font-display text-h2 font-bold text-ink-900 tracking-tight">
        ვინ მუშაობს
      </h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(r => {
          const isCompany = r.company !== null
          const name = r.company?.name ?? r.user?.fullName ?? '—'
          const price = priceHint(r)
          return (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-h3 font-bold text-ink-900">{name}</h3>
                {/* Hairline badge, no pastel fill — the canon's rule for every
                    badge on this site. „ფირმა" and its absence are the whole
                    distinction, so the individual case needs no badge at all:
                    a label on both would be two labels saying one thing. */}
                {isCompany && (
                  <span className="shrink-0 h-6 px-2 rounded-pill border border-ink-200 text-meta text-ink-600 inline-flex items-center">
                    ფირმა
                  </span>
                )}
              </div>
              <p className="mt-2 text-small text-ink-700 leading-relaxed">
                {serviceLabels(r.services).join(' · ')}
              </p>
              <p className="mt-2 text-meta text-ink-500">
                {areaLabels(r.areas).join(', ')}
                {price ? ` · ${price}` : ''}
              </p>
            </Card>
          )
        })}
      </div>
    </>
  )
}
