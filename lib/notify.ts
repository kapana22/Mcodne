import { prisma } from './prisma'

// In-app notification creation helper. All Prisma failures are swallowed so a
// dead notification write never blocks the primary transition (e.g. accepting
// a booking must succeed even if the notification INSERT fails).

export type NotifType =
  | 'BOOKING_CREATED'
  | 'BOOKING_CANCELED'
  | 'BOOKING_COMPLETED'
  | 'BOOKING_REMINDER'
  | 'RESCHEDULE_REQUEST'
  | 'MESSAGE_NEW'
  | 'REVIEW_NEW'
  | 'APPLICATION_STATUS'
  | 'APPLICATION_NEW'
  | 'ADMIN_BROADCAST'
  | 'PAYOUT'
  | 'GENERIC'
  // The requests subsystem (2026-08-19, D10/D12). Typed so the bell can tell
  // „a client wrote first" from „a request came in" without parsing titles;
  // pref-wise they are GENERIC — none maps to a PrefKey below, so all four are
  // always delivered. REQUEST_NEW goes to admins only (the queue ping, like
  // APPLICATION_NEW). PAYOUT never fires yet — payments are not live.
  | 'REQUEST_NEW'
  | 'REQUEST_INVITE'
  | 'REQUEST_MESSAGE'
  | 'REQUEST_DONE'

// The 5 opt-outable categories. Types outside this list (PAYOUT, GENERIC,
// APPLICATION_NEW, REQUEST_*) are always delivered — they carry money/audit/ops signal,
// not marketing. APPLICATION_NEW in particular goes only to admins as a
// moderation-queue ping (same rationale as the GENERIC dispute pings).
export type PrefKey =
  | 'BOOKING_CREATED'
  | 'MESSAGE_NEW'
  | 'REVIEW_NEW'
  | 'APPLICATION_STATUS'
  | 'ADMIN_BROADCAST'

// Group all booking lifecycle types under BOOKING_CREATED — one toggle for
// "ჯავშნის ცვლილება" covers new-request, canceled, completed, reschedule AND
// session-reminder notifications.
function prefKeyForType(t: string): PrefKey | null {
  if (t === 'BOOKING_CREATED' || t === 'BOOKING_CANCELED' || t === 'BOOKING_COMPLETED' || t === 'BOOKING_REMINDER' || t === 'RESCHEDULE_REQUEST') return 'BOOKING_CREATED'
  if (t === 'MESSAGE_NEW') return 'MESSAGE_NEW'
  if (t === 'REVIEW_NEW') return 'REVIEW_NEW'
  if (t === 'APPLICATION_STATUS') return 'APPLICATION_STATUS'
  if (t === 'ADMIN_BROADCAST') return 'ADMIN_BROADCAST'
  // REQUEST_NEW / REQUEST_INVITE / REQUEST_MESSAGE / REQUEST_DONE fall through
  // to null on purpose — the same always-on group GENERIC sits in.
  return null
}

export const DEFAULT_PREFS: Record<PrefKey, boolean> = {
  BOOKING_CREATED: true,
  MESSAGE_NEW: true,
  REVIEW_NEW: true,
  APPLICATION_STATUS: true,
  ADMIN_BROADCAST: true,
}

// Coerce arbitrary JSON into the strict boolean shape. Unknown keys are
// dropped, missing keys default to enabled. Non-object input → all defaults.
export function normalizePrefs(raw: unknown): Record<PrefKey, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_PREFS }
  const src = raw as Record<string, unknown>
  const out = { ...DEFAULT_PREFS }
  for (const k of Object.keys(DEFAULT_PREFS) as PrefKey[]) {
    if (typeof src[k] === 'boolean') out[k] = src[k] as boolean
  }
  return out
}

// Cheap single-row read + normalize. Returns defaults on any failure so a
// prefs-lookup outage never suppresses notifications.
/** Exported 2026-08-18 so the trades queue can pref-gate its own mails the same
 *  way `notify` does — see app/api/master-applications/[id]. */
export async function isTypeEnabled(userId: string, type: string): Promise<boolean> {
  const key = prefKeyForType(type)
  if (!key) return true // uncontrolled types (PAYOUT, GENERIC) always fire
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    })
    if (!row) return true
    const prefs = normalizePrefs(row.notificationPrefs)
    return prefs[key]
  } catch {
    return true
  }
}

export async function notify(
  userId: string,
  opts: { type?: NotifType | string; title: string; body?: string; href?: string },
) {
  try {
    const type = opts.type ?? 'GENERIC'
    // Pref gate — if the user opted out of this category, skip the insert.
    const enabled = await isTypeEnabled(userId, type)
    if (!enabled) return
    await prisma.notification.create({
      data: {
        userId,
        type,
        title: opts.title,
        body: opts.body ?? null,
        href: opts.href ?? null,
      },
    })
  } catch {
    // Silent — notification is a side-effect, not the primary action.
  }
}

// Fan-out: notify a list of userIds with the same message (e.g. all admins).
export async function notifyMany(
  userIds: string[],
  opts: { type?: NotifType | string; title: string; body?: string; href?: string },
) {
  await Promise.all(userIds.map(id => notify(id, opts)))
}
