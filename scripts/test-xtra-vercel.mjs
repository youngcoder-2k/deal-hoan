import assert from 'node:assert/strict';
import { syncXtra, parseShopeeState } from '../lib/deals/xtra-sync.mjs';
import { classifyProductSignals } from '../supabase/functions/_shared/xtra-availability.mjs';
const now=Date.now();
const cookie={name:'test',value:'fixture-not-a-secret',domain:'.shopee.vn',path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'};
const state=JSON.stringify({cookies:[cookie],origins:[{origin:'https://unrelated.example',localStorage:[]} ]});
assert.deepEqual(parseShopeeState(state,now).origins,[]);
for(const bad of ['not-json',JSON.stringify({cookies:[{...cookie,domain:'shopee.vn.evil.test'}]}),JSON.stringify({cookies:[{...cookie,expires:1}]}),JSON.stringify({cookies:[]})])assert.throws(()=>parseShopeeState(bad,now));
const product=i=>({id:`xtra-${i}`,productUrl:`https://shopee.vn/product/1/${i+1}`,price:100000,cashback:20000,affiliateOffer:{source:'shopee-xtra',checkedAt:now,commissionRate:.3},availability:{status:'available',checkedAt:now}});
const env={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-key',SHOPEE_STORAGE_STATE:state};
async function run({products=Array.from({length:18},(_,i)=>product(i)),lock='lease',lockError=null,publishError=null,launchError=false,collectError=false,cacheError=false,overrideEnv=env}={}){
 const calls=[];let launched=0,ctxClosed=0,browserClosed=0,invalidated=0;
 const result=await syncXtra({env:overrideEnv,now:()=>now,createDb:()=>({rpc:(name,args)=>{calls.push({name,args});const result=name==='claim_xtra_import'?{data:lock,error:lockError}:{error:name==='publish_xtra_import'?publishError:null};return {then:(yes,no)=>Promise.resolve(result).then(yes,no)}}}),launchBrowser:async()=>{launched++;if(launchError)throw Error('SECRET_SHOULD_NOT_LEAK');return{newContext:async()=>({close:async()=>ctxClosed++}),close:async()=>browserClosed++}},collect:async()=>{if(collectError)throw Error('SECRET_SHOULD_NOT_LEAK');return products},onPublished:()=>{invalidated++;if(cacheError)throw Error('SECRET_SHOULD_NOT_LEAK')}});
 assert(!JSON.stringify(result).includes('SECRET_SHOULD_NOT_LEAK'));return{result,calls,launched,ctxClosed,browserClosed,invalidated};
}
let r=await run({overrideEnv:{}});assert.equal(r.result.code,503);assert.equal(r.launched,0);
r=await run({overrideEnv:{...env,SHOPEE_STORAGE_STATE:'bad'}});assert.equal(r.result.body.status,'shopee_session_invalid');
r=await run({lock:null});assert.equal(r.result.code,409);assert.equal(r.launched,0);assert.equal(r.calls.length,1);
r=await run({lockError:{}});assert.equal(r.result.code,503);assert.equal(r.launched,0);
for(const options of [{products:[]},{products:[product(0)]},{products:Array(18).fill(product(0))},{products:Array.from({length:18},(_,i)=>({...product(i),availability:{status:'missing',checkedAt:now}}))},{products:Array.from({length:18},(_,i)=>({...product(i),cashback:1}))},{products:Array.from({length:18},(_,i)=>({...product(i),productUrl:'https://evil.test/item'}))}]){r=await run(options);assert.equal(r.result.body.status,'insufficient_purchasable_products');assert(!r.calls.some(c=>c.name==='publish_xtra_import'));assert.equal(r.invalidated,0);assert(r.calls.some(c=>c.name==='release_xtra_import'));assert.equal(r.ctxClosed,1);assert.equal(r.browserClosed,1);}
r=await run({launchError:true});assert.equal(r.result.body.status,'browser_launch_failed');assert(r.calls.some(c=>c.name==='release_xtra_import'));
r=await run({collectError:true});assert.equal(r.result.body.status,'login_required_or_source_unavailable');assert.equal(r.ctxClosed,1);
r=await run({publishError:{}});assert.equal(r.result.body.status,'publish_failed');assert.equal(r.invalidated,0);
r=await run({cacheError:true});assert.equal(r.result.body.status,'published_cache_refresh_failed');assert.equal(r.result.body.published,true);
r=await run();assert.equal(r.result.code,200);assert.equal(r.result.body.count,18);assert.equal(r.invalidated,1);assert.equal(r.calls.filter(c=>c.name==='publish_xtra_import').length,1);assert.equal(r.calls.find(c=>c.name==='publish_xtra_import').args.checked,new Date(now).toISOString());assert.equal(r.ctxClosed,1);assert.equal(r.browserClosed,1);
assert.equal(classifyProductSignals({url:'https://shopee.vn/product/1/1',text:'Sản phẩm này không tồn tại',buyEnabled:true}),'missing');
console.log('PASS: config/session validation; auth-independent import isolation; lease contention; short/duplicate/missing/low-rate/external rejection; failure preservation; cleanup; 18-product atomic publish and cache invalidation');
