const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 let count=0;const records=[];async function test(name,fn){await fn();console.log('PASS '+name);count++;}
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hints-preview-test-'));
 const archive=path.join(root,'releases/Hints-Trainer-V1-Browser-Preview.zip');
 await test('small package has valid hashes, complete assets, and no native installers/models',()=>{
  const code=`import zipfile,json,hashlib,pathlib,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 names=z.namelist()
 assert all(n.startswith('Hints-Trainer-V1-Preview/') and '..' not in n.split('/') for n in names)
 assert not any(n.endswith(('.apk','.exe','.onnx','.bin')) for n in names)
 m=json.loads(z.read('Hints-Trainer-V1-Preview/BUILD-CONTENTS.json'))
 for name,record in m['files'].items():
  data=z.read('Hints-Trainer-V1-Preview/'+name)
  assert len(data)==record['bytes'] and hashlib.sha256(data).hexdigest()==record['sha256']
 z.extractall(sys.argv[2])
`;
  cp.execFileSync('python',['-c',code,archive,temp]);assert(fs.statSync(archive).size<2*1024*1024);
  const dir=path.join(temp,'Hints-Trainer-V1-Preview'),html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  for(const m of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g))assert(fs.existsSync(path.join(dir,m[1])),m[1]);
  for(const icon of JSON.parse(fs.readFileSync(path.join(dir,'manifest.webmanifest'),'utf8')).icons)assert(fs.existsSync(path.join(dir,icon.src)));
 });
 await test('rebuilding produces identical archive bytes',()=>{
  const before=fs.readFileSync(archive);cp.execFileSync('python',['scripts/build-browser-preview.py'],{cwd:root});assert.deepEqual(fs.readFileSync(archive),before);
 });
 const loaded=process.env.HINTS_CHROMIUM_HELPER?require(process.env.HINTS_CHROMIUM_HELPER):null,helper=loaded?.default||loaded;
 const browser=await chromium.launch(helper?{executablePath:await helper.executablePath(),args:helper.args,headless:true}:{headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('billiardTrainerState','original-trainer-sentinel'));
 try{
  await test('extracted launch page opens trainer directly from disk',async()=>{
   await page.goto(pathToFileURL(path.join(temp,'Hints-Trainer-V1-Preview/START-HERE.html')).href);
   await page.getByRole('link',{name:'Open trainer',exact:true}).click();await page.waitForFunction(()=>!!window.BTHintsUI);
   assert.equal(await page.locator('#analyzePhotoBtn').isVisible(),false);
  });
  await test('local-file coaching works with network disabled',async()=>{
   await context.setOffline(true);await page.locator('#hintsToggle').click();await page.locator('#hintsPractice').click();await page.locator('#hintsFind').click();
   await page.waitForFunction(()=>!document.getElementById('hintsResult').hidden,{},{timeout:60000});
   assert.match(await page.locator('#hintsStatus').innerText(),/two-shot/);
   await page.locator('#hintsLevel').selectOption('5');await page.locator('#hintsApply').click();
   assert.match(await page.locator('#hintsStatus').innerText(),/applied/);
  });
  await test('local-file eight-ball coaching works',async()=>{
   await page.locator('#hintsSettings summary').click();await page.locator('#hintsGame').selectOption('eight');await page.locator('#hintsPractice').click();await page.locator('#hintsFind').click();
   await page.waitForFunction(()=>!document.getElementById('hintsResult').hidden,{},{timeout:60000});
   assert.match(await page.locator('#hintsStatus').innerText(),/two-shot/);
  });
  await test('original trainer storage remains untouched',async()=>{
   assert.equal(await page.evaluate(()=>localStorage.getItem('billiardTrainerState')),'original-trainer-sentinel');
   assert(await page.evaluate(()=>!!localStorage.getItem('hintsTrainerV1State')));
  });
  await test('baseline and 4x CPU-throttled search remain within work budget',async()=>{
   const cdp=await context.newCDPSession(page);
   for(const rate of [1,4]){
    await cdp.send('Emulation.setCPUThrottlingRate',{rate});
    for(let trial=0;trial<3;trial++){
     const row=await page.evaluate(async()=>{
      const api=window.__BT_SIMULATION__;api.practice('nine');
      const state={profile:'wpa-9ball-normal-v1',phase:'normal',frozenBallIds:[],consecutiveFouls:0,warnedOnTwo:false};
      const start=performance.now(),result=await BTHintsSearch.search(api.evaluate,api.capture(),state),searchMs=performance.now()-start;
      const zoneStart=performance.now(),zone=await BTHintsZones.build(api.evaluate,result.recommendations[0]);
      return{searchMs:Math.round(searchMs),zoneMs:Math.round(performance.now()-zoneStart),simulations:result.diagnostics.simulations,status:result.status,zoneStatus:zone.status};
     });
     assert.equal(row.status,'ok');assert.equal(row.zoneStatus,'sampled');assert(row.simulations<=96);records.push({cpuSlowdown:rate,trial:trial+1,...row});
    }
   }
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  });
  await test('packaged app has no JavaScript exceptions',()=>assert.deepEqual(errors,[]));
  const report={suite:'browser-package',checks:count,archiveBytes:fs.statSync(archive).size,browser:await browser.version(),performanceScope:'Headless Chromium on this host; 4x CPU throttle is synthetic, not Android acceptance.',measurements:records};
  fs.writeFileSync(path.join(root,'docs/browser-package-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`${count} browser-package checks passed.`);console.log(JSON.stringify(records));
 }finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
