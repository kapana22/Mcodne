const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch();
  const pages=[['home','/','Escrow'],['tutors','/tutors','ექსპერტ'],['profile','/tutors/cmrizguas000aomkerm6milb8','გიორგი'],['apply','/apply','ხელით შემოწმებული'],['categories','/categories','აირჩიე'],['signin','/signin','ანგარიში'],['contact','/contact','კითხვა']];
  const errs=[];const overflows=[];
  for(const [n,p,wt] of pages){
    const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const pg=await ctx.newPage();
    pg.on('pageerror',e=>errs.push(n+':'+String(e).slice(0,70)));
    await pg.goto('http://localhost:3000'+p,{waitUntil:'domcontentloaded',timeout:35000});
    await pg.waitForFunction(t=>new RegExp(t).test(document.body.innerText),wt,{timeout:30000}).catch(()=>{});
    await pg.waitForTimeout(1200);
    const of=await pg.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
    if(of)overflows.push(n);
    await ctx.close();
  }
  console.log('horizontal overflow on:',overflows.length?overflows.join(', '):'NONE');
  console.log('JS errors:',errs.length?JSON.stringify(errs):'none');
})();
