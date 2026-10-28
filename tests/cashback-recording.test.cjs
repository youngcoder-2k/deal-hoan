const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const loadTs=require('./helpers/load-ts.cjs');
const uid='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const base={orderId:'SAMPLE_ORDER',subId:`u_${uid}`,orderValue:100000,commissionAmount:10000,status:'pending'};
function recorder(db){return loadTs({'@/lib/supabase/service':{getSupabaseServiceClient:()=>db},'@/lib/deals/cashback-booster':{getBoosterSettingsSync:()=>({safetyMarginPercent:12})}})('lib/deals/cashback.ts');}

test('database unavailable never returns demo success',async()=>assert.equal((await recorder(null).recordCashbackOrder(base)).success,false));
test('RPC error is a visible recording failure, not a credited order',async()=>{
 const db={rpc:async()=>({error:{code:'XX000'},data:null})};assert.equal((await recorder(db).recordCashbackOrder(base)).success,false);
});
test('zero commission caps explicit cashback to zero; identity mismatch and invalid money rejected',async()=>{
 let payload;const db={rpc:async(_,{p_order})=>{payload=p_order;return {data:p_order,error:null};}};const {recordCashbackOrder}=recorder(db);
 assert.equal((await recordCashbackOrder({...base,commissionAmount:0,cashbackAmount:5000})).success,true);assert.equal(payload.cashback_amount,0);
 assert.equal((await recordCashbackOrder({...base,userId:other})).success,false);
 assert.equal((await recordCashbackOrder({...base,commissionAmount:NaN})).success,false);
 assert.equal((await recordCashbackOrder({...base,commissionAmount:undefined,cashbackAmount:100})).success,false);
});
test('full UUID tracking survives link wrapping and sub-id formatting',()=>{
 const affiliate=loadTs()('lib/deals/affiliate.ts');const url=affiliate.buildShopeeAffiliateUrl('https://shopee.vn/product/123/456',{subId:affiliate.formatSubIdForUser(uid)});
 assert.equal(affiliate.parseUserIdFromSubId(new URL(url).searchParams.get('sub_id')),uid);
});
test('legacy short reference must be unique across all directory pages',async()=>{
 const db={auth:{admin:{listUsers:async({page})=>({data:{users:page===1?Array.from({length:100},(_,i)=>({id:i===0?uid:`99999999-${i}`})):[{id:'11111111-2222-4222-8222-222222222222'}]},error:null})}}};
 assert.equal(await recorder(db).resolveUserIdFromSubId('u_11111111'),null);
});

test('order sync handles configuration, page 2, malformed reports, unknown attribution and persistence failures',async()=>{
 const {syncShopeeOrders,getOrderSyncCookie}=loadTs({
  './cashback':{recordCashbackOrder:async()=>({success:true})},
  './order-sync-config':{loadOrderSyncConfig:async()=>({autoSyncEnabled:true,shopeeCookie:''})},
 })('lib/deals/order-sync.ts');
 const oldCookie=process.env.SHOPEE_AFFILIATE_COOKIE,oldState=process.env.SHOPEE_STORAGE_STATE;
 delete process.env.SHOPEE_AFFILIATE_COOKIE;delete process.env.SHOPEE_STORAGE_STATE;
 try{
  assert.equal((await syncShopeeOrders()).code,503);
  const raw=JSON.stringify({cookies:[{name:'session',value:'secret',domain:'.shopee.vn',expires:-1},{name:'foreign',value:'do-not-forward',domain:'.example.com',expires:-1}]});
  assert.equal(getOrderSyncCookie('',{SHOPEE_STORAGE_STATE:raw}), 'session=secret');
  assert.equal(getOrderSyncCookie('',{SHOPEE_STORAGE_STATE:JSON.stringify({cookies:[{name:'s',value:'expired',domain:'.shopee.vn',expires:1}]})}), '');
  let pages=[],written=0;
  const result=await syncShopeeOrders({cookie:'sample=fixture',fetcher:async(url)=>{
    const page=Number(new URL(url).searchParams.get('page'));pages.push(page);
    const list=Array.from({length:page===1?50:1},(_,i)=>({order_sn:`page-${page}-${i}`,sub_1:`u_${uid}`,commission:10000,gmv:100000,status:'pending'}));
    return Response.json({code:0,data:{list,total:51}});
  },record:async()=>{written++;return {success:true};}});
  assert.equal(result.code,200);assert.equal(written,51);assert.deepEqual(pages,[1,2]);
  const failure=await syncShopeeOrders({cookie:'s=x',fetcher:async()=>Response.json({code:0,data:{list:[{order_sn:'one',sub_id:`u_${uid}`,commission:100,status:'pending'}]}}),record:async()=>({success:false})});
  assert.equal(failure.code,502);assert.equal(failure.body.failed,1);
  const malformed=await syncShopeeOrders({cookie:'s=x',fetcher:async()=>Response.json({code:0,data:{}})});
  assert.equal(malformed.code,502);
 }finally{if(oldCookie===undefined)delete process.env.SHOPEE_AFFILIATE_COOKIE;else process.env.SHOPEE_AFFILIATE_COOKIE=oldCookie;if(oldState===undefined)delete process.env.SHOPEE_STORAGE_STATE;else process.env.SHOPEE_STORAGE_STATE=oldState;}
});

