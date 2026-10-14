'use strict';
const section=(id,kind,title,description='',extra={})=>({id,kind,visible:true,title,description,eyebrow:'',background:'',padding:76,align:'right',...extra});
// Responsive grid presets are chosen per section; missing values keep existing site defaults.
const grid=(desktop,tablet,mobile)=>({columns:{desktop,tablet,mobile},gap:18});
function createDefault(){return {
  version:1,
  theme:{primary:'#171D2D',accent:'#E9B649',background:'#F7F8FA',surface:'#FFFFFF',text:'#172033',muted:'#667085',radius:18,wide:1160},
  sections:[
    section('hero','hero','نحوّل أفكارك إلى أعمال تُرى وتُلمس','لوحات، طباعة، هدايا دعائية، وتغليف يعبّر عن هوية مشروعك. اطلب بكل سهولة من مكان واحد.',{eyebrow:'NICE FOR ADVERTISING',button:'استعرض المنتجات',href:'#products',secondaryButton:'اطلب عرض سعر',secondaryHref:'#quote-request',image:''}),
    section('products','products','منتجات تُشبه طموح مشروعك','اختر المنتج، حدد مقاسك وكميتك، وشاهد السعر المبدئي مباشرة.',{eyebrow:'NICE CATALOG',...grid(3,2,2)}),
    section('quote-request','quote','اطلب عرض سعر يناسب احتياج شركتك','ارسل احتياجك وعرض الأسعار سيصل إلى فريق نايس لمراجعته.',{eyebrow:'BUSINESS QUOTE',...grid(2,1,1)}),
    section('boxes','boxes','صناديق التجميع','شارك كمية الطباعة مع مشاريع أخرى وادفع مقابل حصتك فقط.',{eyebrow:'GROUP ORDERS',...grid(3,2,1)}),
    section('services','services','كل خدمات الدعاية في مكان واحد','من التنفيذ الرقمي إلى المنتجات التي تعيش مع عملائك.',{eyebrow:'OUR SERVICES',...grid(3,2,1)}),
    section('portfolio','portfolio','بعض ما أنجزناه','تصفّح الأعمال، كبّر الصورة، أو اطلب تنفيذ عمل مشابه.',{eyebrow:'OUR WORK',...grid(3,2,2)}),
    section('about','about','شريكك من الفكرة حتى التنفيذ','نساعد المشاريع والمتاجر والشركات على إظهار هويتها بأفضل صورة.',{eyebrow:'ABOUT NICE'}),
    section('track','track','تتبّع طلبك','استخدم رقم الطلب ورقم الهاتف لمعرفة حالته.',{eyebrow:'ORDER TRACKING'}),
  ],
  custom:[],
  updatedAt:null
};}
const addable=[
  {kind:'promo',name:'شريط إعلان',icon:'megaphone',defaults:{title:'عرض حصري من نايس',description:'اكتشف منتجاتنا واطلبها بخطوات بسيطة.',button:'اكتشف الآن',href:'#products',background:'#fff7e5'}},
  {kind:'split',name:'قسم صورة ونص',icon:'image',defaults:{title:'فكرة تستحق تنفيذًا مميزًا',description:'صممنا هذا القسم لعرض خدمة أو حملة بصورة كبيرة.',button:'استكشف أعمالنا',href:'#portfolio',image:''}},
  {kind:'testimonial',name:'رأي عميل',icon:'message-square-quote',defaults:{title:'عملائنا هم أفضل شهادة',description:'ضع هنا رأيًا حقيقيًا من عميل بعد الحصول على إذنه.',author:'عميل نايس'}},
  {kind:'faq',name:'الأسئلة الشائعة',icon:'circle-help',defaults:{title:'أسئلة شائعة',description:'',questions:[{q:'كيف أطلب من نايس؟',a:'اختر المنتج وحدد التفاصيل ثم أرسل الطلب.'},{q:'هل يمكن طلب عرض سعر للشركات؟',a:'نعم، من قسم عرض السعر.'}]}},
  {kind:'cta',name:'دعوة لاتخاذ إجراء',icon:'mouse-pointer-click',defaults:{title:'جاهز نبدأ مشروعك؟',description:'خلّينا نحول فكرتك إلى شيء ملموس.',button:'تواصل معنا',href:'https://wa.me/967784580808'}}
];
module.exports={createDefault,addable};
