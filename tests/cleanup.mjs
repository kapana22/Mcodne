import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const del = await p.booking.deleteMany({
  where: {
    student: { email: 'student@mcodne.ge' },
    status: { in: ['PREPARING', 'CONFIRMED'] },
    topic: { contains: 'audit test' },
  },
})
console.log('deleted:', del.count)
await p.$disconnect()
