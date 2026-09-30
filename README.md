# نظام الحضور والانصراف

شاشة حضور وانصراف بسيطة — خادم Node.js بدون أي مكتبات خارجية (Node 18+).

## التشغيل محليًا
```bash
node server.js
# افتح http://localhost:3000/?user=EMP-001
```
أول تشغيل بيعمل `data/db.json` فاضي تلقائيًا، وبتضيف أول موظف من الشاشة.

## ⚠️ مهم قبل ما تنشره
التطبيق مفيهوش تسجيل دخول (المستخدم بيتحدد من `?user=`)، وأي مستخدم يقدر يمسح كل البيانات.
عشان كده **لازم** تضبط `ACCESS_PASSWORD` لما تنشره على الإنترنت — الموقع كله بيطلب كلمة السر (أي اسم مستخدم + كلمة السر).

## الرفع على GitHub
```bash
cd attendance-system
git init
git add .
git commit -m "Attendance system"
git branch -M main
git remote add origin https://github.com/<USERNAME>/attendance-system.git
git push -u origin main
```
ملفات البيانات الحقيقية (`data/db.json` والنسخ الاحتياطية) في `.gitignore` فمش هتترفع. يفضل يكون المستودع **Private**.

## التشغيل من رابط (الاستضافة)
GitHub Pages مبتشغلش Node.js، فالمشروع بيتنشر على خدمة استضافة بتقرأ من مستودع جيت هاب:

### Render (الأسهل — فيه `render.yaml` جاهز)
1. من render.com: **New → Blueprint** واختار المستودع.
2. اكتب قيمة `ACCESS_PASSWORD` لما يطلبها.
3. بعد النشر هتاخد رابط `https://attendance-system-xxxx.onrender.com/?user=EMP-001`.

الملف بيطلب قرص دائم (`/data`) عشان البيانات ماتضيعش مع كل إعادة تشغيل، وده محتاج خطة مدفوعة (starter). على الخطة المجانية البيانات بتتمسح.

### Railway / Fly.io / Koyeb
فيه `Dockerfile` جاهز. اضبط المتغيرات وأربط Volume على `/data`.

### GitHub Codespaces (للتجربة فقط)
افتح المستودع في Codespaces، شغّل `node server.js` وافتح الـ port 3000 من تبويب Ports.

## متغيرات البيئة
| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | `3000` | المنفذ (الاستضافة بتحدده) |
| `HOST` | `127.0.0.1` | على الاستضافة `0.0.0.0` (مضبوطة في Dockerfile) |
| `ACCESS_PASSWORD` | — | كلمة سر الموقع (Basic Auth) — **مطلوبة عند النشر** |
| `DATA_DIR` | `./data` | مكان `db.json` — اربطه بقرص دائم |
| `TZ_NAME` | `Africa/Cairo` | توقيت تسجيل الحضور |

`GET /healthz` بدون كلمة سر، للفحص الصحي من الاستضافة.
باقي التفاصيل (الـ API والإعدادات) في `README.txt`.
