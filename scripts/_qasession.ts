// QA ONLY — mints a local session cookie for an existing user so the flows can
// be driven end to end against the dev server. Delete after use.
import { PrismaClient } from '@prisma/client'
import { randomBytes, createHash } from 'node:crypto'
const p = new PrismaClient()
async function main(){
  const email = process.argv[2]
  const u = await p.user.findFirst({ where:{ email:{ equals: email, mode:'insensitive' } }, select:{ id:true, role:true, fullName:true } })
  if (!u) { console.error('no user', email); process.exit(1) }
  const raw = randomBytes(32).toString('hex')
  await p.session.create({ data:{ userId:u.id, token:createHash('sha256').update(raw).digest('hex'), expiresAt:new Date(Date.now()+3600_000) } })
  console.log(JSON.stringify({ cookie:`mcodne_session=${raw}`, userId:u.id, role:u.role, name:u.fullName }))
}
main().finally(()=>p.$disconnect())
