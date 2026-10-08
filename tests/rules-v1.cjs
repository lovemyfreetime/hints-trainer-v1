const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { profiles, evaluateRules, evaluateCandidate } = require('../src/rules-v1.js');
let count = 0;
const test = (name, fn) => { fn(); console.log('PASS ' + name); count++; };
const ball = id => ({ id, n: String(id), x: .3 + id * .08, y: .5, active: true });
const hit = (id, t = .1) => ({ type: 'ball-contact', ids: [0, id], t });
const rail = (id = 0, t = .2) => ({ type: 'rail', id, rail: 'left', t });
const pot = (id, pocketId = 'TL', t = .2) => ({ type: 'pocket', id, pocketId, t });
const off = id => ({ type: 'off-table', id, t: .2 });
const nine = { profile: profiles.nine, phase: 'normal', frozenBallIds: [], consecutiveFouls: 0, warnedOnTwo: false };
const eight = { profile: profiles.eight, phase: 'normal', frozenBallIds: [], shooterGroup: 'solids', call: { ballId: 1, pocketId: 'TL' } };
function fixture(ids, events) {
  const snapshot = { physicsVersion: 'hints-sim-1', balls: ids.map(ball) };
  const removed = events.filter(e => ['pocket', 'off-table'].includes(e.type)).map(e => e.id);
  const first = events.find(e => e.type === 'ball-contact' && e.ids.includes(0));
  return [snapshot, { physicsVersion: 'hints-sim-1', settled: true, terminationReason: 'settled', events,
    firstBallContact: first ? { objId: first.ids.find(id => id !== 0), t: first.t } : null,
    finalState: { ...snapshot, balls: snapshot.balls.filter(b => !removed.includes(b.id)) } }];
}
function check(name, ids, events, state, expected) {
  test(name, () => {
    const args = [...fixture(ids, events), state], original = JSON.stringify(args);
    const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } };
    freeze(args); const result = evaluateRules(...args);
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(result[key], value, key);
    assert.deepEqual(result, evaluateRules(...args)); assert.equal(JSON.stringify(args), original);
    if (result.resultingState) assert.notEqual(result.resultingState, args[1].finalState);
  });
}
check('9 lowest legal pot', [0,1,2,9], [hit(1),pot(1)], nine, {legal:true,canContinue:true,nextRequiredBallId:2});
check('9 wrong first contact', [0,1,2,9], [hit(2),pot(2)], nine, {legal:false,reasonCode:'wrong-first-contact',ballInHand:true});
check('9 safety passes turn', [0,1,9], [hit(1),rail()], nine, {legal:true,retainsTurn:false,canContinue:false});
check('9 legal combination win', [0,1,9], [hit(1),pot(9)], nine, {legal:true,classification:'win',winner:'shooter',canContinue:false});
check('9 wrong first plus 9 requires spot', [0,1,9], [hit(9),pot(9)], nine, {legal:false,classification:'foul',respotBallIds:[9],nextRequiredBallId:1});
check('9 scratch with pot', [0,1,9], [hit(1),pot(1),pot(0)], nine, {legal:false,reasonCode:'scratch',pocketedCueBall:true});
check('9 scratch with nine requires spot', [0,9], [hit(9),pot(9),pot(0)], nine, {legal:false,respotBallIds:[9],nextRequiredBallId:9});
check('9 off table object', [0,1,9], [hit(1),off(1),rail()], nine, {legal:false,reasonCode:'object-off-table',respotBallIds:[]});
check('9 off table nine', [0,1,9], [hit(1),off(9),rail()], nine, {legal:false,respotBallIds:[9]});
check('9 no contact', [0,1,9], [rail()], nine, {legal:false,reasonCode:'no-object-contact'});
check('9 no rail', [0,1,9], [hit(1)], nine, {legal:false,reasonCode:'no-rail-after-contact'});
check('rail before contact does not qualify', [0,1,9], [rail(0,.05),hit(1)], nine, {legal:false,reasonCode:'no-rail-after-contact'});
check('object rail qualifies', [0,1,9], [hit(1),rail(1)], nine, {legal:true});
check('same step legal contact benefits shooter', [0,1,2,9], [hit(2),hit(1),rail()], nine, {legal:true,firstContactIds:[2,1]});
check('same step rail qualifies', [0,1,9], [rail(0,.1),hit(1)], nine, {legal:true});
check('three warned fouls lose', [0,1,9], [], {...nine,consecutiveFouls:2,warnedOnTwo:true}, {classification:'loss',winner:'opponent'});
check('unwarned third foul stays second', [0,1,9], [], {...nine,consecutiveFouls:2}, {classification:'foul'});
check('8 open assigns called solid not first pot', [0,1,8,9], [hit(9),pot(9),pot(1)], {...eight,shooterGroup:null}, {legal:true,retainsTurn:true,pocketedObjectIds:[9,1]});
check('8 open assigns stripe', [0,1,8,9], [hit(1),pot(9)], {...eight,shooterGroup:null,call:{ballId:9,pocketId:'TL'}}, {legal:true,retainsTurn:true});
check('8 open missed call stays open', [0,1,8,9], [hit(1),pot(9)], {...eight,shooterGroup:null}, {legal:true,retainsTurn:false});
check('8 open first eight foul', [0,1,8,9], [hit(8),rail()], {...eight,shooterGroup:null}, {legal:false,reasonCode:'wrong-first-contact'});
check('8 assigned legal pot', [0,1,8,9], [hit(1),pot(1)], eight, {legal:true,retainsTurn:true});
check('8 incidental opponent first pot allowed', [0,1,8,9], [hit(1),pot(9),pot(1)], eight, {legal:true,retainsTurn:true});
check('8 opponent first contact foul', [0,1,8,9], [hit(9),pot(1)], eight, {legal:false,reasonCode:'wrong-first-contact'});
check('8 early loss', [0,1,8,9], [hit(1),pot(8)], eight, {classification:'loss',reasonCode:'early-eight'});
check('8 last group and eight same shot loses', [0,1,8,9], [hit(1),pot(1),pot(8)], eight, {classification:'loss',reasonCode:'early-eight'});
const endgame = {...eight,call:{ballId:8,pocketId:'TL'}};
check('8 win with opponent balls remaining', [0,8,9], [hit(8),pot(8)], endgame, {legal:true,classification:'win',winner:'shooter'});
check('8 incorrect pocket loses', [0,8,9], [hit(8),pot(8,'TR')], endgame, {legal:false,classification:'loss',reasonCode:'uncalled-eight',foul:false});
check('8 scratched win loses', [0,8,9], [hit(8),pot(8),pot(0)], endgame, {classification:'loss',reasonCode:'eight-on-foul'});
check('8 scratch on own pot', [0,1,8,9], [hit(1),pot(1),pot(0)], eight, {classification:'foul',reasonCode:'scratch'});
check('8 off table loses', [0,1,8,9], [hit(1),off(8),rail()], eight, {classification:'loss',reasonCode:'eight-off-table'});
check('8 wrong called pocket passes turn', [0,1,8,9], [hit(1),pot(1,'BR')], eight, {legal:true,retainsTurn:false});
check('8 declared safety can pot but passes turn', [0,1,8,9], [hit(1),pot(1)], {...eight,call:null,safety:true}, {legal:true,retainsTurn:false});
check('8 safety pot eight loses', [0,8,9], [hit(8),pot(8)], {...eight,call:null,safety:true}, {classification:'loss',reasonCode:'uncalled-eight'});
check('8 no rail safety foul', [0,1,8,9], [hit(1)], {...eight,call:null,safety:true}, {legal:false,reasonCode:'no-rail-after-contact'});
for (const state of [{...nine,phase:'break'}, {...nine,phase:'push-out'}, {...nine,profile:'house'}, {...nine,frozenBallIds:[1]}, {...eight,call:null}])
 check('unsupported input '+JSON.stringify(state), [0,1,8,9], [hit(1),rail()], state, {legal:false,classification:'unusable'});
