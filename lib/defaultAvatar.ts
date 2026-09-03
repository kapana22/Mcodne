// The default avatar — what a photo-less account shows in every avatar slot.
//
// ⚠️ IT IS A DRAWN PORTRAIT SINCE 2026-09-03, NOT A GLYPH. What stood here was
// a soft person glyph on a brand-green wash, and its comment said in so many
// words „no letter monogram, no stock face". The owner replaced it with two
// portraits from the 3D clay series the rest of the site now uses
// (MCDONE_3D_ICON_STYLE_GUIDE), which is the newer decision; the guide allows a
// human face exactly where the function needs one, and an avatar is that place.
//
// ⚠️ TWO OF THEM, PICKED BY NAME, AND THAT IS THE POINT. A single portrait
// turns a list of twenty photo-less providers into the same face twenty times,
// which reads as a bug. `defaultAvatarFor` hashes whatever name it is handed,
// so a given person keeps the SAME face on every screen and across reloads —
// it is a pure function of the name, so the server and the browser agree and
// there is nothing to store.
//
// ⚠️ IT IS A PLACEHOLDER AND IT MUST KEEP LOOKING LIKE ONE. The drawing is
// obviously clay, not a photograph — that is what keeps it honest in a
// marketplace where the avatar beside a price is supposed to be the person.
// If it is ever made photoreal, this stops being a default and starts being a
// claim about somebody.

/** The two portraits, in a stable order — the index is what the hash picks. */
export const DEFAULT_AVATARS = [
  '/avatars/default-a-384.png',
  '/avatars/default-b-384.png',
] as const

/**
 * Same name → same face, everywhere, forever. FNV-1a over the UTF-16 units:
 * short, dependency-free, and stable across runtimes — which matters, because
 * a server and a client that disagree here produce a hydration mismatch.
 */
export function defaultAvatarFor(seed?: string | null): string {
  if (!seed) return DEFAULT_AVATARS[0]
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return DEFAULT_AVATARS[h % DEFAULT_AVATARS.length]
}

/**
 * For the call sites that have no name to hash — kept so `src={x || DEFAULT_AVATAR}`
 * keeps working. Prefer `defaultAvatarFor(name)` wherever a name is in scope.
 */
export const DEFAULT_AVATAR = DEFAULT_AVATARS[0]
