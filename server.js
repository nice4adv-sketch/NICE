'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDb } = require('./db-compat');
const { upload:uploadSupabase,downloadPrivate }=require('./supabase-storage');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(PUBLIC, 'uploads');
const PRIVATE_UPLOADS = path.join(ROOT, 'private-uploads');
// Serverless deployments must never write persistent data to the filesystem.
if (!process.env.VERCEL) {
  fs.mkdirSync(DATA,{recursive:true,mode:0o700});
  fs.mkdirSync(UPLOADS,{recursive:true});
  fs.mkdirSync(PRIVATE_UPLOADS,{recursive:true,mode:0o700});
  const prefixes=/^(?:proof|request|logo)-[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i;
  for(const name of fs.readdirSync(UPLOADS)) {
    if(prefixes.test(name)&&fs.statSync(path.join(UPLOADS,name)).isFile()) {
      const src=path.join(UPLOADS,name),dst=path.join(PRIVATE_UPLOADS,name);
      if(!fs.existsSync(dst))fs.renameSync(src,dst);
    }
  }
}
const privatePrefixes=/^(?:proof|request|logo)-[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/i;
const db=openDb(path.join(DATA,'nice.db'));

function nowIso() { return new Date().toISOString(); }
function randomCode(prefix='NC') { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`; }
function b64url(input) { return Buffer.from(input).toString('base64url'); }
function hmac(s, secret) { return crypto.createHmac('sha256', secret).update(s).digest('base64url'); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, keyHex] = String(stored||'').split(':');
  if (!salt || !keyHex) return false;
  const got = crypto.scryptSync(password, salt, 64);
  const want = Buffer.from(keyHex, 'hex');
  return want.length === got.length && crypto.timingSafeEqual(got, want);
}

async function initDb() {
 await db.withTransaction(async()=>{
  (await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '✦',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      specs TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      unit_price REAL NOT NULL DEFAULT 0,
      total_quantity INTEGER NOT NULL,
      reserved_quantity INTEGER NOT NULL DEFAULT 0,
      min_quantity INTEGER NOT NULL DEFAULT 1,
      deadline TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'wallet',
      holder_name TEXT DEFAULT '',
      account_number TEXT DEFAULT '',
      instructions TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT DEFAULT '',
      image_url TEXT NOT NULL,
      description TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      box_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      shop_name TEXT DEFAULT '',
      phone TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_amount REAL NOT NULL,
      payment_method_id INTEGER,
      payment_proof_url TEXT DEFAULT '',
      customer_logo_url TEXT DEFAULT '',
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(box_id) REFERENCES boxes(id),
      FOREIGN KEY(payment_method_id) REFERENCES payment_methods(id)
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      business_name TEXT DEFAULT '',
      phone TEXT UNIQUE NOT NULL,
      email TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      customer_type TEXT NOT NULL DEFAULT 'retail',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      category_id INTEGER,
      sale_mode TEXT NOT NULL DEFAULT 'quote',
      pricing_mode TEXT NOT NULL DEFAULT 'quote',
      base_price REAL NOT NULL DEFAULT 0,
      unit_label TEXT DEFAULT 'قطعة',
      min_quantity INTEGER NOT NULL DEFAULT 1,
      description TEXT DEFAULT '',
      specs TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      options_json TEXT DEFAULT '[]',
      pricing_json TEXT DEFAULT '{}',
      requires_design INTEGER NOT NULL DEFAULT 0,
      production_source TEXT NOT NULL DEFAULT 'inhouse',
      active INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(category_id) REFERENCES product_categories(id)
    );
    CREATE TABLE IF NOT EXISTS product_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      product_id INTEGER NOT NULL,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      business_name TEXT DEFAULT '',
      phone TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      configuration_json TEXT DEFAULT '{}',
      customer_file_url TEXT DEFAULT '',
      note TEXT DEFAULT '',
      unit_price REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      pricing_status TEXT NOT NULL DEFAULT 'awaiting_quote',
      payment_method_id INTEGER,
      payment_proof_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      admin_note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(payment_method_id) REFERENCES payment_methods(id)
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      request_id INTEGER,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      business_name TEXT DEFAULT '',
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      valid_until TEXT DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(request_id) REFERENCES product_requests(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quote_form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      required INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS quote_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      contact_name TEXT DEFAULT '',
      company_name TEXT NOT NULL,
      phone1 TEXT NOT NULL,
      phone2 TEXT DEFAULT '',
      phone3 TEXT DEFAULT '',
      location TEXT DEFAULT '',
      activity TEXT DEFAULT '',
      contract_type TEXT DEFAULT 'annual',
      fields_json TEXT DEFAULT '{}',
      items_json TEXT DEFAULT '[]',
      estimated_subtotal REAL NOT NULL DEFAULT 0,
      discount_min REAL NOT NULL DEFAULT 5,
      discount_max REAL NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'new',
      admin_note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS business_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      company_name TEXT NOT NULL,
      contact_name TEXT DEFAULT '',
      phone TEXT NOT NULL,
      contract_type TEXT DEFAULT 'annual',
      status TEXT NOT NULL DEFAULT 'lead',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      credit_limit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
  `));

  // Supabase creates SQL-editor tables without RLS by default. Every business
  // table must be inaccessible to the public anon/authenticated REST roles.
  if(process.env.SUPABASE_DB_URL){
    for(const name of ['settings','admins','services','boxes','payment_methods','portfolio','orders','customers','product_categories','products','product_requests','quotes','quote_items','quote_form_fields','quote_requests','business_accounts']){
      await db.exec(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
    }
  }

  // Lightweight migrations for existing Nice OS databases.
  if(process.env.SUPABASE_DB_URL) await db.exec("ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_json TEXT DEFAULT '{}'");
  else try { await db.exec("ALTER TABLE products ADD COLUMN pricing_json TEXT DEFAULT '{}'"); } catch {}

  if (!(await db.prepare('SELECT id FROM quote_form_fields LIMIT 1').get())) {
    const qf=db.prepare('INSERT INTO quote_form_fields(field_key,label,type,required,active,sort_order) VALUES(?,?,?,?,?,?)');
    for(const row of [['company_name','اسم الشركة','text',1,1,1],['phone1','رقم التواصل الأول','tel',1,1,2],['phone2','رقم التواصل الثاني','tel',0,1,3],['phone3','رقم التواصل الثالث','tel',0,1,4],['location','الموقع','text',1,1,5],['activity','النشاط','text',1,1,6],['contract_type','مدة التعاقد','select',1,1,7]]) await qf.run(...row);
  }

  const defaults = {
    company_name: 'نايس للدعاية والإعلان',
    company_name_en: 'Nice for Advertising',
    tagline: 'نحوّل فكرتك إلى حضور يُرى ويُتذكّر',
    about: 'شركة متخصصة في تنفيذ أعمال الدعاية والإعلان والتصاميم واللوحات والحروف والكلادنج والبنر والفلكس واللاصق والستاندات والدروع والأختام والأعلام والباجات والطباعة المتنوعة.',
    phone: '775577562',
    whatsapp: '967775577562',
    address: 'صنعاء - اليمن',
    facebook_url: 'https://www.facebook.com/p/Nice-for-Advertising-%D9%86%D8%A7%D9%8A%D8%B3-%D9%84%D9%84%D8%AF%D8%B9%D8%A7%D9%8A%D8%A9-%D9%88%D8%A7%D9%84%D8%A7%D8%B9%D9%84%D8%A7%D9%86-100084329619634/',
    logo_url: '',
    primary_color: '#111827',
    accent_color: '#f59e0b',
    hero_title: 'كل احتياج إعلانك في مكان واحد',
    hero_subtitle: 'احجز حصتك في صناديق التجميع، ارفع إشعار الدفع، وتابع طلبك بسهولة.',
    quote_discount_min: '5',
    quote_discount_max: '20',
    quote_contract_types: JSON.stringify(['سنوي','نصف سنوي','ربع سنوي','شهري','مشروع'])
  };
  const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k,v] of Object.entries(defaults)) (await ins.run(k,String(v)));

  if (!(await db.prepare('SELECT id FROM admins LIMIT 1').get())) {
    (await db.prepare('INSERT INTO admins(username,password_hash) VALUES(?,?)').run('admin', hashPassword('Nice@2026')));
  }
  if (!(await db.prepare('SELECT id FROM payment_methods LIMIT 1').get())) {
    (await db.prepare(`INSERT INTO payment_methods(name,type,holder_name,account_number,instructions,active,sort_order)
      VALUES(?,?,?,?,?,?,?)`).run('محفظة إلكترونية','wallet','حمزة أحمد الزهري','775577562','حوّل المبلغ ثم ارفع صورة إشعار التحويل.',1,1));
  }
  if (!(await db.prepare('SELECT id FROM services LIMIT 1').get())) {
    const rows = [
      ['لوحات وبنر','طباعة البنر والفلكس واللوحات بمقاسات متعددة','▣',1],
      ['قص ليزر','لوحات إرشادية ومكتبية ودروع وأعمال أكريليك','✦',2],
      ['طباعة UV','طباعة الهوية على خامات ومنتجات متنوعة','◈',3],
      ['أكواب وهدايا','طباعة الشعارات والهويات على الأكواب والهدايا','☕',4],
      ['أختام','تصميم وتنفيذ الأختام للأفراد والمنشآت','◎',5],
      ['مطبوعات ورقية','فواتير، بروشورات، أكياس ومطبوعات عبر شركائنا','▤',6]
    ];
    const q = db.prepare('INSERT INTO services(title,description,icon,sort_order) VALUES(?,?,?,?)');
    for(const row of rows) await q.run(...row);
  }
  if (!(await db.prepare('SELECT id FROM boxes LIMIT 1').get())) {
    const q = db.prepare(`INSERT INTO boxes(title,category,description,specs,unit_price,total_quantity,reserved_quantity,min_quantity,deadline,status)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    (await q.run('صندوق أكياس المتاجر - مقاس متوسط','أكياس','شارك الحد الأدنى للطباعة مع متاجر أخرى وخذ الكمية المناسبة لك.','مقاس موحد للصندوق، والهوية تختلف لكل متجر.',0,1000,320,50,'','active'));
    (await q.run('صندوق استيكرات الهوية','استيكر','تجميع طلبات الاستيكرات للمشاريع الصغيرة والمتاجر.','يتم تحديد المقاس والخامة عند تأكيد الصندوق.',0,5000,1200,100,'','active'));
  }
  if (!(await db.prepare('SELECT id FROM product_categories LIMIT 1').get())) {
    const q=db.prepare('INSERT INTO product_categories(name,slug,sort_order,active) VALUES(?,?,?,1)');
    for(const row of [['لوحات وطباعة','signage-print',1],['هدايا وهوية','branding-gifts',2],['أختام','stamps',3],['باقات الأعمال','business-packages',4]]) await q.run(...row);
  }
  if (!(await db.prepare('SELECT id FROM products LIMIT 1').get())) {
    const cat=Object.fromEntries((await db.prepare('SELECT slug,id FROM product_categories').all()).map(x=>[x.slug,x.id]));
    const q=db.prepare(`INSERT INTO products(title,slug,category_id,sale_mode,pricing_mode,base_price,unit_label,min_quantity,description,specs,options_json,pricing_json,requires_design,production_source,active,featured,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const t=nowIso();
    (await q.run('طباعة بنر حسب المقاس','banner-custom',cat['signage-print'],'configurable','fixed',1500,'متر مربع',1,'سعر المتر المربع يبدأ من 1500 ر.ي. أدخل العرض والارتفاع ليحسب النظام المساحة تلقائيًا.','مناسب للمحلات والفعاليات والحملات.',JSON.stringify([{name:'الخامة',type:'select',values:['بنر','فلكس','لاصق'],required:true},{name:'تركيب',type:'select',values:['بدون تركيب','مع التركيب'],required:false}]),JSON.stringify({unit:'sqm',label:'متر مربع',basePrice:1500,minQuantity:1,tierBasis:'quantity',tiers:[]}),0,'inhouse',1,1,1,t,t));
    (await q.run('أختام الشركات والأفراد','custom-stamps',cat['stamps'],'configurable','quote',0,'ختم',1,'اطلب ختمك وارفع الشعار أو النص المطلوب.','أنواع ومقاسات متعددة حسب الاستخدام.',JSON.stringify([{name:'نوع الختم',type:'select',values:['ختم شركة','ختم شخصي','ختم تاريخ','غير ذلك'],required:true},{name:'المقاس التقريبي',type:'text',placeholder:'اكتب المقاس إن وجد',required:false}]),JSON.stringify({unit:'piece',label:'قطعة',basePrice:0,minQuantity:1,tierBasis:'quantity',tiers:[]}),1,'inhouse',1,1,2,t,t));
    (await q.run('طباعة UV مخصصة','uv-custom',cat['branding-gifts'],'custom','quote',0,'قطعة',1,'اطبع هويتك أو تصميمك على خامات ومنتجات متعددة.','ارفع صورة المنتج أو الملف واشرح المطلوب.',JSON.stringify([{name:'الخامة أو المنتج',type:'text',placeholder:'مثال: أكريليك / معدن / كوب...',required:true},{name:'المقاس',type:'text',placeholder:'المقاس التقريبي',required:false}]),JSON.stringify({unit:'piece',label:'قطعة',basePrice:0,minQuantity:1,tierBasis:'quantity',tiers:[]}),1,'inhouse',1,1,3,t,t));
    (await q.run('دروع تكريم','award-shields',cat['branding-gifts'],'configurable','quote',0,'درع',1,'دروع تكريم للشركات والمدارس والفعاليات بتصاميم مخصصة.','يمكن رفع الشعار والأسماء لاحقًا.',JSON.stringify([{name:'العدد',type:'number',required:true},{name:'المناسبة',type:'text',placeholder:'اسم المناسبة أو الجهة',required:false}]),JSON.stringify({unit:'piece',label:'درع',basePrice:0,minQuantity:1,tierBasis:'quantity',tiers:[]}),1,'inhouse',1,0,4,t,t));
    (await q.run('باقة افتتاح متجر','store-launch-package',cat['business-packages'],'package','quote',0,'باقة',1,'نجمع احتياجات الافتتاح في طلب واحد: لوحة، ختم، استيكرات ومطبوعات حسب احتياجك.','يتم تخصيص الباقة حسب نشاط المشروع وميزانيته.',JSON.stringify([{name:'نوع النشاط',type:'text',placeholder:'مطعم / ملابس / عطور...',required:true},{name:'الميزانية التقريبية',type:'text',placeholder:'اختياري',required:false}]),JSON.stringify({unit:'package',label:'باقة',basePrice:0,minQuantity:1,tierBasis:'quantity',tiers:[]}),1,'mixed',1,1,5,t,t));
  }
 });
}
let SESSION_SECRET;
let initPromise;
let studioApi;
async function ensureInit(){
  if(!initPromise){
    initPromise=(async()=>{
      await initDb();
      if(process.env.NODE_ENV==='production'||process.env.VERCEL){
        const password=String(process.env.NICE_ADMIN_PASSWORD||'');
        if(password.length<14||password==='Nice@2026') throw new Error('NICE_ADMIN_PASSWORD must be 14+ characters and not the demo password');
        if(process.env.NICE_SESSION_SECRET && String(process.env.NICE_SESSION_SECRET).length<32) throw new Error('NICE_SESSION_SECRET must have 32+ characters');
        if(process.env.VERCEL && (!process.env.SUPABASE_URL||!(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY)))throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel');
        if(process.env.VERCEL)await require('./supabase-storage').validateBucketVisibility();
        const a=await db.prepare('SELECT id,password_hash FROM admins WHERE username=?').get('admin');
        if(a&&verifyPassword('Nice@2026',a.password_hash))
          await db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(password),a.id);
      }
      if(process.env.NICE_ROTATE_SESSION_SECRET_ON_BOOT==='1' && !process.env.VERCEL){
        await db.prepare("INSERT INTO settings(key,value) VALUES('session_secret',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(crypto.randomBytes(32).toString('hex'));
      }
      SESSION_SECRET=process.env.NICE_SESSION_SECRET || await getSecret();
      studioApi=await require('./nice-studio/studio-api').createHandler(__dirname,{isAdmin:req=>!!requireAdmin(req),readJson,json});
    })().catch(err=>{initPromise=null;throw err});
  }
  return initPromise;
}
async function getSettings(){
  return Object.fromEntries((await db.prepare("SELECT key,value FROM settings WHERE key NOT IN ('session_secret')").all()).map(r=>[r.key,r.value]));
}
async function getSecret(){
  let row=await db.prepare("SELECT value FROM settings WHERE key='session_secret'").get();
  if(!row){
    const secret=crypto.randomBytes(32).toString('hex');
    await db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('session_secret',secret);
    row=await db.prepare("SELECT value FROM settings WHERE key='session_secret'").get();
  }
  return row.value;
}

