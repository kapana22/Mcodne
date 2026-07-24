import { randomUUID } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────
// The ONE place a video-room URL is minted.
//
// Provider is env-selected — flip with a variable, no code change:
//   • DAILY_API_KEY set   → a managed Daily.co room (reliable, prejoin UI,
//     recording-ready). This is the intended production provider.
//   • otherwise (interim) → a random room on a Jitsi host (VIDEO_MEETING_DOMAIN,
//     default FFMUC's open instance). Point VIDEO_MEETING_DOMAIN at a paid 8x8
//     JaaS / self-hosted Jitsi for more reliability without touching code.
//
// `newMeetingUrl()` is async because Daily needs a REST call; the Jitsi path
// resolves immediately. If the Daily call fails for any reason we fall back to a
// Jitsi room rather than block a booking. The URL is persisted on the booking
// and shared by both parties.
//
// Rooms created on a DIFFERENT provider than the active one are treated as stale
// (isStaleMeetingUrl) and lazily regenerated the next time anyone opens them —
// so setting DAILY_API_KEY migrates every existing booking to Daily on its own.
// ─────────────────────────────────────────────────────────────────────────

const MEETING_DOMAIN = process.env.VIDEO_MEETING_DOMAIN?.trim() || 'meet.ffmuc.net'
const DAILY_API_KEY = process.env.DAILY_API_KEY?.trim()

function jitsiUrl(): string {
  return `https://${MEETING_DOMAIN}/mcodne-${randomUUID().replace(/-/g, '')}`
}

// Create a Daily room via their REST API. Returns null on ANY failure so the
// caller falls back to the interim Jitsi room instead of failing the booking.
async function dailyRoomUrl(): Promise<string | null> {
  if (!DAILY_API_KEY) return null
  try {
    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${DAILY_API_KEY}`, 'Content-Type': 'application/json' },
      // A prejoin screen lets each party check camera/mic before entering.
      body: JSON.stringify({ properties: { enable_prejoin_ui: true } }),
    })
    if (!res.ok) return null
    const j = (await res.json().catch(() => null)) as { url?: string } | null
    return typeof j?.url === 'string' ? j.url : null
  } catch {
    return null
  }
}

// Mint a room URL: Daily when configured, else the interim Jitsi room.
export async function newMeetingUrl(): Promise<string> {
  return (await dailyRoomUrl()) ?? jitsiUrl()
}

// A stored room is stale (→ regenerate on next open) when it's missing OR not on
// the CURRENTLY-active provider. This lazily migrates every already-created
// booking whenever the provider changes: legacy meet.jit.si → FFMUC, and any
// Jitsi room → Daily the moment DAILY_API_KEY is set.
export function isStaleMeetingUrl(url: string | null | undefined): boolean {
  if (!url) return true
  return DAILY_API_KEY ? !url.includes('.daily.co') : !url.includes(MEETING_DOMAIN)
}
