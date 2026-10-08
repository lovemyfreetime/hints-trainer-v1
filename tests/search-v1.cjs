const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const search=require('../src/search-v1.js'), rules=require('../src/rules-v1.js');
const engine=require('./helpers/simulator.cjs')();
let count=0;
async function test(name,fn){await fn();console.log('PASS '+name);count++;}
const nine={profile:rules.profiles.nine,phase:'normal',frozenBallIds:[],consecutiveFouls:0,warnedOnTwo:false};
const eight={profile:rules.profiles.eight,phase:'normal',frozenBallIds:[],shooterGroup:'solids'};
const clone=x=>JSON.parse(JSON.stringify(x));
function layout(ids=[0,1,9]){
 engine.run('S=defaultState()');const s=engine.capture();
 const positions=[[s.tableL/2,.65],[s.tableL/2,.28],[1.7,.6],[.5,.85]];
 s.balls=ids.map((id,i)=>({id,n:String(id),x:positions[i][0],y:positions[i][1],active:true}));return s;
}
function freeze(o){Object.values(o).forEach(v=>{if(v && typeof v==='object')freeze(v)});return Object.freeze(o);}
const fast={yieldControl:async()=>{}};
function synthetic(s,kind='pot'){
 const remaining=s.balls.filter(b=>b.active && b.id>0), target=Math.min(...remaining.map(b=>b.id));
 const events=kind==='no-contact'?[]:[{type:'ball-contact',ids:[0,target],t:.1}];
 if(kind==='pot' || kind==='scratch') events.push({type:'pocket',id:target,pocketId:'TM',t:.2});
 if(kind==='scratch')events.push({type:'pocket',id:0,pocketId:'TM',t:.3});
 if(kind==='safety')events.push({type:'rail',id:0,t:.2});
 const removed=events.filter(e=>e.type==='pocket').map(e=>e.id);
 const result={physicsVersion:'hints-sim-1',settled:true,terminationReason:'settled',events,
  firstBallContact:events.length?{objId:target,t:.1}:null,finalState:clone(s)};
 result.finalState.balls=result.finalState.balls.filter(b=>!removed.includes(b.id));return result;
}
(async()=>{
 await test('generation is bounded, deterministic and targets lowest 9-ball',()=>{
  const s=freeze(layout([0,1,9,2])),before=JSON.stringify(s),a=search.generateCandidates(s,nine);
  assert(a.length>0 && a.length<=216);assert(a.every(c=>c.call.ballId===1));
  assert.deepEqual(a,search.generateCandidates(s,nine));assert.equal(JSON.stringify(s),before);
  assert(a.some(c=>c.shot.follow<0));assert(a.some(c=>c.shot.follow>0));
 });
 await test('8-ball targets assigned group and switches to eight',()=>{
  assert(search.generateCandidates(layout([0,1,8,9]),eight).every(c=>c.call.ballId===1));
  const a=search.generateCandidates(layout([0,8,9]),eight);assert(a.length);assert(a.every(c=>c.call.ballId===8));
 });
 await test('open 8-ball excludes eight as first target',()=>{
  const a=search.generateCandidates(layout([0,1,8,9]),{...eight,shooterGroup:null});assert(a.length);assert(a.every(c=>c.call.ballId!==8));
 });
 await test('blocked cue lane excludes direct route',()=>{
  const s=layout([0,1,9]);s.balls.push({id:2,n:'2',x:s.tableL/2,y:.48,active:true});
  assert(!search.generateCandidates(s,nine).some(c=>c.call.ballId===1 && c.call.pocketId==='TM'));
 });
 await test('blocked object lane excludes direct route',()=>{
  const s=layout([0,1,9]);s.balls.push({id:2,n:'2',x:s.tableL/2,y:.14,active:true});
  assert(!search.generateCandidates(s,nine).some(c=>c.call.pocketId==='TM'));
 });
 for(const [name,mutate] of [
  ['near cushion',s=>s.balls[1].y=s.ballR],
  ['touching balls',s=>s.balls[1].y=s.balls[0].y-2*s.ballR],
  ['missing cue',s=>s.balls.shift()],
  ['invalid coordinates',s=>s.balls[1].x=NaN],
 ]) await test('unsupported '+name+' never runs simulator',async()=>{
  const s=layout();mutate(s);const result=await search.search(()=>{throw Error('must not simulate')},s,nine,fast);
  assert.equal(result.status,'unsupported');assert.equal(result.diagnostics.simulations,0);
 });
 await test('reject unknown profile and phase',async()=>{
  for(const state of [{...nine,profile:'unknown'},{...nine,phase:'break'}])
   assert.equal((await search.search(()=>{throw Error('must not simulate')},layout(),state,fast)).status,'unsupported');
 });
 await test('hard budget enforced and unsearched continuation labeled',async()=>{
  let calls=0;const result=await search.search(s=>{calls++;return synthetic(s)},layout(),nine,{...fast,maxSimulations:1});
  assert.equal(calls,1);assert.equal(result.diagnostics.simulations,1);assert.equal(result.diagnostics.budgetExhausted,true);
  assert(result.recommendations.length);assert.equal(result.recommendations[0].nextShot,null);
  assert.equal(result.recommendations[0].continuationStatus,'not-searched');
 });
 for(const kind of ['scratch','no-contact','safety']) await test('reject '+kind+' as pocketing recommendation',async()=>{
  const result=await search.search(s=>synthetic(s,kind),layout(),nine,{...fast,firstCandidates:3});
  assert.equal(result.status,'no-shot-found');assert.equal(result.recommendations.length,0);assert.equal(result.diagnostics.secondSimulations,0);
 });
 await test('unsupported endpoint does not spawn second shot',async()=>{
  const result=await search.search(s=>{const r=synthetic(s);r.finalState.balls.find(b=>b.id===0).x=s.ballR;return r;},layout(),nine,{...fast,firstCandidates:1});
  assert.equal(result.recommendations[0].continuationStatus,'near-cushion-unsupported');assert.equal(result.diagnostics.secondSimulations,0);
 });
 await test('immediate win stops rollout',async()=>{
  const s=layout([0,9]);const result=await search.search(q=>synthetic(q),s,nine,{...fast,firstCandidates:1});
  assert.equal(result.recommendations[0].outcome.classification,'win');assert.equal(result.diagnostics.secondSimulations,0);
 });
 await test('second-shot input contains exact first-shot final table including moved objects',async()=>{
  const s=layout([0,1,9,2]);let endpoint;
  const result=await search.search(q=>{
   if(q.balls.some(b=>b.id===1)){
    const r=synthetic(q);r.finalState.balls.forEach(b=>{b.x+=.04;b.y+=.02});endpoint=clone(r.finalState);return r;
   }
   assert.deepEqual(q,endpoint);assert(!q.balls.some(b=>b.id===1));return synthetic(q,'safety');
  },s,nine,{...fast,firstCandidates:1,beamWidth:1,secondCandidates:2});
  assert(result.diagnostics.secondSimulations>0);assert.equal(result.recommendations[0].nextShot,null);
 });
 await test('cancellation after cooperative yield discards stale recommendations',async()=>{
  const controller=new AbortController();let calls=0;
  const result=await search.search(s=>{calls++;return synthetic(s)},layout(),nine,
   {signal:controller.signal,yieldEvery:1,yieldControl:async()=>controller.abort()});
  assert.equal(calls,1);assert.equal(result.status,'cancelled');assert.deepEqual(result.recommendations,[]);
 });
 await test('pre-cancelled request does no work',async()=>{
  const controller=new AbortController();controller.abort();
  const result=await search.search(()=>{throw Error('must not run')},layout(),nine,{signal:controller.signal});
  assert.equal(result.status,'cancelled');assert.equal(result.diagnostics.simulations,0);
 });
 await test('input edits during yield cannot change captured layout',async()=>{
  const s=layout(),initial=clone(s);let calls=0;
  await search.search(q=>{assert.deepEqual(q,initial);calls++;return synthetic(q,'safety')},s,nine,
   {firstCandidates:2,yieldEvery:1,yieldControl:async()=>{s.balls[1].x=.4;}});
  assert.equal(calls,2);
 });
 await test('invalid budgets and simulator failures surface explicitly',async()=>{
  await assert.rejects(search.search(engine.evaluate,layout(),nine,{maxSimulations:Infinity}),/Invalid maxSimulations/);
  await assert.rejects(search.search(()=>{throw Error('engine failed')},layout(),nine,fast),/engine failed/);
 });
 const s=freeze(layout()),state=freeze(clone(nine));let realResult;
 await test('real 9-ball two-shot finish; deterministic immutable full-table rollout',async()=>{
  const live=engine.run('JSON.stringify(S)'),before=JSON.stringify(s),start=performance.now();
  realResult=await search.search(engine.evaluate,s,state,fast);
  const elapsed=performance.now()-start;
  assert.equal(realResult.status,'ok');assert(realResult.recommendations.some(r=>r.nextShot?.outcome.classification==='win'));
  assert(realResult.recommendations.every(r=>r.outcome.legal));assert(realResult.diagnostics.rejected.scratch>0);
  assert(realResult.diagnostics.simulations<=96);assert.equal(engine.run('JSON.stringify(S)'),live);assert.equal(JSON.stringify(s),before);
  assert.deepEqual(realResult,await search.search(engine.evaluate,s,state,fast));
  console.log(`INFO real 9-ball search: ${realResult.diagnostics.simulations} simulations, ${Math.round(elapsed)} ms in Node VM (not device acceptance)`);
 });
 await test('real top recommendation replays both shots and ends in legal win',()=>{
  const first=realResult.recommendations[0];assert(first.nextShot);
  const a=rules.evaluateCandidate(engine.evaluate,s,first.candidate.shot,{...nine,call:first.candidate.call});
  assert.deepEqual(a.rules,first.outcome);
  const b=rules.evaluateCandidate(engine.evaluate,a.rules.resultingState,first.nextShot.candidate.shot,
   {...a.rules.nextShooterState,frozenBallIds:[],call:first.nextShot.candidate.call});
  assert.deepEqual(b.rules,first.nextShot.outcome);assert.equal(b.rules.classification,'win');
 });
 await test('real called 8-ball pot and subsequent eight-ball win',async()=>{
  const s=layout([0,1,8,9]);const result=await search.search(engine.evaluate,s,eight,fast);
  assert.equal(result.status,'ok');assert(result.recommendations.some(r=>r.nextShot?.outcome.classification==='win'));
  assert(result.recommendations.every(r=>r.outcome.legal));
 });
 console.log(`${count} search checks passed. Browser/device acceptance remains pending.`);
})().catch(error=>{console.error(error);process.exitCode=1});
