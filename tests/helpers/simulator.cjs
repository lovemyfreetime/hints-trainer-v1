// Load verbatim numerical functions without initializing the browser UI.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
module.exports=function createSimulator(){
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8'),lines=html.split('\n'),functions=[];
 for(let i=0;i<lines.length;i++)if(/^    function \w+\(/.test(lines[i])){
  let src='';for(let j=i;j<lines.length;j++){src+=lines[j]+'\n';try{new vm.Script(src);functions.push(src);break;}catch(e){if(j===lines.length-1)throw e;}}
 }
 const constants=['APK','PHYSICS_MODEL'].map(n=>html.match(new RegExp('    const '+n+' = Object.freeze\\([\\s\\S]*?^    \\}\\);','m'))[0]);
 const context=vm.createContext({console});
 vm.runInContext(constants.join('\n')+'\n'+functions.join('\n')+'\nlet S=defaultState();',context);
 const run=s=>vm.runInContext(s,context,{timeout:20000});
 return {run,capture:()=>JSON.parse(run('JSON.stringify(captureSimulationSnapshot())')),
  evaluate:(snapshot,shot)=>{context.input=snapshot;context.shot=shot;return JSON.parse(run('JSON.stringify(evaluateSimulationShot(input,shot))'));}};
};
