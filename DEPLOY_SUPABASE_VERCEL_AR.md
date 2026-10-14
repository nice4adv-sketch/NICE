# دليل نشر Nice OS مع Supabase وVercel

## 1) إنشاء مشروع Supabase

1. افتح https://supabase.com وأنشئ مشروعًا خاصًا باسم مناسب لنايس. اختر كلمة مرور قوية لقاعدة البيانات، واحتفظ بها خارج GitHub.
2. افتح لوحة مشروع Supabase، ثم **Connect** واختر **Transaction pooler**. انسخ عنوان PostgreSQL كاملًا الذي يستخدم منفذ **6543**. استبدل `[YOUR-PASSWORD]` بكلمة مرور قاعدة البيانات مع ترميز الرموز الخاصة URL-encoding (أو اختر كلمة مرور مناسبة). ضع الرابط كاملًا في `SUPABASE_DB_URL`.
3. من **Project Settings → API** انسخ Project URL إلى `SUPABASE_URL` والمفتاح السري من مفاتيح الخادم (service_role أو secret key) إلى `SUPABASE_SERVICE_ROLE_KEY`.
4. **مهم جدًا:** لا تضع مفتاح الخدمة السري أو رابط PostgreSQL في ملفات JavaScript للمتصفح أو في GitHub. لا تحتاج إلى مفتاح anon للنسخة الحالية.
5. عند أول اتصال ناجح، تنشئ الشيفرة الجداول تلقائيًا وتفعّل RLS من دون سياسات عامة. تستطيع أيضًا فتح `supabase/schema.sql` في SQL Editor لتجهيز الجداول مسبقًا.

## 2) إنشاء مخازن الصور

من Supabase → Storage → New bucket:

- `nice-public`: **Public ON**. مخصص لصور المنتجات/المعرض/الموقع/الاستوديو فقط.
- `nice-private`: **Public OFF**. مخصص لصور التحويلات وإشعارات الدفع وملفات العملاء. **لا تغيره إلى Public.**

ارفع الملفات على الخادم فقط باستخدام مفتاح الخدمة السري. روابط إيصالات الدفع تمر من الخادم عبر `/private-media/...` ويتحقق الخادم من جلسة المدير أولاً. **لا تنشئ سياسات وصول تسمح للزائر المجهول بعرض أو رفع صور الدفع**.

## 3) رفع الكود إلى GitHub

1. فك ضغط المشروع وارفع محتويات المجلد الرئيسي، بحيث يكون `package.json` و `vercel.json` في جذر مستودع GitHub.
2. اجعل المستودع Private. **لا ترفع ملف `.env` أو `data/*.db` أو صور العملاء أو مفاتيح سرية**.
3. يمكنك ربط مستودع GitHub بمشروع Vercel لاحقًا.

## 4) نشر Vercel

1. في https://vercel.com/new اختر Import Git Repository.
2. Framework Preset = Other، وRoot Directory = جذر المشروع، وBuild Command فارغ أو الإعداد الافتراضي، وInstall Command = `npm install`.
3. من Project → Settings → Environment Variables أضف القيم التالية إلى Production (واستخدم قيمًا مختلفة للتجربة):

| المتغير | المصدر |
|---|---|
| `SUPABASE_DB_URL` | Supabase Connect → Transaction pooler PostgreSQL URI (منفذ 6543) |
| `SUPABASE_URL` | Project Settings → API → URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Secret/server/service_role key **سري للخادم فقط** |
| `SUPABASE_PUBLIC_BUCKET` | `nice-public` |
| `SUPABASE_PRIVATE_BUCKET` | `nice-private` |
| `NICE_ADMIN_PASSWORD` | كلمة قوية جديدة بطول 14 حرفًا أو أكثر، **ليست** `Nice@2026` |
| `NICE_SESSION_SECRET` | نص عشوائي ثابت بطول 32 حرفًا على الأقل |
| `NODE_ENV` | `production` (عادةً تضبطه المنصة تلقائيًا) |

