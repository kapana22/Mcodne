const B='https://mcodne.ge'
const j=async(r)=>{try{return await r.json()}catch{return null}}
const login=async(e,pw)=>{const r=await fetch(`${B}/api/auth/signin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:pw})});const c=r.headers.get('set-cookie');return c?c.split(',').map(s=>s.split(';')[0]).join('; '):''}
const me=async(c)=>(await j(await fetch(`${B}/api/me`,{headers:{cookie:c}}))).user
const fails=[]
const sc=await login('student@mcodne.ge','student1234'); const student=await me(sc)
const ec=await login('giorgi.meladze@mcodne.ge','tutor1234'); const expert=await me(ec)
const tag='LIVE'+Date.now()
let r=await fetch(`${B}/api/messages`,{method:'POST',headers:{'Content-Type':'application/json',cookie:sc},body:JSON.stringify({toUserId:expert.id,body:tag+' Q'})}); console.log('student→expert:',r.status)
if(r.status!==200)fails.push('send')
r=await fetch(`${B}/api/messages`,{method:'POST',headers:{'Content-Type':'application/json',cookie:ec},body:JSON.stringify({toUserId:student.id,body:tag+' A'})}); console.log('expert reply:',r.status)
if(r.status!==200)fails.push('reply')
r=await fetch(`${B}/api/messages?withUser=${expert.id}`,{headers:{cookie:sc}}); let d=await j(r)
const bb=(d?.messages||[]).map(m=>m.body); console.log('student sees Q+A:',bb.some(x=>x.includes(tag+' Q'))&&bb.some(x=>x.includes(tag+' A')))
if(!(bb.some(x=>x.includes(tag+' Q'))&&bb.some(x=>x.includes(tag+' A'))))fails.push('thread')
// cold tutor blocked
const oc=await login('nino.kvitsinadze@mcodne.ge','tutor1234')
r=await fetch(`${B}/api/messages`,{method:'POST',headers:{'Content-Type':'application/json',cookie:oc},body:JSON.stringify({toUserId:student.id,body:'cold'})}); console.log('cold tutor (403?):',r.status)
if(r.status===200)fails.push('cold-guard')
// pages live
r=await fetch(`${B}/student/messages/u/${expert.id}`,{headers:{cookie:sc}}); console.log('student pair page:',r.status)
console.log(fails.length?'FAIL: '+fails.join(','):'\n✅ PRE-BOOKING MESSAGING LIVE & WORKING')
