'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {openDb}=require('../db-compat');
const {createDefault}=require('./default-layout');
async function initStudio(root){
  const dataDir=path.join(root,'data');if(!process.env.VERCEL)fs.mkdirSync(dataDir,{recursive:true});
  const db=openDb(path.join(dataDir,'nice-studio.db'));
  (await db.exec(`CREATE TABLE IF NOT EXISTS studio_state (id INTEGER PRIMARY KEY CHECK(id=1),draft TEXT NOT NULL,published TEXT NOT NULL,draft_time TEXT NOT NULL,published_time TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_template(id INTEGER PRIMARY KEY CHECK(id=1),snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,snapshot TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);`));
  if(process.env.SUPABASE_DB_URL){
    for(const name of ['studio_state','studio_template','studio_revisions'])await db.exec(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
  }
  // First install: a draft for editing, but NO changes to the live Nice OS site
  // until the owner explicitly presses Publish in Nice Studio.
  if(!(await db.prepare('SELECT id FROM studio_state WHERE id=1').get())){
    const initial=createDefault();
    // Pre-fill the draft with the exact Nice OS v3 headings, and honor brand
    // colors already chosen in Nice OS > Site settings when available.
    const copy={
      hero:['كل احتياج إعلانك في مكان واحد','منتجات، طلبات مخصصة، صناديق تجميع وعروض أسعار في منصة واحدة.'],
      products:['منتجات وحلول نايس','اختر المنتج ثم أرسل المقاس والمواصفات والملف. بعض المنتجات بسعر مباشر، والبعض نحسبه حسب طلبك.'],
      'quote-request':['تحتاج أكثر من منتج؟ اطلب عرض سعر','أدخل بيانات منشأتك، اختر المنتجات والكميات التقريبية، وستظهر لك قيمة مبدئية قبل إرسال الطلب.'],
      boxes:['صناديق التجميع','شارك الحد الأدنى للطباعة مع مشاريع أخرى وخذ الكمية التي تناسب ميزانيتك.'],
      services:['خدمات نايس','تنفيذ متكامل للدعاية والطباعة والهوية.'],
      portfolio:['من أعمالنا','اضغط على أي عمل لتكبيره أو لطلب شيء مشابه مباشرة عبر واتساب.'],
      about:['شريك تنفيذ، وليس مجرد مطبعة',''],
      track:['تابع طلبك','رقم الطلب يعمل لصناديق التجميع وطلبات المنتجات.']
    };
    for(const sec of initial.sections){
      if(copy[sec.id]){sec.title=copy[sec.id][0];sec.description=copy[sec.id][1];}
    }
    const hero=initial.sections.find(s=>s.id==='hero');
    if(hero){hero.button='استعرض المنتجات';hero.secondaryButton='اطلب عرض سعر';}
    if(!process.env.VERCEL){
      try{
        const {DatabaseSync}=require('node:sqlite');
        const legacyDb=new DatabaseSync(path.join(dataDir,'nice.db'),{readOnly:true});
        try{
          const cfg=Object.fromEntries(legacyDb.prepare('SELECT key,value FROM settings').all().map(x=>[x.key,x.value]));
          const keys={primary:'primary_color',accent:'accent_color',background:'background_color',surface:'surface_color',text:'text_color',muted:'muted_color'};
          for(const [key,legacyKey] of Object.entries(keys))if(/^#[0-9a-f]{6}$/i.test(cfg[legacyKey]||''))initial.theme[key]=cfg[legacyKey];
          if(hero){if(cfg.hero_title)hero.title=cfg.hero_title;if(cfg.hero_subtitle)hero.description=cfg.hero_subtitle;}
        }finally{legacyDb.close();}
      }catch(e){if(e.code!=='SQLITE_CANTOPEN')console.warn('Studio: could not import theme:',e.message);}
    }
    const d=JSON.stringify(initial),published=JSON.stringify({version:1,theme:{},sections:[]});
    (await db.prepare('INSERT OR IGNORE INTO studio_template(id,snapshot) VALUES(1,?)').run(d));
    const t=new Date().toISOString();
    (await db.prepare('INSERT OR IGNORE INTO studio_state VALUES(1,?,?,?,?)').run(d,published,t,t));
  }
  const dir=path.join(root,'public','uploads');if(!process.env.VERCEL)fs.mkdirSync(dir,{recursive:true});
  const get=async (mode='published')=>{
    const row=(await db.prepare('SELECT * FROM studio_state WHERE id=1').get());
    return {layout:JSON.parse(mode==='draft'?row.draft:row.published),draftTime:row.draft_time,publishedTime:row.published_time};
  };
  function validate(layout){
    if(!layout || typeof layout!=='object' || !layout.theme || !Array.isArray(layout.sections))throw new Error('صيغة التصميم غير صالحة');
    if(layout.sections.length>50)throw new Error('الحد الأقصى 50 قسمًا');
    const ids=new Set();
    const allowed=new Set(['hero','products','quote','boxes','services','portfolio','about','track','promo','split','testimonial','faq','cta']);
    for(const item of layout.sections){
      if(!item || typeof item.id!=='string'|| item.id.length>100 || !allowed.has(item.kind)||ids.has(item.id))throw new Error('قسم غير صالح أو مكرر');
      ids.add(item.id);
    }
    const text=JSON.stringify(layout);
    if(text.length>400000)throw new Error('التصميم أكبر من الحد المسموح');
    return text;
  }
  async function draft(layout){
    const clean=validate(layout),t=new Date().toISOString();
    (await db.prepare('UPDATE studio_state SET draft=?,draft_time=? WHERE id=1').run(clean,t));
    return {ok:true,updatedAt:t};
  }
  async function publish(layout){
    const clean=layout?validate(layout):(await db.prepare('SELECT draft FROM studio_state WHERE id=1').get()).draft;
    const row=(await db.prepare('SELECT published FROM studio_state WHERE id=1').get());
    const t=new Date().toISOString();
    try{await db.withTransaction(async()=>{
      (await db.prepare('INSERT INTO studio_revisions(snapshot,note,created_at) VALUES(?,?,?)').run(row.published,'قبل النشر',t));
      (await db.prepare('UPDATE studio_state SET draft=?,published=?,draft_time=?,published_time=? WHERE id=1').run(clean,clean,t,t));
      (await db.prepare('DELETE FROM studio_revisions WHERE id NOT IN (SELECT id FROM studio_revisions ORDER BY id DESC LIMIT 20)').run());
      });
      return {ok:true,publishedAt:t};
    }catch(e){throw e;}
  }
  async function revisions(){return (await db.prepare('SELECT id,note,created_at FROM studio_revisions ORDER BY id DESC LIMIT 20').all());}
  async function resetDraft(){
    const original=(await db.prepare('SELECT snapshot FROM studio_template WHERE id=1').get());
    return draft(JSON.parse(original?.snapshot||JSON.stringify(createDefault())));
  }
  async function restore(id){
    const row=(await db.prepare('SELECT snapshot FROM studio_revisions WHERE id=?').get(id));
    if(!row)throw new Error('لا توجد نسخة محفوظة');
    return draft(JSON.parse(row.snapshot));
  }
  async function upload(dataUrl){
    const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||''));
    if(!m)throw new Error('الصورة يجب أن تكون PNG أو JPG أو WebP');
    const buff=Buffer.from(m[2],'base64');if(buff.length>(process.env.VERCEL?2.5:5)*1024*1024)throw new Error('الصورة أكبر من 5MB');
    const magic=(m[1]==='png'&&buff.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))||
      (m[1]==='jpeg'&&buff.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))||
      (m[1]==='webp'&&buff.toString('ascii',0,4)==='RIFF'&&buff.toString('ascii',8,12)==='WEBP');
    if(!magic)throw new Error('تنسيق الصورة غير صحيح');
    const ext=m[1]==='jpeg'?'jpg':m[1];const filename=`studio-${crypto.randomBytes(12).toString('hex')}.${ext}`;
    if(process.env.VERCEL || process.env.SUPABASE_STORAGE_REMOTE==='1')return await require('../supabase-storage').upload(filename,buff,{contentType:'image/'+(ext==='jpg'?'jpeg':ext)});
    fs.writeFileSync(path.join(dir,filename),buff,{flag:'wx'});return '/uploads/'+filename;
  }
  return {get,draft,publish,revisions,restore,resetDraft,upload,db};
}
async function createHandler(root,{isAdmin,readJson,json}){
  const core=await initStudio(root);
  return async function handle(req,res,url){
    const method=req.method,p=url.pathname;
    try{
      if(method==='GET'&&p==='/api/studio/published')return json(res,200,await core.get('published'));
      const admin=isAdmin(req);
      if(!admin)return json(res,401,{error:'unauthorized'});
      if(method==='GET'&&p==='/api/studio/draft')return json(res,200,await core.get('draft'));
      if(method==='GET'&&p==='/api/studio/revisions')return json(res,200,await core.revisions());
      if(method==='PUT'&&p==='/api/studio/draft')return json(res,200,await core.draft((await readJson(req)).layout));
      if(method==='POST'&&p==='/api/studio/publish')return json(res,200,await core.publish((await readJson(req)).layout));
      if(method==='POST'&&p==='/api/studio/restore')return json(res,200,await core.restore(Number((await readJson(req)).id)));
      if(method==='POST'&&p==='/api/studio/reset-draft')return json(res,200,await core.resetDraft());
      if(method==='POST'&&p==='/api/studio/upload')return json(res,200,{url:await core.upload((await readJson(req)).dataUrl)});
      return json(res,404,{error:'not_found'});
    }catch(e){return json(res,400,{error:e.message||'تعذر إتمام الطلب'});}
  };
}
module.exports={createHandler,initStudio};
