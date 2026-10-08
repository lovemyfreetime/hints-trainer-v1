const assert=require('node:assert/strict'),zones=require('../src/zones-v1.js'),search=require('../src/search-v1.js');
const engine=require('./helpers/simulator.cjs')();let count=0;
async function test(name,fn){await fn();console.log('PASS '+name);count++;}
(async()=>{
 const samples=[];for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++)samples.push({i,j,good:true});
 await test('all four shapes stay inside fully supported grid',()=>{
  const s=zones.shapes(samples,{x:0,y:0},1);
  for(const name of ['circle','lane','wedge','irregular']){assert(s[name].length);assert(s[name].flat().every(p=>Math.abs(p.x)<=2&&Math.abs(p.y)<=2));}
  assert.equal(s.irregular.length,16);
 });
 await test('failed center leaves no suggested area',()=>{
  const s=zones.shapes(samples.map(p=>({...p,good:p.i!==0||p.j!==0})),{x:0,y:0},1);
  assert(Object.values(s).every(polygons=>polygons.length===0));
 });
 await test('irregular shape excludes unsupported cells; circle unavailable',()=>{
  const s=zones.shapes(samples.map(p=>({...p,good:!(p.i===1&&p.j===1)})),{x:0,y:0},1);
  assert.equal(s.circle.length,0);assert.equal(s.irregular.length,12);
  assert(s.irregular.every(poly=>!poly.some(p=>p.x===1&&p.y===1)));
 });
 await test('no continuation returns unavailable without simulation',async()=>{
  assert.equal((await zones.build(()=>{throw Error('unexpected')},{})).status,'unavailable');
 });
 engine.run('S=defaultState();S.balls=[{id:0,n:"CB",x:S.tableL/2,y:.65,active:true},{id:1,n:"1",x:S.tableL/2,y:.28,active:true},{id:9,n:"9",x:1.7,y:.6,active:true}]');
 const state={profile:'wpa-9ball-normal-v1',phase:'normal',frozenBallIds:[],consecutiveFouls:0,warnedOnTwo:false};
 const result=await search.search(engine.evaluate,engine.capture(),state,{yieldControl:async()=>{}}),rec=result.recommendations[0];
 await test('real second-shot zone samples preserve table and verify center',async()=>{
  const before=JSON.stringify(rec),live=engine.run('JSON.stringify(S)');let calls=0;
  const guide=await zones.build((s,shot)=>{calls++;return engine.evaluate(s,shot)},rec,{yieldControl:async()=>{}});
  assert.equal(guide.status,'sampled');assert.equal(guide.samples.length,25);assert(calls<=25);
  assert(guide.samples.find(p=>p.i===0&&p.j===0).good);assert(guide.shapes.irregular.length);
  assert.equal(JSON.stringify(rec),before);assert.equal(engine.run('JSON.stringify(S)'),live);
 });
 await test('cancelled sampling discards partial guidance',async()=>{
  const controller=new AbortController();let calls=0;
  const guide=await zones.build((s,shot)=>{calls++;return engine.evaluate(s,shot)},rec,
   {signal:controller.signal,yieldControl:async()=>controller.abort()});
  assert.equal(guide.status,'cancelled');assert.equal(guide.samples.length,0);assert(calls<=4);
 });
 console.log(`${count} position-zone checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1});
