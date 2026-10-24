const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness(file){
 let hooks=[],index=0,effects=[],clock=0,timers=new Map(),nextId=0,closed=0,toast={id:1,message:'Test'},result;
 function flush(){index=0;effects=[];result=Component({toast,onClose:()=>{closed++}});for(const run of effects)run();}
 const react={useState(initial){const i=index++;hooks[i]??={value:initial};return [hooks[i].value,v=>{hooks[i].value=v;flush()}]},useRef(initial){const i=index++;return (hooks[i]??={current:initial})},useEffect(fn,deps){const i=index++;const old=hooks[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=fn()})}}};
 const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};vm.runInNewContext(src,{module:mod,exports:mod.exports,require:n=>n==='react'?react:n==='react/jsx-runtime'?{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}:require(n),setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,at:clock+ms});return id},clearTimeout:id=>timers.delete(id)});
 const Component=mod.exports.default;flush();
 return {render:flush,advance(ms){const end=clock+ms;while(true){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at).find(([,t])=>t.at<=end);if(!entry)break;clock=entry[1].at;timers.delete(entry[0]);entry[1].fn()}clock=end},get closed(){return closed},get closing(){return result.props.className.includes('top-toast-exit')}};
}
test('toast closes by 3.75s even with parent rerenders',()=>{const h=harness(process.env.TOAST_FIXTURE||'app/components/top-toast.tsx');for(let i=0;i<6;i++){h.advance(500);h.render()}assert.equal(h.closed,0);h.advance(500);assert.equal(h.closing,true);h.advance(250);assert.equal(h.closed,1)});
