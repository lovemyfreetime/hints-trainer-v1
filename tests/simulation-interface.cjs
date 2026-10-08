const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const root=path.join(__dirname,'..');
function load(html){
 const lines=html.split('\n'),f=[];
 for(let i=0;i<lines.length;i++)if(/^    function \w+\(/.test(lines[i])){
  let src='';for(let j=i;j<lines.length;j++){src+=lines[j]+'\n';try{new vm.Script(src);f.push(src);break;}catch(e){if(j===lines.length-1)throw e;}}
 }
 const constants=['APK','PHYSICS_MODEL'].map(n=>html.match(new RegExp('    const '+n+' = Object.freeze\\([\\s\\S]*?^    \\}\\);','m'))[0]);
 const ctx=vm.createContext({console});
 vm.runInContext(constants.join('\n')+'\n'+f.join('\n')+'\nlet S=defaultState();',ctx);
 return s=>vm.runInContext(s,ctx,{timeout:20000});
}
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
// Compile every inline script as well as executing the isolated numerical functions.
for(const m of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
const run=load(source),old=load(cp.execFileSync('git',['show','15c6c76:index.html'],{cwd:root,encoding:'utf8',maxBuffer:8e6}));
const json=x=>JSON.parse(JSON.stringify(x));let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('existing numerical self-tests',()=>assert.equal(run('runPhysicsSelfTests().ok'),true));
const scenarios=[['default',''],['follow','S.follow=.7'],['draw','S.follow=-.7'],['english','S.sideSpin=.7'],['airborne','S.airbornePhysics=true;S.cueElevationDeg=35'],['scratch','S.balls=[{id:0,n:"CB",x:S.tableL/2,y:.3,active:true}];S.freeAim={x:S.tableL/2,y:-1};S.speed=1.5'],['marker','S.balls.push({id:1000,n:"M",x:1,y:.56,active:true,marker:true})']];
for(const [name,setup] of scenarios)test('unchanged physics and isolated evaluation: '+name,()=>{
 run('S=defaultState();'+setup);old('S=defaultState();'+setup);
 const original=json(old('simulate(false)')),before=run('JSON.stringify(S)');
 const legacy=json(run('simulate(false)')),a=json(run('evaluateSimulationShot(captureSimulationSnapshot())'));
 assert.deepEqual(a.finalBalls,original.finalBalls);assert.deepEqual(a.firstBallContact,original.firstBallContact);
 assert.deepEqual(a.pocketEvents.map(({pocketId,...event})=>event),original.pocketEvents);
 assert.deepEqual(a.finalBalls,legacy.finalBalls);assert.deepEqual(a.paths,{});assert.deepEqual(a.frames,[]);
 assert.equal(run('JSON.stringify(S)'),before);assert.deepEqual(a,json(run('evaluateSimulationShot(captureSimulationSnapshot())')));
 const recorded=json(run('evaluateSimulationShot(captureSimulationSnapshot(),{}, {recordPaths:true,recordFrames:true})'));
 assert.deepEqual(recorded.finalBalls,a.finalBalls);assert.deepEqual(recorded.events,a.events);assert.deepEqual(recorded.frames.at(-1),a.finalBalls);
 assert(a.events.every((e,i)=>!i||e.t>=a.events[i-1].t));
});
test('jaw-contact no longer depends on browser named globals',()=>{
 run('S=defaultState();S.muRoll=.00001;S.muSlide=.00001;S.speed=6');
 const r=json(run('evaluateSimulationShot(captureSimulationSnapshot())'));
 assert(r.events.some(e=>e.type==='jaw'));
});
test('time limit explicitly rejected as usable and terminal frame exact',()=>{
 run('S=defaultState();S.balls=[{id:0,n:"CB",x:.52,y:.56,active:true}];S.freeAim={x:2,y:.56};S.muRoll=.00001;S.muSlide=.00001;S.speed=6');
 const r=json(run('evaluateSimulationShot(captureSimulationSnapshot(),{}, {recordFrames:true})'));
 assert.equal(r.settled,false);assert.equal(r.usable,false);assert.equal(r.terminationReason,'time-limit');assert.equal(r.duration,20);
 assert.deepEqual(r.frames.at(-1),r.finalBalls);assert(r.finalVelocities.some(b=>Math.hypot(b.vx,b.vy)>.002));
});
test('snapshot inputs stay immutable; full remaining table feeds next shot',()=>{
 run('S=defaultState();var live=S;var snap=captureSimulationSnapshot();snap.balls.forEach(Object.freeze);Object.freeze(snap.balls);Object.freeze(snap.freeAim);Object.freeze(snap);var first=evaluateSimulationShot(snap);');
 assert.equal(run('S===live'),true);
 const q=json(run('first'));assert(q.usable);assert.notDeepEqual(q.finalState.balls,json(run('snap.balls')));
 assert.deepEqual(q.finalState.balls.map(({n,...b})=>b),q.finalBalls.filter(b=>b.active).map(({z,...b})=>b));
 run('var second=evaluateSimulationShot(first.finalState,{freeAim:{x:1,y:.2},speed:1})');assert.equal(run('S===live'),true);
});
test('pocket identity, scratch and no-cue contract',()=>{
 run('S=defaultState();S.balls=[{id:0,n:"CB",x:S.tableL/2,y:.3,active:true},{id:1,n:"1",x:1.6,y:.6,active:true}];S.freeAim={x:S.tableL/2,y:-1};S.speed=1.5;var scratch=evaluateSimulationShot(captureSimulationSnapshot())');
 assert.equal(run('scratch.usable'),false);assert.equal(run('scratch.pocketEvents[0].pocketId'),'TM');
 assert.equal(run('scratch.finalState.balls.length'),1);const r=json(run('evaluateSimulationShot(scratch.finalState)'));
 assert.equal(r.terminationReason,'missing-cue-ball');assert.equal(r.finalState.balls[0].id,1);assert.equal(r.usable,false);
});
test('reject invalid parameters without modifying live state',()=>{
 run('S=defaultState();var originalState=S');
 for(const expression of ['{speed:NaN}','{speed:Infinity}','{speed:-1}','{speed:7}','{sideSpin:2}','{freeAim:{x:NaN,y:0}}','{balls:[]}'])assert.throws(()=>run('evaluateSimulationShot(captureSimulationSnapshot(),'+expression+')'));
 for(const mutation of ['snap.balls.push({...snap.balls[0]})','snap.muSlide=0','snap.tableL=-1','snap.airbornePhysics=1','snap.physicsVersion="bad"'])assert.throws(()=>run('var snap=captureSimulationSnapshot();'+mutation+';evaluateSimulationShot(snap)'));
 assert.equal(run('S===originalState'),true);
});
test('finally restores exact live reference after engine exception',()=>{
 run('S=defaultState();var beforeThrow=S;var originalSimulate=simulate;simulate=function(){throw new Error("injected failure")};');
 assert.throws(()=>run('evaluateSimulationShot(captureSimulationSnapshot())'),/injected failure/);
 assert.equal(run('S===beforeThrow'),true);run('simulate=originalSimulate');
});
test('animation commit uses exact finalBalls with stale sampled frame',()=>{
 run(`S=defaultState();var undoStack=[],runHistory=[],animation=null;
 normalizeBallSet=function(){};updateUI=function(){};refreshPreview=function(){};saveState=function(){};syncProjector=function(){};toast=function(){};
 var pre=JSON.parse(JSON.stringify(S));var mock=simulate(true);mock.finalBalls[0].x=.77;
 mock.frames=[pre.balls.map(b=>({...b}))];commitAnimatedShot(mock,pre);`);
 assert.equal(run('S.balls.find(b=>b.id===0).x'),.77);
});
console.log(count+' checks passed. Node VM validation only; browser/device acceptance remains pending.');