test('PostgreSQL atomic recording: pending -> completed, retry, correction, rejection, rollback and permissions',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as 'select null::uuid';
 create table public.user_wallets(user_id uuid primary key references auth.users(id),balance bigint not null default 0,pending_balance bigint not null default 0,updated_at timestamptz default now());
 insert into auth.users values('${uid}'),('${other}');`);
 const sql=fs.readFileSync('supabase/schema-cashback-recording.sql','utf8');await db.exec(sql);await db.exec(sql); // repeatable deployment
 const record=async(p)=>db.query('select public.record_cashback_order($1::jsonb)',[JSON.stringify({user_id:uid,order_id:'real-fixture',platform:'Shopee',status:'pending',commission_amount:10000,cashback_amount:8800,...p})]);
 const wallet=async()=>{const r=await db.query('select balance::int,pending_balance::int from user_wallets where user_id=$1',[uid]);return r.rows[0];};
 await record();assert.deepEqual(await wallet(),{balance:0,pending_balance:8800});
 await record();assert.deepEqual(await wallet(),{balance:0,pending_balance:8800});
 await record({status:'completed'});assert.deepEqual(await wallet(),{balance:8800,pending_balance:0});
 await record({status:'completed'});assert.deepEqual(await wallet(),{balance:8800,pending_balance:0});
 await record({status:'completed',cashback_amount:8000});assert.deepEqual(await wallet(),{balance:8000,pending_balance:0});
 await assert.rejects(record({user_id:other}),/order_owner_mismatch/);
 await record({status:'rejected'});assert.deepEqual(await wallet(),{balance:0,pending_balance:0});
 await db.exec(`create function block_wallet() returns trigger language plpgsql as $$begin raise exception 'fixture_wallet_failure';end$$;create trigger block_wallet before update on user_wallets for each row execute function block_wallet();`);
 await assert.rejects(record({order_id:'must-rollback'}),/fixture_wallet_failure/);
 assert.equal((await db.query("select count(*)::int as count from cashback_orders where order_id='must-rollback'")).rows[0].count,0);
 await db.exec('drop trigger block_wallet on user_wallets;');
 // Two different orders update one wallet additively, instead of read/replace lost updates.
 await Promise.all([record({order_id:'parallel-a'}),record({order_id:'parallel-b'})]);
 assert.deepEqual(await wallet(),{balance:0,pending_balance:17600});
 const perms=(await db.query(`select has_function_privilege('authenticated','public.record_cashback_order(jsonb)','execute') as client_execute,
 has_table_privilege('authenticated','public.cashback_orders','insert') as client_insert,
 has_table_privilege('authenticated','public.shopee_sync_settings','select') as client_secrets,
 has_function_privilege('service_role','public.record_cashback_order(jsonb)','execute') as service_execute`)).rows[0];
 assert.deepEqual(perms,{client_execute:false,client_insert:false,client_secrets:false,service_execute:true});
 await db.exec('begin');await record({order_id:'rollback-only'});await db.exec('rollback');
 assert.equal((await db.query("select count(*)::int as count from cashback_orders where order_id='rollback-only'")).rows[0].count,0);
 }finally{await db.close();}
});
