import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main(){
  const ns = await p.notification.findMany({ where:{ userId:'cmt1h095w000gle01msmgjsoz' }, orderBy:{createdAt:'desc'}, take:5, select:{ type:true, title:true, href:true, readAt:true, createdAt:true } })
  console.log('provider notifications:', JSON.stringify(ns,null,1))
}
main().finally(()=>p.$disconnect())
