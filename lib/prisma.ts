import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Prisma's default pool is tiny (num_physical_cpus × 2 + 1 → ~3–5 on a small
// Railway instance). This app fires several background pollers per open tab
// (chat 15s, nav-badges/notifications 60s, conversation-list 20s) plus normal
// page reads, so bursts of concurrent queries queue behind that tiny pool and
// wait — the intermittent multi-second / 50s `/api/bookings/[id]` responses.
// A modestly larger pool + a generous acquire timeout lets those bursts run
// concurrently instead of serialising. `connection_limit=15` stays well under
// Postgres' default max_connections. Appended in CODE so the Railway
// DATABASE_URL env var is never edited (a malformed URL there would break every
// connection). Respects an existing `connection_limit` if one is ever set.
function tunedDatabaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL
  if (!base || base.includes('connection_limit')) return base
  const sep = base.includes('?') ? '&' : '?'
  // ⚠️ `pool_timeout` WAS 30 AND IS 10 (2026-08-27). Thirty seconds was chosen
  // for BURSTS — several pollers per open tab queueing behind a small pool —
  // and it is far more than a burst ever needs at connection_limit=15. What it
  // also governed was the pathological case: with Postgres unreachable, every
  // request sat here for thirty seconds before anything could report a failure,
  // which is long past the point where a proxy has given the visitor a gateway
  // error. Ten still absorbs a burst and bounds the outage.
  // `connect_timeout` is stated rather than left to the default so both halves
  // of „the database is not answering" are written down in one place.
  return `${base}${sep}connection_limit=15&pool_timeout=10&connect_timeout=5`
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: tunedDatabaseUrl() } },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
