/* Bounded, deterministic two-shot search. No DOM, storage, or network dependencies. */
(function (root, factory) {
  const rules = typeof module === 'object' && module.exports ? require('./rules-v1.js') : root.BTHintsRules;
  const api = factory(rules);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BTHintsSearch = api;
})(globalThis, function (rules) {
  'use strict';
  if (!rules) throw new Error('Load rules-v1.js before search-v1.js');
  const copy = x => JSON.parse(JSON.stringify(x));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const group = id => id > 0 && id < 8 ? 'solids' : id > 8 ? 'stripes' : null;
  const active = s => s.balls.filter(b => b.active);
  function pockets(s) {
    return [['TL',0,0],['TM',s.tableL/2,0],['TR',s.tableL,0],['BL',0,s.tableW],['BM',s.tableL/2,s.tableW],['BR',s.tableL,s.tableW]]
      .map(([id,x,y]) => ({id,x,y}));
  }
  function targets(s,state) {
    const objects=active(s).filter(b=>b.id>0);
    if(state.profile===rules.profiles.nine) return objects.filter(b=>b.id===Math.min(...objects.map(b=>b.id)));
    if(state.shooterGroup===null) return objects.filter(b=>b.id!==8);
    const own=objects.filter(b=>group(b.id)===state.shooterGroup);
    return own.length ? own : objects.filter(b=>b.id===8);
  }
  function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
    const t=l2 ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2)) : 0;
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }
  function layoutIssue(s) {
    if(!s || s.physicsVersion!=='hints-sim-1' || !Array.isArray(s.balls) || s.balls.length>16 ||
      !Number.isFinite(s.ballR) || s.ballR<=0 || !Number.isFinite(s.tableL) || !Number.isFinite(s.tableW) ||
      s.tableL<=4*s.ballR || s.tableW<=4*s.ballR || s.balls.some(b=>!b || typeof b.active!=='boolean' ||
      !Number.isInteger(b.id) || b.id<0 || b.id>15 || !Number.isFinite(b.x) || !Number.isFinite(b.y)) ||
      new Set(s.balls.map(b=>b.id)).size!==s.balls.length) return 'invalid-layout';
    const balls=active(s);
    if(!balls.some(b=>b.id===0)) return 'missing-cue-ball';
    // Deliberately conservative: the rectangular band includes jaws/openings as well as rails.
    if(balls.some(b=>Math.min(b.x,b.y,s.tableL-b.x,s.tableW-b.y)<=s.ballR+.001)) return 'near-cushion-unsupported';
    if(balls.some((b,i)=>balls.slice(i+1).some(c=>distance(b,c)<=2*s.ballR+.001))) return 'touching-balls-unsupported';
    return null;
  }
  function stateIssue(s,state) {
    if(!state || !Object.values(rules.profiles).includes(state.profile)) return 'unknown-profile';
    if(state.phase!=='normal') return 'unsupported-phase';
    if(!Array.isArray(state.frozenBallIds) || state.frozenBallIds.length) return 'frozen-status-unsupported';
    const ids=active(s).map(b=>b.id);
    if(state.profile===rules.profiles.nine) {
      if(ids.some(id=>id>9) || !ids.includes(9)) return 'invalid-nine-ball-layout';
      if(!Number.isInteger(state.consecutiveFouls) || state.consecutiveFouls<0 || state.consecutiveFouls>2 ||
        typeof state.warnedOnTwo!=='boolean' || (state.warnedOnTwo && state.consecutiveFouls!==2)) return 'invalid-foul-history';
    } else {
      if(![null,'solids','stripes'].includes(state.shooterGroup) || !ids.includes(8)) return 'invalid-eight-ball-state';
      if(state.shooterGroup===null && ['solids','stripes'].some(g=>!ids.some(id=>group(id)===g))) return 'open-table-cleared-group-needs-claim';
    }
    return null;
  }
  function generateCandidates(s,state) {
    if(layoutIssue(s) || stateIssue(s,state)) return [];
    const cue=active(s).find(b=>b.id===0), routes=[];
    for(const ball of targets(s,state)) for(const pocket of pockets(s)) {
      const objectDistance=distance(ball,pocket),ux=(pocket.x-ball.x)/objectDistance,uy=(pocket.y-ball.y)/objectDistance;
      const ghost={x:ball.x-2*s.ballR*ux,y:ball.y-2*s.ballR*uy};
      if(ghost.x<s.ballR || ghost.y<s.ballR || ghost.x>s.tableL-s.ballR || ghost.y>s.tableW-s.ballR) continue;
      const cueDistance=distance(cue,ghost);
      if(cueDistance<1e-6) continue;
      const cosine=((ghost.x-cue.x)*ux+(ghost.y-cue.y)*uy)/cueDistance;
      if(cosine<.2) continue; // Exclude extreme/back cuts; this is a limited direct-pot generator.
      const others=active(s).filter(b=>b.id!==0 && b.id!==ball.id);
      if(others.some(b=>segmentDistance(b,cue,ghost)<2*s.ballR+.001 || segmentDistance(b,ball,pocket)<2*s.ballR+.001)) continue;
      const cutAngleDeg=Math.acos(Math.min(1,cosine))*180/Math.PI;
      const difficulty=cueDistance+objectDistance+cutAngleDeg/35;
      routes.push({ballId:ball.id,pocketId:pocket.id,ghost,cueDistance,objectDistance,cutAngleDeg,difficulty});
    }
    routes.sort((a,b)=>a.difficulty-b.difficulty || a.ballId-b.ballId || a.pocketId.localeCompare(b.pocketId,'en'));
    // Round-robin across the best eight routes prevents a single route consuming the budget.
    const variants=[];
    for(const angle of [0,-.4,.4]) for(const speed of [1.2,1.8,2.5]) for(const follow of [0,-.35,.35]) variants.push({follow,angle,speed});
    const candidates=[];
    for(const v of variants) for(const route of routes.slice(0,8)) {
      const a=Math.atan2(route.ghost.y-cue.y,route.ghost.x-cue.x)+v.angle*Math.PI/180;
      candidates.push({id:`${route.ballId}:${route.pocketId}:${v.speed}:${v.follow}:${v.angle}`,route:copy(route),
        shot:{freeAim:{x:cue.x+Math.cos(a)*route.cueDistance,y:cue.y+Math.sin(a)*route.cueDistance},
          speed:v.speed,follow:v.follow,sideSpin:0,cueElevationDeg:0},
        call:{ballId:route.ballId,pocketId:route.pocketId}});
    }
    return candidates;
  }
  const localScore = c => 20-c.route.difficulty-0.15*c.shot.speed-0.2*Math.abs(c.shot.follow);
  const order = (a,b) => b.rankTier-a.rankTier || b.score-a.score || (a.candidate.id<b.candidate.id ? -1 : a.candidate.id>b.candidate.id ? 1 : 0);
  const yieldDefault = () => new Promise(resolve=>setTimeout(resolve,0));
  async function search(simulate,snapshot,state,options={}) {
    if(typeof simulate!=='function') throw new TypeError('A synchronous isolated simulator is required');
    const limits={maxSimulations:96,firstCandidates:48,beamWidth:4,secondCandidates:12,yieldEvery:4,...options};
    for(const [key,max] of [['maxSimulations',512],['firstCandidates',216],['beamWidth',16],['secondCandidates',216],['yieldEvery',16]])
      if(!Number.isInteger(limits[key]) || limits[key]<1 || limits[key]>max) throw new RangeError('Invalid '+key);
    if(options.yieldControl!==undefined && typeof options.yieldControl!=='function') throw new TypeError('Invalid yieldControl');
    const diagnostics={simulations:0,firstSimulations:0,secondSimulations:0,rejected:{},firstGenerated:0,firstEvaluated:0,secondBranches:0,budgetExhausted:false};
    const reject=reason=>{diagnostics.rejected[reason]=(diagnostics.rejected[reason]||0)+1;};
    const stop=()=>!!(options.signal && options.signal.aborted);
    const finish=(status,reasonCode,recommendations=[])=>({version:'hints-search-1',status,reasonCode,recommendations,diagnostics});
    if(stop()) return finish('cancelled','cancelled');
    const issue=layoutIssue(snapshot) || stateIssue(snapshot,state);
    if(issue) return finish('unsupported',issue);
    const initial=copy(snapshot), initialState=copy(state); // Isolate from edits while yielding.
    const candidates=generateCandidates(initial,initialState), first=[];
    diagnostics.firstGenerated=candidates.length;
    async function evaluate(s,rs,candidate,depth) {
      if(stop() || diagnostics.simulations>=limits.maxSimulations) return null;
      diagnostics.simulations++;diagnostics[depth===1?'firstSimulations':'secondSimulations']++;
      const declaration={...rs,call:candidate.call};delete declaration.safety;
      const {rules:outcome,simulation}=rules.evaluateCandidate(simulate,s,candidate.shot,declaration);
      if(diagnostics.simulations%limits.yieldEvery===0) await (options.yieldControl || yieldDefault)();
      if(!outcome.legal) {reject(outcome.reasonCode);return null;}
      // A failed pot that happens to be a legal safety is not a scored pocketing recommendation.
      if(!outcome.terminal && !outcome.canContinue) {reject('turn-passed');return null;}
      if(!outcome.terminal && !simulation.events.some(e=>e.type==='pocket' && e.id===candidate.call.ballId && e.pocketId===candidate.call.pocketId)) {reject('intended-pot-missed');return null;}
      return {candidate:copy(candidate),outcome,score:localScore(candidate),rankTier:outcome.classification==='win'?3:0,
        nextShot:null,continuationStatus:outcome.terminal?'terminal':'not-searched'};
    }
    for(const c of candidates.slice(0,limits.firstCandidates)) {
      if(stop()) return finish('cancelled','cancelled');
      if(diagnostics.simulations>=limits.maxSimulations) break;
      const result=await evaluate(initial,initialState,c,1);diagnostics.firstEvaluated++;
      if(result) first.push(result);
    }
    first.sort(order);
    const branches=first.filter(r=>r.outcome.canContinue).slice(0,limits.beamWidth);
    // Fair second-shot allocation: one candidate per branch per round.
    for(const branch of branches) {
      const next=branch.outcome.resultingState, problem=layoutIssue(next);
      branch.continuationStatus=problem || 'not-searched';
      if(problem) continue;
      branch.nextState={...branch.outcome.nextShooterState,frozenBallIds:[]};
      const stateProblem=stateIssue(next,branch.nextState);
      if(stateProblem) {branch.continuationStatus=stateProblem;continue;}
      branch.queue=generateCandidates(next,branch.nextState).slice(0,limits.secondCandidates);
      if(!branch.queue.length) branch.continuationStatus='no-direct-candidates';
      diagnostics.secondBranches++;
    }
    for(let i=0;i<limits.secondCandidates;i++) for(const branch of branches) {
      if(stop()) return finish('cancelled','cancelled');
      if(diagnostics.simulations>=limits.maxSimulations) break;
      if(!branch.queue || !branch.queue[i]) continue;
      if(!branch.nextShot) branch.continuationStatus='no-second-pot-found';
      const second=await evaluate(branch.outcome.resultingState,branch.nextState,branch.queue[i],2);
      if(second && (!branch.nextShot || order(second,branch.nextShot)<0)) {
        branch.nextShot=second;branch.continuationStatus='verified-second-shot';
        branch.rankTier=second.outcome.classification==='win'?2:1;
        branch.score=localScore(branch.candidate)+localScore(second.candidate)*.5;
      }
    }
    if(stop()) return finish('cancelled','cancelled');
    for(const branch of branches) {delete branch.queue;delete branch.nextState;}
    first.sort(order);
    diagnostics.budgetExhausted=diagnostics.simulations>=limits.maxSimulations;
    return finish(first.length?'ok':'no-shot-found',first.length?'bounded-direct-pot-search':'no-verified-direct-pot',first.slice(0,5));
  }
  return Object.freeze({version:'hints-search-1',generateCandidates,search});
});
