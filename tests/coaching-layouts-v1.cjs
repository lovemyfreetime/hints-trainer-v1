const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const search=require('../src/search-v1.js'),rules=require('../src/rules-v1.js'),zones=require('../src/zones-v1.js');
const fixtures=require('./fixtures/coaching-layouts-v1.json'),engine=require('./helpers/simulator.cjs')();
const clone=x=>JSON.parse(JSON.stringify(x));
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
(async()=>{
 const records=[];
 for(const layout of fixtures.cases){
  engine.run('S=defaultState()');const snapshot=engine.capture();snapshot.balls=clone(layout.balls);
  Object.assign(snapshot,{tableL:fixtures.tableL,tableW:fixtures.tableW},layout.calibration||{});
  freeze(snapshot);const state=freeze(clone(layout.state)),original=JSON.stringify(snapshot),live=engine.run('JSON.stringify(S)');
  const start=performance.now();let result,guide=null,error=null;
  try{
   result=await search.search(engine.evaluate,snapshot,state,{yieldControl:async()=>{}});
   assert.equal(JSON.stringify(snapshot),original,'input layout changed');assert.equal(engine.run('JSON.stringify(S)'),live,'live state changed');
   assert(result.diagnostics.simulations<=96,'search budget exceeded');
   if(layout.expected==='unsupported'){
    assert.equal(result.status,'unsupported');assert.equal(result.reasonCode,layout.reason);assert.equal(result.diagnostics.simulations,0);
   }else if(layout.expected==='blocked-route'){
    assert(['ok','no-shot-found'].includes(result.status));
    assert(result.recommendations.every(r=>r.candidate.call.pocketId!==layout.forbiddenPocket));
   }else{
    assert.equal(result.status,'ok',result.reasonCode);assert(result.recommendations.length);
    if(layout.expected==='win')assert.equal(result.recommendations[0].outcome.classification,'win');
    if(layout.expected==='two-shot-win')assert.equal(result.recommendations[0].nextShot?.outcome.classification,'win');
   }
   for(const rec of result.recommendations){
    assert(rec.outcome.legal);if(layout.firstTarget)assert.equal(rec.candidate.call.ballId,layout.firstTarget);
    const a=rules.evaluateCandidate(engine.evaluate,snapshot,rec.candidate.shot,{...state,call:rec.candidate.call});
    assert.deepEqual(a.rules,rec.outcome,'first-shot replay differs');
    if(rec.nextShot){
     assert(a.rules.canContinue,'second shot after turn ended');
     const b=rules.evaluateCandidate(engine.evaluate,a.rules.resultingState,rec.nextShot.candidate.shot,
      {...a.rules.nextShooterState,frozenBallIds:[],call:rec.nextShot.candidate.call});
     assert.deepEqual(b.rules,rec.nextShot.outcome,'second-shot replay differs');assert(b.rules.legal);
    }
   }
   const top=result.recommendations[0];
   if(top?.nextShot){
    guide=await zones.build(engine.evaluate,top,{yieldControl:async()=>{}});
    assert.equal(guide.status,'sampled');assert.equal(guide.samples.length,25);
    assert(guide.samples.find(p=>p.i===0&&p.j===0).good,'verified second-shot endpoint failed zone replay');
    const good=new Set(guide.samples.filter(p=>p.good).map(p=>`${p.i},${p.j}`));
    for(const polygon of guide.shapes.irregular)for(const p of polygon){
     const i=Math.round((p.x-guide.center.x)/guide.step),j=Math.round((p.y-guide.center.y)/guide.step);
     assert(good.has(`${i},${j}`),'unsupported cell corner included');
    }
   }
  }catch(e){error=e.message;}
  const record={name:layout.name,expected:layout.expected,pass:!error,status:result?.status,reason:result?.reasonCode,
   simulations:result?.diagnostics.simulations,recommendations:result?.recommendations.length,
   topBall:result?.recommendations[0]?.candidate.call.ballId,topPocket:result?.recommendations[0]?.candidate.call.pocketId,
   secondShot:!!result?.recommendations[0]?.nextShot,zoneSuccessfulSamples:guide?.samples.filter(s=>s.good).length,
   elapsedMs:Math.round(performance.now()-start),error};records.push(record);
  console.log(`${error?'FAIL':'PASS'} ${layout.name}${error?': '+error:''}`);
 }
 const report={suite:'coaching-layouts-v1',environment:'Node VM actual simulator; not physical-device or expert coaching acceptance',passed:records.filter(r=>r.pass).length,total:records.length,records};
 if(process.argv.includes('--report'))fs.writeFileSync(path.join(__dirname,'../docs/coaching-layouts-v1-results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`${report.passed}/${report.total} fixed-layout checks passed.`);
 if(report.passed!==report.total)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
