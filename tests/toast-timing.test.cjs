const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness(){let clock=0,timers=new Map(),nextId=0,closed=0,closing=false;
 const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/ui/toast-timer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod,Date:{now:()=>clock},setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,at:clock+ms});return id},clearTimeout:id=>timers.delete(id)});
 const timer=mod.exports.createToastTimer(v=>closing=v,()=>closed++);timer.resume();
 return {timer,advance(ms){const end=clock+ms;while(true){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at).find(([,t])=>t.at<=end);if(!entry)break;clock=entry[1].at;timers.delete(entry[0]);entry[1].fn()}clock=end},get closed(){return closed},get closing(){return closing}};
}
test('normal toast closes at3.75s',()=>{const h=harness();h.advance(3500);assert.equal(h.closing,true);h.advance(250);assert.equal(h.closed,1)});
test('hold pauses countdown; release resumes only remaining time',()=>{const h=harness();h.advance(1000);h.timer.pause();h.advance(10000);assert.equal(h.closed,0);assert.equal(h.closing,false);h.timer.resume();h.advance(2499);assert.equal(h.closing,false);h.advance(251);assert.equal(h.closed,1)});
test('hold during exit cancels dismissal until release',()=>{const h=harness();h.advance(3600);h.timer.pause();h.advance(10000);assert.equal(h.closed,0);assert.equal(h.closing,false);h.timer.resume();h.advance(250);assert.equal(h.closed,1)});
test('repeated holds, disposal and manual dismissal',()=>{const h=harness();h.advance(100);h.timer.pause();h.timer.pause();h.timer.resume();h.timer.resume();h.timer.dispose();h.advance(5000);assert.equal(h.closed,0);const j=harness();j.timer.pause();j.timer.dismiss();j.advance(250);assert.equal(j.closed,1)});
test('pointer cancellation and keyboard focus handlers exist; callback changes do not restart timer',()=>{const s=fs.readFileSync('app/components/top-toast.tsx','utf8');for(const x of ['onPointerDown','onPointerUp','onPointerCancel','onLostPointerCapture','onFocusCapture','onBlurCapture','closeRef.current()'])assert.ok(s.includes(x));assert.ok(s.includes('}, [toast]);'));});
