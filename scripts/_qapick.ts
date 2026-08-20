import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main(){
  const client = await p.user.findFirst({ where:{ role:'STUDENT', tutor:null, serviceProfile:null, suspendedAt:null }, select:{ id:true, email:true, fullName:true } })
  const provider = await p.serviceProfile.findFirst({ where:{ slug:'mcodne-2' }, select:{ id:true, slug:true, userId:true, user:{select:{email:true,fullName:true}} } })
  const expert = await p.tutorProfile.findFirst({ where:{ available:true, consultations:{ some:{} }, availability:{ some:{} } }, select:{ id:true, slug:true, userId:true, user:{select:{email:true,fullName:true}}, consultations:{select:{id:true,title:true,minutes:true,price:true,bookable:true}} } })
  const admin = await p.user.findFirst({ where:{ role:'ADMIN' }, select:{ id:true, email:true } })
  console.log(JSON.stringify({ client, provider, expert, admin }, null, 1))
}
main().finally(()=>p.$disconnect())
