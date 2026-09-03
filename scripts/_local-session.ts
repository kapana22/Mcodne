import { PrismaClient } from '@prisma/client'
import { randomBytes, createHash } from 'node:crypto'
const url = process.env.DATABASE_URL ?? ''
if (!url.includes('localhost')) { console.error('REFUSING: not localhost'); process.exit(1) }
const prisma = new PrismaClient()
async function main() {
  const u = await prisma.user.findUniqueOrThrow({ where: { email: process.argv[2] }, select: { id: true } })
  const raw = randomBytes(32).toString('hex')
  await prisma.session.create({ data: { userId: u.id, token: createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() + 864e5) } })
  console.log(raw)
}
main().finally(() => prisma.$disconnect())
