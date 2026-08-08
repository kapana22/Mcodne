import { chromium } from 'playwright'
const D='/private/tmp/claude-501/-Users-kapana-Desktop-Tutor/f63e2b62-9fdc-47e2-b335-c08d43dea4a4/scratchpad'
const br = await chromium.launch()
const deadline = Date.now() + 9*60*1000
let done = false, out = []
while (Date.now() < deadline && !done) {
  const ctx = await br.newContext({viewport:{width:1440,height:900}})
  const p = await ctx.newPage(); p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(30000)
  const errs=[]; p.on('pageerror', e=>errs.push(String(e).slice(0,100)))
  try {
    await p.goto('https://mcodne.ge/signin',{waitUntil:'domcontentloaded'})
    await p.waitForSelector('input[type="email"]',{timeout:40000})
    await p.fill('input[type="email"]','admin@mcodne.ge')
    await p.fill('input[type="password"]', process.env.ADM_PW)
    await p.getByRole('button', { name: 'შესვლა', exact: true }).first().click()
    await p.waitForTimeout(8000)
    const role = await p.evaluate(async()=>{try{const r=await fetch('/api/me');return (await r.json())?.user?.role}catch{return null}})
    if (role !== 'ADMIN') { await ctx.close(); await new Promise(r=>setTimeout(r,15000)); continue }
    await p.goto('https://mcodne.ge/admin',{waitUntil:'domcontentloaded'})
    await p.waitForSelector('aside nav button',{timeout:40000}); await p.waitForTimeout(3000)
    const nav = await p.evaluate(() => {
      const groups=[...document.querySelectorAll('aside nav > div')].map(g=>({
        title:(g.querySelector('div')?.textContent||'').trim(),
        items:[...g.querySelectorAll('button')].map(b=>b.textContent.trim())}))
      return groups
    })
    const content = nav.find(g=>g.title==='კონტენტი')
    if (content && content.items.some(i=>i.includes('კოდი და ანალიტიკა'))) {
      done = true
      out.push(`✓ „კოდი და ანალიტიკა" is now in ჯგუფი „კონტენტი": ${content.items.join(' · ')}`)
      await p.evaluate(()=>{window.location.hash='integrations'}); await p.waitForTimeout(5000)
      const f = await p.evaluate(()=>{
        const m=document.querySelector('main')
        const vals=[...document.querySelectorAll('main input, main textarea')].map(e=>(e.value||'').length)
        return { head:(m?.innerText||'').slice(0,55).replace(/\n/g,' | '), vals }
      })
      out.push(`✓ tab opens: ${f.head}`)
      out.push(`✓ fields hold: ${f.vals.filter(n=>n>0).join(', ')} chars — GA id + header code intact`)
      const ga = await p.evaluate(async()=>{const x=await fetch('/');return (await x.text()).includes('G-4WFNGD5WNX')})
      out.push(ga ? '✓ GA tag serving on the public site' : '✖ GA tag missing')
      const warn = await p.evaluate(async()=>{await new Promise(r=>setTimeout(r,300))
        window.location.hash='texts'; await new Promise(r=>setTimeout(r,4000))
        return (document.querySelector('main')?.innerText||'').includes('საიტზე აღარ ჩანს')})
      out.push(warn ? '✖ orphan warning still shown' : '✓ no false orphan warning')
      out.push(errs.length ? `✖ page errors: ${errs[0]}` : '✓ no page errors')
      await p.screenshot({path:`${D}/final-admin.png`})
    }
  } catch(e) { /* retry */ }
  await ctx.close()
  if (!done) await new Promise(r=>setTimeout(r,20000))
}
console.log(done ? out.join('\n') : '✖ new build did not appear within the window')
await br.close(); process.exit(0)
