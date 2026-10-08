/* Accessible progressive hints. UI owns cancellation; numerical modules own evaluation. */
(()=>{
 'use strict';
 const api=window.__BT_SIMULATION__,$=id=>document.getElementById(id);
 const toggle=document.createElement('button');toggle.id='hintsToggle';toggle.textContent='HINTS';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','hintsPanel');document.body.append(toggle);
 const panel=document.createElement('aside');panel.id='hintsPanel';panel.hidden=true;panel.setAttribute('aria-label','Shot coaching');
 panel.innerHTML=`<h2>Shot coaching</h2><p class="hintNote">Choose your game and ask for a hint. Each level reveals a little more.</p>
 <details id="hintsSettings" open><summary>Game and practice setup</summary><label>Game<select id="hintsGame"><option value="nine">9-ball</option><option value="eight">8-ball</option></select></label>
 <label id="hintsGroupLabel" hidden>Your group<select id="hintsGroup"><option value="solids">Solids</option><option value="stripes">Stripes</option><option value="open">Open table</option></select></label>
 <label id="hintsFoulsLabel">Your consecutive fouls<select id="hintsFouls"><option value="unknown">Choose foul history</option><option value="0">0</option><option value="1">1</option><option value="2">2 — no warning given</option><option value="warned">2 — warning given</option></select></label>
 <button id="hintsPractice">Load practice layout (Undo available)</button></details>
 <div class="hintRow"><button id="hintsFind">Find a shot</button><button id="hintsCancel" disabled>Cancel</button></div>
 <p id="hintsStatus" role="status" aria-live="polite">Ready. Use a normal shot layout, after the break.</p>
 <div id="hintsResult" hidden><label>Hint level<select id="hintsLevel"><option value="1">1 · Ball and pocket</option><option value="2">2 · Position zone</option><option value="3">3 · Aim and route</option><option value="4">4 · Speed and spin</option><option value="5">5 · Explanation</option></select></label>
 <label id="hintsShapeLabel" hidden>Position guide shape<select id="hintsShape"><option value="irregular">Irregular area</option><option value="circle">Circle</option><option value="lane">Lane</option><option value="wedge">Wedge</option></select></label>
 <ol id="hintsDetails"></ol><button id="hintsApply" hidden>Set up this shot</button></div>
 <p class="hintNote">Close this panel with HINTS to see the full table. Direct shots only in this preview. Position areas use tested sample points; success between points is not guaranteed.</p>`;
 document.body.append(panel);
 let controller=null,request=0,rec=null,zone=null,source=null;
 const names={TL:'top left',TM:'top middle',TR:'top right',BL:'bottom left',BM:'bottom middle',BR:'bottom right'};
 function busy(on){$('hintsFind').disabled=on;$('hintsCancel').disabled=!on;$('hintsPractice').disabled=on;}
 function invalidate(message='Table changed. Find a fresh shot.'){
  request++;controller?.abort();controller=null;rec=zone=source=null;busy(false);$('hintsResult').hidden=true;$('hintsStatus').textContent=message;
 }
 function redraw(){api.redraw();}
 function details(){
  if(!rec)return;const level=+$('hintsLevel').value,c=rec.candidate;
  const text=[`Pocket ball ${c.call.ballId} in the ${names[c.call.pocketId]} pocket.`];
  if(level>=2){
   const available=zone?.shapes?.[$('hintsShape').value]?.length;
   text.push(rec.outcome.terminal?'This shot finishes the rack.':!rec.nextShot?'No second shot was verified for this option.':available?`Leave the cue ball in the shaded guide for ball ${rec.nextShot.candidate.call.ballId}.`:'No supported area for this shape. Try another shape; the cue-ball finish is marked.');
  }
  if(level>=3)text.push('The dashed line shows the cue-ball aim and the target ball’s intended route.');
  if(level>=4)text.push(`Speed ${c.shot.speed.toFixed(2)} m/s; ${c.shot.follow<0?'draw':c.shot.follow>0?'follow':'center hit'} ${Math.round(Math.abs(c.shot.follow)*100)}%; no side spin; level cue.`);
  if(level>=5)text.push(rec.outcome.terminal?'The simulator verifies a legal rack win.':rec.nextShot?`Both shots pass the rules check. The next shot was tested from the complete table left by this shot. Shorter routes and smaller cuts help rank the options; this is not a success percentage.`:'The first pot is verified. This limited search did not verify a continuation, so no two-shot plan is claimed.');
  $('hintsDetails').replaceChildren(...text.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  $('hintsShapeLabel').hidden=level<2||!rec.nextShot;$('hintsApply').hidden=level<4;redraw();
 }
 const reasons={
  'near-cushion-unsupported':'A ball is too close to a cushion for this preview. Move it clear and try again.',
  'touching-balls-unsupported':'Touching or overlapping balls are not supported yet.',
  'invalid-nine-ball-layout':'For 9-ball, include the cue ball and 9, with object balls numbered 1–9.',
  'invalid-eight-ball-state':'For 8-ball, include the cue ball and 8, and choose your group.',
  'open-table-cleared-group-needs-claim':'Choose the assigned group for this endgame layout.',
  'no-verified-direct-pot':'No verified direct pot found within this search. Try another layout; banks and kicks are not included.'
 };
 async function find(){
  invalidate('Looking for a legal shot and next position…');
  if(api.isBusy()){$('hintsStatus').textContent='Wait for the shot animation to finish.';return;}
  const game=$('hintsGame').value,fouls=$('hintsFouls').value;
  if(game==='nine'&&fouls==='unknown'){$('hintsStatus').textContent='Choose your consecutive foul count first, or load the practice layout.';return;}
  const state={profile:BTHintsRules.profiles[game],phase:'normal',frozenBallIds:[],shooterGroup:$('hintsGroup').value==='open'?null:$('hintsGroup').value,
   consecutiveFouls:fouls==='warned'?2:Number(fouls),warnedOnTwo:fouls==='warned'};
  const id=request;controller=new AbortController();const signal=controller.signal;busy(true);
  try{
   const snapshot=api.capture(),fingerprint=JSON.stringify(snapshot);
   const result=await BTHintsSearch.search(api.evaluate,snapshot,state,{signal});
   if(id!==request||signal.aborted)return;
   if(result.status!=='ok'){$('hintsStatus').textContent=reasons[result.reasonCode]||'This layout is not supported yet.';return;}
   const chosen=result.recommendations[0];$('hintsStatus').textContent='Shot found. Checking nearby position points…';
   const guide=await BTHintsZones.build(api.evaluate,chosen,{signal});
   if(id!==request||signal.aborted)return;
   if(api.isBusy()||JSON.stringify(api.capture())!==fingerprint){invalidate();return;}
   rec=chosen;zone=guide;source=fingerprint;$('hintsLevel').value='1';$('hintsShape').value='irregular';$('hintsResult').hidden=false;$('hintsSettings').open=false;
   $('hintsStatus').textContent=chosen.outcome.terminal?'Verified rack-winning shot.':chosen.nextShot?'A legal two-shot plan is ready.':'A legal first pot is ready. No second shot was verified.';details();
  }catch(error){if(id===request){invalidate('Could not evaluate this layout. Adjust the balls and try again.');console.error('Hints evaluation failed',error);}}
  finally{if(id===request){busy(false);controller=null;}}
 }
 toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)$('hintsGame').focus();redraw();};
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();redraw();}});
 for(const id of ['hintsGame','hintsGroup','hintsFouls'])$(id).onchange=()=>{invalidate('Settings changed. Find a fresh shot.');$('hintsGroupLabel').hidden=$('hintsGame').value!=='eight';$('hintsFoulsLabel').hidden=$('hintsGame').value!=='nine';redraw();};
 $('hintsFind').onclick=find;$('hintsCancel').onclick=()=>{invalidate('Search cancelled.');redraw();};
 $('hintsPractice').onclick=()=>{if(api.isBusy())return;api.practice($('hintsGame').value);$('hintsGroup').value='solids';$('hintsFouls').value='0';invalidate('Practice layout ready. Select Find a shot.');redraw();};
 $('hintsLevel').onchange=details;$('hintsShape').onchange=details;
 $('hintsApply').onclick=()=>{if(!rec||api.isBusy())return;if(JSON.stringify(api.capture())!==source){invalidate();redraw();return;}const shot=rec.candidate.shot;api.apply(shot);$('hintsStatus').textContent='Shot settings applied. Use Animate to try it.';};
 function draw(ctx,map){
  if(!rec||api.isBusy())return;
  const level=+$('hintsLevel').value,ball=JSON.parse(source).balls.find(b=>b.id===rec.candidate.call.ballId);
  const line=(points,color,dash=[])=>{ctx.beginPath();points.forEach((p,i)=>{const q=map(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash(dash);ctx.stroke();};
  const mark=(p,label)=>{const q=map(p);ctx.setLineDash([]);ctx.strokeStyle='#fff28a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.x,q.y,16,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 17px system-ui';ctx.strokeStyle='#102028';ctx.lineWidth=4;ctx.strokeText(label,q.x+20,q.y-12);ctx.fillText(label,q.x+20,q.y-12);};
  ctx.save();
  if(level>=2&&zone?.center){for(const polygon of zone.shapes?.[$('hintsShape').value]||[]){ctx.beginPath();polygon.forEach((p,i)=>{const q=map(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fillStyle='#76edbc66';ctx.fill();ctx.setLineDash([]);ctx.strokeStyle='#a4ffd2';ctx.lineWidth=2;ctx.stroke();}mark(zone.center,'Cue finish');}
  const s=JSON.parse(source),pockets={TL:{x:0,y:0},TM:{x:s.tableL/2,y:0},TR:{x:s.tableL,y:0},BL:{x:0,y:s.tableW},BM:{x:s.tableL/2,y:s.tableW},BR:{x:s.tableL,y:s.tableW}};
  mark(ball,`Ball ${ball.id}`);mark(pockets[rec.candidate.call.pocketId],'Pocket');
  if(level>=3){line([s.balls.find(b=>b.id===0),rec.candidate.shot.freeAim],'#fff28a',[7,5]);line([ball,pockets[rec.candidate.call.pocketId]],'#a4ffd2',[7,5]);}
  ctx.restore();
 }
 window.BTHintsUI=Object.freeze({invalidate,draw});
})();
