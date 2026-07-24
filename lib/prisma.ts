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
  return `${base}${sep}connection_limit=15&pool_timeout=30`
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: tunedDatabaseUrl() } },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
