import { prisma } from './prisma'

// In-app notification creation helper. All Prisma failures are swallowed so a
// dead notification write never blocks the primary transition (e.g. accepting
// a booking must succeed even if the notification INSERT fails).

export type NotifType =
  | 'BOOKING_CREATED'
  | 'BOOKING_CANCELED'
  | 'RESCHEDULE_REQUEST'
  | 'MESSAGE_NEW'
  | 'REVIEW_NEW'
  | 'APPLICATION_STATUS'
  | 'ADMIN_BROADCAST'
  | 'PAYOUT'
  | 'GENERIC'

// The 5 opt-outable categories. Types outside this list (PAYOUT, GENERIC) are
// always delivered — they carry money/audit signal, not marketing.
export type PrefKey =
  | 'BOOKING_CREATED'
  | 'MESSAGE_NEW'
  | 'REVIEW_NEW'
  | 'APPLICATION_STATUS'
  | 'ADMIN_BROADCAST'

// Group all booking lifecycle types under BOOKING_CREATED — one toggle for
// "ჯავშნის ცვლილება" covers both new-request and canceled notifications.
function prefKeyForType(t: string): PrefKey | null {
  if (t === 'BOOKING_CREATED' || t === 'BOOKING_CANCELED' || t === 'RESCHEDULE_REQUEST') return 'BOOKING_CREATED'
  if (t === 'MESSAGE_NEW') return 'MESSAGE_NEW'
  if (t === 'REVIEW_NEW') return 'REVIEW_NEW'
  if (t === 'APPLICATION_STATUS') return 'APPLICATION_STATUS'
  if (t === 'ADMIN_BROADCAST') return 'ADMIN_BROADCAST'
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
async function isTypeEnabled(userId: string, type: string): Promise<boolean> {
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