for (const profile of [eight,nine]) test('reject unsettled '+profile.profile, () => {
 const args=fixture([0,1,8,9],[hit(1),rail()]); args[1].settled=false;
 assert.equal(evaluateRules(...args,profile).classification,'unusable');
});
for (const [name, mutate] of [
 ['missing remaining ball',a=>a[1].finalState.balls.pop()],
 ['pocket ball still present',a=>a[1].events.push(pot(1))],
 ['fabricated first contact',a=>a[1].firstBallContact.objId=9],
 ['unknown event',a=>a[1].events.push({type:'magic',t:1})],
 ['unordered event',a=>a[1].events.push(rail(1,.01))],
 ['unknown pocket',a=>a[1].events.push(pot(1,'unknown'))],
 ['missing cue',a=>a[0].balls=a[0].balls.filter(b=>b.id!==0)],
]) test('reject '+name,()=>{const a=fixture([0,1,9],[hit(1),rail()]);mutate(a);assert.equal(evaluateRules(...a,nine).classification,'unusable');});
test('group assignment follows called ball; next call cleared',()=>{
 const a=fixture([0,1,8,9],[hit(9),pot(9),pot(1)]);
 const r=evaluateRules(...a,{...eight,shooterGroup:null});
 assert.equal(r.nextShooterState.shooterGroup,'solids');assert.equal(r.nextShooterState.call,undefined);
});
test('legal shot resets shooter foul count',()=>{
 const r=evaluateRules(...fixture([0,1,9],[hit(1),rail()]),{...nine,consecutiveFouls:2,warnedOnTwo:true});
 assert.equal(r.nextShooterState.consecutiveFouls,0);assert.equal(r.nextShooterState.warnedOnTwo,false);
});
// Execute the actual simulator functions from index.html (no DOM or numerical mocks).
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),lines=html.split('\n'),functions=[];
for(let i=0;i<lines.length;i++)if(/^    function \w+\(/.test(lines[i])){
 let src='';for(let j=i;j<lines.length;j++){src+=lines[j]+'\n';try{new vm.Script(src);functions.push(src);break;}catch(e){if(j===lines.length-1)throw e;}}
}
const constants=['APK','PHYSICS_MODEL'].map(n=>html.match(new RegExp('    const '+n+' = Object.freeze\\([\\s\\S]*?^    \\}\\);','m'))[0]);
const context=vm.createContext({console});
vm.runInContext(constants.join('\n')+'\n'+functions.join('\n')+'\nlet S=defaultState();',context);
const run=s=>vm.runInContext(s,context,{timeout:20000});
for(const [name,setup,expected] of [
 ['stationary foul','S.speed=0',false],
 ['straight legal contact and rail','S.speed=2;S.freeAim={x:2,y:.56}',true],
 ['wrong first contact','S.speed=2;S.freeAim={x:2,y:.56};S.balls[1].id=2;S.balls.push({id:1,n:"1",x:1.5,y:.8,active:true})',false],
]) test('real simulator adapter: '+name,()=>{
 run('S=defaultState();S.balls=[{id:0,n:"CB",x:.5,y:.56,active:true},{id:1,n:"1",x:.9,y:.56,active:true},{id:9,n:"9",x:1.8,y:.8,active:true}];'+setup);
 const snapshot=JSON.parse(run('JSON.stringify(captureSimulationSnapshot())'));
 context.input=snapshot;
 const result=evaluateCandidate((snap,shot)=>{context.input=snap;context.shot=shot;return JSON.parse(run('JSON.stringify(evaluateSimulationShot(input,shot))'));},snapshot,{},nine);
 assert.notEqual(result.rules.classification,'unusable',JSON.stringify(result.rules));
 assert.equal(result.rules.legal,expected,JSON.stringify(result.rules));
});
console.log(`${count} rules checks passed.`);
