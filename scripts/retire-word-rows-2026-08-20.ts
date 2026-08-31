// The last fourteen rows carrying the retired word. Owner: „ხელოსნები აღარ
// უნდა გამოგყევენებინა არსად" — and „არსად" includes the notification bell.
//
//   npx tsx scripts/retire-word-rows-2026-08-20.ts
//
// ⚠️ NO ROW IS DELETED. Each is rewritten in place, and only the word changes.
// The writers were fixed first (app/api/provider-applications emits „ახალი
// განაცხადი — სერვისი" now), so nothing regenerates these.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const W = 'ხელოს'

async function main() {
  const notes = await prisma.notification.updateMany({
    where: { title: 'ახალი ხელოსანი' },
    data: { title: 'ახალი განაცხადი — სერვისი' },
  })
  console.log(`✓ Notification.title: ${notes.count} rows`)

  // The two free-text rows are one each and are edited by id, not by pattern:
  // a blind replace across a `note` column an admin types into is how a sweep
  // starts rewriting somebody's sentence.
  for (const r of await prisma.requestAccess.findMany({ select: { id: true, note: true } })) {
    if (!r.note?.includes(W)) continue
    const next = r.note.replace(/ხელოსანი/g, 'სერვისი').replace(/ხელოსნები/g, 'სერვისები')
    await prisma.requestAccess.update({ where: { id: r.id }, data: { note: next } })
    console.log(`✓ RequestAccess ${r.id}: „${r.note}" → „${next}"`)
  }
  for (const r of await prisma.serviceRequest.findMany({ select: { id: true, contactName: true } })) {
    if (!r.contactName?.includes(W)) continue
    const next = r.contactName.replace(/ხელოსანი/g, 'სერვისი').replace(/ხელოსნები/g, 'სერვისები')
    await prisma.serviceRequest.update({ where: { id: r.id }, data: { contactName: next } })
    console.log(`✓ ServiceRequest ${r.id}: „${r.contactName}" → „${next}"`)
  }

  const left = await prisma.notification.count({ where: { title: { contains: W } } })
  if (left) throw new Error(`${left} notifications still carry it`)
  console.log('✓ guard: nothing left in the notification titles')
}
main().then(() => console.log('\ndone')).catch(e => { console.error('FAILED:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())
