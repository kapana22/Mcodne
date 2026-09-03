'use client'
// „ნამუშევრის ფოტოები" — the proof half of the one provider editor.
//
// ⚠️ IT WAS `_provider.tsx`, A SECOND FORM ON THIS PAGE, UNTIL 2026-08-30. It
// had its own fetch, its own dirty flag, its own `useUnsavedGuard` and its own
// sticky save bar — sitting BELOW a tab bar it did not belong to, on a page
// whose tabs therefore lied about being its structure. Two guards on one screen
// meant „შენახული არ არის" could fire twice, for two different halves of one
// row, at two different moments.
//
// What is left is the card. The parent owns the draft and the single save.
//
// ⚠️ THE STORED PHOTOS ARE TOKENS, NEVER BYTES — this is the one rule that had
// to travel with the markup. `kept:<n>` stands for „the n-th photo you already
// hold" and the endpoint resolves it. A form that had to receive six base64
// images so somebody could delete one would ship a megabyte on every open, and
// the GET deliberately sends a COUNT instead.

import { WorkPhotos } from '@/app/join/_provider/_workPhotos'
import { Card } from '@/components/Card'
import { MAX_WORK_PHOTOS } from '@/lib/serviceProfile'

export function PhotosSection({ profileId, stamp, photos, setPhotos }: {
  profileId: string | null
  /** `updatedAt`, busting the year-long cache on the photo route. */
  stamp: string
  photos: string[]
  setPhotos: (next: string[]) => void
}) {
  /** A stored photo draws through the public route by index; a fresh one is
   *  already a data URI and draws itself. */
  const photoSrc = (v: string, i: number) =>
    v.startsWith('kept:') && profileId
      ? `/api/providers/${profileId}/photo?n=${v.slice(5)}&v=${stamp}-${i}`
      : v

  /* ⚠️ `id` AND `scroll-mt-24` SO THE CHECKLIST CAN REACH IT (2026-09-03). The
     card beside the form now lists the six tasks that PAY, and one of them is
     the work photos — `taskAnchor('PROFILE_CERTIFICATE')` names this exact id.
     Without it that row scrolled nowhere. The margin matches the other two
     sections, so the heading clears the sticky bar. */
  return (
    <Card id="section-photos" className="scroll-mt-24">
      {/* ⚠️ THE FACE UPLOADER WAS HERE AND IT WAS THE SECOND ONE (removed
          2026-08-29). This card wrote `ServiceProfile.photoUrl` under the words
          „ფოტო — ეს ჩანს კლიენტთან, სიაში", while the ავატარი block above wrote
          `User.avatarUrl` under „ატვირთე პროფილის ფოტო". Two uploaders, one
          face, both claiming to be the public one — and only one of them was,
          silently: app/experts/_providers.ts prefers `photoUrl` and falls back
          to the avatar. So a provider could replace their photo in the block
          the completeness checklist scores, be told they were finished, and
          keep showing the old face in the catalogue.

          One uploader now, the ავატარი block in `_secIdentity`, and
          /api/uploads drops `photoUrl` when a new one is picked so the fallback
          takes over. The column stays — 27 migrated professionals have never
          written it and their cards read through it. */}
      <h2 className="font-display text-h3 font-bold text-ink-900">ნამუშევრის ფოტოები</h2>
      <p className="mt-1 text-small text-ink-600">
        შესრულებული სამუშაო ყველაზე კარგი მტკიცებულებაა. მაქსიმუმ {MAX_WORK_PHOTOS}.
      </p>
      <div className="mt-4">
        <WorkPhotos
          // Display only: what the form keeps is the token or the data URI.
          value={photos.map((v, i) => photoSrc(v, i))}
          onChange={next => setPhotos(next.map(src => photos.find((v, i) => photoSrc(v, i) === src) ?? src))}
          max={MAX_WORK_PHOTOS}
        />
      </div>
    </Card>
  )
}
