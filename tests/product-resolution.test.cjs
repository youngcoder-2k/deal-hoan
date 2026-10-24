const {test}=require('node:test');
const assert=require('node:assert/strict');
const loadTs=require('./helpers/load-ts.cjs');
const fs=require('node:fs');
function route(file, product=null){return loadTs({
 '@/lib/supabase/server':{createSupabaseServerClient:async()=>null},
 '@/lib/deals/providers/hoanngay':{lookupHoanNgayProduct:async()=>product},
 '@/lib/deals/providers/accesstrade':{lookupAccessTradeProduct:async()=>null},
 '@/lib/deals/shopee-sync-config':{getAccessTradeToken:()=>''},
 })(file).POST;}
const input='https://s.shopee.vn/Zdvy2iud';
test('unresolved short link never returns camera, default price or affiliate receipt',async()=>{
 const old=global.fetch;global.fetch=async()=>{throw Error('offline')};
 try{const post=route(process.env.RESOLVE_FIXTURE || 'app/api/deals/resolve/route.ts');
 const response=await post({json:async()=>({url:input}),headers:new Headers(),nextUrl:new URL("https://example.com")});const data=await response.json();
 assert.equal(response.status,422);assert.equal(data.error,'product_unresolved');assert.equal(data.product,undefined);assert.equal(data.trackedLink,undefined);
 }finally{global.fetch=old;}
});
test('verified provider product is retained',async()=>{
 const old=global.fetch;global.fetch=async()=>{throw Error('offline')};
 try{const post=route('app/api/deals/resolve/route.ts',{name:'Sản phẩm đúng',price:250000,originalPrice:250000,imageUrl:'https://example.com/real.jpg',isVerifiedPrice:true,shopId:'123',itemId:'456',productLink:'https://shopee.vn/product/123/456',cashbackRate:0,commission:0});
 const response=await post({json:async()=>({url:input}),headers:new Headers(),nextUrl:new URL('https://example.com')});const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.product.name,'Sản phẩm đúng');assert.equal(data.product.price,250000);
 }finally{global.fetch=old;}
});
test('client does not generate substitute receipt on API errors',()=>{const s=fs.readFileSync('app/home-client.tsx','utf8');assert.ok(!s.includes('resolveProductLocally'));assert.ok(s.includes('title: "Chưa xác minh được sản phẩm"'));});
test('user Shopee video link gets actionable error, not a product',async()=>{
 const post=route('app/api/deals/resolve/route.ts');const response=await post({json:async()=>({url:'https://sv.shopee.vn/share-video/gkGKGyjOCQD8L9gKAAAAAA=='})});const data=await response.json();
 assert.equal(response.status,422);assert.equal(data.error,'video_link_not_product');assert.match(data.message,/Chia sẻ/);assert.equal(data.product,undefined);
});
for(const url of ['not a link','https://example.com/?link=shopee.vn','https://shopee.vn.evil.test/product/1/2']) test('invalid or unrelated URL rejected: '+url,async()=>{const response=await route('app/api/deals/resolve/route.ts')({json:async()=>({url})});assert.equal(response.status,400);assert.equal((await response.json()).product,undefined);});
test('client never uses demo data for pasted links and clears stale receipts before validation',()=>{const s=fs.readFileSync('app/home-client.tsx','utf8');assert.ok(!s.includes('SAMPLE_CHIP_PRODUCTS'));assert.ok(s.indexOf('setCalculatedProduct(null);',s.indexOf('const executeCalculation'))<s.indexOf('if (!trimmed)',s.indexOf('const executeCalculation')));});