function makeToken(admin) {
  const payload = b64url(JSON.stringify({id:admin.id,u:admin.username,exp:Date.now()+8*60*60*1000}));
  return `${payload}.${hmac(payload,SESSION_SECRET)}`;
}
function parseCookies(req) {
  const out={};
  String(req.headers.cookie||'').split(';').forEach(p=>{const i=p.indexOf('=');if(i>0){try{out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());}catch{}}});
  return out;
}
function requireAdmin(req) {
  const token = parseCookies(req).nice_admin;
  if (!token) return null;
  const [p,s] = token.split('.');
  if (!p || !s || s.length>100) return null;
  const expected=Buffer.from(hmac(p,SESSION_SECRET));
  const got=Buffer.from(s);
  if(got.length!==expected.length || !crypto.timingSafeEqual(expected,got)) return null;
  try { const d=JSON.parse(Buffer.from(p,'base64url').toString()); if(d.exp < Date.now()) return null; return d; } catch { return null; }
}
function json(res, status, body, extra={}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});
  res.end(JSON.stringify(body));
}
function safeText(v,max=5000){ return String(v??'').trim().slice(0,max); }
async function readJson(req, maxBytes=process.env.VERCEL?4*1024*1024:12*1024*1024) {
  if(Buffer.isBuffer(req.body))return JSON.parse(req.body.toString('utf8'));
  if(req.body && typeof req.body==='object')return req.body;
  if(typeof req.body==='string')return JSON.parse(req.body);
  const chunks=[]; let size=0;
  for await (const c of req) { size+=c.length; if(size>maxBytes) throw new Error('payload_too_large'); chunks.push(c); }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
async function saveDataUrl(dataUrl, prefix='file') {
  if (!dataUrl) return '';
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) throw new Error('unsupported_file');
  const ext = m[2].toLowerCase()==='jpeg'?'jpg':m[2].toLowerCase();
  const buf = Buffer.from(m[3],'base64');
  if (buf.length > (process.env.VERCEL?2.5:6)*1024*1024) throw new Error('file_too_large');
  const name = `${prefix}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${ext}`;
  const isPrivate=['proof','request','logo'].includes(prefix);
  if(process.env.VERCEL || process.env.SUPABASE_STORAGE_REMOTE==='1'){
    return uploadSupabase(name,buf,{isPrivate,contentType:`image/${ext==='jpg'?'jpeg':ext}`});
  }
  fs.writeFileSync(path.join(isPrivate?PRIVATE_UPLOADS:UPLOADS,name),buf,{flag:'wx',mode:isPrivate?0o600:0o644});
  return `${isPrivate?'/private-media':'/uploads'}/${name}`;
}
function mimeFor(file) {
  const ext=path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'})[ext] || 'application/octet-stream';
}
function serveStatic(req,res,pathname) {
  // Old receipt and customer file links may have /uploads/... in the database.
  // Serve those only via the protected private-media handler.
  if(/^\/uploads\/(proof|request|logo)-/i.test(pathname)) return false;
  let rel = pathname==='/' ? '/index.html' : pathname;
  if (rel==='/admin') rel='/admin.html';
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC)) return false;
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return false;
  res.writeHead(200, {'Content-Type':mimeFor(full),'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});
  fs.createReadStream(full).pipe(res); return true;
}

async function servePrivateMedia(req,res,pathname) {
  if(req.method!=='GET' && req.method!=='HEAD') return json(res,405,{error:'method_not_allowed'});
  if(!requireAdmin(req)) return json(res,401,{error:'unauthorized'});
  const name=path.basename(pathname);
  if(!privatePrefixes.test(name) || pathname.split('/').pop()!==name) return json(res,404,{error:'not_found'});
  if(process.env.VERCEL || process.env.SUPABASE_STORAGE_REMOTE==='1'){
    const result=await downloadPrivate(name);
    if(!result)return json(res,404,{error:'not_found'});
    res.writeHead(200,{'Content-Type':result.contentType,'Content-Length':result.buffer.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
    if(req.method==='HEAD')return res.end();
    return res.end(result.buffer);
  }
  const full=path.join(PRIVATE_UPLOADS,name);
  if(!fs.existsSync(full) || !fs.statSync(full).isFile()) return json(res,404,{error:'not_found'});
  const st=fs.statSync(full);
  res.writeHead(200,{'Content-Type':mimeFor(full),'Content-Length':st.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
  if(req.method==='HEAD')return res.end();
  return fs.createReadStream(full).pipe(res);
}
function send404(res){ json(res,404,{error:'not_found'}); }
function adminOnly(req,res){ const a=requireAdmin(req); if(!a){json(res,401,{error:'unauthorized'}); return null;} return a; }
function num(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
function int(v,d=0){ return Math.trunc(num(v,d)); }
function slugify(v=''){
  const base=String(v).trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,'-').replace(/^-+|-+$/g,'');
  return base || `product-${Date.now().toString(36)}`;
}
function parseJson(text,fallback={}){ try{return JSON.parse(text||'');}catch{return fallback;} }
async function upsertCustomer({name,businessName='',phone,email='',logoUrl='',customerType='retail'}) {
  const clean=safeText(phone,30); if(!clean) return null;
  const old=(await db.prepare('SELECT * FROM customers WHERE phone=?').get(clean));
  if(old){ (await db.prepare(`UPDATE customers SET name=?,business_name=?,email=CASE WHEN ?!='' THEN ? ELSE email END,logo_url=CASE WHEN ?!='' THEN ? ELSE logo_url END,customer_type=?,updated_at=? WHERE id=?`).run(safeText(name||old.name,120),safeText(businessName||old.business_name,150),safeText(email,180),safeText(email,180),safeText(logoUrl,500),safeText(logoUrl,500),safeText(customerType||old.customer_type,30),nowIso(),old.id)); return old.id; }
  const r=(await db.prepare(`INSERT INTO customers(name,business_name,phone,email,logo_url,customer_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).run(safeText(name,120),safeText(businessName,150),clean,safeText(email,180),safeText(logoUrl,500),safeText(customerType,30)||'retail',nowIso(),nowIso()));
  return Number(r.lastInsertRowid);
}
function productPublicRow(row){ if(!row)return row; return {...row,options:parseJson(row.options_json,[]),pricing:parseJson(row.pricing_json,{}),pricing_json:undefined}; }
function normalizePricing(b, old={}) {
  const p = (b && typeof b.pricing==='object') ? b.pricing : parseJson(old.pricing_json,{});
  const unit = ['piece','meter','sqm','package'].includes(p.unit) ? p.unit : (old.unit_label==='متر مربع'?'sqm':'piece');
  const tiers = Array.isArray(p.tiers) ? p.tiers.map(t=>({min:Math.max(1,int(t.min,1)),unitPrice:Math.max(0,num(t.unitPrice,0))})).filter(t=>t.unitPrice>0).sort((a,b)=>a.min-b.min) : [];
  return {unit,label:safeText(p.label,40)||old.unit_label||'قطعة',basePrice:Math.max(0,num(p.basePrice, num(b?.basePrice,old.base_price||0))),minQuantity:Math.max(1,int(p.minQuantity, int(b?.minQuantity,old.min_quantity||1))),tierBasis:p.tierBasis==='billable'?'billable':'quantity',tiers,discountNote:safeText(p.discountNote,300)};
}
function calculateProductPrice(product, quantity, configuration={}) {
  const p=parseJson(product.pricing_json,{}); const qty=Math.max(1,num(quantity,1));
  const width=num(configuration.width,0), height=num(configuration.height,0);
  let billable=qty;
  if(p.unit==='sqm'){ if(width<=0||height<=0) return {ok:false,error:'dimensions_required',quantity:qty}; billable=qty*width*height; }
  else if(p.unit==='meter'){ billable=qty; }
  const basis=p.tierBasis==='billable'?billable:qty;
  let unitPrice=num(p.basePrice,product.base_price||0);
  for(const t of (p.tiers||[]).slice().sort((a,b)=>Number(a.min)-Number(b.min))) if(basis>=Number(t.min)) unitPrice=Number(t.unitPrice);
  return {ok:true,quantity:qty,billableUnits:billable,unitPrice,total:billable*unitPrice,unit:p.unit||'piece',label:p.label||product.unit_label||'قطعة',discountNote:p.discountNote||''};
}


async function api(req,res,url) {
  const p=url.pathname; const method=req.method;
  
// Nice Studio integration: BEGIN
  if(p.startsWith('/api/studio/')) return studioApi(req,res,url);
  // Nice Studio integration: END
try {
    if (method==='GET' && p==='/api/settings') return json(res,200,await getSettings());
    if (method==='GET' && p==='/api/services') return json(res,200,(await db.prepare('SELECT * FROM services WHERE active=1 ORDER BY sort_order,id').all()));
    if (method==='GET' && p==='/api/boxes') {
      const rows=(await db.prepare("SELECT *, MAX(total_quantity-reserved_quantity,0) AS remaining FROM boxes WHERE status!='archived' ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,id DESC").all());
      return json(res,200,rows);
    }
    if (method==='GET' && p==='/api/payment-methods') return json(res,200,(await db.prepare('SELECT id,name,type,holder_name,account_number,instructions FROM payment_methods WHERE active=1 ORDER BY sort_order,id').all()));
    if (method==='GET' && p==='/api/portfolio') return json(res,200,(await db.prepare('SELECT * FROM portfolio WHERE active=1 ORDER BY id DESC LIMIT 60').all()));
    if (method==='GET' && p.startsWith('/api/order/')) {
      const code=decodeURIComponent(p.split('/').pop()); const phone=safeText(url.searchParams.get('phone'),30);
      const row=(await db.prepare(`SELECT o.code,o.customer_name,o.shop_name,o.phone,o.quantity,o.total_amount,o.status,o.admin_note,o.created_at,b.title box_title
        FROM orders o JOIN boxes b ON b.id=o.box_id WHERE o.code=? AND o.phone=?`).get(code,phone));
      return row?json(res,200,row):json(res,404,{error:'order_not_found'});
    }
    if (method==='POST' && p==='/api/orders') {
      const b=await readJson(req);
      const boxId=int(b.boxId); const qty=int(b.quantity); const pmId=int(b.paymentMethodId);
      const box=(await db.prepare("SELECT * FROM boxes WHERE id=? AND status='active'").get(boxId));
      if(!box) return json(res,400,{error:'box_unavailable'});
      if(num(box.unit_price)<=0)return json(res,400,{error:'price_not_configured'});
      if(qty<box.min_quantity || qty<=0) return json(res,400,{error:'quantity_too_low',min:box.min_quantity});
      const remaining=box.total_quantity-box.reserved_quantity; if(qty>remaining) return json(res,400,{error:'quantity_exceeds_remaining',remaining});
      const customer=safeText(b.customerName,120), shop=safeText(b.shopName,120), phone=safeText(b.phone,30), note=safeText(b.note,1200);
      if(!customer || !phone) return json(res,400,{error:'missing_customer_data'});
      const pm=(await db.prepare('SELECT * FROM payment_methods WHERE id=? AND active=1').get(pmId)); if(!pm) return json(res,400,{error:'invalid_payment_method'});
      let proof='', logo='';
      try { proof=await saveDataUrl(b.paymentProofBase64,'proof'); if(b.customerLogoBase64) logo=await saveDataUrl(b.customerLogoBase64,'logo'); } catch(e){ return json(res,400,{error:e.message}); }
      if(!proof) return json(res,400,{error:'payment_proof_required'});
      const code=randomCode(); const unit=num(box.unit_price,0), total=unit*qty;
      try {
        await db.withTransaction(async()=>{
        const fresh=(await db.prepare('SELECT total_quantity,reserved_quantity FROM boxes WHERE id=?').get(boxId));
        if(qty>(fresh.total_quantity-fresh.reserved_quantity)) throw new Error('quantity_exceeds_remaining');
        (await db.prepare(`INSERT INTO orders(code,box_id,customer_name,shop_name,phone,quantity,unit_price,total_amount,payment_method_id,payment_proof_url,customer_logo_url,note,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,boxId,customer,shop,phone,qty,unit,total,pmId,proof,logo,note,'pending',nowIso(),nowIso()));
        const lock=await db.prepare("UPDATE boxes SET reserved_quantity=reserved_quantity+?,updated_at=? WHERE id=? AND status='active' AND reserved_quantity+?<=total_quantity").run(qty,nowIso(),boxId,qty); if(!lock.changes)throw new Error('capacity_changed');
        });
      } catch(e){ if(['quantity_exceeds_remaining','capacity_changed'].includes(e.message)) return json(res,409,{error:e.message}); throw e; }
      await upsertCustomer({name:customer,businessName:shop,phone,logoUrl:logo});
      return json(res,201,{ok:true,code,totalAmount:total,status:'pending'});
    }

    if (method==='GET' && p==='/api/quote-config') { const cfg=await getSettings(); return json(res,200,{discountMin:num(cfg.quote_discount_min,5),discountMax:num(cfg.quote_discount_max,20),contractTypes:parseJson(cfg.quote_contract_types,'[\"سنوي\",\"نصف سنوي\",\"ربع سنوي\",\"شهري\",\"مشروع\"]'),fields:(await db.prepare('SELECT * FROM quote_form_fields WHERE active=1 ORDER BY sort_order,id').all())}); }
    if (method==='GET' && p==='/api/product-categories') return json(res,200,(await db.prepare('SELECT * FROM product_categories WHERE active=1 ORDER BY sort_order,id').all()));
    if (method==='GET' && p==='/api/products') {
      const category=safeText(url.searchParams.get('category'),80);
      const rows=category?(await db.prepare(`SELECT p.*,c.name category_name,c.slug category_slug FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.active=1 AND c.slug=? ORDER BY p.featured DESC,p.sort_order,p.id DESC`).all(category)):(await db.prepare(`SELECT p.*,c.name category_name,c.slug category_slug FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.featured DESC,p.sort_order,p.id DESC`).all());
      return json(res,200,rows.map(productPublicRow));
    }
    if (method==='GET' && /^\/api\/products\/\d+$/.test(p)) { const row=(await db.prepare(`SELECT p.*,c.name category_name,c.slug category_slug FROM products p LEFT JOIN product_categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1`).get(int(p.split('/').pop()))); return row?json(res,200,productPublicRow(row)):send404(res); }
    if (method==='POST' && p==='/api/products/estimate') {
      const b=await readJson(req); const product=(await db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(int(b.productId))); if(!product)return json(res,400,{error:'product_unavailable'});
      const pricing=calculateProductPrice(product,Math.max(1,num(b.quantity,1)),b.configuration&&typeof b.configuration==='object'?b.configuration:{});
      if(!pricing.ok)return json(res,400,{error:pricing.error});
      return json(res,200,pricing);
    }
    if (method==='POST' && p==='/api/quote-requests') {
      const b=await readJson(req); const company=safeText(b.companyName,180), phone1=safeText(b.phone1,30); if(!company||!phone1)return json(res,400,{error:'quote_company_phone_required'});
      const cfg=await getSettings(), min=Math.max(0,num(cfg.quote_discount_min,5)), max=Math.max(min,num(cfg.quote_discount_max,20));
      const types=parseJson(cfg.quote_contract_types,'["سنوي","نصف سنوي","ربع سنوي","شهري","مشروع"]');
      const contract=Array.isArray(types)&&types.includes(safeText(b.contractType,60))?safeText(b.contractType,60):(types[0]||'سنوي');
      const fields=(await db.prepare('SELECT field_key,label,type,required FROM quote_form_fields WHERE active=1 ORDER BY sort_order,id').all());
      for(const f of fields){ if(f.required && !safeText((b.fields||{})[f.field_key],500)) return json(res,400,{error:'field_required',field:f.field_key}); }
      const rawItems=Array.isArray(b.items)?b.items:[]; if(!rawItems.length)return json(res,400,{error:'quote_items_required'});
      const items=[]; let subtotal=0;
      for(const it of rawItems){ const prod=(await db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(int(it.productId))); if(!prod)continue; const qty=Math.max(1,num(it.quantity,1)); const config=it.configuration&&typeof it.configuration==='object'?it.configuration:{}; const calc=calculateProductPrice(prod,qty,config); const est=calc.ok?calc.total:0; items.push({productId:prod.id,title:prod.title,quantity:qty,configuration:config,estimatedUnitPrice:calc.ok?calc.unitPrice:0,estimatedTotal:est,unit:calc.ok?calc.label:prod.unit_label}); subtotal+=est; }
      if(!items.length)return json(res,400,{error:'quote_items_invalid'});
      const code=randomCode('QR'); const r=(await db.prepare(`INSERT INTO quote_requests(code,contact_name,company_name,phone1,phone2,phone3,location,activity,contract_type,fields_json,items_json,estimated_subtotal,discount_min,discount_max,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,safeText(b.contactName,120),company,phone1,safeText(b.phone2,30),safeText(b.phone3,30),safeText(b.location,250),safeText(b.activity,180),contract,JSON.stringify(b.fields||{}),JSON.stringify(items),subtotal,min,max,'new',nowIso(),nowIso()));
      await upsertCustomer({name:safeText(b.contactName,120)||company,businessName:company,phone:phone1,customerType:'business'});
      return json(res,201,{ok:true,code,estimatedSubtotal:subtotal,discountMin:min,discountMax:max,status:'new'});
    }
    if (method==='POST' && p==='/api/product-requests') {
      const b=await readJson(req); const product=(await db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(int(b.productId))); if(!product)return json(res,400,{error:'product_unavailable'});
      const customer=safeText(b.customerName,120), business=safeText(b.businessName,150), phone=safeText(b.phone,30); if(!customer||!phone)return json(res,400,{error:'missing_customer_data'});
      const qty=int(b.quantity,1); if(qty<(product.min_quantity||1))return json(res,400,{error:'quantity_too_low',min:product.min_quantity}); let file='',proof='';
      try{if(b.customerFileBase64)file=await saveDataUrl(b.customerFileBase64,'request');if(b.paymentProofBase64)proof=await saveDataUrl(b.paymentProofBase64,'proof');}catch(e){return json(res,400,{error:e.message});}
      const customerId=await upsertCustomer({name:customer,businessName:business,phone}); const cfgObj=b.configuration&&typeof b.configuration==='object'?b.configuration:{}; const calc=calculateProductPrice(product,qty,cfgObj); if(product.pricing_mode==='fixed' && !calc.ok)return json(res,400,{error:calc.error}); const fixed=product.pricing_mode==='fixed'&&calc.ok&&Number(calc.total)>=0; const unit=calc.ok?Number(calc.unitPrice):0; const total=calc.ok?Number(calc.total):0; const code=randomCode('NP'); const config=JSON.stringify(cfgObj); const pricing=fixed?'fixed':'awaiting_quote';
      const r=(await db.prepare(`INSERT INTO product_requests(code,product_id,customer_id,customer_name,business_name,phone,quantity,configuration_json,customer_file_url,note,unit_price,total_amount,pricing_status,payment_method_id,payment_proof_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,product.id,customerId,customer,business,phone,qty,config,file,safeText(b.note,2000),unit,total,pricing,int(b.paymentMethodId)||null,proof,fixed&&proof?'payment_review':'new',nowIso(),nowIso()));
      return json(res,201,{ok:true,id:Number(r.lastInsertRowid),code,totalAmount:total,pricingStatus:pricing,status:fixed&&proof?'payment_review':'new'});
    }
    if (method==='GET' && p.startsWith('/api/product-request/')) {
      const code=decodeURIComponent(p.split('/').pop()),phone=safeText(url.searchParams.get('phone'),30); const row=(await db.prepare(`SELECT r.code,r.customer_name,r.business_name,r.phone,r.quantity,r.total_amount,r.pricing_status,r.status,r.admin_note,r.created_at,p.title product_title FROM product_requests r JOIN products p ON p.id=r.product_id WHERE r.code=? AND r.phone=?`).get(code,phone)); return row?json(res,200,row):json(res,404,{error:'request_not_found'});
    }
    if (method==='GET' && p.startsWith('/api/quote/')) { const code=decodeURIComponent(p.split('/').pop()),phone=safeText(url.searchParams.get('phone'),30); const q=(await db.prepare('SELECT * FROM quotes WHERE code=? AND phone=?').get(code,phone)); if(!q)return json(res,404,{error:'quote_not_found'}); const items=(await db.prepare('SELECT * FROM quote_items WHERE quote_id=? ORDER BY sort_order,id').all(q.id)); return json(res,200,{...q,items}); }

    if (method==='POST' && p==='/api/admin/login') {
      const b=await readJson(req,1024*1024); const u=safeText(b.username,80), pass=String(b.password||'');
      const key=`${req.socket.remoteAddress}:${u.toLowerCase()}`;
      const attempts=loginAttempts.get(key)||[];
      const recent=attempts.filter(t=>Date.now()-t<15*60*1000);
      if(recent.length>=10) return json(res,429,{error:'too_many_attempts'});
      const a=(await db.prepare('SELECT * FROM admins WHERE username=?').get(u));
      if(!a || !verifyPassword(pass,a.password_hash)) {loginAttempts.set(key,[...recent,Date.now()]);return json(res,401,{error:'invalid_credentials'});}
      loginAttempts.delete(key);
      const token=makeToken(a);
      return json(res,200,{ok:true},{'Set-Cookie':`nice_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${(process.env.NODE_ENV==='production'||process.env.VERCEL)?'; Secure':''}`});
    }
    if (method==='POST' && p==='/api/admin/logout') return json(res,200,{ok:true},{'Set-Cookie':`nice_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${(process.env.NODE_ENV==='production'||process.env.VERCEL)?'; Secure':''}`});
    if (method==='GET' && p==='/api/admin/me') { const a=adminOnly(req,res); if(!a)return; return json(res,200,{id:a.id,username:a.u}); }
    if (method==='GET' && p==='/api/admin/stats') {
      if(!adminOnly(req,res))return;
      const stats={
        orders: (await db.prepare('SELECT COUNT(*) c FROM orders').get()).c,
        pending: (await db.prepare("SELECT COUNT(*) c FROM orders WHERE status='pending'").get()).c,
        confirmed: (await db.prepare("SELECT COUNT(*) c FROM orders WHERE status='confirmed'").get()).c,
        revenue: (await db.prepare("SELECT COALESCE(SUM(total_amount),0) s FROM orders WHERE status IN ('confirmed','completed')").get()).s,
        activeBoxes: (await db.prepare("SELECT COUNT(*) c FROM boxes WHERE status='active'").get()).c,
        products: (await db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get()).c,
        productRequests: (await db.prepare("SELECT COUNT(*) c FROM product_requests").get()).c,
        newProductRequests: (await db.prepare("SELECT COUNT(*) c FROM product_requests WHERE status IN ('new','quote_sent','payment_review')").get()).c,
        customers: (await db.prepare('SELECT COUNT(*) c FROM customers').get()).c,
        quotes: (await db.prepare('SELECT COUNT(*) c FROM quotes').get()).c,
        businessAccounts: (await db.prepare("SELECT COUNT(*) c FROM business_accounts WHERE status!='closed'").get()).c
      }; return json(res,200,stats);
    }
    if (method==='GET' && p==='/api/admin/orders') {
      if(!adminOnly(req,res))return;
      const rows=(await db.prepare(`SELECT o.*,b.title box_title,p.name payment_name FROM orders o JOIN boxes b ON b.id=o.box_id LEFT JOIN payment_methods p ON p.id=o.payment_method_id ORDER BY o.id DESC`).all());
      return json(res,200,rows);
    }
    if (method==='PUT' && /^\/api\/admin\/orders\/\d+$/.test(p)) {
      if(!adminOnly(req,res))return; const id=int(p.split('/').pop()); const b=await readJson(req);
      const order=(await db.prepare('SELECT * FROM orders WHERE id=?').get(id)); if(!order)return send404(res);
      const allowed=['pending','confirmed','in_progress','completed','rejected','cancelled']; const status=allowed.includes(b.status)?b.status:order.status;
      const releasing = !['rejected','cancelled'].includes(order.status) && ['rejected','cancelled'].includes(status);
      const restoring = ['rejected','cancelled'].includes(order.status) && !['rejected','cancelled'].includes(status);
      try{
        await db.withTransaction(async()=>{
        (await db.prepare('UPDATE orders SET status=?,admin_note=?,updated_at=? WHERE id=?').run(status,safeText(b.adminNote,1200),nowIso(),id));
        if(releasing) (await db.prepare('UPDATE boxes SET reserved_quantity=MAX(reserved_quantity-?,0),updated_at=? WHERE id=?').run(order.quantity,nowIso(),order.box_id));
        if(restoring) {
          const bx=(await db.prepare('SELECT * FROM boxes WHERE id=?').get(order.box_id)); if(order.quantity>bx.total_quantity-bx.reserved_quantity) throw new Error('capacity_conflict');
          (await db.prepare('UPDATE boxes SET reserved_quantity=reserved_quantity+?,updated_at=? WHERE id=?').run(order.quantity,nowIso(),order.box_id));
        }
        });
      }catch(e){return json(res,409,{error:e.message});}
      return json(res,200,{ok:true});
    }

    if (method==='GET' && p==='/api/admin/boxes') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare('SELECT * FROM boxes ORDER BY id DESC').all())); }
    if (method==='POST' && p==='/api/admin/boxes') {
      if(!adminOnly(req,res))return; const b=await readJson(req); let img=''; if(b.imageBase64) img=await saveDataUrl(b.imageBase64,'box');
      const r=(await db.prepare(`INSERT INTO boxes(title,category,description,specs,image_url,unit_price,total_quantity,reserved_quantity,min_quantity,deadline,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(safeText(b.title,150),safeText(b.category,80),safeText(b.description,1500),safeText(b.specs,1500),img,num(b.unitPrice),int(b.totalQuantity),0,int(b.minQuantity,1),safeText(b.deadline,40),safeText(b.status,30)||'active',nowIso(),nowIso()));
      return json(res,201,{ok:true,id:Number(r.lastInsertRowid)});
    }
    if (method==='PUT' && /^\/api\/admin\/boxes\/\d+$/.test(p)) {
      if(!adminOnly(req,res))return; const id=int(p.split('/').pop()); const old=(await db.prepare('SELECT * FROM boxes WHERE id=?').get(id)); if(!old)return send404(res); const b=await readJson(req); let img=old.image_url; if(b.imageBase64) img=await saveDataUrl(b.imageBase64,'box');
      const total=Math.max(int(b.totalQuantity,old.total_quantity),old.reserved_quantity);
      (await db.prepare(`UPDATE boxes SET title=?,category=?,description=?,specs=?,image_url=?,unit_price=?,total_quantity=?,min_quantity=?,deadline=?,status=?,updated_at=? WHERE id=?`).run(
        safeText(b.title||old.title,150),safeText(b.category||old.category,80),safeText(b.description??old.description,1500),safeText(b.specs??old.specs,1500),img,num(b.unitPrice,old.unit_price),total,int(b.minQuantity,old.min_quantity),safeText(b.deadline??old.deadline,40),safeText(b.status||old.status,30),nowIso(),id));
      return json(res,200,{ok:true});
    }
    if (method==='DELETE' && /^\/api\/admin\/boxes\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()); (await db.prepare("UPDATE boxes SET status='archived',updated_at=? WHERE id=?").run(nowIso(),id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/payment-methods') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare('SELECT * FROM payment_methods ORDER BY sort_order,id').all())); }
    if (method==='POST' && p==='/api/admin/payment-methods') {
      if(!adminOnly(req,res))return; const b=await readJson(req); const r=(await db.prepare(`INSERT INTO payment_methods(name,type,holder_name,account_number,instructions,active,sort_order) VALUES(?,?,?,?,?,?,?)`).run(safeText(b.name,120),safeText(b.type,30)||'wallet',safeText(b.holderName,120),safeText(b.accountNumber,120),safeText(b.instructions,1000),b.active===false?0:1,int(b.sortOrder))); return json(res,201,{ok:true,id:Number(r.lastInsertRowid)});
    }
    if (method==='PUT' && /^\/api\/admin\/payment-methods\/\d+$/.test(p)) {
      if(!adminOnly(req,res))return; const id=int(p.split('/').pop()); const b=await readJson(req); (await db.prepare(`UPDATE payment_methods SET name=?,type=?,holder_name=?,account_number=?,instructions=?,active=?,sort_order=? WHERE id=?`).run(safeText(b.name,120),safeText(b.type,30)||'wallet',safeText(b.holderName,120),safeText(b.accountNumber,120),safeText(b.instructions,1000),b.active===false?0:1,int(b.sortOrder),id)); return json(res,200,{ok:true});
    }
    if (method==='DELETE' && /^\/api\/admin\/payment-methods\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()); (await db.prepare('UPDATE payment_methods SET active=0 WHERE id=?').run(id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/portfolio') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare('SELECT * FROM portfolio ORDER BY id DESC').all())); }
    if (method==='POST' && p==='/api/admin/portfolio') {
      if(!adminOnly(req,res))return; const b=await readJson(req); const img=await saveDataUrl(b.imageBase64,'work'); if(!img)return json(res,400,{error:'image_required'}); const r=(await db.prepare('INSERT INTO portfolio(title,category,image_url,description,active,created_at) VALUES(?,?,?,?,?,?)').run(safeText(b.title,150),safeText(b.category,80),img,safeText(b.description,1200),b.active===false?0:1,nowIso())); return json(res,201,{ok:true,id:Number(r.lastInsertRowid)});
    }
    if (method==='DELETE' && /^\/api\/admin\/portfolio\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()); (await db.prepare('DELETE FROM portfolio WHERE id=?').run(id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/services') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare('SELECT * FROM services ORDER BY sort_order,id').all())); }
    if (method==='POST' && p==='/api/admin/services') { if(!adminOnly(req,res))return; const b=await readJson(req); const r=(await db.prepare('INSERT INTO services(title,description,icon,active,sort_order) VALUES(?,?,?,?,?)').run(safeText(b.title,120),safeText(b.description,1000),safeText(b.icon,12)||'✦',b.active===false?0:1,int(b.sortOrder))); return json(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if (method==='DELETE' && /^\/api\/admin\/services\/\d+$/.test(p)) { if(!adminOnly(req,res))return; (await db.prepare('DELETE FROM services WHERE id=?').run(int(p.split('/').pop()))); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/product-categories') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare('SELECT * FROM product_categories ORDER BY sort_order,id').all())); }
    if (method==='POST' && p==='/api/admin/product-categories') { if(!adminOnly(req,res))return; const b=await readJson(req); const name=safeText(b.name,120); if(!name)return json(res,400,{error:'name_required'}); let slug=safeText(b.slug,120)||slugify(name); if((await db.prepare('SELECT id FROM product_categories WHERE slug=?').get(slug)))slug+=`-${Date.now().toString(36)}`; const r=(await db.prepare('INSERT INTO product_categories(name,slug,sort_order,active) VALUES(?,?,?,?)').run(name,slug,int(b.sortOrder),b.active===false?0:1)); return json(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }

    if (method==='GET' && p==='/api/admin/products') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare(`SELECT p.*,c.name category_name FROM products p LEFT JOIN product_categories c ON c.id=p.category_id ORDER BY p.sort_order,p.id DESC`).all()).map(productPublicRow)); }
    if (method==='POST' && p==='/api/admin/products') {
      if(!adminOnly(req,res))return; const b=await readJson(req); let img=''; if(b.imageBase64)img=await saveDataUrl(b.imageBase64,'product'); const title=safeText(b.title,160); if(!title)return json(res,400,{error:'title_required'}); let slug=safeText(b.slug,140)||slugify(title); if((await db.prepare('SELECT id FROM products WHERE slug=?').get(slug)))slug+=`-${Date.now().toString(36)}`; const allowedModes=['direct','configurable','quote','custom','package','contract','group']; const sale=allowedModes.includes(b.saleMode)?b.saleMode:'quote'; const pricing=['fixed','quote'].includes(b.pricingMode)?b.pricingMode:'quote'; const options=JSON.stringify(Array.isArray(b.options)?b.options:[]); const pricingJson=JSON.stringify(normalizePricing(b)); const r=(await db.prepare(`INSERT INTO products(title,slug,category_id,sale_mode,pricing_mode,base_price,unit_label,min_quantity,description,specs,image_url,options_json,pricing_json,requires_design,production_source,active,featured,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(title,slug,int(b.categoryId)||null,sale,pricing,num(b.basePrice),safeText(b.unitLabel,40)||'قطعة',Math.max(1,int(b.minQuantity,1)),safeText(b.description,2500),safeText(b.specs,2500),img,options,pricingJson,b.requiresDesign?1:0,safeText(b.productionSource,30)||'inhouse',b.active===false?0:1,b.featured?1:0,int(b.sortOrder),nowIso(),nowIso())); return json(res,201,{ok:true,id:Number(r.lastInsertRowid)});
    }
    if (method==='PUT' && /^\/api\/admin\/products\/\d+$/.test(p)) {
      if(!adminOnly(req,res))return; const id=int(p.split('/').pop()),old=(await db.prepare('SELECT * FROM products WHERE id=?').get(id)); if(!old)return send404(res); const b=await readJson(req); let img=old.image_url; if(b.imageBase64)img=await saveDataUrl(b.imageBase64,'product'); const sale=['direct','configurable','quote','custom','package','contract','group'].includes(b.saleMode)?b.saleMode:old.sale_mode; const pricing=['fixed','quote'].includes(b.pricingMode)?b.pricingMode:old.pricing_mode; (await db.prepare(`UPDATE products SET title=?,category_id=?,sale_mode=?,pricing_mode=?,base_price=?,unit_label=?,min_quantity=?,description=?,specs=?,image_url=?,options_json=?,pricing_json=?,requires_design=?,production_source=?,active=?,featured=?,sort_order=?,updated_at=? WHERE id=?`).run(safeText(b.title||old.title,160),int(b.categoryId)||null,sale,pricing,num(b.basePrice,old.base_price),safeText(b.unitLabel||old.unit_label,40),Math.max(1,int(b.minQuantity,old.min_quantity)),safeText(b.description??old.description,2500),safeText(b.specs??old.specs,2500),img,JSON.stringify(Array.isArray(b.options)?b.options:parseJson(old.options_json,[])),JSON.stringify(normalizePricing(b,old)),b.requiresDesign?1:0,safeText(b.productionSource||old.production_source,30),b.active===false?0:1,b.featured?1:0,int(b.sortOrder,old.sort_order),nowIso(),id)); return json(res,200,{ok:true});
    }
    if (method==='DELETE' && /^\/api\/admin\/products\/\d+$/.test(p)) { if(!adminOnly(req,res))return; (await db.prepare('UPDATE products SET active=0,updated_at=? WHERE id=?').run(nowIso(),int(p.split('/').pop()))); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/product-requests') { if(!adminOnly(req,res))return; const rows=(await db.prepare(`SELECT r.*,p.title product_title,p.sale_mode,c.id customer_record_id,pm.name payment_name FROM product_requests r JOIN products p ON p.id=r.product_id LEFT JOIN customers c ON c.id=r.customer_id LEFT JOIN payment_methods pm ON pm.id=r.payment_method_id ORDER BY r.id DESC`).all()); return json(res,200,rows.map(r=>({...r,configuration:parseJson(r.configuration_json,{})}))); }
    if (method==='PUT' && /^\/api\/admin\/product-requests\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()),b=await readJson(req),old=(await db.prepare('SELECT * FROM product_requests WHERE id=?').get(id)); if(!old)return send404(res); const allowed=['new','reviewing','quote_sent','awaiting_payment','payment_review','paid','design','awaiting_approval','production','ready','delivered','cancelled','rejected']; const st=allowed.includes(b.status)?b.status:old.status; const unit=num(b.unitPrice,old.unit_price),total=('totalAmount' in b)?num(b.totalAmount):unit*old.quantity; const pricing=safeText(b.pricingStatus,40)||old.pricing_status; (await db.prepare('UPDATE product_requests SET status=?,pricing_status=?,unit_price=?,total_amount=?,admin_note=?,updated_at=? WHERE id=?').run(st,pricing,unit,total,safeText(b.adminNote??old.admin_note,2000),nowIso(),id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/customers') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.phone=c.phone) legacy_orders,(SELECT COUNT(*) FROM product_requests r WHERE r.customer_id=c.id) product_requests,(SELECT COALESCE(SUM(total_amount),0) FROM product_requests r WHERE r.customer_id=c.id AND r.status IN ('paid','design','awaiting_approval','production','ready','delivered')) product_value FROM customers c ORDER BY c.updated_at DESC`).all())); }
    if (method==='PUT' && /^\/api\/admin\/customers\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()),b=await readJson(req),old=(await db.prepare('SELECT * FROM customers WHERE id=?').get(id)); if(!old)return send404(res); (await db.prepare('UPDATE customers SET name=?,business_name=?,email=?,customer_type=?,notes=?,updated_at=? WHERE id=?').run(safeText(b.name||old.name,120),safeText(b.businessName??old.business_name,150),safeText(b.email??old.email,180),safeText(b.customerType||old.customer_type,30),safeText(b.notes??old.notes,2500),nowIso(),id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/quote-config') { if(!adminOnly(req,res))return; const s=await getSettings(); return json(res,200,{discountMin:num(s.quote_discount_min,5),discountMax:num(s.quote_discount_max,20),contractTypes:parseJson(s.quote_contract_types,'["سنوي","نصف سنوي","ربع سنوي","شهري","مشروع"]'),fields:(await db.prepare('SELECT * FROM quote_form_fields ORDER BY sort_order,id').all())}); }
    if (method==='PUT' && p==='/api/admin/quote-config') { if(!adminOnly(req,res))return; const b=await readJson(req); const q=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'); (await q.run('quote_discount_min',String(Math.max(0,num(b.discountMin,5))))); (await q.run('quote_discount_max',String(Math.max(0,num(b.discountMax,20))))); (await q.run('quote_contract_types',JSON.stringify(Array.isArray(b.contractTypes)?b.contractTypes.filter(Boolean).map(x=>safeText(x,80)):[]))); return json(res,200,{ok:true}); }
    if (method==='POST' && p==='/api/admin/quote-fields') { if(!adminOnly(req,res))return; const b=await readJson(req); const key=safeText(b.fieldKey,80).replace(/\s+/g,'_').toLowerCase(); if(!key)return json(res,400,{error:'field_key_required'}); const r=(await db.prepare('INSERT INTO quote_form_fields(field_key,label,type,required,active,sort_order) VALUES(?,?,?,?,?,?)').run(key,safeText(b.label,120)||key,['text','tel','number','textarea','select'].includes(b.type)?b.type:'text',b.required?1:0,b.active===false?0:1,int(b.sortOrder))); return json(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if (method==='PUT' && /^\/api\/admin\/quote-fields\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()),b=await readJson(req),old=(await db.prepare('SELECT * FROM quote_form_fields WHERE id=?').get(id)); if(!old)return send404(res); (await db.prepare('UPDATE quote_form_fields SET label=?,type=?,required=?,active=?,sort_order=? WHERE id=?').run(safeText(b.label||old.label,120),['text','tel','number','textarea','select'].includes(b.type)?b.type:old.type,b.required?1:0,b.active===false?0:1,int(b.sortOrder,old.sort_order),id)); return json(res,200,{ok:true}); }
    if (method==='DELETE' && /^\/api\/admin\/quote-fields\/\d+$/.test(p)) { if(!adminOnly(req,res))return; (await db.prepare('UPDATE quote_form_fields SET active=0 WHERE id=?').run(int(p.split('/').pop()))); return json(res,200,{ok:true}); }
    if (method==='GET' && p==='/api/admin/quote-requests') { if(!adminOnly(req,res))return; const rows=(await db.prepare('SELECT * FROM quote_requests ORDER BY id DESC').all()); return json(res,200,rows.map(r=>({...r,fields:parseJson(r.fields_json,{}),items:parseJson(r.items_json,[])}))); }
    if (method==='PUT' && /^\/api\/admin\/quote-requests\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()),b=await readJson(req),old=(await db.prepare('SELECT * FROM quote_requests WHERE id=?').get(id)); if(!old)return send404(res); const allowed=['new','reviewing','contacted','quote_created','won','lost','cancelled']; (await db.prepare('UPDATE quote_requests SET status=?,admin_note=?,updated_at=? WHERE id=?').run(allowed.includes(b.status)?b.status:old.status,safeText(b.adminNote??old.admin_note,2500),nowIso(),id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/quotes') { if(!adminOnly(req,res))return; const rows=(await db.prepare('SELECT * FROM quotes ORDER BY id DESC').all()); return json(res,200,await Promise.all(rows.map(async q=>({...q,items:(await db.prepare('SELECT * FROM quote_items WHERE quote_id=? ORDER BY sort_order,id').all(q.id))})))); }
    if (method==='POST' && p==='/api/admin/quotes') {
      if(!adminOnly(req,res))return; const b=await readJson(req),rid=int(b.requestId),qrid=int(b.quoteRequestId); const reqRow=rid?(await db.prepare('SELECT * FROM product_requests WHERE id=?').get(rid)):null; const quoteReq=qrid?(await db.prepare('SELECT * FROM quote_requests WHERE id=?').get(qrid)):null; const customerId=reqRow?.customer_id||int(b.customerId)||null; const customerName=safeText(b.customerName||reqRow?.customer_name||quoteReq?.contact_name||quoteReq?.company_name,120),business=safeText(b.businessName||reqRow?.business_name||quoteReq?.company_name,150),phone=safeText(b.phone||reqRow?.phone||quoteReq?.phone1,30); if(!customerName||!phone)return json(res,400,{error:'customer_required'}); const qrItems=quoteReq?parseJson(quoteReq.items_json,[]):[]; const items=Array.isArray(b.items)&&b.items.length?b.items:(qrItems.length?qrItems.map(x=>({description:x.title+(x.configuration?.width&&x.configuration?.height?' — '+x.configuration.width+'×'+x.configuration.height+' م':''),quantity:x.quantity,unitPrice:num(x.estimatedTotal)/Math.max(1,num(x.quantity,1))})):[{description:reqRow?`طلب ${reqRow.code}`:'خدمة نايس',quantity:reqRow?.quantity||1,unitPrice:num(b.unitPrice)}]); const normalized=items.map((x,i)=>({description:safeText(x.description,500),quantity:Math.max(0.01,num(x.quantity,1)),unitPrice:Math.max(0,num(x.unitPrice)),sortOrder:i})); const subtotal=normalized.reduce((a,x)=>a+x.quantity*x.unitPrice,0),discount=Math.max(0,num(b.discount)),total=Math.max(0,subtotal-discount),code=randomCode('NQ'); try{await db.withTransaction(async()=>{const r=(await db.prepare(`INSERT INTO quotes(code,request_id,customer_id,customer_name,business_name,phone,status,valid_until,subtotal,discount,total,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,rid||null,customerId,customerName,business,phone,'sent',safeText(b.validUntil,40),subtotal,discount,total,safeText(b.notes,2000),nowIso(),nowIso())); const qid=Number(r.lastInsertRowid),qi=db.prepare('INSERT INTO quote_items(quote_id,description,quantity,unit_price,total,sort_order) VALUES(?,?,?,?,?,?)'); for(const x of normalized) await qi.run(qid,x.description,x.quantity,x.unitPrice,x.quantity*x.unitPrice,x.sortOrder); if(reqRow)(await db.prepare(`UPDATE product_requests SET status='quote_sent',pricing_status='quoted',unit_price=?,total_amount=?,updated_at=? WHERE id=?`).run(normalized.length===1?normalized[0].unitPrice:0,total,nowIso(),rid)); if(quoteReq)(await db.prepare(`UPDATE quote_requests SET status='quote_created',updated_at=? WHERE id=?`).run(nowIso(),qrid)); return {id:qid};});return json(res,201,{ok:true,code,total});}catch(e){throw e;}
    }
    if (method==='PUT' && /^\/api\/admin\/quotes\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()),b=await readJson(req),old=(await db.prepare('SELECT * FROM quotes WHERE id=?').get(id)); if(!old)return send404(res); const allowed=['draft','sent','accepted','rejected','expired','converted']; (await db.prepare('UPDATE quotes SET status=?,valid_until=?,notes=?,updated_at=? WHERE id=?').run(allowed.includes(b.status)?b.status:old.status,safeText(b.validUntil??old.valid_until,40),safeText(b.notes??old.notes,2000),nowIso(),id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/business-accounts') { if(!adminOnly(req,res))return; return json(res,200,(await db.prepare('SELECT * FROM business_accounts ORDER BY id DESC').all())); }
    if (method==='POST' && p==='/api/admin/business-accounts') { if(!adminOnly(req,res))return; const b=await readJson(req); const company=safeText(b.companyName,180),phone=safeText(b.phone,30); if(!company||!phone)return json(res,400,{error:'company_required'}); const cid=await upsertCustomer({name:safeText(b.contactName,120)||company,businessName:company,phone,customerType:'business'}); const r=(await db.prepare(`INSERT INTO business_accounts(customer_id,company_name,contact_name,phone,contract_type,status,start_date,end_date,credit_limit,balance,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(cid,company,safeText(b.contactName,120),phone,safeText(b.contractType,40)||'annual',safeText(b.status,30)||'lead',safeText(b.startDate,40),safeText(b.endDate,40),num(b.creditLimit),num(b.balance),safeText(b.notes,2500),nowIso(),nowIso())); return json(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if (method==='PUT' && /^\/api\/admin\/business-accounts\/\d+$/.test(p)) { if(!adminOnly(req,res))return; const id=int(p.split('/').pop()),b=await readJson(req),old=(await db.prepare('SELECT * FROM business_accounts WHERE id=?').get(id)); if(!old)return send404(res); (await db.prepare(`UPDATE business_accounts SET company_name=?,contact_name=?,phone=?,contract_type=?,status=?,start_date=?,end_date=?,credit_limit=?,balance=?,notes=?,updated_at=? WHERE id=?`).run(safeText(b.companyName||old.company_name,180),safeText(b.contactName??old.contact_name,120),safeText(b.phone||old.phone,30),safeText(b.contractType||old.contract_type,40),safeText(b.status||old.status,30),safeText(b.startDate??old.start_date,40),safeText(b.endDate??old.end_date,40),num(b.creditLimit,old.credit_limit),num(b.balance,old.balance),safeText(b.notes??old.notes,2500),nowIso(),id)); return json(res,200,{ok:true}); }

    if (method==='GET' && p==='/api/admin/settings') { if(!adminOnly(req,res))return; return json(res,200,await getSettings()); }
    if (method==='PUT' && p==='/api/admin/settings') {
      if(!adminOnly(req,res))return; const b=await readJson(req); const allowed=['company_name','company_name_en','tagline','about','phone','whatsapp','address','facebook_url','primary_color','accent_color','background_color','surface_color','text_color','muted_color','hero_title','hero_subtitle']; const q=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for(const k of allowed) if(k in b) (await q.run(k,safeText(b[k],3000))); if(b.logoBase64) (await q.run('logo_url',await saveDataUrl(b.logoBase64,'brand')));
      return json(res,200,{ok:true,settings:await getSettings()});
    }
    if (method==='POST' && p==='/api/admin/change-password') {
      const a=adminOnly(req,res); if(!a)return; const b=await readJson(req,1024*1024); const row=(await db.prepare('SELECT * FROM admins WHERE id=?').get(a.id)); if(!verifyPassword(String(b.currentPassword||''),row.password_hash)) return json(res,400,{error:'wrong_current_password'}); const np=String(b.newPassword||''); if(np.length<8) return json(res,400,{error:'password_too_short'}); (await db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(np),a.id)); return json(res,200,{ok:true});
    }
    return send404(res);
  } catch(e) {
    console.error(e); return json(res,500,{error:'server_error',detail:process.env.NODE_ENV==='development'?e.message:undefined});
  }
}

const loginAttempts=new Map();
// Nice Studio integration: BEGIN

// Nice Studio integration: END
async function handler(req,res){
  try{
    await ensureInit();
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET'&&req.method!=='HEAD'&&(url.pathname.startsWith('/api/admin/')||url.pathname.startsWith('/api/studio/'))){
      const host=String(req.headers.host||'');const origin=String(req.headers.origin||'');
      if(origin&&new URL(origin).host!==host)return json(res,403,{error:'origin_mismatch'});
    }
    if(url.pathname.startsWith('/api/'))return await api(req,res,url);
    if(url.pathname.startsWith('/private-media/')||/^\/uploads\/(proof|request|logo)-/i.test(url.pathname))return await servePrivateMedia(req,res,url.pathname);
    if(serveStatic(req,res,url.pathname))return;
    send404(res);
  }catch(e){console.error('Nice OS server error:',e);if(!res.headersSent)json(res,500,{error:'server_error'});else res.end();}
}
module.exports={handler,ensureInit};
if(require.main===module){
  ensureInit().then(()=>{
    const port=Number(process.env.PORT||3000);
    http.createServer(handler).listen(port,'0.0.0.0',()=>console.log('Nice OS listening:',port));
  }).catch(e=>{console.error(e);process.exit(1)});
}
