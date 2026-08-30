// Puts the /join „how it works" step-3 title back in step with its own
// description. 2026-08-29
//
//   npx tsx scripts/sitetext-step3-2026-08-29.ts
//
// ⚠️ WHY A SCRIPT AND NOT A DEFAULT. `lib/siteTextDefs` holds the DEFAULT for
// every key; the live site reads the `SiteText` ROW and falls back to the
// default only when the row is missing. If this key has a row — and the launch
// scripts wrote rows for most of this group — changing the default moved
// nothing. This is the half that does.
//
// ⚠️ WHAT WAS WRONG. „გამოაქვეყნე თავისუფალი დრო" was the booking product's
// third step. That product went on 2026-08-24 and step 3's DESCRIPTION was
// updated to what actually happens after approval („დამტკიცების შემდეგ შენი
// პროფილი ძიებაში გამოჩნდება და კლიენტების მოთხოვნებს მიიღებ — შეთავაზებას
// თავად აგზავნი"); the title above it was not. /join therefore opened its
// recruiting pitch by telling an applicant to do something no screen on the
// site can do, and corrected itself in smaller type directly underneath.
//
// The replacement is not authored — it is the description's own subject.
//
// ⚠️ IT PRINTS THE OLD VALUE BEFORE WRITING, like the scripts beside it. This
// is the owner's copy; the previous text is echoed so it can be put back by
// hand from ადმინი → ტექსტები. Re-running is safe.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const COPY: Record<string, string> = {
  'apply.how.step3.title': 'მიიღე მოთხოვნები',
}

async function main() {
  for (const [key, value] of Object.entries(COPY)) {
    const row = await prisma.siteText.findUnique({ where: { key }, select: { value: true } })
    console.log(row ? `  ${key}\n    was: ${row.value}\n    now: ${value}` : `  ${key} — no row; the default now carries it`)
    if (!row) continue
    await prisma.siteText.update({ where: { key }, data: { value } })
  }
  console.log('\ndone')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
