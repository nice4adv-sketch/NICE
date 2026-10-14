import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const tmp=mkdtempSync(path.join(tmpdir(),'nice-sb-test-'));
for(const name of ['server.js','db-compat.js','supabase-storage.js','nice-studio','public','api','package.json'])cpSync(path.join(root,name),path.join(tmp,name),{recursive:true});
const port=38391;
const child=spawn(process.execPath,['server.js'],{cwd:tmp,env:{...process.env,PORT:String(port),NODE_ENV:'development',SUPABASE_DB_URL:'',VERCEL:''},stdio:['ignore','pipe','pipe']});
let out='';child.stderr.on('data',d=>out+=d);child.stdout.on('data',d=>out+=d);
async function req(api,opts){const r=await fetch(`http://127.0.0.1:${port}${api}`,opts);return {status:r.status,body:await r.json()}}
async function post(route,obj,cookie=''){return req(route,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(obj)});}
try{
  let ok=false;for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error(out);try{const r=await req('/api/products');if(r.status===200){ok=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,120));}if(!ok)throw Error('failed start: '+out);
  const products=(await req('/api/products')).body;
  if(!products.some(x=>x.title.includes('بنر')))throw Error('no seeded products');
  const banner=products.find(x=>x.title.includes('بنر'));
  const result=await post('/api/products/estimate',{productId:banner.id,quantity:1,configuration:{width:3,height:5}});
  if(result.body.total!==22500)throw Error('wrong banner pricing: '+JSON.stringify(result));
  const config=(await req('/api/quote-config')).body;
  const fields={company_name:'اختبار',phone1:'777000000',phone2:'777999999',location:'صنعاء',activity:'طباعة',contract_type:config.contractTypes[0]};
  const qr=await post('/api/quote-requests',{companyName:'شركة اختبار',phone1:'777000000',phone2:'777999999',location:'صنعاء',activity:'طباعة',contractType:config.contractTypes[0],fields,items:[{productId:banner.id,quantity:1,configuration:{width:3,height:5}}]});
  if(qr.status!==201||qr.body.estimatedSubtotal!==22500)throw Error('quote request failed: '+JSON.stringify(qr));
  const login=await fetch(`http://127.0.0.1:${port}/api/admin/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'Nice@2026'})});
  const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('login failed: '+login.status);
  const rows=await req('/api/admin/quote-requests',{headers:{cookie}});
  if(!rows.body.some(x=>x.code===qr.body.code))throw Error('quote not stored');
  // Exercise actual private payment receipt storage and authorization.
  const boxes=(await req('/api/boxes')).body;
  const pay=(await req('/api/payment-methods')).body;
  if(boxes.length && pay.length){
    const box=boxes.find(b=>b.status==='active' && b.unit_price>0 && b.min_quantity<=b.total_quantity-b.reserved_quantity);
    if(box){
      const png='data:image/png;base64,'+Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex').toString('base64');
      const order=await post('/api/orders',{boxId:box.id,quantity:box.min_quantity,paymentMethodId:pay[0].id,customerName:'زبون تجريبي',phone:'777123456',shopName:'متجر تجريبي',paymentProofBase64:png});
      if(order.status!==201)throw Error('box order failed '+JSON.stringify(order));
      const adminOrders=await req('/api/admin/orders',{headers:{cookie}});
      const saved=adminOrders.body.find(x=>x.code===order.body.code);
      if(!saved || !saved.payment_proof_url)throw Error('receipt not saved');
      const blocked=await fetch(`http://127.0.0.1:${port}${saved.payment_proof_url}`);
      if(blocked.status!==401)throw Error('private receipt exposed to guest: '+blocked.status);
      const readable=await fetch(`http://127.0.0.1:${port}${saved.payment_proof_url}`,{headers:{cookie}});
      if(readable.status!==200)throw Error('private receipt not visible to admin: '+readable.status);
    }
  }
  const before=await req('/api/studio/published');
  const draft=await req('/api/studio/draft',{headers:{cookie}});
  if(!draft.body.layout?.sections)throw Error('no studio draft');
  draft.body.layout.sections.find(x=>x.id==='hero').title='اختبار نايس';
  const saved=await req('/api/studio/draft',{method:'PUT',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({layout:draft.body.layout})});
  if(saved.status!==200)throw Error('draft save failed: '+JSON.stringify(saved));
  const afterDraft=await req('/api/studio/published');if(JSON.stringify(before.body.layout)!==JSON.stringify(afterDraft.body.layout))throw Error('draft leaked into live layout');
  const published=await post('/api/studio/publish',{layout:draft.body.layout},cookie);if(published.status!==200)throw Error('studio publish failed: '+JSON.stringify(published));
  const final=await req('/api/studio/published');if(final.body.layout.sections.find(x=>x.id==='hero')?.title!=='اختبار نايس')throw Error('published layout mismatch');
  console.log('PASSED: local SQLite fallback, products, banner price, quote request, admin auth, private payment media, studio draft and publish');
}catch(e){console.error(e);console.error(out);process.exitCode=1}finally{child.kill('SIGTERM');rmSync(tmp,{recursive:true,force:true});}
