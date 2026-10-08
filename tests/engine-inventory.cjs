// Read-only inventory harness: compile verbatim function declarations from index.html.
// No UI bootstrap, browser APIs, network, storage, or application source edits.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const lines=html.split('\n'), functions=[];
for(let i=0;i<lines.length;i++) if(/^    function \w+\(/.test(lines[i])) {
 let source=''; for(let j=i;j<lines.length;j++) {source+=lines[j]+'\n';try{new vm.Script(source);functions.push(source);break;}catch(e){if(j===lines.length-1)throw e;}}
}
const constants=['APK','PHYSICS_MODEL'].map(n=>html.match(new RegExp('    const '+n+' = Object.freeze\\([\\s\\S]*?^    \\}\\);','m'))[0]);
const ctx=vm.createContext({console,performance});
vm.runInContext(constants.join('\n')+'\n'+functions.join('\n')+'\nlet S=defaultState();',ctx);
const run=s=>vm.runInContext(s,ctx,{timeout:20000});
const results={sourceCommit:process.env.SOURCE_COMMIT||'15c6c76fe5aaadca507313de56a124291992881c',method:'Node VM: verbatim source functions, UI bootstrap excluded',selfTests:run('runPhysicsSelfTests()'),cases:[]};
assert.equal(results.selfTests.ok,true);
const cases=[['default',''],['follow','S.follow=.7'],['draw','S.follow=-.7'],['side-spin','S.sideSpin=.7'],['airborne','S.airbornePhysics=true;S.cueElevationDeg=35'],['scratch','S.balls=[{id:0,n:"CB",x:S.tableL/2,y:.3,active:true}];S.freeAim={x:S.tableL/2,y:-1};S.speed=1.5'],['marker','S.balls.push({id:1000,n:"MARKER",x:1,y:.56,active:true,marker:true})'],['jaw-contact-headless','S.muRoll=.00001;S.muSlide=.00001;S.speed=6']];
cases.push(['low-friction-cap','S.balls=[{id:0,n:"CB",x:.52,y:.56,active:true}];S.freeAim={x:2,y:.56};S.muRoll=.00001;S.muSlide=.00001;S.speed=6']);
for(const [name,setup] of cases){
 run('S=defaultState();'+setup);
 try {
 const before=run('JSON.stringify(S)'),t=performance.now();
 const a=run('simulate(false)'),elapsedMs=performance.now()-t,b=run('simulate(false)'),c=run('simulate(true)');
 assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(before,run('JSON.stringify(S)'));
 assert.deepEqual(a.finalBalls,c.finalBalls);assert.deepEqual(a.pocketEvents,c.pocketEvents);
 assert.deepEqual(a.firstBallContact,c.firstBallContact);
 const last=c.frames.at(-1);let finalFrameDeltaM=0;
 for(const ball of a.finalBalls){const f=last?.find(x=>x.id===ball.id);if(f)finalFrameDeltaM=Math.max(finalFrameDeltaM,Math.hypot(ball.x-f.x,ball.y-f.y,ball.z-f.z));}
 results.cases.push({name,elapsedMs:+elapsedMs.toFixed(2),deterministic:true,stateUnchanged:true,previewAnimationResultsEqual:true,pocketed:a.pocketEvents.map(e=>e.id),lastPathTime:Math.max(...Object.values(a.paths).flat().map(p=>p.t)),finalFrameDeltaM,hasSettledFlag:'settled' in a});
 } catch(e) {results.cases.push({name,error:e.message});}
}
run('S=defaultState();S.shot2Enabled=true;');const before2=run('JSON.stringify(S)');try{run('simulateShot2()')}catch(e){results.shot2Error=e.message}results.shot2FirstCallStateUnchanged=before2===run('JSON.stringify(S)');
const before3=run('JSON.stringify(S)');try{run('simulateShot2()')}catch(e){results.shot2Error=e.message}results.shot2RepeatStateUnchanged=before3===run('JSON.stringify(S)');
run('S=defaultState();S.balls=[]');results.noCueResultKeys=Object.keys(run('simulate(false)'));
run('S=defaultState();S.shot2Enabled=true;delete S.shot2.autoGhostLock');const incomplete=run('JSON.stringify(S)');run('simulateShot2()');results.shot2IncompleteStateUnchanged=incomplete===run('JSON.stringify(S)');
console.log(JSON.stringify(results,null,2));
