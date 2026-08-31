import { prisma } from './prisma'

// In-app notification creation helper. All Prisma failures are swallowed so a
// dead notification write never blocks the primary transition (e.g. accepting
// a booking must succeed even if the notification INSERT fails).

// ⚠️ FIVE BOOKING TYPES LEFT THIS UNION ON 2026-08-26 — `BOOKING_CREATED`,
// `BOOKING_CANCELED`, `BOOKING_COMPLETED`, `BOOKING_REMINDER` and
// `RESCHEDULE_REQUEST`. Nothing had emitted one since the booking product was
// removed on 2026-08-24, and their pref row („ჯავშნის ცვლილება") sat in
// /settings as a switch that governed no notification anybody could receive.
export type NotifType =
  | 'MESSAGE_NEW'
  | 'REVIEW_NEW'
  | 'APPLICATION_STATUS'
  | 'APPLICATION_NEW'
  | 'ADMIN_BROADCAST'
  | 'PAYOUT'
  | 'GENERIC'
  // The requests subsystem (2026-08-19, D10/D12). Typed so the bell can tell
  // „a client wrote first" from „a request came in" without parsing titles;
  // pref-wise REQUEST_MESSAGE follows MESSAGE_NEW (see below) and the other
  // three are always delivered. REQUEST_NEW goes to admins only (the queue ping, like
  // APPLICATION_NEW). PAYOUT carries ONE thing since 2026-08-30 — the automatic
  // refund of a contact bought on a request that died unanswered (lib/requestJobs
  // → refundDeadRequest). It is filed here, among the uncontrolled types, for the
  // reason those exist: money moving is not a notification anybody may switch off.
  | 'REQUEST_NEW'
  | 'REQUEST_INVITE'
  | 'REQUEST_MESSAGE'
  | 'REQUEST_DONE'

// The 5 opt-outable categories. Types outside this list (PAYOUT, GENERIC,
// APPLICATION_NEW, REQUEST_*) are always delivered — they carry money/audit/ops signal,
// not marketing. APPLICATION_NEW in particular goes only to admins as a
// moderation-queue ping (same rationale as the GENERIC dispute pings).
export type PrefKey =
  | 'MESSAGE_NEW'
  | 'REVIEW_NEW'
  | 'APPLICATION_STATUS'
  | 'ADMIN_BROADCAST'

// ⚠️ `MESSAGE_NEW` NOW ANSWERS FOR `REQUEST_MESSAGE` (2026-08-26). The toggle
// reads „ახალი შეტყობინება · ახალი ტექსტი მიმოწერაში" and that is EXACTLY what
// a REQUEST_MESSAGE is — but the two were never wired together, so the switch
// governed a type nothing sends while the chat pings it describes were
// always-on. The rest of the REQUEST_* family stays always-on deliberately:
// REQUEST_NEW is the admins' queue ping, and INVITE/DONE are the transaction
// itself — a provider who silenced those would simply stop hearing about work.
function prefKeyForType(t: string): PrefKey | null {
  if (t === 'MESSAGE_NEW' || t === 'REQUEST_MESSAGE') return 'MESSAGE_NEW'
  if (t === 'REVIEW_NEW') return 'REVIEW_NEW'
  if (t === 'APPLICATION_STATUS') return 'APPLICATION_STATUS'
  if (t === 'ADMIN_BROADCAST') return 'ADMIN_BROADCAST'
  // REQUEST_NEW / REQUEST_INVITE / REQUEST_DONE fall through to null on
  // purpose — the same always-on group GENERIC sits in.
  return null
}

export const DEFAULT_PREFS: Record<PrefKey, boolean> = {
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
 *  way `notify` does — see app/api/provider-applications/[id]. */
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
