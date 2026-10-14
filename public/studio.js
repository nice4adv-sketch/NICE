(function(){'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const labels={hero:'الواجهة الرئيسية',products:'قسم المنتجات',quote:'طلبات عروض الأسعار',boxes:'صناديق التجميع',services:'الخدمات',portfolio:'معرض الأعمال',about:'من نحن',track:'تتبع الطلب',promo:'شريط إعلاني',split:'صورة ونص',testimonial:'رأي عميل',faq:'أسئلة شائعة',cta:'دعوة للتواصل'};
const palette=[{kind:'promo',label:'شريط إعلان',glyph:'✺',title:'إعلان مهم',description:'عرض جديد يستحق أن يراه عميلك.',button:'اكتشف',href:'#products',background:'#fff7e5'},
{kind:'split',label:'صورة ونص',glyph:'▣',title:'قدّم خدمتك بصورة مميزة',description:'أضف وصفًا بسيطًا يشرح فائدة الخدمة.',button:'شاهد الأعمال',href:'#portfolio',image:''},
{kind:'testimonial',label:'رأي عميل',glyph:'❞',title:'قالوا عن نايس',description:'تجربتنا مع نايس كانت مميزة.',author:'اسم العميل'},
{kind:'faq',label:'أسئلة شائعة',glyph:'?',title:'أسئلة شائعة',description:'',questions:[{q:'كيف أطلب؟',a:'اختر المنتج واطلب عبر الموقع.'}]},
{kind:'cta',label:'دعوة لاتخاذ إجراء',glyph:'↗',title:'أصبح الوقت مناسبًا لمشروعك',description:'تواصل معنا وسنساعدك في اختيار الأنسب.',button:'راسلنا',href:'https://wa.me/967784580808'}];
const presets=[{name:'الكحلي والذهبي',primary:'#171D2D',accent:'#E9B649',background:'#F7F8FA',surface:'#FFFFFF',text:'#172033',muted:'#667085'},
{name:'الأخضر الحديث',primary:'#135D52',accent:'#E7A548',background:'#F5F8F5',surface:'#FFFFFF',text:'#17352F',muted:'#65766F'},
{name:'الأزرق النابض',primary:'#164E9C',accent:'#FFB02E',background:'#F4F7FC',surface:'#FFFFFF',text:'#172943',muted:'#607287'},
{name:'الخمري والأوف وايت',primary:'#743344',accent:'#D8A46C',background:'#FCF8F6',surface:'#FFFFFF',text:'#331F27',muted:'#7A6872'}];
let lastInspectedId=null,layout=null,selectedId=null,currentPanel='sections',revisions=[],history=[],histIndex=0,frameReady=false,dirty=false,device='desktop',panelOpen=true,inspectorOpen=true,previewQueued=false;
const clone=x=>JSON.parse(JSON.stringify(x)),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3100)}
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt,credentials:'same-origin'});let d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'حدث خطأ في الخادم');return d}
async function start(){try{const data=await api('/api/studio/draft');layout=data.layout;history=[clone(layout)];histIndex=0;$('#editor').hidden=false;$('#loginLayer').hidden=true;panelOpen=innerWidth>=1100;inspectorOpen=innerWidth>=1100;applyPanelState();selectedId=layout.sections[0]?.id||null;renderPanel();renderInspector();updateHistoryButtons();setStatus('مسودة جاهزة');setTimeout(sendPreview,700);}catch{$('#loginLayer').hidden=false;$('#editor').hidden=true;}}
function setStatus(text,kind=''){$('#saveStatus').textContent=text;$('#saveStatus').className='save-status '+kind;}
function change(fn,commit=false){if(!layout)return;fn(layout);layout.updatedAt=new Date().toISOString();dirty=true;setStatus('تغييرات غير محفوظة','dirty');sendPreview();if(commit)pushHistory();}
function pushHistory(){const str=JSON.stringify(layout),prev=JSON.stringify(history[histIndex]);if(str===prev)return;history=history.slice(0,histIndex+1);history.push(clone(layout));if(history.length>35)history.shift();histIndex=history.length-1;updateHistoryButtons();}
function undo(dir){const next=histIndex+dir;if(next<0||next>=history.length)return;histIndex=next;layout=clone(history[histIndex]);selectedId=layout.sections.some(s=>s.id===selectedId)?selectedId:layout.sections[0]?.id;dirty=true;setStatus('تغييرات غير محفوظة','dirty');renderPanel();renderInspector();sendPreview();updateHistoryButtons();}
function updateHistoryButtons(){$('#undoBtn').disabled=histIndex<=0;$('#redoBtn').disabled=histIndex>=history.length-1;}
$('#undoBtn').onclick=()=>undo(-1);$('#redoBtn').onclick=()=>undo(1);
function sendPreview(){if(!layout||!frameReady||previewQueued)return;previewQueued=true;requestAnimationFrame(()=>{previewQueued=false;try{$('#siteFrame').contentWindow.postMessage({type:'nice-studio:update',layout:clone(layout)},location.origin);}catch{}})}
function applyPanelState(){const left=$('.left-panel'),right=$('.inspector');left.classList.toggle('is-collapsed',!panelOpen);right.classList.toggle('is-collapsed',!inspectorOpen);$('#showSections').classList.toggle('active',panelOpen);$('#showInspector').classList.toggle('active',inspectorOpen);const area=$('.work-area');area.dataset.left=panelOpen?'open':'closed';area.dataset.right=inspectorOpen?'open':'closed';const narrow=window.innerWidth<1100;const backdrop=$('#panelBackdrop');backdrop.hidden=!(narrow&&(inspectorOpen||(panelOpen&&window.innerWidth<760)));}
function openPanel(which){if(which==='left'){panelOpen=true;if(innerWidth<760)inspectorOpen=false;}else{inspectorOpen=true;if(innerWidth<760)panelOpen=false;}applyPanelState();}
function closeOverlays(){if(innerWidth<760)panelOpen=false;if(innerWidth<1100)inspectorOpen=false;applyPanelState();}
// Switching window orientation never leaves overlapping drawers covering the canvas.
let viewportMode=innerWidth>=1100?'wide':innerWidth>=760?'medium':'small';
window.addEventListener('resize',()=>{
  const mode=innerWidth>=1100?'wide':innerWidth>=760?'medium':'small';
  if(mode===viewportMode)return;
  viewportMode=mode;
  panelOpen=mode==='wide';inspectorOpen=mode==='wide';applyPanelState();
});
$('#panelBackdrop').onclick=closeOverlays;
// Desktop-only resizing; unlike browser resize, it never hides the toolbar.
$$('[data-resize]').forEach(handle=>{
  const sections=handle.dataset.resize==='sections',cssVar=sections?'--sections-width':'--inspector-width';
  const getWidth=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar))||(sections?270:310);
  let startX=0,startWidth=0;
  handle.addEventListener('pointerdown',e=>{if(innerWidth<1100)return;startX=e.clientX;startWidth=getWidth();handle.setPointerCapture(e.pointerId);handle.classList.add('dragging');e.preventDefault();});
  handle.addEventListener('pointermove',e=>{if(!handle.hasPointerCapture(e.pointerId))return;const delta=sections?startX-e.clientX:e.clientX-startX;const width=Math.max(220,Math.min(420,startWidth+delta));document.documentElement.style.setProperty(cssVar,width+'px');});
  const end=e=>{if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);handle.classList.remove('dragging');};
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const move=(e.key==='ArrowLeft'?1:-1)*(sections?1:-1)*16;document.documentElement.style.setProperty(cssVar,Math.max(220,Math.min(420,getWidth()+move))+'px');});
});$('#showSections').onclick=()=>{panelOpen=!panelOpen;if(panelOpen&&innerWidth<760)inspectorOpen=false;applyPanelState()};$('#showInspector').onclick=()=>{inspectorOpen=!inspectorOpen;if(inspectorOpen&&innerWidth<760)panelOpen=false;applyPanelState()};
window.addEventListener('message',e=>{if(e.origin!==location.origin||!e.data)return;if(e.data.type==='nice-studio:ready'){frameReady=true;sendPreview();if(selectedId)focusPreview(selectedId,false)}if(e.data.type==='nice-studio:selected'){selectedId=e.data.id;currentPanel='sections';renderPanel();renderInspector();openPanel('inspector');}});
function focusPreview(id,scroll=true){if(!frameReady)return;$('#siteFrame').contentWindow.postMessage({type:'nice-studio:focus',id,scroll},location.origin);}
function select(id){selectedId=id;currentPanel='sections';renderPanel();renderInspector();focusPreview(id);openPanel('inspector');}
function renderPanel(){$$('[data-panel]').forEach(x=>x.classList.toggle('active',x.dataset.panel===currentPanel));const names={sections:'أقسام الصفحة',add:'إضافة قسم',theme:'الهوية والألوان',history:'النسخ المنشورة'};$('#panelTitle').textContent=names[currentPanel];if(currentPanel==='sections')return renderSectionPanel();if(currentPanel==='add')return renderAddPanel();if(currentPanel==='theme')return renderThemePanel();if(currentPanel==='history')return renderHistoryPanel();}
function renderSectionPanel(){const wrap=$('#panelContent'),oldTop=wrap.scrollTop;wrap.innerHTML=`<div class="group-label">رتّب بالسحب أو بأسهم التحريك</div><div id="sectionsList" class="section-list">${layout.sections.map((s,i)=>`<div draggable="true" data-row="${esc(s.id)}" class="section-list-item ${s.id===selectedId?'active':''}"><span class="section-handle" title="اسحب القسم">⠿</span><button class="section-pick" data-select="${esc(s.id)}"><strong>${esc(s.title||labels[s.kind])}</strong><small>${esc(labels[s.kind]||s.kind)}</small></button><button class="tiny-btn ${s.visible===false?'off':''}" data-eye="${esc(s.id)}" title="إظهار / إخفاء">${s.visible===false?'◌':'◉'}</button><button class="tiny-btn" data-up="${esc(s.id)}" title="للأعلى" ${i===0?'disabled':''}>↑</button><button class="tiny-btn" data-down="${esc(s.id)}" title="للأسفل" ${i===layout.sections.length-1?'disabled':''}>↓</button></div>`).join('')}</div><div class="panel-info">يمكنك إخفاء الأقسام، تغيير ترتيبها، وإضافة أقسام جديدة. وظائف الطلب والدفع تُدار من Nice OS وليست قابلة للكسر عبر المحرر.</div>`;
  $$('[data-select]').forEach(x=>x.onclick=()=>select(x.dataset.select));
  $$('[data-eye]').forEach(x=>x.onclick=()=>{const b=layout.sections.find(b=>b.id===x.dataset.eye);change(()=>b.visible=b.visible===false?true:false,true);renderPanel();renderInspector()});
  $$('[data-up]').forEach(x=>x.onclick=()=>move(x.dataset.up,-1));$$('[data-down]').forEach(x=>x.onclick=()=>move(x.dataset.down,1));
  wrap.scrollTop=oldTop;
  let dragging=null;$$('[data-row]').forEach(row=>{
    row.addEventListener('dragstart',e=>{dragging=row.dataset.row;e.dataTransfer.setData('text/plain',dragging);e.dataTransfer.effectAllowed='move';row.style.opacity='.5'});
    row.addEventListener('dragend',()=>{row.style.opacity='1';dragging=null});row.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move'});
    row.addEventListener('drop',e=>{e.preventDefault();const target=row.dataset.row,src=dragging||e.dataTransfer.getData('text/plain');if(!src||src===target)return;change(l=>{const a=l.sections.findIndex(s=>s.id===src),b=l.sections.findIndex(s=>s.id===target);if(a<0||b<0)return;const [v]=l.sections.splice(a,1);l.sections.splice(b,0,v);},true);renderPanel()});
  });
}
function move(id,delta){change(l=>{const i=l.sections.findIndex(s=>s.id===id),j=i+delta;if(i<0||j<0||j>=l.sections.length)return;[l.sections[i],l.sections[j]]=[l.sections[j],l.sections[i]]},true);renderPanel();}
function renderAddPanel(){$('#panelContent').innerHTML=`<div class="group-label">أقسام جاهزة قابلة للتعديل</div><div class="palette">${palette.map(i=>`<button data-add="${i.kind}"><span>${i.glyph}</span><small>${i.label}</small></button>`).join('')}</div><div class="panel-info">اختَر قسمًا جديدًا. يُضاف إلى آخر الصفحة ويمكنك تغيير ترتيبه وحذفه ونسخه لاحقًا.</div>`;$$('[data-add]').forEach(x=>x.onclick=()=>addSection(x.dataset.add));}
function addSection(kind){const preset=palette.find(x=>x.kind===kind);if(!preset)return;const id='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);const newSection={id,kind,visible:true,title:preset.title,description:preset.description||'',eyebrow:'NICE',background:preset.background||'',padding:68,align:'right',button:preset.button||'',href:preset.href||'',image:preset.image||'',author:preset.author||'',questions:clone(preset.questions||[])};change(l=>l.sections.push(newSection),true);toast('تمت إضافة القسم');select(id);}
function renderThemePanel(){const t=layout.theme;const colors=[['primary','اللون الرئيسي'],['accent','لون التمييز'],['background','خلفية الموقع'],['surface','خلفية البطاقات'],['text','لون النص الرئيسي'],['muted','النص الثانوي']];$('#panelContent').innerHTML=`<div class="group-label">قوالب ألوان جاهزة</div><div class="preset-row">${presets.map((p,i)=>`<button data-preset="${i}" title="${p.name}" style="background:linear-gradient(145deg,${p.primary} 50%,${p.accent} 50%)"></button>`).join('')}</div><div class="group-label" style="margin-top:23px">اختر ألوان هويتك</div>${colors.map(([key,title])=>`<div class="field"><label>${title}</label><div class="color-field"><input type="color" data-theme="${key}" value="${esc(t[key])}"><code>${esc(t[key])}</code></div></div>`).join('')}<div class="field"><label>استدارة الزوايا (بكسل)</label><input type="range" min="2" max="40" step="1" data-theme="radius" value="${t.radius||18}"><span class="muted">${t.radius||18}px</span></div><div class="field"><label>عرض محتوى الموقع (بكسل)</label><input type="number" min="800" max="1600" data-theme="wide" value="${t.wide||1160}"></div><div class="panel-info">هذه التغييرات تؤثر في الواجهة المنشورة بعد الضغط على نشر، ولا تغير الأسعار أو الطلبات أو قاعدة بيانات عملائك.</div>`;
 $$('[data-preset]').forEach(x=>x.onclick=()=>{const p=presets[Number(x.dataset.preset)];change(l=>{Object.keys(p).forEach(k=>{if(k!=='name')l.theme[k]=p[k]})},true);renderPanel()});
 $$('[data-theme]').forEach(x=>{x.addEventListener('input',()=>{change(l=>l.theme[x.dataset.theme]=x.type==='number'||x.type==='range'?Number(x.value):x.value);if(x.type==='color')x.nextElementSibling.textContent=x.value;if(x.type==='range')x.nextElementSibling.textContent=x.value+'px'});x.addEventListener('change',()=>pushHistory())});
}
async function renderHistoryPanel(){$('#panelContent').innerHTML='<div class="muted">جاري تحميل النسخ السابقة...</div>';try{revisions=await api('/api/studio/revisions');$('#panelContent').innerHTML=`<div class="panel-info">عند النشر يحتفظ Nice Studio بالنسخة السابقة. يمكن استعادتها كمسودة ثم نشرها.</div><button id="resetDefaultDesign" class="default-reset-btn">↺ ابدأ بتصميم نايس الأساسي</button>${revisions.length?revisions.map(x=>`<div class="history-row"><strong>نسخة ${x.id}</strong><div class="muted">${new Date(x.created_at).toLocaleString('ar')}</div><button data-restore="${x.id}">استعادة للمسودة</button></div>`).join(''):'<div class="muted">لم تُنشر أي تعديلات بعد.</div>'}`;const resetBtn=$('#resetDefaultDesign');if(resetBtn)resetBtn.onclick=async()=>{if(!confirm('إعادة المسودة إلى تصميم نايس الأساسي؟ لن يتغير الموقع المنشور.'))return;
    await api('/api/studio/reset-draft',{method:'POST',body:JSON.stringify({})});
    const d=await api('/api/studio/draft');layout=d.layout;history=[clone(layout)];histIndex=0;selectedId=layout.sections[0]?.id||null;dirty=false;
    setStatus('مسودة أساسية جاهزة','saved');currentPanel='sections';renderPanel();renderInspector();sendPreview();updateHistoryButtons();toast('تم تجهيز التصميم الأساسي كمسودة.');
  };
  $$('[data-restore]').forEach(x=>x.onclick=async()=>{if(!confirm('استعادة هذه النسخة إلى المسودة الحالية؟'))return;const id=Number(x.dataset.restore);await api('/api/studio/restore',{method:'POST',body:JSON.stringify({id})});const d=await api('/api/studio/draft');layout=d.layout;history=[clone(layout)];histIndex=0;dirty=false;setStatus('استُعيدت مسودة','saved');renderPanel();renderInspector();sendPreview();updateHistoryButtons();toast('يمكنك مراجعة النسخة ثم نشرها.');})}catch(e){$('#panelContent').textContent=e.message;}}
function field(label,key,value,type='text',extra=''){const val=value??'';return `<div class="field"><label for="field-${key}">${label}</label>${type==='textarea'?`<textarea id="field-${key}" data-field="${key}" ${extra}>${esc(val)}</textarea>`:type==='select'?`<select id="field-${key}" data-field="${key}">${extra}</select>`:`<input id="field-${key}" data-field="${key}" type="${type}" value="${esc(val)}" ${extra}>`}</div>`;}
function renderInspector(){const b=layout?.sections.find(s=>s.id===selectedId);const oldTop=$('#inspectorContent').scrollTop,keepScroll=b&&b.id===lastInspectedId;if(!b){$('#selectedTitle').textContent='اختر قسمًا من الصفحة';$('#inspectorContent').innerHTML='<div class="empty-inspector">اختر قسمًا للبدء.</div>';lastInspectedId=null;return;}lastInspectedId=b.id;$('#selectedTitle').textContent=labels[b.kind]||'تحرير القسم';const core=!b.id.startsWith('custom-');let html='<h4 class="inspector-section-title">المحتوى</h4>';
  html+=field('العنوان الرئيسي','title',b.title);
  html+=field('وصف القسم','description',b.description,'textarea');
  html+=field('عنوان صغير (Eyebrow)','eyebrow',b.eyebrow);
  if(['hero','promo','split','cta'].includes(b.kind)){html+=field('نص الزر','button',b.button||'');html+=field('رابط الزر','href',b.href||'');}
  if(b.kind==='hero'){html+=field('نص الزر الثاني','secondaryButton',b.secondaryButton||'');html+=field('رابط الزر الثاني','secondaryHref',b.secondaryHref||'');}
  if(b.kind==='testimonial')html+=field('اسم العميل','author',b.author||'');
  if(b.kind==='faq')html+=field('الأسئلة والأجوبة (سؤال | جواب)','questionsText',(b.questions||[]).map(x=>`${x.q} | ${x.a}`).join('\n'),'textarea');
  if(['hero','split'].includes(b.kind)){html+=`<div class="field"><label>صورة القسم</label>${b.image?`<img src="${esc(b.image)}" style="width:100%;max-height:110px;object-fit:cover;border-radius:10px;margin-bottom:7px">`:''}<input id="imageFile" type="file" accept="image/png,image/jpeg,image/webp"><p class="muted">PNG / JPG / WebP — حتى 5MB</p></div>`;}
  const gridKinds=['products','services','boxes','portfolio','quote'];
  if(gridKinds.includes(b.kind)){
    const defaults={products:[3,2,2],services:[3,2,1],boxes:[3,2,1],portfolio:[3,2,2],quote:[2,1,1]};
    const col=b.columns||{},d=defaults[b.kind]||[3,2,1];
    html+=`<hr class="inspector-divider"><h4 class="inspector-section-title">تقسيم المربعات في كل صف</h4><p class="muted">خصّص عدد الأعمدة لكل جهاز بشكل مستقل؛ سيظهر التغيير في المعاينة فورًا.</p>`;
    [['desktop','كمبيوتر',d[0]],['tablet','تابلت',d[1]],['mobile','جوال',d[2]]].forEach(([key,label,fallback])=>{
      const n=Number(col[key]||fallback);
      html+=`<div class="grid-editor"><label>${label}</label><div class="grid-options" role="group" aria-label="أعمدة ${label}">${[1,2,3,4].map(v=>`<button type="button" class="grid-option ${n===v?'active':''}" data-grid-device="${key}" data-grid-value="${v}" aria-pressed="${n===v}"><span class="grid-glyph">${Array.from({length:v},()=>'<i></i>').join('')}</span><small>${v}</small></button>`).join('')}</div></div>`;
    });
    html+=`<div class="field"><label>المسافة بين المربعات <b id="gapValue">${Number(b.gap??18)}px</b></label><input id="gridGap" type="range" min="0" max="48" step="2" value="${Number(b.gap??18)}"></div>`;
  }
  html+='<hr class="inspector-divider"><h4 class="inspector-section-title">المظهر</h4>';
  html+=`<div class="field"><label>لون خلفية القسم</label><div class="color-field"><input id="sectionColor" type="color" value="${/^#[0-9a-f]{6}$/i.test(b.background||'')?b.background:'#ffffff'}"><button id="clearColor" class="tiny-btn">تلقائي</button></div></div>`;
  html+=field('المسافة العلوية والسفلية','padding',b.padding??76,'range','min="20" max="160" step="4"');
  html+=`<div class="field"><label>محاذاة النص</label><select data-field="align"><option value="right" ${b.align==='right'?'selected':''}>يمين</option><option value="center" ${b.align==='center'?'selected':''}>وسط</option><option value="left" ${b.align==='left'?'selected':''}>يسار</option></select></div>`;
  html+=`<div class="field"><label><input id="visibleToggle" type="checkbox" ${b.visible!==false?'checked':''}> إظهار القسم للزوار</label></div>`;
  html+='<hr class="inspector-divider"><h4 class="inspector-section-title">إدارة القسم</h4><div class="section-actions">';
  if(!core)html+='<button id="duplicateSection">⎘ تكرار القسم</button><button id="removeSection" class="destructive">× حذف القسم</button>';
  else html+='<button id="hideSection">◉ إظهار/إخفاء</button><button disabled title="الأقسام المرتبطة بالطلبات لا تُحذف لحماية الوظائف">قسم نظام أساسي</button>';
  html+='</div>';$('#inspectorContent').innerHTML=html;$('#inspectorContent').scrollTop=keepScroll?oldTop:0;
  $$('[data-field]').forEach(x=>{if(x.dataset.field==='questionsText'){x.addEventListener('input',()=>change(()=>b.questions=x.value.split('\n').map(row=>{const i=row.indexOf('|');return {q:(i<0?row:row.slice(0,i)).trim(),a:(i<0?'':row.slice(i+1)).trim()}}).filter(x=>x.q)));}
    else{x.addEventListener('input',()=>change(()=>b[x.dataset.field]=x.type==='range'?Number(x.value):x.value));}x.addEventListener('change',()=>pushHistory());});
  $$('[data-grid-device]').forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridDevice,n=Number(btn.dataset.gridValue);change(()=>{b.columns=b.columns||{};b.columns[key]=n;},true);renderInspector();});
  if($('#gridGap'))$('#gridGap').addEventListener('input',e=>{const n=Number(e.target.value);change(()=>b.gap=n);$('#gapValue').textContent=n+'px';});
  if($('#gridGap'))$('#gridGap').addEventListener('change',pushHistory);
  $('#sectionColor').addEventListener('input',e=>change(()=>b.background=e.target.value));$('#sectionColor').addEventListener('change',pushHistory);
  $('#clearColor').onclick=()=>{change(()=>b.background='',true);renderInspector()};
  $('#visibleToggle').onchange=e=>{change(()=>b.visible=e.target.checked,true);renderPanel()};
  if($('#hideSection'))$('#hideSection').onclick=()=>{change(()=>b.visible=b.visible===false?true:false,true);renderPanel();renderInspector()};
  if($('#duplicateSection'))$('#duplicateSection').onclick=()=>{const copy=clone(b);copy.id='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);copy.title+=' (نسخة)';change(l=>{const i=l.sections.findIndex(x=>x.id===b.id);l.sections.splice(i+1,0,copy)},true);select(copy.id)};
  if($('#removeSection'))$('#removeSection').onclick=()=>{if(!confirm('حذف هذا القسم من التصميم؟'))return;change(l=>l.sections=l.sections.filter(x=>x.id!==b.id),true);selectedId=layout.sections[0]?.id;renderPanel();renderInspector()};
  if($('#imageFile'))$('#imageFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024)return toast('الصورة كبيرة؛ الحد 5MB');try{const dataUrl=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)});const x=await api('/api/studio/upload',{method:'POST',body:JSON.stringify({dataUrl})});change(()=>b.image=x.url,true);renderInspector();toast('تم رفع الصورة إلى الاستوديو')}catch(e){toast(e.message)}};
}
$$('[data-panel]').forEach(btn=>btn.onclick=()=>{currentPanel=btn.dataset.panel;openPanel('left');renderPanel()});
$('#collapsePanel').onclick=()=>{panelOpen=false;applyPanelState()};$('#toggleInspector').onclick=()=>{inspectorOpen=false;applyPanelState()};
$$('[data-device]').forEach(btn=>btn.onclick=()=>{device=btn.dataset.device;$$('[data-device]').forEach(x=>x.classList.toggle('active',x===btn));$('#canvasWrap').dataset.device=device;$('#previewSize').textContent={desktop:'كمبيوتر',tablet:'تابلت',mobile:'جوال'}[device]});
$('#saveDraft').onclick=async()=>{try{await api('/api/studio/draft',{method:'PUT',body:JSON.stringify({layout})});dirty=false;setStatus('حُفظت المسودة','saved');toast('حُفظت المسودة دون تغيير موقع العملاء')}catch(e){toast(e.message)}};
$('#publish').onclick=async()=>{if(!confirm('نشر التصميم الحالي ليظهر لجميع زوار الموقع؟'))return;try{await api('/api/studio/publish',{method:'POST',body:JSON.stringify({layout})});dirty=false;setStatus('تم النشر','saved');toast('نُشر التصميم. افتح الموقع للتأكد من النتيجة');}catch(e){toast(e.message)}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();undo(e.shiftKey?1:-1)}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('#saveDraft').click()}});
start();
})();
