// Derived "is this session live right now?" oracle.
//
// The `LIVE` Booking status is never written anywhere (there is no cron/worker
// flipping CONFIRMED→LIVE at start time, and adding one that reliably fires
// isn't worth it). Instead we DERIVE liveness from the clock: a CONFIRMED (or
// already-LIVE) booking is "live" from its start until start+duration.
//
// Use this wherever the UI or an aggregate needs the real-time in-progress
// state — never a raw `status === 'LIVE'` check, which is effectively dead.
export function isBookingLive(b: {
  status: string
  startAt: Date | string
  durationMin: number
}): boolean {
  if (b.status !== 'CONFIRMED' && b.status !== 'LIVE') return false
  const start = new Date(b.startAt).getTime()
  if (Number.isNaN(start)) return false
  const end = start + b.durationMin * 60_000
  const now = Date.now()
  return now >= start && now < end
}
