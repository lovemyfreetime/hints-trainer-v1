// Requires Playwright and a Chromium installation. Run against a local HTTP server.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const loaded=process.env.HINTS_CHROMIUM_HELPER?require(process.env.HINTS_CHROMIUM_HELPER):null;
 const helper=loaded?.default||loaded;
 const browser=await chromium.launch(helper?{executablePath:await helper.executablePath(),args:helper.args,headless:true}:{headless:true});
 const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let count=0,projector;
 async function test(name,fn){await fn();console.log('PASS '+name);count++;}
 try{
  await page.goto(process.env.HINTS_TEST_URL||`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>!!window.BTHintsUI);
  // Allow initial service-worker claiming/reload to complete before interacting.
  await page.evaluate(()=>navigator.serviceWorker?.ready.then(()=>true));
  await page.waitForTimeout(800);
  await test('panel opens with large controls and explicit foul-history choice',async()=>{
   await page.locator('#hintsToggle').click();assert(await page.locator('#hintsPanel').isVisible());
   assert.equal(await page.locator('#hintsFouls').inputValue(),'unknown');
   assert.equal(await page.locator('#hintsGroupLabel').isVisible(),false);
   await page.locator('#hintsFind').click();assert.match(await page.locator('#hintsStatus').innerText(),/foul count/);
   const size=await page.locator('#hintsFind').boundingBox();assert(size.height>=48);
  });
  await test('practice search reveals a verified two-shot plan',async()=>{
   await page.locator('#hintsPractice').click();await page.locator('#hintsFind').click();
   await page.waitForFunction(()=>!document.getElementById('hintsResult').hidden,{},{timeout:60000});
   assert.match(await page.locator('#hintsStatus').innerText(),/two-shot/);
   assert.equal(await page.locator('#hintsDetails li').count(),1);
  });
  await test('five cumulative levels and all shape controls draw without errors',async()=>{
   for(let i=2;i<=5;i++){await page.locator('#hintsLevel').selectOption(String(i));assert.equal(await page.locator('#hintsDetails li').count(),i);}
   for(const shape of ['circle','lane','wedge','irregular'])await page.locator('#hintsShape').selectOption(shape);
   assert(await page.locator('#hintsApply').isVisible());
   await page.screenshot({path:process.env.HINTS_SCREENSHOT||'/tmp/hints-preview.png',fullPage:true});
  });
  await test('projector opened after search receives current table, level and shape',async()=>{
   await page.locator('#hintsSettings summary').click();
   const popup=page.waitForEvent('popup');await page.locator('#hintsProjector').click();projector=await popup;
   projector.on('pageerror',e=>errors.push(e.message));
   await projector.waitForFunction(()=>window.BTHintsUI?.exportState()?.level===5);
   assert.equal(await projector.locator('#hintsToggle').isVisible(),false);
   const control=await page.evaluate(()=>window.BTHintsUI.exportState());
   assert.deepEqual(await projector.evaluate(()=>window.BTHintsUI.exportState()),control);
   await projector.screenshot({path:'/tmp/hints-projector-preview.png'});
   await page.locator('#hintsSettings summary').click();
  });
  await test('projector tracks changed hint level and zone shape',async()=>{
   await page.locator('#hintsLevel').selectOption('2');await page.locator('#hintsShape').selectOption('wedge');
   await projector.waitForFunction(()=>window.BTHintsUI.exportState()?.level===2&&window.BTHintsUI.exportState()?.shape==='wedge');
   await page.locator('#hintsLevel').selectOption('5');
  });
  await test('projector reload restores guidance and ignores unrelated sender',async()=>{
   await projector.reload();await projector.waitForFunction(()=>window.BTHintsUI?.exportState()?.level===5);
   const before=await projector.evaluate(()=>JSON.stringify(window.BTHintsUI.exportState()));
   await projector.evaluate(()=>window.postMessage({type:'state',state:{balls:[]},hints:null},location.origin));
   await projector.waitForTimeout(50);
   assert.equal(await projector.evaluate(()=>JSON.stringify(window.BTHintsUI.exportState())),before);
  });
  await test('applying recommendation changes controls and clears stale hints',async()=>{
   await page.locator('#hintsApply').click();assert.equal(await page.locator('#hintsResult').isVisible(),false);
   assert.match(await page.locator('#hintsStatus').innerText(),/applied/);
   await projector.waitForFunction(()=>window.BTHintsUI.exportState()===null);
  });
  await test('changing game cancels in-progress results',async()=>{
   await page.locator('#hintsFind').click();await page.locator('#hintsSettings summary').click();await page.locator('#hintsGame').selectOption('eight');
   assert.equal(await page.locator('#hintsResult').isVisible(),false);assert(await page.locator('#hintsGroupLabel').isVisible());
   assert.equal(await page.locator('#hintsCancel').isEnabled(),false);
  });
  await test('8-ball practice plan is available',async()=>{
   await page.locator('#hintsPractice').click();await page.locator('#hintsFind').click();
   await page.waitForFunction(()=>!document.getElementById('hintsResult').hidden,{},{timeout:60000});
   assert.match(await page.locator('#hintsStatus').innerText(),/two-shot/);
  });
  await test('starting animation clears hints in both windows',async()=>{
   await page.evaluate(()=>document.getElementById('animate').click());
   assert.equal(await page.evaluate(()=>window.BTHintsUI.exportState()),null);
   await projector.waitForFunction(()=>window.BTHintsUI.exportState()===null);
   await page.waitForFunction(()=>!window.__BT_SIMULATION__.isBusy(),{},{timeout:30000});
  });
  await test('keyboard dismissal and narrow viewport preserve reachable controls',async()=>{
   await page.locator('#hintsFind').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#hintsPanel').isVisible(),false);
   await page.setViewportSize({width:390,height:844});await page.locator('#hintsToggle').click();
   const box=await page.locator('#hintsPanel').boundingBox();assert(box.x>=0&&box.x+box.width<=390);
   await page.screenshot({path:'/tmp/hints-preview-narrow.png',fullPage:true});
  });
  await test('practice layout can be undone without losing prior table',async()=>{
   const before=await page.evaluate(()=>JSON.stringify(window.__BT_SIMULATION__.capture()));
   await page.evaluate(()=>window.__BT_SIMULATION__.practice('nine'));
   await page.evaluate(()=>document.getElementById('undoShot').click());
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__BT_SIMULATION__.capture())),before);
  });
  await test('offline reload retains coaching modules',async()=>{
   await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.BTHintsUI);
   assert(await page.locator('#hintsToggle').isVisible());
   await page.locator('#hintsToggle').click();await page.locator('#hintsPractice').click();await page.locator('#hintsFind').click();
   await page.waitForFunction(()=>!document.getElementById('hintsResult').hidden,{},{timeout:60000});
   assert.match(await page.locator('#hintsStatus').innerText(),/two-shot/);await context.setOffline(false);
  });
  await test('no browser JavaScript exceptions',()=>assert.deepEqual(errors,[]));
  console.log(`${count} Chromium UI checks passed. Physical Android and projector acceptance remain pending.`);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
