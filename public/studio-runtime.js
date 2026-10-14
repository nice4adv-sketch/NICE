/* Nice Studio runtime — additive visual customization, does not replace commerce event handlers. */
(function(){'use strict';
const qs=new URLSearchParams(location.search), preview=qs.has('studioPreview');
const main=document.querySelector('main');if(!main)return;
let layout=null;
const byId=(id)=>id==='hero'?document.querySelector('main > section.hero'):(id==='quote-request'?document.querySelector('main > #quote-request'):document.getElementById(id));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeLink(link){const x=String(link||'');if(x.startsWith('#')&&/^#[\w-]+$/.test(x))return x;try{const u=new URL(x,location.href);if(['https:','http:'].includes(u.protocol))return u.href;}catch{}return '#products'}
function imageSrc(url){const u=String(url||'');if(/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(u))return u;try{const parsed=new URL(u,location.href);if(['https:','http:'].includes(parsed.protocol))return parsed.href;}catch{}return ''}
function link(label,url){return label?`<a class="action primary" href="${escape(safeLink(url))}">${escape(label)}</a>`:''}
function renderCustom(b){const el=document.createElement('section');el.className='studio-custom '+b.kind;el.id=b.id;el.dataset.studioCustom='1';
 let inner='';const image=imageSrc(b.image);
 if(b.kind==='split')inner=`<div class="wrap"><div><span class="eyebrow">${escape(b.eyebrow||'')}</span><h2>${escape(b.title)}</h2><p>${escape(b.description)}</p><div class="custom-actions">${link(b.button,b.href)}</div></div>${image?`<img class="custom-media" alt="" src="${escape(image)}">`:'<div class="custom-media"></div>'}</div>`;
 else if(b.kind==='testimonial')inner=`<div class="wrap"><div class="quote-mark">“</div><h2>${escape(b.title)}</h2><p>${escape(b.description)}</p><strong>${escape(b.author||'عميل نايس')}</strong></div>`;
 else if(b.kind==='faq')inner=`<div class="wrap"><span class="eyebrow">${escape(b.eyebrow||'FAQ')}</span><h2>${escape(b.title)}</h2>${(b.questions||[]).map(i=>`<details class="faq-row"><summary>${escape(i.q)}</summary><p>${escape(i.a)}</p></details>`).join('')}</div>`;
 else inner=`<div class="wrap"><span class="eyebrow">${escape(b.eyebrow||'NICE')}</span><h2>${escape(b.title)}</h2><p>${escape(b.description)}</p><div class="custom-actions">${link(b.button,b.href)}</div></div>`;
 el.innerHTML=inner;return el;
}
function assignText(el,text){if(el&&typeof text==='string'&&el.textContent!==text)el.textContent=text;}
function assignHeroTitle(el,text){
 if(!el||typeof text!=='string')return;
 const words=text.trim().split(/\s+/);
 if(words.length>=4){
   const prefix=words.slice(0,-2).join(' ');
   const emphasis=words.slice(-2).join(' ');
   const html=escape(prefix)+' <em>'+escape(emphasis)+'</em>';
   if(el.innerHTML!==html)el.innerHTML=html;
 } else assignText(el,text);
}
function applyTheme(theme){if(!theme)return;const doc=document.documentElement;const pairs={primary:'--ns-primary',accent:'--ns-accent',background:'--ns-background',surface:'--ns-surface',text:'--ns-text',muted:'--ns-muted'};
  for(const [k,v] of Object.entries(pairs))if(theme[k]&&/^#[0-9a-f]{6}$/i.test(theme[k]))doc.style.setProperty(v,theme[k]);
  const shared={primary:'--primary',accent:'--accent',background:'--page-bg',surface:'--surface',text:'--text',muted:'--muted'};
  for(const [k,v] of Object.entries(shared))if(theme[k]&&/^#[0-9a-f]{6}$/i.test(theme[k]))doc.style.setProperty(v,theme[k]);
  if(theme.radius)doc.style.setProperty('--ns-radius',Math.max(2,Math.min(40,Number(theme.radius)))+'px');
  if(theme.wide)doc.style.setProperty('--ns-wide',Math.max(800,Math.min(1600,Number(theme.wide)))+'px');
  doc.style.setProperty('--radius',Math.max(2,Math.min(40,Number(theme.radius)||18))+'px');
}
function applyLayout(data){if(!data||!Array.isArray(data.sections))return;layout=data;applyTheme(data.theme);const blocks=[];
 document.querySelectorAll('[data-studio-custom="1"]').forEach(e=>e.remove());
 for(const b of layout.sections){let el=byId(b.id);if(!el&&['promo','split','testimonial','faq','cta'].includes(b.kind))el=renderCustom(b);if(!el)continue;el.dataset.studioBlock=b.id;
   el.style.display=b.visible===false?'none':'';el.style.backgroundColor=/^#[0-9A-Fa-f]{6}$/.test(b.background||'')?b.background:'';
   el.style.paddingTop=b.padding!==undefined?`${Math.max(0,Math.min(180,Number(b.padding)))}px`:'';
   el.style.paddingBottom=b.padding!==undefined?`${Math.max(0,Math.min(180,Number(b.padding)))}px`:'';
   if(b.kind==='hero'){
     assignHeroTitle(document.getElementById('heroTitle'),b.title);assignText(document.getElementById('heroSubtitle'),b.description);
     const eyebrow=el.querySelector('.eyebrow');assignText(eyebrow,b.eyebrow||'');
     const buttons=el.querySelectorAll('.hero-actions a,.hero-buttons a');
     if(buttons[0]&&b.button){assignText(buttons[0],b.button);buttons[0].href=safeLink(b.href)}
     if(buttons[1]&&b.secondaryButton){assignText(buttons[1],b.secondaryButton);buttons[1].href=safeLink(b.secondaryHref)}
     if(b.image){const img=imageSrc(b.image); if(img){el.style.setProperty('--studio-hero-image',`url('${img.replace(/'/g,'%27')}')`);el.classList.add('studio-hero-picture');}}
     else{el.style.removeProperty('--studio-hero-image');el.classList.remove('studio-hero-picture')}
   }else if(!el.dataset.studioCustom){
     const h=el.querySelector('.section-head h2,.heading h2,.quote-request-head h2,h2');
     const p=el.querySelector('.section-head p,.heading p,.quote-request-head p,#aboutText,.track-wrap > div > p');
     const eyebrow=el.querySelector('.section-head .eyebrow,.heading .eyebrow,.quote-request-head .eyebrow,.about-grid .eyebrow,.track-wrap .eyebrow');
     assignText(h,b.title);assignText(p,b.description);if(eyebrow)assignText(eyebrow,b.eyebrow||'');
   }
   // Individual card-grid controls (desktop / tablet / phone). Layout data belongs to
   // the section, never the product card, so store prices and order handlers stay intact.
   const targets={products:'#productsGrid',boxes:'#boxesGrid',services:'#servicesGrid',portfolio:'#portfolioGrid',quote:'#quoteProductsPicker'};
   const grid=targets[b.kind]?el.querySelector(targets[b.kind]):null;
   if(grid){const defaults={products:[3,2,2],boxes:[3,2,1],services:[3,2,1],portfolio:[3,2,2],quote:[2,1,1]};const [d,t,m]=defaults[b.kind];
     grid.style.setProperty('--studio-cols-desktop',String(Math.min(4,Math.max(1,Number(b.columns?.desktop)||d))));
     grid.style.setProperty('--studio-cols-tablet',String(Math.min(4,Math.max(1,Number(b.columns?.tablet)||t))));
     grid.style.setProperty('--studio-cols-mobile',String(Math.min(4,Math.max(1,Number(b.columns?.mobile)||m))));
     grid.style.setProperty('--studio-card-gap',Math.min(48,Math.max(0,Number(b.gap??18)))+'px');
   }
   if(b.align){const area=el.querySelector('.section-head,.heading,.hero-copy,.quote-request-head,.wrap');if(area)area.style.textAlign=b.align;}
   blocks.push(el);
 }
 // Avoid re-appending all sections after every keypress: moving DOM nodes can
 // jump the preview scroll position and cause touch/scroll stuttering.
 const current=[...main.children].filter(el=>el.tagName==='SECTION'&&blocks.includes(el));
 const reordered=current.length!==blocks.length||current.some((el,i)=>el!==blocks[i]);
 if(reordered)for(const el of blocks)main.appendChild(el);
 if(preview)enableSelect();
}
function enableSelect(){document.querySelectorAll('[data-studio-block]').forEach(el=>{
   if(el.dataset.studioBound)return;el.dataset.studioBound='1';
   el.addEventListener('mouseenter',()=>el.classList.add('studio-hover'));
   el.addEventListener('mouseleave',()=>el.classList.remove('studio-hover'));
   el.addEventListener('click',e=>{
     if(!preview)return;e.preventDefault();e.stopPropagation();
     const id=el.dataset.studioBlock;document.querySelectorAll('.studio-selected').forEach(x=>x.classList.remove('studio-selected'));
     el.classList.add('studio-selected');parent.postMessage({type:'nice-studio:selected',id},location.origin);
   },true);
 });}
if(preview){document.addEventListener('submit',e=>e.preventDefault(),true);window.addEventListener('message',e=>{
   if(e.origin!==location.origin||!e.data)return;
   if(e.data.type==='nice-studio:update')applyLayout(e.data.layout);
   if(e.data.type==='nice-studio:focus'){document.querySelectorAll('.studio-selected').forEach(x=>x.classList.remove('studio-selected'));const el=document.querySelector(`[data-studio-block="${CSS.escape(e.data.id)}"]`);if(el){el.classList.add('studio-selected');el.scrollIntoView({behavior:'smooth',block:'center'});}}
 });}
fetch('/api/studio/published').then(r=>r.ok?r.json():null).then(data=>{if(data)applyLayout(data.layout);}).catch(()=>{}).finally(()=>{if(preview)parent.postMessage({type:'nice-studio:ready'},location.origin)});
// Nice OS may fill its sections asynchronously; reapply authored text after its initial data render.
window.addEventListener('load',()=>{if(layout)setTimeout(()=>applyLayout(layout),300);});
window.addEventListener('nice:app-ready',()=>{if(layout)applyLayout(layout);});
})();
