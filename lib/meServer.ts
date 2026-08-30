// THE IDENTITY THE FIRST PAINT NEEDS — the server half of lib/me.
//
// ⚠️ WHY THIS FILE EXISTS (2026-08-30). Owner: „ხანდახან დილეი აქვს, ნახევარს
// ტვირთავს ხოლმე რაღაცებს და მერე ჩნდება ხოლმე — ესე არ უნდა ხდებოდეს."
//
// The header is a client component fed by `useMe`, which probes /api/me AFTER
// mount. Pages therefore hand it `initialUser` so the first paint is already
// right — and four pages built that object BY HAND, each with the same four
// fields:
//
//     { id, fullName, avatarUrl, role }
//
// That is not what the header reads. It also reads `provider` (whether to show
// the „მოთხოვნის გაგზავნა" button, and whether to invite them to join) and
// `balanceTetri` (the credit pill). Neither was in the hand-built object, so on
// EVERY page load a signed-in provider got:
//
//   · the request button drawn, then removed a beat later — they sell here, the
//     button is not for them (lib/requests → showRequestCta), and
//     PublicTopBar's own note claimed `initialUser` „resolves it in the FIRST
//     paint on every server-rendered page". It could not: the field was absent.
//   · no balance pill, then a balance pill.
//
// Two visible re-layouts of the top bar on the site's busiest pages, on every
// cold load. That is the „half loads, then appears" exactly.
//
// ⚠️ THE SHAPE HAS TO MATCH /api/me OR THE FLIP SURVIVES. This builds the same
// fields from the same two calls that route makes (`identityOf` + `balanceOf`,
// in parallel), so when the probe resolves it agrees with what is already on
// screen and nothing moves. A first paint that is merely CLOSER would still
// flicker, just less often — which is worse, because it stops being reported.
import { getCurrentUser } from '@/lib/auth'
import { identityOf } from '@/lib/identity'
import { balanceOf } from '@/lib/creditsServer'
import type { Me } from '@/lib/me'

/**
 * The signed-in identity for a server-rendered page's `initialUser`, or null
 * for a guest.
 *
 * ⚠️ IT NEVER THROWS AND IT NEVER HANGS. A session blip or an unreachable
 * database must not take a public page down — „null just means render as
 * guest", the rule app/page already followed, with the same 2s ceiling and for
 * the same reason: on the day Postgres went, the session read spent the pool
 * timeout before anybody reached the catch, and the home page answered in ten
 * seconds instead of instantly.
 */
export async function initialMe(): Promise<Me> {
  try {
    const user = await withDeadline(getCurrentUser(), 2000)
    if (!user) return null

    // Beside each other, not after: the balance is one indexed read on
    // (userId, createdAt) and costs no latency unless it extends the chain.
    // Degrading to the bare user is deliberate — a header with a name and no
    // pill is a smaller wrong than a page that does not render.
    const [identity, balanceTetri] = await withDeadline(
      Promise.all([identityOf(user.id), balanceOf(user.id)]),
      2000,
    ) ?? [null, null]

    return {
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: (identity?.role ?? user.role) as NonNullable<Me>['role'],
      hats: identity?.hats,
      provider: identity?.provider,
      // ⚠️ NULL AND ZERO ARE DIFFERENT, and /api/me draws the same line: null
      // means „nothing to show" (this person sells nothing), 0 means „spent it
      // all". Handing a plain client a 0 would put a number in their bar for
      // something they can neither earn nor spend.
      balanceTetri: identity?.provider ? balanceTetri : null,
    }
  } catch {
    return null
  }
}

/** Resolve, or give up with null — never reject, never outlive `ms`. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms)
    p.then(
      v => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(null) },
    )
  })
}
