import { chromium } from 'playwright'
const B='http://localhost:3000'
const b=await chromium.launch({headless:true})
// 1. GUEST /tutors — SSR header nav in initial HTML
const gHtml=await (await fetch(`${B}/tutors`)).text()
const navItems=['ექსპერტები','კატეგორიები','გახდი ექსპერტი','დახმარება']
const guestNav=navItems.filter(x=>gHtml.includes(x))
const guestSignin=gHtml.includes('შესვლა')||gHtml.includes('დაწყება')
console.log('GUEST /tutors SSR: nav items present:', guestNav.length+'/4', '| signin/CTA:', guestSignin)
// 2. LOGGED-IN student /tutors — header should show SAME nav + avatar, no signin CTA, on first paint (SSR)
const ctx=await b.newContext(); await ctx.request.post(`${B}/api/auth/signin`,{data:{email:'student@mcodne.ge',password:'student1234'},timeout:120000})
const cookies=await ctx.cookies(); const cookieHdr=cookies.map(c=>`${c.name}=${c.value}`).join('; ')
const sHtml=await (await fetch(`${B}/tutors`,{headers:{cookie:cookieHdr}})).text()
const studentNav=navItems.filter(x=>sHtml.includes(x))
const hasAvatar=/avatar|<img[^>]+alt=/i.test(sHtml)
// role-specific nav that should NOT appear (uniform nav):
const roleNavLeak=['ჩემი ჯავშნები','ჩემი სივრცე'].filter(x=>sHtml.includes(x))
console.log('STUDENT /tutors SSR: same nav:', studentNav.length+'/4', '| role-nav leaked (should be 0):', roleNavLeak.length, roleNavLeak)
// 3. does the SSR html for logged-in already NOT show signin CTA? (correct auth first paint)
const studentShowsSignin=/>\s*შესვლა\s*</.test(sHtml) && /დაწყება/.test(sHtml)
console.log('STUDENT first-paint shows guest signin/CTA (should be false):', studentShowsSignin)
await b.close()