4. انشر المشروع وراجع Deployment Logs عند حدوث خطأ. لا تشارك صور إعدادات تحتوي على مفاتيح؛ امسحها أولاً.
5. اربط نطاقك من Settings → Domains، ثم اختبر HTTPS.

**شروط مهمة:** Vercel Hobby مخصصة للاستخدام غير التجاري وفق شروطها، وموقع نايس التجاري يحتاج اشتراكًا يسمح بالاستخدام التجاري. تحقق أيضًا من إمكانية التسجيل والدفع من اليمن. مشاريع Supabase المجانية قد تُوقف بسبب الخمول؛ للنشر الرسمي المستمر تحتاج خطة ونسخًا احتياطية مناسبة.

## 5) اختبار قبل طلبات حقيقية

- افتح الموقع والرابط `/admin` والاستوديو `/studio.html`.
- سجل الدخول بكلمة مرورك الجديدة، وغير كلمة المرور لاحقًا من لوحة الإدارة عند الحاجة.
- افتح منتج البنر وأدخل 3×5 بسعر 1500 للمتر المربع، يفترض أن يظهر 22500 ريال.
- أنشئ حجزًا تجريبيًا وارفع صورة إشعار دفع **وهمية**، ثم تحقق أن الملف العام لا يفتح وأن المدير فقط يستطيع قراءته.
- أنشئ عرض سعر، وعدل حالته، وجرّب حفظ ونشر مسودة من Nice Studio؛ ثم أعد نشر الموقع وتحقق من بقاء البيانات.
- تأكد من إمكانية تنزيل نسخة احتياطية خارج Supabase للقاعدة ومخزني الصور.

## 6) نقل البيانات القديمة

**مهم:** ربط Supabase لا ينقل تلقائيًا بيانات SQLite القديمة! إذا لديك طلبات وصور حقيقية في مجلدات `data/` و`public/uploads` و`private-uploads/`، لا تحذفها ولا ترفعها لـGitHub. يلزم ترحيل منفصل للصفوف والصور، مع تحديث روابط الصور في القاعدة، والتحقق من مراجع الجداول والعدادات بعد النقل.

## 7) في حال حدوث خطأ

- `SUPABASE_DB_URL is required`: أضف رابط اتصال PostgreSQL الصحيح إلى Vercel.
- `password authentication failed`: تحقق من كلمة مرور القاعدة واسم المستخدم وعنوان Transaction pooler كاملًا، لا تختلق عنوانه يدويًا.
- `relation does not exist` أو `permission denied`: تحقق من صلاحية دور الاتصال وإعداد SQL Editor / RLS.
- `storage_upload_failed`: أنشئ المخزنين بالاسم الصحيح وتأكد من مفتاح الخادم وحدود الملفات.
- `NICE_ADMIN_PASSWORD must be ...`: غيّر كلمة المرور إلى قيمة قوية بطول 14+.

المراجع الرسمية:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/reference/javascript/storage-from-upload
- https://supabase.com/docs/reference/javascript/storage-from-download
- https://vercel.com/docs/limits/fair-use-guidelines

## 8) فحص فني قبل النشر

للتأكد من أن الملفات لم تتلف، نفذ من جهازك `npm install` ثم `npm test` لاختبار عمليات الطلب والتسعير والحماية محليًا. وللتأكد من الاتصال الفعلي بمشروع Supabase، لا بد من Deployment حقيقي ثم تجربة حفظ بيانات جديدة وإعادة نشر المشروع والتحقق من بقائها.

**تحذير تشغيلي:** الاستوديو يستدعي Supabase API من وظائف Vercel، ولا يوجد في هذه الحزمة نقل تلقائي من قاعدة بيانات Nice OS القديمة. إذا كانت لديك بيانات عملاء، اطلب ترحيلها قبل تشغيل المتجر للعامة.
