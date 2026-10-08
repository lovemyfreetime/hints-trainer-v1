(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./rules-v1.js'):root.BTHintsRules,
 typeof module==='object'&&module.exports?require('./search-v1.js'):root.BTHintsSearch);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.BTHintsZones=api;
})(globalThis,function(rules,search){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 function shapes(samples,center,step){
  const good=new Set(samples.filter(s=>s.good).map(s=>`${s.i},${s.j}`)),cells=[];
  for(let j=-2;j<2;j++)for(let i=-2;i<2;i++)if([[i,j],[i+1,j],[i+1,j+1],[i,j+1]].every(([x,y])=>good.has(`${x},${y}`)))cells.push({i,j});
  // Retain only supported cells connected to the predicted cue-ball endpoint.
  const connected=cells.filter(c=>[-1,0].includes(c.i)&&[-1,0].includes(c.j));
  let changed=true;while(changed){changed=false;for(const c of cells)if(!connected.includes(c)&&connected.some(a=>Math.abs(a.i-c.i)+Math.abs(a.j-c.j)===1)){connected.push(c);changed=true;}}
  const point=(i,j)=>({x:center.x+i*step,y:center.y+j*step});
  const polygon=c=>[point(c.i,c.j),point(c.i+1,c.j),point(c.i+1,c.j+1),point(c.i,c.j+1)];
  const result={irregular:connected.map(polygon),circle:[],lane:[],wedge:[]};
  const has=(i,j)=>connected.some(c=>c.i===i&&c.j===j);
  if([-1,0].every(i=>[-1,0].every(j=>has(i,j))))result.circle=[Array.from({length:40},(_,k)=>({x:center.x+step*Math.cos(k*Math.PI/20),y:center.y+step*Math.sin(k*Math.PI/20)}))];
  // A narrow rectangle inside one or two supported central rows/columns.
  let best=null;
  for(const horizontal of [true,false])for(const side of [-1,0]){
   let lo=0,hi=0;
   while(lo>-2&&(horizontal?has(lo-1,side):has(side,lo-1)))lo--;
   while(hi<2&&(horizontal?has(hi,side):has(side,hi)))hi++;
   if(hi-lo<2)continue;
   const a=side===-1?-.5:0,b=side===-1?0:.5;
   const p=horizontal?[point(lo,a),point(hi,a),point(hi,b),point(lo,b)]:[point(a,lo),point(b,lo),point(b,hi),point(a,hi)];
   if(!best||hi-lo>best.length)best={length:hi-lo,p};
  }
  if(best)result.lane=[best.p];
  const central=connected.find(c=>[-1,0].includes(c.i)&&[-1,0].includes(c.j));
  if(central){const sx=central.i===0?1:-1,sy=central.j===0?1:-1;result.wedge=[[point(0,0),point(sx,0),point(sx,sy)]];}
  return result;
 }
 async function build(simulate,recommendation,options={}){
  if(!recommendation?.nextShot)return {status:'unavailable',reason:'No verified second shot.',samples:[],shapes:{}};
  const rec=copy(recommendation),s=rec.outcome.resultingState,center=s.balls.find(b=>b.id===0),step=s.ballR;
  const state={...rec.outcome.nextShooterState,frozenBallIds:[]},samples=[];
  const yieldControl=options.yieldControl||(()=>new Promise(resolve=>setTimeout(resolve,0)));
  for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){
   if(options.signal?.aborted)return {status:'cancelled',samples:[],shapes:{}};
   const q=copy(s),cue=q.balls.find(b=>b.id===0);cue.x=center.x+i*step;cue.y=center.y+j*step;
   const candidate=search.generateCandidates(q,state).find(c=>c.id===rec.nextShot.candidate.id);
   let good=false;
   if(candidate){const r=rules.evaluateCandidate(simulate,q,candidate.shot,{...state,call:candidate.call});
    good=r.rules.legal&&(r.rules.terminal||r.rules.canContinue)&&r.simulation.events.some(e=>e.type==='pocket'&&e.id===candidate.call.ballId&&e.pocketId===candidate.call.pocketId);}
   samples.push({i,j,x:cue.x,y:cue.y,good});
   if(samples.length%4===0)await yieldControl();
  }
  if(options.signal?.aborted)return {status:'cancelled',samples:[],shapes:{}};
  return {status:'sampled',center:{x:center.x,y:center.y},step,samples,shapes:shapes(samples,center,step)};
 }
 return Object.freeze({build,shapes});
});
