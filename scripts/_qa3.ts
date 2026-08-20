import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main(){
  const r = await p.serviceRequest.findFirst({ where:{ publicRef:'MC-2HGAK' } })
  if(!r){ console.log('NOT FOUND'); return }
  const { description, ...rest } = r as any
  console.log(JSON.stringify(rest, null, 1))
  const offers = await p.requestOffer.findMany({ where:{ requestId:r.id } })
  console.log('OFFERS:', JSON.stringify(offers, null, 1))
  const th = await p.requestThread.findMany({ where:{ requestId:r.id } }).catch(()=>null)
  console.log('THREADS:', JSON.stringify(th, null, 1))
}
main().finally(()=>p.$disconnect())
